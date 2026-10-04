import { resolve } from "node:path";
if (process.env.NODE_ENV !== "test")
  throw new Error("Test fixture setup is restricted to NODE_ENV=test.");
if (resolve(process.env.DATABASE_PATH || "") !== resolve("data/e2e.sqlite"))
  throw new Error(
    "Browser fixtures must use the disposable data/e2e.sqlite database.",
  );
const { seed } = await import("../scripts/seed.js");
await seed();
const { run } = await import("../server/db.js");
run("UPDATE users SET role='admin',onboarded=1 WHERE id='demo-1'");

// Reset only beta fixtures in the named disposable browser-test database.
for (const table of [
  "beta_invites",
  "beta_feedback",
  "beta_devices",
  "challenge_entries",
])
  run(`DELETE FROM ${table}`);
