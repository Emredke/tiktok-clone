import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import request from "supertest";
const dir = mkdtempSync(join(tmpdir(), "velo-features-"));
process.env.DATABASE_PATH = join(dir, "test.sqlite");
process.env.MEDIA_DIR = resolve("data/media");
process.env.NODE_ENV = "test";
const { app } = await import("../server/app.js");
const { db, one, all, run } = await import("../server/db.js");
const { seed } = await import("../scripts/seed.js");
const { startWorker, stopWorker, tick } = await import("../server/jobs.js");
const { rankVideos } = await import("../server/recommend.js");
const a = request.agent(app),
  b = request.agent(app),
  guest = request(app);
let draft, duet, remix;
async function wait(id, agent = a) {
  for (let i = 0; i < 240; i++) {
    const r = await agent.get(`/api/jobs/${id}`).expect(200);
    if (r.body.job.status === "failed") throw new Error(r.body.job.error);
    if (r.body.job.status === "completed") return r.body;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Timed out processing video.");
}
function upload(agent, fields = {}) {
  let q = agent.post("/api/upload");
  for (const [k, v] of Object.entries({
    caption: "Feature test clip",
    category: "Education",
    auto_captions: "false",
    start: "0",
    end: "2",
    ...fields,
  }))
    q = q.field(k, String(v));
  return q
    .attach("video", "data/media/seed-01.mp4", { contentType: "video/mp4" })
    .expect(202);
}
before(async () => {
  await seed();
  await a
    .post("/api/auth/login")
    .send({ email: "comedy1@demo.velo.invalid", password: "VeloDemo!2026" })
    .expect(200);
  await b
    .post("/api/auth/login")
    .send({ email: "sports2@demo.velo.invalid", password: "VeloDemo!2026" })
    .expect(200);
  startWorker();
});
after(async () => {
  await stopWorker();
  db.close();
  rmSync(dir, { recursive: true, force: true });
});
test("creator, recommendations, adaptive media, and moderation features", async (t) => {
  await t.test(
    "interest choices persist and genuinely change rank",
    async () => {
      await guest
        .put("/api/preferences")
        .send({ interests: ["Travel"] })
        .expect(401);
      await a
        .put("/api/preferences")
        .send({ interests: ["Travel", "Animals"] })
        .expect(200);
      assert.deepEqual((await a.get("/api/preferences")).body.interests, [
        "Animals",
        "Travel",
      ]);
      assert.equal((await a.get("/api/auth/me")).body.user.onboarded, 1);
      const ranked = rankVideos(
        [
          {
            id: "travel",
            user_id: "demo-6",
            category: "Travel",
            hashtags: [],
            likes_count: 0,
            comments_count: 0,
            shares_count: 0,
            created_at: "2026-01-01 00:00:00",
          },
          {
            id: "food",
            user_id: "demo-5",
            category: "Food",
            hashtags: [],
            likes_count: 0,
            comments_count: 0,
            shares_count: 0,
            created_at: "2026-01-01 00:00:00",
          },
        ],
        "demo-1",
      );
      assert.equal(ranked[0].id, "travel");
      assert.match(ranked[0].reason, /selected interest/);
    },
  );
  await t.test(
    "negative feedback is reversible and never leaks to another account",
    async () => {
      for (const [kind, target] of [
        ["category", "Travel"],
        ["video", "seed-01"],
        ["creator", "demo-7"],
      ])
        await a.post("/api/feedback").send({ kind, target }).expect(200);
      let feed = (await a.get("/api/feed")).body.videos;
      assert.ok(
        feed.every(
          (v) =>
            v.category !== "Travel" &&
            v.id !== "seed-01" &&
            v.user_id !== "demo-7",
        ),
      );
      assert.equal((await b.get("/api/preferences")).body.hidden.length, 0);
      await a
        .post("/api/feedback")
        .send({ kind: "category", target: "Travel", active: false })
        .expect(200);
      assert.ok(
        (await a.get("/api/preferences")).body.hidden.every(
          (x) => x.target !== "Travel",
        ),
      );
    },
  );
  await t.test(
    "durable private drafts can be edited and published with real overlays and adaptive output",
    async () => {
      draft = (
        await upload(a, {
          mode: "draft",
          overlay: "A real rendered overlay",
          overlay_end: "2",
          rotation: "90",
          speed: "2",
          allow_duet: "false",
          privacy: "private",
        })
      ).body.job;
      await b.get(`/api/jobs/${draft.id}`).expect(404);
      await guest.get(`/api/jobs/${draft.id}/raw`).expect(401);
      await a.get(`/api/jobs/${draft.id}/raw`).expect(200);
      await a.get(`/api/videos/${draft.video_id}`).expect(404);
      await a
        .patch(`/api/jobs/${draft.id}`)
        .send({ ...draft.options, mode: "publish" })
        .expect(200);
      const done = await wait(draft.id);
      assert.equal(done.video.duration, 1);
      assert.equal(done.video.allow_duet, 0);
      assert.ok(done.video.hls_url);
      await guest.get(done.video.hls_url).expect(404);
      const master = await a.get(done.video.hls_url).expect(200);
      assert.match(master.text, /low.m3u8/);
      assert.match(master.text, /high.m3u8/);
      const playlist = await a
        .get(`/api/stream/${done.video.id}/low.m3u8`)
        .expect(200);
      assert.match(playlist.text, /low-000.ts/);
      await a.get(`/api/stream/${done.video.id}/low-000.ts`).expect(200);
      await b
        .patch(`/api/videos/${done.video.id}/settings`)
        .send({ allow_duet: true, allow_remix: true })
        .expect(404);
    },
  );
  await t.test(
    "caption editor checks ownership and timing and publishes a usable VTT track",
    async () => {
      const id = draft.video_id;
      await a
        .patch(`/api/videos/${id}/captions`)
        .send({ cues: [{ start: 0, end: 4, text: "Too long" }] })
        .expect(400);
      await a
        .patch(`/api/videos/${id}/captions`)
        .send({ cues: [{ start: 0, end: 0.9, text: "Readable <captions>" }] })
        .expect(200);
      const vtt = await a.get(`/api/videos/${id}/captions.vtt`).expect(200);
      assert.match(vtt.text, /WEBVTT/);
      assert.match(vtt.text, /00:00:00.900/);
      assert.match(vtt.text, /&lt;captions>/);
      await guest.get(`/api/videos/${id}/captions.vtt`).expect(404);
    },
  );
  await t.test(
    "collaboration permissions and private originals are enforced",
    async () => {
      const rejected = await a
        .post("/api/upload")
        .field("caption", "Rejected")
        .field("category", "Comedy")
        .field("parent_id", draft.video_id)
        .field("remix_mode", "duet")
        .attach("video", "data/media/seed-01.mp4", { contentType: "video/mp4" })
        .expect(403);
      assert.ok(rejected.body.error);
      await a
        .patch("/api/videos/seed-01/settings")
        .send({ allow_duet: false, allow_remix: true })
        .expect(200);
      await b
        .post("/api/upload")
        .field("caption", "Rejected")
        .field("category", "Comedy")
        .field("parent_id", "seed-01")
        .field("remix_mode", "duet")
        .attach("video", "data/media/seed-01.mp4", { contentType: "video/mp4" })
        .expect(403);
      await a
        .patch("/api/videos/seed-01/settings")
        .send({ allow_duet: true, allow_remix: true })
        .expect(200);
    },
  );
  await t.test(
    "duets and remixes are encoded with their original video relationships",
    async () => {
      // Simulate credited archive source and verify attribution survives collaboration.
      run(
        "UPDATE videos SET source_json=? WHERE id=?",
        JSON.stringify({
          author: "Original author",
          page: "https://commons.wikimedia.org",
          license: "CC BY 4.0",
          license_url: "https://creativecommons.org/licenses/by/4.0/",
          changes: "Trimmed.",
        }),
        "seed-01",
      );
      duet = await wait(
        (await upload(b, { parent_id: "seed-01", remix_mode: "duet" })).body.job
          .id,
        b,
      );
      assert.equal(duet.video.parent.id, "seed-01");
      assert.equal(duet.video.duration, 2);
      assert.equal(duet.video.source.author, "Original author");
      assert.match(duet.video.source.changes, /side by side/);
      remix = await wait(
        (await upload(b, { parent_id: "seed-01", remix_mode: "remix" })).body
          .job.id,
        b,
      );
      assert.ok(Math.abs(remix.video.duration - 9) < 0.1);
      assert.equal(remix.video.remix_mode, "remix");
    },
  );
  await t.test(
    "original account blocks and suspension protect collaboration media",
    async () => {
      await a
        .post("/api/blocks")
        .send({ user_id: "demo-2", active: true })
        .expect(200);
      await b.get(`/api/videos/${duet.video.id}`).expect(404);
      await b.get(duet.video.hls_url).expect(404);
      await a
        .post("/api/blocks")
        .send({ user_id: "demo-2", active: false })
        .expect(200);
      run(
        "UPDATE users SET suspended_until=? WHERE id=?",
        Date.now() + 60000,
        "demo-1",
      );
      await guest.get(`/api/videos/${duet.video.id}`).expect(404);
      run("UPDATE users SET suspended_until=0 WHERE id='demo-1'");
      await guest.get(`/api/videos/${duet.video.id}`).expect(200);
    },
  );
  await t.test(
    "analytics use actual watch durations, completion, and follower changes",
    async () => {
      await a
        .post(`/api/videos/${duet.video.id}/view`)
        .send({
          watch_seconds: 1,
          completion: 0.5,
          rewatches: 0,
          skip_seconds: 1,
        })
        .expect(200);
      await a
        .post(`/api/videos/${duet.video.id}/view`)
        .send({
          watch_seconds: 2,
          completion: 1,
          rewatches: 0,
          skip_seconds: 2,
        })
        .expect(200);
      await a
        .post("/api/profiles/sports_studio2/follow")
        .send({ active: true })
        .expect(200);
      const d = (await b.get("/api/studio/analytics?days=7").expect(200)).body;
      assert.equal(d.totals.views, 2);
      assert.equal(d.totals.watch_seconds, 3);
      assert.equal(d.totals.average_watch, 1.5);
      assert.equal(d.totals.completion_rate, 0.5);
      assert.equal(d.totals.new_followers, 1);
      assert.equal(d.totals.net_followers, 1);
      await a
        .post("/api/profiles/sports_studio2/follow")
        .send({ active: false })
        .expect(200);
      assert.equal(
        (await b.get("/api/studio/analytics")).body.totals.net_followers,
        0,
      );
    },
  );
  await t.test(
    "automatic speech captions run locally and survive publishing",
    { skip: process.env.TEST_CAPTIONS !== "1" },
    async () => {
      const response = await a
        .post("/api/upload")
        .field("caption", "Local speech captions")
        .field("category", "Education")
        .field("auto_captions", "true")
        .attach("video", "data/fixtures/speech.mp4", {
          contentType: "video/mp4",
        })
        .expect(202);
      const d = await wait(response.body.job.id);
      assert.equal(d.video.captions_status, "ready");
      assert.match(
        JSON.parse(d.video.captions_json)
          .map((c) => c.text)
          .join(" "),
        /country/i,
      );
      assert.match(
        (await guest.get(d.video.captions_url).expect(200)).text,
        /country/i,
      );
    },
  );
  await t.test(
    "crashed processing jobs recover from durable originals",
    async () => {
      const j = (await upload(a, { mode: "draft" })).body.job;
      await stopWorker();
      run("UPDATE media_jobs SET status='processing' WHERE id=?", j.id);
      run("UPDATE videos SET status='processing' WHERE id=?", j.video_id);
      startWorker();
      assert.equal((await wait(j.id)).job.status, "completed");
    },
  );
  await t.test(
    "staff permissions, audit records, and cascading removals work",
    async () => {
      await guest.get("/api/admin/reports").expect(401);
      await b.get("/api/admin/reports").expect(403);
      await b
        .post("/api/reports")
        .send({
          target_type: "video",
          target_id: "seed-01",
          reason: "Review source footage",
        })
        .expect(201);
      run("UPDATE users SET role='admin' WHERE id='demo-1'");
      const reports = (await a.get("/api/admin/reports").expect(200)).body
        .reports;
      await a
        .post(`/api/admin/reports/${reports[0].id}`)
        .send({ action: "remove", reason: "Reviewed source rights complaint" })
        .expect(200);
      await guest.get("/api/videos/seed-01").expect(404);
      await guest.get(`/api/videos/${duet.video.id}`).expect(404);
      await guest.get(remix.video.hls_url).expect(404);
      run("UPDATE media_jobs SET status='failed' WHERE id=?", duet.job.id);
      const { parent_id, remix_mode, ...retryOptions } = duet.job.options;
      const denied = await b
        .patch(`/api/jobs/${duet.job.id}`)
        .send({ ...retryOptions, mode: "publish" })
        .expect(403);
      assert.match(denied.body.error, /removed upload/);
      assert.equal((await a.get("/api/admin/reports")).body.actions.length, 1);
      await a
        .post(`/api/admin/reports/${reports[0].id}`)
        .send({ action: "dismiss", reason: "Repeated" })
        .expect(409);
    },
  );
  await t.test(
    "suspension blocks publishing and restoration records staff reasoning",
    async () => {
      await a
        .post("/api/reports")
        .send({
          target_type: "user",
          target_id: "demo-2",
          reason: "Test account review",
        })
        .expect(201);
      const r = (await a.get("/api/admin/reports")).body.reports.find(
        (r) => r.status === "pending",
      );
      await a
        .post(`/api/admin/reports/${r.id}`)
        .send({ action: "suspend", reason: "Review completed", days: 1 })
        .expect(200);
      await b
        .post("/api/videos/seed-02/like")
        .send({ active: true })
        .expect(403);
      await guest.get("/api/videos/seed-02").expect(404);
      await a
        .post("/api/admin/accounts/demo-2/restore")
        .send({ reason: "Appeal reviewed" })
        .expect(200);
      await b
        .post("/api/videos/seed-02/like")
        .send({ active: true })
        .expect(200);
    },
  );
  assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
});
