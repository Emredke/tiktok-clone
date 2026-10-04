if (process.env.NODE_ENV !== "test")
  throw new Error("Test fixture setup is restricted to NODE_ENV=test.");
const { seed } = await import("../scripts/seed.js");
await seed();
const { run } = await import("../server/db.js");
run("UPDATE users SET role='admin',onboarded=1 WHERE id='demo-1'");
