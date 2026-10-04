import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import request from "supertest";
const dir = mkdtempSync(join(tmpdir(), "velo-club-"));
process.env.DATABASE_PATH = join(dir, "club.sqlite");
process.env.NODE_ENV = "test";
const { app } = await import("../server/app.js");
const { run, one, db } = await import("../server/db.js");
const { hashToken } = await import("../server/auth.js");
const { currentChallenge } = await import("../server/club.js");
for (const id of ["a", "b", "host", "unverified"]) {
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
    `club_${id}`,
    id,
  );
  run(
    "INSERT INTO sessions VALUES(?,?,?)",
    hashToken(id),
    id,
    Date.now() + 3600000,
  );
}
run("UPDATE users SET role='admin' WHERE id='host'");
function call(user, method, path, body) {
  const r = request(app)[method](path).set("Cookie", `velo_session=${user}`);
  return body === undefined ? r : r.send(body);
}
function video(id, user, extra = {}) {
  run(
    "INSERT INTO videos(id,user_id,caption,category,video_url,thumbnail_url,duration) VALUES(?,?,?,'Animals','/unused.mp4','/unused.jpg',5)",
    id,
    user,
    id,
  );
  for (const [key, val] of Object.entries(extra))
    run(`UPDATE videos SET ${key}=? WHERE id=?`, val, id);
}
after(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});
test("first adventure checks actual interests, visible saves and email; reward is private and permanent", async () => {
  await request(app).post("/api/club/adventure/claim").send({}).expect(401);
  await call("unverified", "post", "/api/club/adventure/claim", {}).expect(403);
  await call("a", "post", "/api/club/adventure/claim", { xp: 10000 }).expect(
    409,
  );
  await call("a", "put", "/api/preferences", { interests: ["Animals"] }).expect(
    200,
  );
  video("treasure", "b");
  await call("a", "post", "/api/videos/treasure/save", { active: true }).expect(
    200,
  );
  run("INSERT INTO blocks VALUES('b','a')");
  await call("a", "post", "/api/club/adventure/claim", {}).expect(409);
  run("DELETE FROM blocks");
  const r = await Promise.all([
    call("a", "post", "/api/club/adventure/claim", { xp: 10000 }),
    call("a", "post", "/api/club/adventure/claim", {}),
  ]);
  assert.deepEqual(
    r.map((x) => x.body.awarded).sort((a, b) => a - b),
    [0, 25],
  );
  assert.equal(
    (await call("a", "get", "/api/club")).body.adventure.claimed,
    true,
  );
  assert.equal((await call("b", "get", "/api/club?user_id=a")).body.xp, 0);
  assert.equal(
    (await request(app).get("/api/club?user_id=a")).body.adventure.claimed,
    false,
  );
  assert.ok(
    (await call("a", "get", "/api/quests")).body.badges.some(
      (b) => b.id === "first-adventure",
    ),
  );
  run("DELETE FROM bookmarks WHERE user_id='a'");
  assert.equal(
    (await call("a", "get", "/api/club")).body.adventure.claimed,
    true,
  );
  await call("a", "put", "/api/club/adventure", { dismissed: true }).expect(
    200,
  );
  assert.equal(
    (await call("a", "get", "/api/club")).body.adventure.dismissed,
    true,
  );
});
test("cosmetic unlocks use earned XP; selected public style exposes no XP and is durable", async () => {
  await call("a", "put", "/api/club/style", {
    kind: "cover",
    id: "cosmos",
    xp: 9999,
  }).expect(403);
  await call("a", "put", "/api/club/style", {
    kind: "title",
    id: "cosmos",
  }).expect(403);
  run(
    "INSERT INTO quest_claims(user_id,week,quest_id,xp) VALUES('a','fixture','maker',200)",
  );
  for (const [kind, id] of [
    ["cover", "cosmos"],
    ["frame", "orbit"],
    ["title", "explorer"],
  ])
    await call("a", "put", "/api/club/style", { kind, id }).expect(200);
  const s = (await call("a", "get", "/api/club")).body;
  assert.equal(s.style.cover, "cosmos");
  assert.equal(s.level, 2);
  const p = (await request(app).get("/api/profiles/club_a")).body.profile;
  assert.equal(p.club_style.frame, "orbit");
  assert.equal(p.club_style.titleLabel, "Field explorer");
  assert.equal(p.xp, undefined);
  assert.equal(p.club_style.xp, undefined);
  await call("b", "put", "/api/club/style", {
    kind: "cover",
    id: "cosmos",
  }).expect(403);
  await call("a", "put", "/api/club/style", {
    kind: "cover",
    id: "forest",
  }).expect(403);
});
test("weekly challenge validates ownership and original public footage, filters showcase, and awards once", async () => {
  const c = currentChallenge();
  assert.equal(currentChallenge(new Date(`${c.week}T12:00:00Z`)).id, c.id);
  assert.notEqual(
    currentChallenge(new Date(Date.parse(`${c.week}T00:00:00Z`) + 7 * 86400000))
      .id,
    c.id,
  );
  await call("a", "post", "/api/challenges/claim", {}).expect(409);
  for (const [id, extra] of [
    ["archive", { source_json: '{"author":"Archive"}' }],
    ["remix", { parent_id: "treasure" }],
    ["private", { privacy: "private" }],
    ["pending", { status: "processing" }],
    ["old", { created_at: "2020-01-01 00:00:00" }],
    ["seed-mock", {}],
  ]) {
    video(id, "a", extra);
    await call("a", "post", "/api/challenges/entry", { video_id: id }).expect(
      409,
    );
  }
  await call("a", "post", "/api/challenges/entry", {
    video_id: "treasure",
  }).expect(409);
  video("original", "a");
  await call("unverified", "post", "/api/challenges/entry", {
    video_id: "original",
  }).expect(403);
  await call("a", "post", "/api/challenges/entry", {
    video_id: "original",
  }).expect(201);
  assert.equal(
    (await call("b", "get", "/api/challenges")).body.entries.length,
    1,
  );
  const r = await Promise.all([
    call("a", "post", "/api/challenges/claim", { xp: 9999 }),
    call("a", "post", "/api/challenges/claim", {}),
  ]);
  assert.deepEqual(
    r.map((x) => x.body.awarded).sort((a, b) => a - b),
    [0, 75],
  );
  run("INSERT INTO blocks VALUES('b','a')");
  assert.equal(
    (await call("b", "get", "/api/challenges")).body.entries.length,
    0,
  );
  run("DELETE FROM blocks");
  run("UPDATE videos SET privacy='private' WHERE id='original'");
  assert.equal(
    (await request(app).get("/api/challenges")).body.entries.length,
    0,
  );
  assert.equal((await call("a", "get", "/api/challenges")).body.entry, null);
  await call("a", "delete", "/api/challenges/entry", {}).expect(200);
  assert.equal((await call("a", "get", "/api/challenges")).body.claimed, true);
  assert.ok(
    (await call("a", "get", "/api/quests")).body.badges.some(
      (b) => b.id === "challenge",
    ),
  );
});
test("ten single-use invitations require staff, reject expiry and replay, and gate signup transactionally", async () => {
  await call("a", "post", "/api/beta/invites", { label: "Nope" }).expect(403);
  await call("a", "get", "/api/beta/manage").expect(403);
  await call("a", "get", "/api/beta").expect(403);
  const invites = [];
  for (let i = 0; i < 10; i++)
    invites.push(
      (
        await call("host", "post", "/api/beta/invites", {
          label: `Tester ${i + 1}`,
        }).expect(201)
      ).body,
    );
  await call("host", "post", "/api/beta/invites", { label: "11" }).expect(409);
  assert.equal(
    one("SELECT token_hash FROM beta_invites WHERE id=?", invites[0].id)
      .token_hash,
    hashToken(invites[0].token),
  );
  assert.ok(
    (await call("host", "get", "/api/beta/manage")).body.invites.every(
      (i) => !i.token && !i.token_hash,
    ),
  );
  run("UPDATE beta_invites SET expires_at=0 WHERE id=?", invites[0].id);
  await call("a", "post", "/api/beta/join", { token: invites[0].token }).expect(
    403,
  );
  await call("host", "delete", `/api/beta/invites/${invites[1].id}`, {}).expect(
    200,
  );
  await call("a", "post", "/api/beta/join", { token: invites[1].token }).expect(
    403,
  );
  await call("a", "post", "/api/beta/join", { token: invites[2].token }).expect(
    200,
  );
  await call("b", "post", "/api/beta/join", { token: invites[2].token }).expect(
    403,
  );
  await call("host", "delete", `/api/beta/invites/${invites[2].id}`, {}).expect(
    409,
  );
  await call("host", "post", "/api/beta/invites", {
    label: "Replacement",
  }).expect(201);
  process.env.BETA_INVITE_ONLY = "1";
  const account = {
    email: "invited@example.invalid",
    password: "ValidPassword!2026",
    username: "invited_person",
    display_name: "Invited person",
  };
  await request(app).post("/api/auth/signup").send(account).expect(403);
  assert.equal(
    one("SELECT id FROM users WHERE email=?", account.email),
    undefined,
  );
  await request(app)
    .post("/api/auth/signup")
    .send({ ...account, invite: invites[3].token })
    .expect(201);
  assert.ok(
    one("SELECT used_by FROM beta_invites WHERE id=?", invites[3].id).used_by,
  );
  delete process.env.BETA_INVITE_ONLY;
});
test("beta feedback and physical-device reports stay private; staff can triage without inventing passes", async () => {
  await call("b", "post", "/api/beta/feedback", {
    kind: "idea",
    body: "This should stay private.",
  }).expect(403);
  const f = (
    await call("a", "post", "/api/beta/feedback", {
      kind: "bug",
      body: "The player needs a clearer sound control.",
      page: "/v/original",
    }).expect(201)
  ).body;
  assert.equal((await call("a", "get", "/api/beta")).body.feedback.length, 1);
  await call("b", "get", "/api/beta").expect(403);
  await call("a", "put", `/api/beta/feedback/${f.id}`, {
    status: "done",
  }).expect(403);
  await call("host", "put", `/api/beta/feedback/${f.id}`, {
    status: "reviewing",
  }).expect(200);
  assert.equal(
    (await call("a", "get", "/api/beta")).body.feedback[0].status,
    "reviewing",
  );
  await call("a", "post", "/api/beta/devices", {
    model: "iPhone 16 Pro",
    platform: "ios",
    browser: "Safari",
    results: {
      playback: "untested",
      camera: "untested",
      upload: "untested",
      accessibility: "untested",
    },
  }).expect(201);
  assert.ok(
    Object.values(
      (await call("a", "get", "/api/beta")).body.devices[0].results,
    ).every((v) => v === "untested"),
  );
  assert.equal(
    (await call("host", "get", "/api/beta/manage")).body.devices[0].model,
    "iPhone 16 Pro",
  );
  run("UPDATE users SET suspended_until=? WHERE id='a'", Date.now() + 10000);
  await call("a", "post", "/api/beta/feedback", {
    kind: "idea",
    body: "Suspended accounts cannot send this.",
  }).expect(403);
  await call("a", "put", "/api/club/style", {
    kind: "cover",
    id: "paper",
  }).expect(403);
  assert.equal((await call("a", "get", "/api/club")).body.xp, 0);
});

test("one account cannot exhaust another account’s upload allowance on a shared network", async () => {
  for (let i = 0; i < 10; i++)
    await call("host", "post", "/api/upload", {}).expect(400);
  await call("host", "post", "/api/upload", {}).expect(429);
  await call("b", "post", "/api/upload", {}).expect(400);
  await request(app).post("/api/upload").send({}).expect(401);
});
