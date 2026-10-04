import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { all, one, run, transaction } from "../server/db.js";
import { passwordHash } from "../server/auth.js";
import { exec, processVideo } from "../server/storage.js";
import { buildHls } from "../server/media.js";
export async function importVideos() {
  const manifest = JSON.parse(
    await readFile(new URL("./open-videos.json", import.meta.url), "utf8"),
  );
  const owner = "open-archive";
  if (!one("SELECT id FROM users WHERE id=?", owner)) {
    const hash = await passwordHash(crypto.randomUUID() + crypto.randomUUID());
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
  await mkdir("./data/imports", { recursive: true });
  let imported = 0;
  for (const source of manifest) {
    if (one("SELECT id FROM videos WHERE id=?", source.id)) continue;
    if (
      !["CC0", "CC BY 4.0"].includes(source.license) ||
      new URL(source.url).hostname !== "upload.wikimedia.org"
    )
      throw new Error("Unsupported source license or host.");
    const raw = resolve(`./data/imports/${source.id}.source`),
      clip = raw + ".mp4",
      temporary = [];
    try {
      console.log("Importing:", source.caption);
      // Do not follow redirects to arbitrary hosts. Cap the download before retaining it.
      const response = await fetch(source.url, {
        redirect: "error",
        signal: AbortSignal.timeout(120000),
        headers: {
          "User-Agent": "Velo/1.1 (https://github.com/Emredke/tiktok-clone)",
        },
      });
      if (!response.ok) throw new Error(`Source returned ${response.status}`);
      if (Number(response.headers.get("content-length")) > 100 * 1024 * 1024)
        throw new Error("Source exceeds 100 MB.");
      const chunks = [];
      let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > 100 * 1024 * 1024) throw new Error("Source exceeds 100 MB.");
        chunks.push(chunk);
      }
      await writeFile(raw, Buffer.concat(chunks));
      await exec(
        "ffmpeg",
        [
          "-nostdin",
          "-y",
          "-i",
          raw,
          "-map",
          "0:v:0",
          "-t",
          "12",
          "-an",
          "-vf",
          "scale='min(1080,iw)':-2",
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-movflags",
          "+faststart",
          clip,
        ],
        { timeout: 180000, maxBuffer: 2 * 1024 * 1024 },
      );
      const media = await processVideo(clip, source.id, 0, undefined, 1);
      transaction(() => {
        run(
          "INSERT INTO videos(id,user_id,caption,category,audio,video_url,thumbnail_url,duration,source_json) VALUES(?,?,?,?,?,?,?,?,?)",
          source.id,
          owner,
          source.caption,
          source.category,
          "Open footage · audio removed",
          media.video_url,
          media.thumbnail_url,
          media.duration,
          JSON.stringify(source),
        );
        for (const tag of [
          source.category.toLowerCase(),
          "realfootage",
          "openarchive",
        ]) {
          run("INSERT OR IGNORE INTO hashtags(name) VALUES(?)", tag);
          run(
            "INSERT INTO video_hashtags VALUES(?,?)",
            source.id,
            one("SELECT id FROM hashtags WHERE name=?", tag).id,
          );
        }
      });
      try {
        await buildHls(clip, source.id, temporary);
        run("UPDATE videos SET hls=1 WHERE id=?", source.id);
      } catch (e) {
        console.warn(
          "Adaptive processing failed; MP4 fallback remains available:",
          e.message,
        );
      }
      imported++;
    } catch (e) {
      console.warn("Import skipped:", source.caption, e.message);
    } finally {
      await Promise.all(
        [raw, clip, ...temporary].map((p) => unlink(p).catch(() => {})),
      );
    }
  }
  console.log(
    `Open collection: ${one("SELECT count(*) n FROM videos WHERE user_id=?", owner).n} real videos (${imported} added).`,
  );
  return imported;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await importVideos();
