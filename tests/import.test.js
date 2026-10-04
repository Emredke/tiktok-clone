import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  writeFile,
  unlink,
  access,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateSource, downloadSource } from "../scripts/video-sources.js";

const source = (suffix = "000000000001") => ({
  id: `open-${suffix}`,
  title: "File:Test.webm",
  url: `https://upload.wikimedia.org/wikipedia/commons/a/ab/${suffix}.webm`,
  page: "https://commons.wikimedia.org/wiki/File:Test.webm",
  author: "Fixture author",
  license: "CC BY 4.0",
  license_url: "https://creativecommons.org/licenses/by/4.0/",
  category: "Technology",
  caption: "Test footage",
  changes: "Resized; audio removed.",
});

test("source attribution and license cannot be replaced by an unrelated URL", () => {
  validateSource(source());
  for (const override of [
    { url: "https://example.com/clip.mp4" },
    { id: "../../unsafe" },
    { license: "CC BY-SA 4.0" },
    { license_url: "https://creativecommons.org/licenses/by-nc/4.0/" },
    { license_url: "https://creativecommons.org/licenses/by/3.0/" },
    { author: "" },
    { thumbnail_at: 13 },
  ])
    assert.throws(() => validateSource({ ...source(), ...override }));
});

test("the bundled collection has at least 300 distinct credited reusable sources", async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL("../scripts/open-videos.json", import.meta.url),
      "utf8",
    ),
  );
  assert.ok(manifest.length >= 300);
  assert.equal(
    new Set(manifest.map((source) => source.id)).size,
    manifest.length,
  );
  assert.equal(
    new Set(manifest.map((source) => source.url)).size,
    manifest.length,
  );
  for (const source of manifest) validateSource(source);
});

test("downloads retry temporary failures, reject permanent failures, and clean incomplete streams", async () => {
  const dir = await mkdtemp(join(tmpdir(), "velo-download-"));
  const path = join(dir, "clip");
  try {
    let calls = 0;
    const fetchImpl = async () =>
      ++calls === 1
        ? new Response("busy", { status: 503 })
        : new Response("footage");
    assert.equal(
      await downloadSource(source().url, path, {
        fetchImpl,
        pause: async () => {},
      }),
      7,
    );
    assert.equal(calls, 2);
    assert.equal(await readFile(path, "utf8"), "footage");
    calls = 0;
    await assert.rejects(
      downloadSource(source().url, path, {
        fetchImpl: async () => {
          calls++;
          return new Response("missing", { status: 404 });
        },
        pause: async () => {},
      }),
      /404/,
    );
    assert.equal(calls, 1);
    await assert.rejects(access(path));
    await assert.rejects(
      downloadSource(source().url, path, {
        maxBytes: 4,
        fetchImpl: async () =>
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(new Uint8Array(5));
                controller.close();
              },
            }),
          ),
        pause: async () => {},
      }),
      /download limit/,
    );
    await assert.rejects(access(path));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("bulk import fills a bounded collection after a failed source and repairs adaptive playback without re-downloading", async () => {
  const dir = await mkdtemp(join(tmpdir(), "velo-import-"));
  process.env.DATABASE_PATH = join(dir, "test.sqlite");
  process.env.MEDIA_DIR = join(dir, "media");
  const { exec } = await import("../server/storage.js");
  const { importVideos } = await import("../scripts/import-videos.js");
  const { one, all, run, db } = await import("../server/db.js");
  try {
    const fixture = join(dir, "fixture.mp4");
    await exec("ffmpeg", [
      "-nostdin",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=160x284:rate=30",
      "-t",
      "2",
      "-c:v",
      "libx264",
      "-threads",
      "2",
      fixture,
    ]);
    const bytes = await readFile(fixture);
    const sources = [source(), source("000000000002"), source("000000000003")];
    const manifestPath = join(dir, "manifest.json");
    await writeFile(manifestPath, JSON.stringify(sources));
    let release, started;
    const waiting = new Promise((resolve) => {
      release = resolve;
    });
    const began = new Promise((resolve) => {
      started = resolve;
    });
    const options = {
      manifestPath,
      concurrency: 2,
      limit: 1,
      fetchImpl: async (url) => {
        if (url === sources[0].url) {
          started();
          await waiting;
          return new Response("missing", { status: 404 });
        }
        return new Response(bytes);
      },
    };
    const importing = importVideos(options);
    await began;
    assert.equal(
      await importVideos(options),
      0,
      "overlapping startup/manual import is locked",
    );
    release();
    assert.equal(await importing, 1);
    assert.equal(one("SELECT count(*) n FROM videos").n, 1);
    const row = one("SELECT * FROM videos");
    assert.equal(row.id, sources[1].id);
    assert.equal(row.hls, 1);
    assert.equal(JSON.parse(row.source_json).author, sources[1].author);
    assert.equal(one("SELECT count(*) n FROM likes").n, 0);
    await writeFile(manifestPath, JSON.stringify([sources[1]]));
    const retryOptions = {
      ...options,
      fetchImpl: async () => {
        throw new Error("Should use stored footage");
      },
    };
    assert.equal(await importVideos(retryOptions), 0);
    const segment = all(
      "SELECT location FROM video_assets WHERE video_id=?",
      row.id,
    ).find((asset) => asset.location.endsWith(".ts"));
    await unlink(
      join(process.env.MEDIA_DIR, segment.location.split("/").pop()),
    );
    assert.equal(await importVideos(retryOptions), 0);
    await access(
      join(process.env.MEDIA_DIR, segment.location.split("/").pop()),
    );
    assert.equal(one("SELECT hls FROM videos WHERE id=?", row.id).hls, 1);
    // Exercise every discovery/profile page with a library larger than 300 entries.
    for (let i = 0; i < 305; i++) {
      run(
        "INSERT INTO videos(id,user_id,caption,category,audio,video_url,thumbnail_url,duration) SELECT ?,user_id,caption,category,audio,video_url,thumbnail_url,duration FROM videos WHERE id=?",
        `page-${String(i).padStart(4, "0")}`,
        row.id,
      );
    }
    process.env.NODE_ENV = "test";
    const { app } = await import("../server/app.js");
    const request = (await import("supertest")).default;
    for (const route of [
      "/api/discover",
      "/api/profiles/open_archive/videos",
    ]) {
      const seen = new Set();
      let hasMore = true;
      for (let offset = 0; hasMore; offset += 24) {
        assert.ok(offset < 400, "pagination terminates");
        const response = await request(app)
          .get(`${route}?offset=${offset}`)
          .expect(200);
        for (const video of response.body.videos) {
          assert.ok(
            !seen.has(video.id),
            "each video appears on exactly one page",
          );
          seen.add(video.id);
        }
        hasMore = response.body.hasMore;
      }
      assert.equal(seen.size, 306, "every imported video remains reachable");
    }
    assert.equal(
      (await request(app).get("/api/profiles/open_archive").expect(200)).body
        .profile.video_count,
      306,
    );
    run("UPDATE videos SET parent_id=? WHERE id='page-0000'", row.id);
    run(
      "UPDATE videos SET status='removed',privacy='private' WHERE id=?",
      row.id,
    );
    await importVideos(retryOptions);
    assert.equal(
      one("SELECT status FROM videos WHERE id=?", row.id).status,
      "removed",
    );
    assert.equal(
      one("SELECT privacy FROM videos WHERE id=?", row.id).privacy,
      "private",
    );
    assert.equal(
      (await request(app).get("/api/profiles/open_archive").expect(200)).body
        .profile.video_count,
      304,
      "the count hides removed originals and their descendants",
    );
    assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
  } finally {
    db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
