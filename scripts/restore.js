import { constants } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { readFile, copyFile, access, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
// Restore into a new path only. Stop the server before switching DATABASE_PATH.
const [source, target] = process.argv.slice(2);
if (!source || !target)
  throw new Error(
    "Usage: npm run restore -- backup.sqlite NEW-DATABASE.sqlite",
  );
const from = resolve(source),
  to = resolve(target);
try {
  await access(to);
  throw new Error("Target exists. Restore into a new path.");
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const bytes = await readFile(from),
  manifest = JSON.parse(await readFile(from + ".json", "utf8"));
if (createHash("sha256").update(bytes).digest("hex") !== manifest.sha256)
  throw new Error("Backup checksum mismatch.");
const check = new DatabaseSync(from, { readOnly: true });
try {
  if (check.prepare("PRAGMA integrity_check").get().integrity_check !== "ok")
    throw new Error("Invalid backup.");
} finally {
  check.close();
}
await mkdir(dirname(to), { recursive: true });
await copyFile(from, to, constants.COPYFILE_EXCL);
console.log(
  `Verified database restored to ${to}. Stop the app, point DATABASE_PATH here, and restart. Keep the same media bucket; local media must be restored separately.`,
);
