import { backup, DatabaseSync } from "node:sqlite";
import {
  mkdir,
  readFile,
  readdir,
  unlink,
  writeFile,
  chmod,
} from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { db, one } from "./db.js";
let busy = false,
  timer;
export async function createBackup(
  directory = process.env.BACKUP_DIR || "./data/backups",
) {
  if (busy) throw new Error("A backup is already running.");
  busy = true;
  try {
    const dir = resolve(directory);
    await mkdir(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-"),
      name = `velo-${stamp}.sqlite`,
      path = join(dir, name);
    await backup(db, path);
    await chmod(path, 0o600);
    const check = new DatabaseSync(path, { readOnly: true });
    try {
      if (
        check.prepare("PRAGMA integrity_check").get().integrity_check !== "ok"
      )
        throw new Error("Backup failed integrity verification.");
    } finally {
      check.close();
    }
    const bytes = await readFile(path),
      manifest = {
        created_at: new Date().toISOString(),
        database: name,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        bytes: bytes.length,
        storage: process.env.STORAGE_DRIVER || "local",
        bucket: process.env.S3_BUCKET || null,
        media_note:
          "Media objects are retained in the configured bucket. Enable bucket versioning and retention; this database snapshot does not copy media.",
        videos: one("SELECT count(*) n FROM videos").n,
      };
    if (process.env.STORAGE_DRIVER === "s3") {
      const s3 = new S3Client({
        region: process.env.S3_REGION || "us-east-1",
        endpoint: process.env.S3_ENDPOINT || undefined,
        forcePathStyle: !!process.env.S3_ENDPOINT,
      });
      const prefix = process.env.BACKUP_PREFIX || "backups/";
      for (const [key, body, type] of [
        [name, bytes, "application/vnd.sqlite3"],
        [
          `${name}.json`,
          Buffer.from(JSON.stringify(manifest)),
          "application/json",
        ],
      ])
        await s3.send(
          new PutObjectCommand({
            Bucket: process.env.S3_BUCKET,
            Key: prefix + key,
            Body: body,
            ContentType: type,
            ServerSideEncryption: process.env.S3_ENDPOINT
              ? undefined
              : "AES256",
          }),
        );
    }
    await writeFile(`${path}.json`, JSON.stringify(manifest, null, 2), {
      mode: 0o600,
    });
    const old = (await readdir(dir))
      .filter((f) => /^velo-.*\.sqlite$/.test(f))
      .sort()
      .reverse()
      .slice(Number(process.env.BACKUP_KEEP || 7));
    for (const file of old)
      await Promise.all([
        unlink(join(dir, file)),
        unlink(join(dir, file + ".json")).catch(() => {}),
      ]);
    return { path, manifest };
  } finally {
    busy = false;
  }
}
export async function dueBackup() {
  if (process.env.BACKUPS_ENABLED === "0") return;
  const dir = resolve(process.env.BACKUP_DIR || "./data/backups");
  await mkdir(dir, { recursive: true });
  const files = (await readdir(dir))
    .filter((f) => /^velo-.*\.sqlite\.json$/.test(f))
    .sort()
    .reverse();
  let last = 0;
  if (files[0])
    last = Date.parse(
      JSON.parse(await readFile(join(dir, files[0]), "utf8")).created_at,
    );
  if (Date.now() - last >= 86400000) await createBackup(dir);
}
export function startBackups() {
  if (timer) return;
  void dueBackup().catch((e) => console.error("Backup failed:", e.message));
  timer = setInterval(
    () => dueBackup().catch((e) => console.error("Backup failed:", e.message)),
    3600000,
  );
  timer.unref();
}
export async function stopBackups() {
  clearInterval(timer);
  timer = null;
  while (busy) await new Promise((r) => setTimeout(r, 100));
}
