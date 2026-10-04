import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import request from "supertest";
const dir = mkdtempSync(join(tmpdir(), "velo-community-"));
process.env.DATABASE_PATH = join(dir, "test.sqlite");
process.env.MEDIA_DIR = resolve("data/media");
process.env.NODE_ENV = "test";
process.env.VAPID_FILE = join(dir, "vapid.json");
const { app } = await import("../server/app.js");
const { db, one, run, all } = await import("../server/db.js");
const { seed } = await import("../scripts/seed.js");
const { settings, sendMessage, pushEvent } =
  await import("../server/social.js");
const { initPush, deliverPush, validEndpoint } =
  await import("../server/push.js");
const { createBackup } = await import("../server/backups.js");
const { exec } = await import("../server/storage.js");
const { startWorker, stopWorker } = await import("../server/jobs.js");
const a = request.agent(app),
  b = request.agent(app),
  guest = request(app);
let aid, bid;
before(async () => {
  await seed();
  await initPush();
  for (const [agent, email] of [
    [a, "comedy1@demo.velo.invalid"],
    [b, "sports2@demo.velo.invalid"],
  ])
    await agent
      .post("/api/auth/login")
      .send({ email, password: "VeloDemo!2026" })
      .expect(200);
  aid = one(
    "SELECT user_id FROM profiles WHERE username='comedy_studio1'",
  ).user_id;
  bid = one(
    "SELECT user_id FROM profiles WHERE username='sports_studio2'",
  ).user_id;
  startWorker();
});
after(async () => {
  await stopWorker();
  db.close();
  rmSync(dir, { recursive: true, force: true });
});
const fullSettings = (s) => ({
  ...s,
  history_enabled: !!s.history_enabled,
  push_messages: !!s.push_messages,
  push_replies: !!s.push_replies,
  push_uploads: !!s.push_uploads,
});
const view = {
  position: 2.25,
  watch_seconds: 3,
  completion: 0.5,
  rewatches: 0,
  skip_seconds: 3,
};
test("history is private, resumes at a saved position, pauses and clears separately from analytics", async () => {
  await guest.get("/api/history").expect(401);
  await a.post("/api/videos/seed-01/view").send(view).expect(200);
  assert.equal((await a.get("/api/history")).body.videos[0].position, 2.25);
  assert.equal((await b.get("/api/history")).body.videos.length, 0);
  await a
    .put("/api/settings")
    .send({ ...fullSettings(settings(aid)), history_enabled: false })
    .expect(200);
  await a.post("/api/videos/seed-02/view").send(view).expect(200);
  assert.equal(
    one("SELECT count(*) n FROM watch_history WHERE user_id=?", aid).n,
    1,
  );
  await a.delete("/api/history").send({}).expect(200);
  assert.equal(
    one("SELECT count(*) n FROM watch_history WHERE user_id=?", aid).n,
    0,
  );
  assert.ok(
    one("SELECT count(*) n FROM video_views WHERE user_id=? AND is_demo=0", aid)
      .n >= 2,
  );
  await a
    .put("/api/settings")
    .send({ ...fullSettings(settings(aid)), history_enabled: true })
    .expect(200);
});
test("collections enforce owner access and playlists enforce creator ownership, ordering and visibility", async () => {
  const c = (
    await a
      .post("/api/libraries")
      .send({ kind: "collection", name: "Favorites" })
      .expect(201)
  ).body.library;
  await a
    .post(`/api/libraries/${c.id}/items`)
    .send({ video_id: "seed-01" })
    .expect(200);
  await guest.get(`/api/libraries/${c.id}`).expect(404);
  await b.delete(`/api/libraries/${c.id}`).send({}).expect(404);
  assert.equal(
    (await a.get(`/api/libraries/${c.id}`)).body.videos[0].id,
    "seed-01",
  );
  const own = all("SELECT id FROM videos WHERE user_id=? LIMIT 2", aid).map(
      (v) => v.id,
    ),
    other = one("SELECT id FROM videos WHERE user_id!=?", aid).id;
  const p = (
    await a
      .post("/api/libraries")
      .send({ kind: "playlist", name: "My series" })
      .expect(201)
  ).body.library;
  await a
    .post(`/api/libraries/${p.id}/items`)
    .send({ video_id: other })
    .expect(403);
  for (const id of own)
    await a
      .post(`/api/libraries/${p.id}/items`)
      .send({ video_id: id })
      .expect(200);
  await a
    .put(`/api/libraries/${p.id}/order`)
    .send({ ids: own.slice().reverse() })
    .expect(200);
  assert.deepEqual(
    (await guest.get(`/api/libraries/${p.id}`)).body.videos.map((v) => v.id),
    own.slice().reverse(),
  );
  await a
    .put(`/api/libraries/${p.id}/order`)
    .send({ ids: [own[0], own[0]] })
    .expect(400);
  run("UPDATE videos SET privacy='private' WHERE id=?", own[0]);
  assert.equal(
    (await guest.get(`/api/libraries/${p.id}`)).body.videos.length,
    1,
  );
  run("UPDATE videos SET privacy='public' WHERE id=?", own[0]);
  await a
    .patch(`/api/libraries/${c.id}`)
    .send({ name: "Travel finds" })
    .expect(200);
  await a.delete(`/api/libraries/${c.id}/items/seed-01`).send({}).expect(200);
  await a.delete(`/api/libraries/${c.id}`).send({}).expect(200);
});
test("chat requests, replies, receipts, privacy policies and bilateral blocks", async () => {
  run(
    "DELETE FROM follows WHERE (follower_id=? AND following_id=?) OR (follower_id=? AND following_id=?)",
    aid,
    bid,
    bid,
    aid,
  );
  run("DELETE FROM messages");
  const first = (
    await a
      .post("/api/chats/sports_studio2")
      .send({ body: "Hello!" })
      .expect(201)
  ).body.id;
  await a
    .post("/api/chats/sports_studio2")
    .send({ body: "A second message" })
    .expect(201);
  await a
    .post("/api/chats/sports_studio2")
    .send({ body: "A third message" })
    .expect(201);
  await a
    .post("/api/chats/sports_studio2")
    .send({ body: "Too many" })
    .expect(429);
  assert.equal((await b.get("/api/chats/comedy_studio1")).body.request, true);
  await b.post("/api/inbox/read").send({ all: true }).expect(200);
  assert.equal(
    one("SELECT read_at FROM messages WHERE id=?", first).read_at,
    null,
  );
  await b.post("/api/chats/comedy_studio1/read").send({}).expect(200);
  assert.equal(
    one("SELECT read_at FROM messages WHERE id=?", first).read_at,
    null,
  );
  await b.post("/api/chats/comedy_studio1/accept").send({}).expect(200);
  await b.post("/api/chats/comedy_studio1/read").send({}).expect(200);
  assert.ok(one("SELECT read_at FROM messages WHERE id=?", first).read_at);
  await b
    .post("/api/chats/comedy_studio1")
    .send({ body: "Welcome", reply_id: first })
    .expect(201);
  await a
    .post("/api/chats/sports_studio2")
    .send({ body: "Invalid reply", reply_id: "not-my-thread" })
    .expect(404);
  run("UPDATE videos SET privacy='private' WHERE id='seed-01'");
  await b
    .post("/api/chats/comedy_studio1")
    .send({ video_id: "seed-01" })
    .expect(403);
  run("UPDATE videos SET privacy='public' WHERE id='seed-01'");
  await b
    .put("/api/settings")
    .send({ ...fullSettings(settings(bid)), message_policy: "off" })
    .expect(200);
  await a
    .post("/api/chats/sports_studio2")
    .send({ body: "No permission" })
    .expect(403);
  await b
    .put("/api/settings")
    .send({ ...fullSettings(settings(bid)), message_policy: "requests" })
    .expect(200);
  run("INSERT OR IGNORE INTO blocks VALUES(?,?)", bid, aid);
  await a.get("/api/chats/sports_studio2").expect(404);
  await a
    .post("/api/chats/sports_studio2")
    .send({ body: "Blocked" })
    .expect(404);
  assert.equal((await a.get("/api/chats")).body.chats.length, 0);
  run("DELETE FROM blocks WHERE user_id=? AND blocked_id=?", bid, aid);
});
test("authenticated live stream delivers updates and rejects guests", async () => {
  await guest.get("/api/live").expect(401);
  const server = app.listen(0, "127.0.0.1");
  try {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "comedy1@demo.velo.invalid", password: "VeloDemo!2026" })
      .expect(200);
    const controller = new AbortController(),
      response = await fetch(
        `http://127.0.0.1:${server.address().port}/api/live`,
        {
          headers: { cookie: login.headers["set-cookie"][0].split(";")[0] },
          signal: controller.signal,
        },
      );
    assert.equal(response.status, 200);
    const reader = response.body.getReader();
    assert.match(
      new TextDecoder().decode((await reader.read()).value),
      /event: ready/,
    );
    const { live } = await import("../server/social.js");
    live(aid);
    const chunk = await reader.read();
    assert.match(new TextDecoder().decode(chunk.value), /event: refresh/);
    controller.abort();
    await reader.cancel().catch(() => {});
  } finally {
    await new Promise((r) => server.close(r));
  }
});
test("conversation cursors retrieve older messages and reject unrelated IDs", async () => {
  const id = "cursor-unrelated";
  run(
    "INSERT INTO messages(id,sender_id,recipient_id,body) VALUES(?,?,?,?)",
    id,
    aid,
    "demo-3",
    "Another conversation",
  );
  for (let i = 0; i < 105; i++)
    run(
      "INSERT INTO messages(id,sender_id,recipient_id,body) VALUES(?,?,?,?)",
      `cursor-${i}`,
      aid,
      bid,
      `Message ${i}`,
    );
  const latest = (await a.get("/api/chats/sports_studio2").expect(200)).body;
  assert.equal(latest.messages.length, 100);
  assert.equal(latest.hasMore, true);
  const earlier = (
    await a
      .get(`/api/chats/sports_studio2?before=${latest.messages[0].id}`)
      .expect(200)
  ).body;
  assert.ok(earlier.messages.length > 0);
  assert.ok(
    earlier.messages.every((m) => !latest.messages.some((v) => v.id === m.id)),
  );
  await a.get(`/api/chats/sports_studio2?before=${id}`).expect(400);
});
test("sound library plays real audio, voiceovers stay private and published mixes are audible with licensed credits", async () => {
  const list = (await guest.get("/api/sounds").expect(200)).body.sounds;
  assert.equal(list.length, 9);
  assert.ok(list.every((s) => s.license === "CC0 1.0"));
  await guest.get("/api/sounds/chime/audio").expect(200);
  const audio = join(dir, "voice.wav");
  await exec("ffmpeg", [
    "-nostdin",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=700:duration=2",
    audio,
  ]);
  const v = (
    await a
      .post("/api/voiceovers")
      .attach("audio", audio, { contentType: "audio/wav" })
      .expect(201)
  ).body.voiceover;
  await b.get(v.url).expect(404);
  await guest.get(v.url).expect(401);
  await a.get(v.url).expect(200);
  const upload = (agent, voice) =>
    agent
      .post("/api/upload")
      .field("caption", "Audible soundtrack")
      .field("category", "Music")
      .field("end", "2")
      .field("mute", "true")
      .field("sound_id", "morning")
      .field("voiceover_id", voice)
      .field("auto_captions", "false")
      .attach("video", "data/media/seed-01.mp4", { contentType: "video/mp4" });
  await upload(b, v.id).expect(403);
  const queued = (await upload(a, v.id).expect(202)).body.job;
  let ready;
  for (let i = 0; i < 240; i++) {
    const result = (await a.get(`/api/jobs/${queued.id}`)).body;
    if (result.job.status === "failed") throw new Error(result.job.error);
    if (result.job.status === "completed") {
      ready = result;
      break;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  assert.ok(ready);
  assert.equal(ready.video.audio_source.license, "CC0 1.0");
  const location = one(
      "SELECT video_url FROM videos WHERE id=?",
      ready.video.id,
    ).video_url,
    media = resolve("data/media", location.split("/").at(-1));
  const measurement = await exec("ffmpeg", [
    "-i",
    media,
    "-af",
    "volumedetect",
    "-f",
    "null",
    "-",
  ]);
  const dbValue = Number(
    measurement.stderr.match(/mean_volume: ([-.\d]+) dB/)[1],
  );
  assert.ok(dbValue > -40, `audio must be audible: ${dbValue}dB`);
  assert.ok(
    (await a.get(`/api/stream/${ready.video.id}/master.m3u8`)).text.includes(
      "#EXTM3U",
    ),
  );
});
test("push validates remote destinations, respects preferences and deletes expired subscriptions", async () => {
  assert.equal(validEndpoint("https://127.0.0.1/private"), false);
  assert.equal(
    validEndpoint("https://fcm.googleapis.com.evil.invalid/push"),
    false,
  );
  assert.equal(validEndpoint("http://fcm.googleapis.com/x"), false);
  await a
    .post("/api/push/subscriptions")
    .send({
      endpoint: "https://localhost/x",
      keys: { p256dh: "A".repeat(87), auth: "B".repeat(22) },
    })
    .expect(400);
  const endpoint = "https://fcm.googleapis.com/test";
  await a
    .post("/api/push/subscriptions")
    .send({ endpoint, keys: { p256dh: "A".repeat(87), auth: "B".repeat(22) } })
    .expect(201);
  run("DELETE FROM push_queue");
  pushEvent(aid, bid, "messages");
  let deliveries = 0;
  await deliverPush(async () => {
    deliveries++;
    throw { statusCode: 410 };
  });
  assert.equal(deliveries, 1);
  assert.equal(one("SELECT count(*) n FROM push_subscriptions").n, 0);
  await a
    .put("/api/settings")
    .send({ ...fullSettings(settings(aid)), push_messages: false })
    .expect(200);
  pushEvent(aid, bid, "messages");
  assert.equal(one("SELECT count(*) n FROM push_queue").n, 0);
});
test("online SQLite snapshot verifies integrity and restores durable relationships without overwriting", async () => {
  const { path, manifest } = await createBackup(join(dir, "backups"));
  assert.ok(manifest.sha256);
  const restored = join(dir, "restored.sqlite");
  await exec(process.execPath, ["scripts/restore.js", path, restored]);
  const copy = new DatabaseSync(restored, { readOnly: true });
  try {
    assert.equal(
      copy.prepare("SELECT count(*) n FROM videos").get().n,
      one("SELECT count(*) n FROM videos").n,
    );
    assert.equal(
      copy.prepare("SELECT count(*) n FROM messages").get().n,
      one("SELECT count(*) n FROM messages").n,
    );
  } finally {
    copy.close();
  }
  await assert.rejects(
    exec(process.execPath, ["scripts/restore.js", path, restored]),
    /Target exists/,
  );
  const bytes = readFileSync(path);
  bytes[100] ^= 255;
  writeFileSync(path, bytes);
  await assert.rejects(
    exec(process.execPath, [
      "scripts/restore.js",
      path,
      join(dir, "corrupt.sqlite"),
    ]),
    /checksum mismatch/,
  );
});
