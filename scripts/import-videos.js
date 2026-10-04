import {
  readFile,
  writeFile,
  mkdir,
  unlink,
  open,
  access,
} from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { all, one, run, transaction } from "../server/db.js";
import { passwordHash } from "../server/auth.js";
import { exec, probe, storeFile, mediaDir } from "../server/storage.js";
import { buildHls, materialize } from "../server/media.js";
import { validateSource, downloadSource } from "./video-sources.js";

async function acquireLock(path) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await open(path, "wx");
      await handle.writeFile(String(process.pid));
      await handle.close();
      return true;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const pid = Number(await readFile(path, "utf8").catch(() => ""));
      if (!Number.isInteger(pid) || pid <= 0) return false;
      try {
        process.kill(pid, 0);
        return false;
      } catch (error) {
        if (error.code !== "ESRCH") return false;
        await unlink(path).catch(() => {});
      }
    }
  }
  return false;
}
async function available(location) {
  if (!location) return false;
  if (location.startsWith("s3:")) return true;
  return access(resolve(mediaDir, basename(location))).then(
    () => true,
    () => false,
  );
}

export async function importVideos({
  manifestPath = new URL("./open-videos.json", import.meta.url),
  workDir = resolve(
    dirname(process.env.DATABASE_PATH || "./data/velo.sqlite"),
    "imports",
  ),
  concurrency = Number(process.env.IMPORT_CONCURRENCY || 2),
  limit = Infinity,
  fetchImpl = fetch,
} = {}) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.forEach(validateSource);
  if (
    new Set(manifest.map((s) => s.id)).size !== manifest.length ||
    new Set(manifest.map((s) => s.url)).size !== manifest.length
  )
    throw new Error("The collection contains duplicate sources.");
  if (
    !Number.isInteger(concurrency) ||
    concurrency < 1 ||
    concurrency > 4 ||
    !(limit === Infinity || (Number.isInteger(limit) && limit > 0))
  )
    throw new Error("Use 1–4 import workers and a positive collection limit.");
  await mkdir(workDir, { recursive: true });
  const lock = resolve(workDir, "import.lock");
  if (!(await acquireLock(lock))) {
    console.log("Another importer is already working on this collection.");
    return 0;
  }
  const owner = "open-archive";
  let imported = 0,
    failed = 0,
    repaired = 0,
    cursor = 0;
  let total = one("SELECT count(*) n FROM videos WHERE user_id=?", owner).n;
  let reserved = 0;
  try {
    if (!one("SELECT id FROM users WHERE id=?", owner)) {
      const hash = await passwordHash(
        crypto.randomUUID() + crypto.randomUUID(),
      );
      transaction(() => {
        run(
          "INSERT INTO users(id,email,password_hash,verified,onboarded) VALUES(?,?,?,?,?)",
          owner,
          "archive@collection.velo.invalid",
          hash,
          1,
          1,
        );
        run(
          "INSERT INTO profiles(user_id,username,display_name,bio) VALUES(?,?,?,?)",
          owner,
          "open_archive",
          "Velo Open Archive",
          "A curated collection of openly licensed real footage. Each video credits its original author. This account is operated by Velo.",
        );
      });
    }
    async function worker() {
      while (cursor < manifest.length) {
        if (total + reserved >= limit && reserved) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          continue;
        }
        const source = manifest[cursor++];
        const existing = one("SELECT * FROM videos WHERE id=?", source.id);
        if (existing && existing.user_id !== owner)
          throw new Error("Source ID belongs to another creator.");
        // Moderation and privacy decisions must survive reruns.
        if (existing && existing.status !== "ready") continue;
        const mediaReady =
          existing &&
          (await available(existing.video_url)) &&
          (await available(existing.thumbnail_url));
        const assets = existing
          ? all("SELECT location FROM video_assets WHERE video_id=?", source.id)
          : [];
        if (
          mediaReady &&
          existing.hls &&
          assets.length &&
          one(
            "SELECT name FROM video_assets WHERE video_id=? AND name='master.m3u8'",
            source.id,
          ) &&
          (
            await Promise.all(assets.map((asset) => available(asset.location)))
          ).every(Boolean)
        )
          continue;
        const newEntry = !existing;
        // Reserve a slot before asynchronous work so concurrent workers cannot exceed the goal.
        if (newEntry && total + reserved >= limit) continue;
        let slotPending = newEntry;
        if (newEntry) reserved++;
        const raw = resolve(workDir, `${source.id}.source`),
          clip = raw + ".mp4",
          thumb = raw + ".jpg",
          temporary = [];
        try {
          console.log(`Preparing ${source.caption}`);
          if (mediaReady) await materialize(existing.video_url, clip);
          else {
            await downloadSource(source.url, raw, { fetchImpl });
            await exec(
              "ffmpeg",
              [
                "-nostdin",
                "-y",
                "-threads",
                "2",
                "-i",
                raw,
                "-map",
                "0:v:0",
                "-t",
                "12",
                "-an",
                "-vf",
                "scale='min(1080,iw)':-2",
                "-r",
                "30",
                "-c:v",
                "libx264",
                "-threads",
                "2",
                "-preset",
                "veryfast",
                "-crf",
                "23",
                "-movflags",
                "+faststart",
                clip,
              ],
              { timeout: 180000, maxBuffer: 2 * 1024 * 1024 },
            );
            const duration = await probe(clip);
            await exec(
              "ffmpeg",
              [
                "-nostdin",
                "-y",
                "-ss",
                String(Math.min(source.thumbnail_at ?? 1, duration - 0.1)),
                "-i",
                clip,
                "-frames:v",
                "1",
                "-vf",
                "scale=360:-2",
                thumb,
              ],
              { timeout: 20000, maxBuffer: 1024 * 1024 },
            );
            const video = await storeFile(
              clip,
              `${source.id}.mp4`,
              "video/mp4",
            );
            const thumbnail = await storeFile(
              thumb,
              `${source.id}.jpg`,
              "image/jpeg",
            );
            transaction(() => {
              if (existing)
                run(
                  "UPDATE videos SET video_url=?,thumbnail_url=?,duration=?,hls=0 WHERE id=?",
                  video,
                  thumbnail,
                  duration,
                  source.id,
                );
              else
                run(
                  "INSERT INTO videos(id,user_id,caption,category,audio,video_url,thumbnail_url,duration,source_json) VALUES(?,?,?,?,?,?,?,?,?)",
                  source.id,
                  owner,
                  source.caption,
                  source.category,
                  "Open footage · audio removed",
                  video,
                  thumbnail,
                  duration,
                  JSON.stringify(source),
                );
              for (const tag of [
                source.category.toLowerCase(),
                "realfootage",
                "openarchive",
              ]) {
                run("INSERT OR IGNORE INTO hashtags(name) VALUES(?)", tag);
                run(
                  "INSERT OR IGNORE INTO video_hashtags VALUES(?,?)",
                  source.id,
                  one("SELECT id FROM hashtags WHERE name=?", tag).id,
                );
              }
            });
            if (newEntry) {
              imported++;
              total++;
              reserved--;
              slotPending = false;
            }
          }
          try {
            await buildHls(clip, source.id, temporary, () => {}, 2);
            run("UPDATE videos SET hls=1 WHERE id=?", source.id);
            if (existing) repaired++;
          } catch (error) {
            run("UPDATE videos SET hls=0 WHERE id=?", source.id);
            console.warn(
              `Adaptive processing needs retry for ${source.id}: ${error.message}`,
            );
          }
          console.log(
            `Collection: ${total} real videos; ${imported} added, ${repaired} repaired, ${failed} skipped.`,
          );
        } catch (error) {
          failed++;
          console.warn(
            `Import skipped: ${source.caption}: ${error.message.slice(0, 250)}`,
          );
        } finally {
          if (slotPending) reserved--;
          await Promise.all(
            [raw, clip, thumb, ...temporary].map((path) =>
              unlink(path).catch(() => {}),
            ),
          );
        }
      }
    }
    const results = await Promise.allSettled(
      Array.from({ length: concurrency }, worker),
    );
    const rejected = results.find((result) => result.status === "rejected");
    if (rejected) throw rejected.reason;
    const report = {
      total,
      imported,
      repaired,
      failed,
      completed: new Date().toISOString(),
    };
    await writeFile(
      resolve(workDir, "last-run.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
    console.log(`Open collection: ${total} real videos (${imported} added).`);
    return imported;
  } finally {
    await unlink(lock).catch(() => {});
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  const value = (flag) =>
    args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
  await importVideos({
    manifestPath: value("--manifest") || undefined,
    limit: value("--limit") ? Number(value("--limit")) : Infinity,
  });
}
