import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import request from "supertest";
const dir = mkdtempSync(join(tmpdir(), "velo-test-"));
process.env.DATABASE_PATH = join(dir, "test.sqlite");
process.env.MEDIA_DIR = resolve("data/media");
process.env.APP_ORIGIN = "http://localhost:3001";
process.env.MAIL_MODE = "development";
process.env.NODE_ENV = "test";
const { app } = await import("../server/app.js");
const { one, run, db } = await import("../server/db.js");
const { seed } = await import("../scripts/seed.js");
const { startWorker, stopWorker } = await import("../server/jobs.js");
const { rankVideos } = await import("../server/recommend.js");
const a = request.agent(app),
  b = request.agent(app),
  guest = request(app);
let alice, bob, uploadId, privateId, comment, reply;
const stamp = Date.now();
const aliceEmail = `alice${stamp}@example.invalid`,
  bobEmail = `bob${stamp}@example.invalid`;
const aliceName = `alice_${stamp.toString().slice(-9)}`,
  bobName = `bob_${stamp.toString().slice(-9)}`;
async function finishUpload(response, agent) {
  const id = response.body.job.id;
  for (let i = 0; i < 120; i++) {
    const r = await agent.get(`/api/jobs/${id}`).expect(200);
    if (r.body.job.status === "failed") throw new Error(r.body.job.error);
    if (r.body.job.status === "completed") {
      response.body.video = r.body.video;
      return;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Upload did not complete.");
}
function emailToken(email, purpose) {
  const files = readdirSync("data/mail").map((f) =>
    JSON.parse(readFileSync(`data/mail/${f}`, "utf8")),
  );
  const found = files
    .reverse()
    .find((v) => v.to === email && v.url.includes(`?${purpose}=`));
  assert.ok(found, `${purpose} mail exists`);
  return new URL(found.url).searchParams.get(purpose);
}
before(async () => {
  await seed();
  startWorker();
});
after(async () => {
  await stopWorker();
  db.close();
  rmSync(dir, { recursive: true, force: true });
  for (const f of readdirSync("data/mail")) {
    const d = JSON.parse(readFileSync(`data/mail/${f}`, "utf8"));
    if ([aliceEmail, bobEmail].includes(d.to)) rmSync(`data/mail/${f}`);
  }
});
test("complete authenticated social flow and authorization", async (t) => {
  await t.test("seed is complete, deterministic and relational", async () => {
    assert.equal(one("SELECT count(*) n FROM videos").n, 36);
    assert.equal(one("SELECT count(*) n FROM users").n, 24);
    assert.equal(one("SELECT count(*) n FROM likes").n, 576);
    await seed();
    assert.equal(one("SELECT count(*) n FROM videos").n, 36);
    assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
  });
  await t.test(
    "guest feed is paginated and media supports byte ranges",
    async () => {
      const d = await guest.get("/api/feed").expect(200);
      assert.equal(d.body.videos.length, 8);
      assert.equal(d.body.hasMore, true);
      const excluded = d.body.videos.map((v) => v.id);
      const next = await guest
        .get(`/api/feed?exclude=${excluded.join(",")}`)
        .expect(200);
      assert.ok(next.body.videos.every((v) => !excluded.includes(v.id)));
      const file = await guest
        .get(d.body.videos[0].video_url)
        .set("Range", "bytes=0-1023")
        .expect(206);
      assert.equal(file.headers["content-type"], "video/mp4");
      assert.equal(file.headers["content-length"], "1024");
    },
  );
  await t.test(
    "signup, persistence, duplicate username, email verification",
    async () => {
      alice = (
        await a
          .post("/api/auth/signup")
          .send({
            email: aliceEmail,
            password: "SecureTestPass!2026",
            username: aliceName,
            display_name: "Alice Test",
          })
          .expect(201)
      ).body.user;
      assert.equal(
        (await a.get("/api/auth/me").expect(200)).body.user.username,
        aliceName,
      );
      await b
        .post("/api/auth/signup")
        .send({
          email: bobEmail,
          password: "SecureTestPass!2026",
          username: aliceName,
          display_name: "Bob",
        })
        .expect(409);
      bob = (
        await b
          .post("/api/auth/signup")
          .send({
            email: bobEmail,
            password: "SecureTestPass!2026",
            username: bobName,
            display_name: "Bob Test",
          })
          .expect(201)
      ).body.user;
      const token = emailToken(aliceEmail, "verify");
      await a.post("/api/auth/verify").send({ token }).expect(200);
      await a.post("/api/auth/verify").send({ token }).expect(400);
      await b
        .post("/api/auth/verify")
        .send({ token: emailToken(bobEmail, "verify") })
        .expect(200);
      assert.equal((await a.get("/api/auth/me")).body.user.verified, 1);
    },
  );
  await t.test(
    "authentication, CSRF and input validation reject unsafe actions",
    async () => {
      await guest
        .post("/api/videos/seed-01/like")
        .send({ active: true })
        .expect(401);
      await a
        .post("/api/videos/seed-01/like")
        .set("Origin", "https://evil.invalid")
        .send({ active: true })
        .expect(403);
      await a
        .post("/api/videos/seed-01/like")
        .send({ active: "yes" })
        .expect(400);
      await a
        .patch("/api/profile")
        .send({
          username: "bad';DROP TABLE users",
          display_name: "Alice",
          bio: "",
        })
        .expect(400);
    },
  );
  await t.test(
    "likes, bookmarks and follows are idempotent and database-backed",
    async () => {
      const first = await a
        .post("/api/videos/seed-01/like")
        .send({ active: true })
        .expect(200);
      const again = await a
        .post("/api/videos/seed-01/like")
        .send({ active: true })
        .expect(200);
      assert.equal(first.body.count, 17);
      assert.equal(again.body.count, 17);
      await a
        .post("/api/videos/seed-01/like")
        .send({ active: false })
        .expect(200);
      await a
        .post("/api/videos/seed-01/save")
        .send({ active: true })
        .expect(200);
      const saved = await a
        .get(`/api/profiles/${aliceName}/videos?tab=saved`)
        .expect(200);
      assert.ok(saved.body.videos.some((v) => v.id === "seed-01"));
      await b.get(`/api/profiles/${aliceName}/videos?tab=saved`).expect(403);
      await a
        .post("/api/profiles/comedy_studio1/follow")
        .send({ active: true })
        .expect(200);
      await a
        .post("/api/profiles/comedy_studio1/follow")
        .send({ active: true })
        .expect(200);
      const following = await a.get("/api/feed?mode=following").expect(200);
      assert.ok(following.body.videos.length > 0);
      assert.ok(following.body.videos.every((v) => v.user_id === "demo-1"));
      await b
        .post(`/api/profiles/${aliceName}/follow`)
        .send({ active: true })
        .expect(200);
      const profile = await a.get(`/api/profiles/${aliceName}`).expect(200);
      assert.equal(profile.body.profile.followers, 1);
    },
  );
  await t.test(
    "comments, nested replies, likes and ownership checks",
    async () => {
      comment = (
        await a
          .post("/api/videos/seed-01/comments")
          .send({ body: "Original test comment" })
          .expect(201)
      ).body.id;
      reply = (
        await b
          .post("/api/videos/seed-01/comments")
          .send({ body: "A real reply", parent_id: comment })
          .expect(201)
      ).body.id;
      await a
        .post(`/api/comments/${reply}/like`)
        .send({ active: true })
        .expect(200);
      const list = (await a.get("/api/videos/seed-01/comments").expect(200))
        .body.comments;
      assert.ok(
        list.some(
          (c) =>
            c.id === reply && c.parent_id === comment && c.likes_count === 1,
        ),
      );
      await b.delete(`/api/comments/${comment}`).send({}).expect(403);
      await a
        .post("/api/videos/seed-02/comments")
        .send({ body: "Wrong parent", parent_id: comment })
        .expect(404);
    },
  );
  await t.test(
    "views record completion and personalized ranker responds to affinity",
    async () => {
      await a
        .post("/api/videos/seed-03/view")
        .send({
          watch_seconds: 21,
          completion: 1,
          rewatches: 2,
          skip_seconds: 21,
        })
        .expect(200);
      await a
        .post("/api/videos/seed-03/like")
        .send({ active: true })
        .expect(200);
      assert.equal(
        one(
          "SELECT completed FROM video_views WHERE user_id=? AND video_id=?",
          alice.user_id,
          "seed-03",
        ).completed,
        1,
      );
      const candidates = [
        {
          id: "unseen-basketball",
          user_id: "demo-3",
          category: "Basketball",
          hashtags: ["basketball"],
          likes_count: 10,
          comments_count: 0,
          shares_count: 0,
          created_at: "2026-01-01 00:00:00",
        },
        {
          id: "unseen-fashion",
          user_id: "demo-9",
          category: "Fashion",
          hashtags: ["fashion"],
          likes_count: 10,
          comments_count: 0,
          shares_count: 0,
          created_at: "2026-01-01 00:00:00",
        },
      ];
      const ranked = rankVideos(candidates, alice.user_id);
      assert.equal(ranked[0].id, "unseen-basketball");
      assert.ok(ranked[0].score > ranked[1].score);
    },
  );
  await t.test(
    "follow-after-watch analytics and image validation",
    async () => {
      await a
        .post("/api/profiles/basketball_studio3/follow")
        .send({ active: true, video_id: "seed-03" })
        .expect(200);
      assert.equal(
        one(
          "SELECT count(*) n FROM analytics_events WHERE user_id=? AND video_id=? AND event='follow_after_watch'",
          alice.user_id,
          "seed-03",
        ).n,
        1,
      );
      await a
        .post("/api/profile/avatar")
        .attach("avatar", "data/media/seed-01.jpg", {
          contentType: "image/jpeg",
        })
        .expect(200);
      await a.get(`/api/avatars/${alice.user_id}`).expect(200);
      await a
        .post("/api/upload")
        .attach("video", Buffer.from("not a video"), {
          filename: "wrong.txt",
          contentType: "text/plain",
        })
        .expect(400);
    },
  );
  await t.test(
    "real video upload, thumbnail generation and playback",
    async () => {
      const d = await a
        .post("/api/upload")
        .field("caption", "My real test upload #original")
        .field("category", "Education")
        .field("hashtags", "original test")
        .field("privacy", "public")
        .field("comments_enabled", "true")
        .field("start", "1")
        .field("end", "5")
        .field("thumbnail", "1")
        .attach("video", "data/media/seed-01.mp4", { contentType: "video/mp4" })
        .expect(202);
      await finishUpload(d, a);
      uploadId = d.body.video.id;
      assert.equal(d.body.video.duration, 4);
      assert.ok(d.body.video.hashtags.includes("original"));
      await guest
        .get(d.body.video.video_url)
        .set("Range", "bytes=0-500")
        .expect(206);
      await guest.get(d.body.video.thumbnail_url).expect(200);
      const own = (await a.get(`/api/profiles/${aliceName}/videos`)).body
        .videos;
      assert.ok(own.some((v) => v.id === uploadId));
      await b.delete(`/api/videos/${uploadId}`).send({}).expect(403);
    },
  );
  await t.test(
    "notifications and in-app sharing store read/unread state",
    async () => {
      await b
        .post(`/api/videos/${uploadId}/like`)
        .send({ active: true })
        .expect(200);
      await b
        .post(`/api/videos/${uploadId}/comments`)
        .send({ body: "Love your upload!" })
        .expect(201);
      await a
        .post(`/api/videos/${uploadId}/share`)
        .send({ method: "message", recipient: bobName })
        .expect(200);
      const inbox = (await a.get("/api/inbox").expect(200)).body;
      assert.ok(
        inbox.notifications.some(
          (n) => n.type === "like" && n.video_id === uploadId,
        ),
      );
      assert.ok(inbox.notifications.some((n) => n.type === "follow"));
      const message = (await b.get("/api/inbox")).body.messages[0];
      assert.equal(message.video_id, uploadId);
      await b
        .post("/api/inbox/read")
        .send({ ids: [message.id] })
        .expect(200);
      assert.ok((await b.get("/api/inbox")).body.messages[0].read_at);
    },
  );
  await t.test(
    "private uploads protect API, media, discovery and sharing",
    async () => {
      const d = await a
        .post("/api/upload")
        .field("caption", "Secret clip")
        .field("category", "Music")
        .field("privacy", "private")
        .field("comments_enabled", "false")
        .attach("video", "data/media/seed-02.mp4", { contentType: "video/mp4" })
        .expect(202);
      await finishUpload(d, a);
      privateId = d.body.video.id;
      await b.get(`/api/videos/${privateId}`).expect(404);
      await guest.get(d.body.video.video_url).expect(404);
      await guest.get(d.body.video.thumbnail_url).expect(404);
      await a.get(d.body.video.video_url).expect(200);
      await a
        .post(`/api/videos/${privateId}/share`)
        .send({ method: "message", recipient: bobName })
        .expect(403);
      await a
        .post(`/api/videos/${privateId}/comments`)
        .send({ body: "nope" })
        .expect(403);
      assert.ok(
        !(await b.get("/api/discover?q=Secret")).body.videos.some(
          (v) => v.id === privateId,
        ),
      );
    },
  );
  await t.test("profile editing, search and follower lists work", async () => {
    await a
      .patch("/api/profile")
      .send({
        username: aliceName,
        display_name: "Alice Updated",
        bio: "A database-backed bio",
      })
      .expect(200);
    assert.equal(
      (await a.get("/api/auth/me")).body.user.bio,
      "A database-backed bio",
    );
    const d = await a.get("/api/discover?q=%23original").expect(200);
    assert.ok(d.body.videos.some((v) => v.id === uploadId));
    assert.ok(
      (
        await a.get(`/api/profiles/${aliceName}/connections?type=followers`)
      ).body.profiles.some((p) => p.user_id === bob.user_id),
    );
  });
  await t.test(
    "reporting and bilateral blocking protect profiles, videos and messages",
    async () => {
      await b
        .post("/api/reports")
        .send({
          target_type: "video",
          target_id: uploadId,
          reason: "Test moderation report",
        })
        .expect(201);
      await b
        .post("/api/blocks")
        .send({ user_id: alice.user_id, active: true })
        .expect(200);
      await b.get(`/api/profiles/${aliceName}`).expect(404);
      await a.get(`/api/profiles/${bobName}`).expect(404);
      await b.get(`/api/videos/${uploadId}`).expect(404);
      await b.get(`/api/media/${uploadId}/video`).expect(404);
      await a
        .post(`/api/videos/${uploadId}/share`)
        .send({ method: "message", recipient: bobName })
        .expect(404);
      assert.equal(
        one(
          "SELECT count(*) n FROM follows WHERE follower_id=? AND following_id=?",
          bob.user_id,
          alice.user_id,
        ).n,
        0,
      );
      await b
        .post("/api/blocks")
        .send({ user_id: alice.user_id, active: false })
        .expect(200);
      await b.get(`/api/videos/${uploadId}`).expect(200);
    },
  );
  await t.test(
    "logout, login, forgot password and one-time reset invalidate sessions",
    async () => {
      await a.post("/api/auth/logout").send({}).expect(200);
      assert.equal((await a.get("/api/auth/me")).body.user, null);
      await a
        .post("/api/auth/login")
        .send({ email: aliceEmail, password: "wrong" })
        .expect(401);
      await a
        .post("/api/auth/login")
        .send({ email: aliceEmail, password: "SecureTestPass!2026" })
        .expect(200);
      await a.post("/api/auth/forgot").send({ email: aliceEmail }).expect(200);
      const token = emailToken(aliceEmail, "reset");
      await guest
        .post("/api/auth/reset")
        .send({ token, password: "NewSecurePass!2026" })
        .expect(200);
      assert.equal((await a.get("/api/auth/me")).body.user, null);
      await guest
        .post("/api/auth/reset")
        .send({ token, password: "AnotherPass!2026" })
        .expect(400);
      await a
        .post("/api/auth/login")
        .send({ email: aliceEmail, password: "NewSecurePass!2026" })
        .expect(200);
    },
  );
  await t.test(
    "deletion cleans relational dependencies and denies old media",
    async () => {
      await a.delete(`/api/comments/${comment}`).send({}).expect(200);
      assert.equal(
        one("SELECT count(*) n FROM comments WHERE id=?", reply).n,
        0,
      );
      await a.delete(`/api/videos/${uploadId}`).send({}).expect(200);
      await guest.get(`/api/media/${uploadId}/video`).expect(404);
      assert.equal(
        one("SELECT count(*) n FROM likes WHERE video_id=?", uploadId).n,
        0,
      );
      assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
    },
  );
});
