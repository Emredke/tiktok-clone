import { migrate } from "./migrations.js";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
const path = process.env.DATABASE_PATH || "./data/velo.sqlite";
if (path !== ":memory:") mkdirSync(dirname(resolve(path)), { recursive: true });
export const db = new DatabaseSync(path, { timeout: 5000 });
db.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
migrate(db);
export const all = (sql, ...args) => db.prepare(sql).all(...args);
export const one = (sql, ...args) => db.prepare(sql).get(...args);
export const run = (sql, ...args) => db.prepare(sql).run(...args);
export function transaction(fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const r = fn();
    db.exec("COMMIT");
    return r;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
