import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import request from "supertest";
const dir = mkdtempSync(join(tmpdir(), "velo-quests-"));
process.env.DATABASE_PATH = join(dir, "test.sqlite");
process.env.NODE_ENV = "test";
const { app } = await import("../server/app.js");
const { db, run, one } = await import("../server/db.js");
const { hashToken } = await import("../server/auth.js");
const { questWeek, questState } = await import("../server/quests.js");
for (const id of ["quest-a", "quest-b", "quest-c", "unverified"]) {
  run(
    "INSERT INTO users(id,email,password_hash,verified) VALUES(?,?,?,?)",
    id,
    `${id}@example.invalid`,
    "unused",
    id === "unverified" ? 0 : 1,
  );
  run(
    "INSERT INTO profiles(user_id,username,display_name) VALUES(?,?,?)",
    id,
    id.replace("-", "_"),
    id,
  );
  run(
    "INSERT INTO sessions VALUES(?,?,?)",
    hashToken(id),
    id,
    Date.now() + 3600000,
  );
}
const call = (user, path, body) =>
  body === undefined
    ? request(app).get(path).set("Cookie", `velo_session=${user}`)
    : request(app).post(path).set("Cookie", `velo_session=${user}`).send(body);
function video(id, creator, category = "Travel", extra = {}) {
  run(
    "INSERT INTO videos(id,user_id,caption,category,video_url,thumbnail_url,duration) VALUES(?,?,?,?,?,?,?)",
    id,
    creator,
    id,
    category,
    "/test.mp4",
    "/test.jpg",
    2,
  );
  for (const [key, value] of Object.entries(extra))
    run(`UPDATE videos SET ${key}=? WHERE id=?`, value, id);
}
after(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

test("quest weeks reset at Monday UTC across month and year boundaries", () => {
  assert.equal(questWeek(new Date("2026-10-04T23:59:59Z")).id, "2026-09-28");
  assert.equal(questWeek(new Date("2026-10-05T00:00:00Z")).id, "2026-10-05");
  assert.equal(questWeek(new Date("2027-01-01T00:00:00Z")).id, "2026-12-28");
});
test("private, verified, server-checked claims award once even when requests race", async () => {
  await request(app)
    .post("/api/quests/scout/claim")
    .send({ xp: 99999 })
    .expect(401);
  await call("unverified", "/api/quests/scout/claim", {}).expect(403);
  await call("quest-a", "/api/quests/scout/claim", { xp: 99999 }).expect(409);
  for (const [id, creator, category] of [
    ["q1", "quest-b", "Travel"],
    ["q2", "quest-b", "Food"],
    ["q3", "quest-c", "Animals"],
  ]) {
    video(id, creator, category);
    await call("quest-a", `/api/videos/${id}/save`, { active: true }).expect(
      200,
    );
  }
  const outcomes = await Promise.all([
    call("quest-a", "/api/quests/scout/claim", { xp: 99999 }),
    call("quest-a", "/api/quests/scout/claim", {}),
  ]);
  assert.deepEqual(
    outcomes.map((r) => r.body.awarded).sort((a, b) => a - b),
    [0, 40],
  );
  assert.equal(
    (await call("quest-a", "/api/quests?user_id=quest-b")).body.xp,
    40,
  );
  assert.equal(
    (await call("quest-b", "/api/quests?user_id=quest-a")).body.xp,
    0,
  );
  assert.equal(
    (await request(app).get("/api/quests?user_id=quest-a")).body.xp,
    0,
  );
  assert.match(
    (await call("quest-a", "/api/quests")).headers["cache-control"],
    /no-store/,
  );
  await call("quest-a", "/api/quests/not-a-quest/claim", {}).expect(404);
});
test("curation requires one current collection and two visible distinct creators", async () => {
  const library = (
    await call("quest-a", "/api/libraries", {
      kind: "collection",
      name: "Quest collection",
    }).expect(201)
  ).body.library;
  await call("quest-a", `/api/libraries/${library.id}/items`, {
    video_id: "q1",
  }).expect(200);
  await call("quest-a", `/api/libraries/${library.id}/items`, {
    video_id: "q2",
  }).expect(200);
  await call("quest-a", "/api/quests/curator/claim", {}).expect(409);
  await call("quest-a", `/api/libraries/${library.id}/items`, {
    video_id: "q3",
  }).expect(200);
  run("INSERT INTO blocks VALUES(?,?)", "quest-c", "quest-a");
  await call("quest-a", "/api/quests/curator/claim", {}).expect(409);
  run("DELETE FROM blocks");
  const response = await call(
    "quest-a",
    "/api/quests/curator/claim",
    {},
  ).expect(200);
  assert.equal(response.body.awarded, 60);
  await call("quest-b", "/api/quests/curator/claim", {}).expect(409);
});
test("creator quest rejects imports, remixes, processing and private videos; earned XP survives weekly resets", async () => {
  video("import", "quest-a", "Travel", {
    source_json: JSON.stringify({ author: "Archive" }),
  });
  video("remix", "quest-a", "Travel", { parent_id: "q1" });
  video("processing", "quest-a", "Travel", { status: "processing" });
  video("private", "quest-a", "Travel", { privacy: "private" });
  video("seed-fictional", "quest-a");
  await call("quest-a", "/api/quests/maker/claim", {}).expect(409);
  video("original", "quest-a");
  const result = await call("quest-a", "/api/quests/maker/claim", {}).expect(
    200,
  );
  assert.equal(result.body.state.xp, 200);
  assert.equal(result.body.state.level, 2);
  assert.equal(result.body.state.badges.length, 3);
  run("DELETE FROM videos WHERE id='original'");
  const future = new Date(Date.now() + 8 * 86400000);
  const state = questState("quest-a", () => null, future);
  assert.equal(state.xp, 200);
  assert.equal(state.badges.length, 3);
  assert.ok(state.quests.every((q) => !q.claimed && q.progress === 0));
  run(
    "UPDATE users SET suspended_until=? WHERE id='quest-a'",
    Date.now() + 60000,
  );
  await call("quest-a", "/api/quests/maker/claim", {}).expect(403);
  assert.equal((await call("quest-a", "/api/quests")).body.xp, 0);
  assert.equal(one("SELECT count(*) n FROM quest_claims").n, 3);
});
