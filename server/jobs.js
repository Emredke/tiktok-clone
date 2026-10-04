import { sourceAllowed, collaborationCredit } from "./policy.js";
import { randomUUID } from "node:crypto";
import { mkdir, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { one, run, transaction } from "./db.js";
import { storeFile, probe } from "./storage.js";
import { produce, materialize } from "./media.js";
export const optionsSchema = (categories) =>
  z
    .object({
      caption: z.string().trim().min(1).max(1000),
      category: z.enum(categories),
      hashtags: z.string().max(350).default(""),
      privacy: z.enum(["public", "followers", "private"]).default("public"),
      comments_enabled: z
        .union([z.boolean(), z.enum(["true", "false"])])
        .transform((v) => v === true || v === "true")
        .default(true),
      start: z.coerce.number().min(0).max(179).default(0),
      end: z.coerce.number().min(1).max(180).optional(),
      thumbnail: z.coerce.number().min(0).max(180).default(0),
      speed: z.coerce
        .number()
        .refine((n) => [0.5, 1, 1.5, 2].includes(n))
        .default(1),
      rotation: z.coerce
        .number()
        .refine((n) => [0, 90, 180, 270].includes(n))
        .default(0),
      fit: z.enum(["contain", "cover"]).default("contain"),
      overlay: z.string().max(180).default(""),
      overlay_position: z.enum(["top", "bottom"]).default("bottom"),
      overlay_start: z.coerce.number().min(0).max(180).default(0),
      overlay_end: z.coerce.number().min(0).max(180).default(180),
      mute: z
        .union([z.boolean(), z.enum(["true", "false"])])
        .transform((v) => v === true || v === "true")
        .default(false),
      auto_captions: z
        .union([z.boolean(), z.enum(["true", "false"])])
        .transform((v) => v === true || v === "true")
        .default(false),
      allow_duet: z
        .union([z.boolean(), z.enum(["true", "false"])])
        .transform((v) => v === true || v === "true")
        .default(true),
      allow_remix: z
        .union([z.boolean(), z.enum(["true", "false"])])
        .transform((v) => v === true || v === "true")
        .default(true),
      parent_id: z
        .string()
        .regex(/^[a-z0-9-]{1,64}$/i)
        .optional(),
      remix_mode: z.enum(["duet", "remix"]).optional(),
      mode: z.enum(["draft", "publish"]).default("publish"),
    })
    .superRefine((o, c) => {
      if (o.end && o.end <= o.start)
        c.addIssue({ code: "custom", message: "End must follow the start." });
      if (o.overlay && o.overlay_end <= o.overlay_start)
        c.addIssue({
          code: "custom",
          message: "Text end must follow text start.",
        });
      if (Boolean(o.parent_id) !== Boolean(o.remix_mode))
        c.addIssue({
          code: "custom",
          message: "Choose a collaboration source and mode.",
        });
    });
export function checkSource(o, user, visibleVideo) {
  if (!o.parent_id) return;
  const source = visibleVideo(o.parent_id, user);
  if (
    !source ||
    !sourceAllowed(o, user) ||
    source.privacy !== "public" ||
    !source[o.remix_mode === "duet" ? "allow_duet" : "allow_remix"]
  ) {
    const e = new Error(
      "This public video does not allow the selected collaboration.",
    );
    e.status = 403;
    throw e;
  }
}
function tags(id, values) {
  run("DELETE FROM video_hashtags WHERE video_id=?", id);
  for (const name of [...new Set(values.toLowerCase().split(/[ ,#]+/))]
    .filter((n) => /^[a-z0-9_]{1,32}$/.test(n))
    .slice(0, 10)) {
    run("INSERT OR IGNORE INTO hashtags(name) VALUES(?)", name);
    run(
      "INSERT INTO video_hashtags VALUES(?,?)",
      id,
      one("SELECT id FROM hashtags WHERE name=?", name).id,
    );
  }
}
export async function enqueue(path, user, o) {
  // Probe untrusted media before retaining it. Encoding happens after the request ends.
  const rawDuration = await probe(path);
  if (o.end === undefined) o.end = rawDuration;
  const editedDuration =
    (Math.min(o.end, rawDuration) - Math.min(o.start, rawDuration - 1)) /
    o.speed;
  if (editedDuration < 1 || editedDuration > 180)
    throw Object.assign(
      new Error("Choose a clip between 1 and 180 seconds after editing."),
      { status: 400 },
    );
  if (
    one(
      "SELECT count(*) n FROM media_jobs WHERE user_id=? AND status IN ('draft','queued','processing','failed')",
      user,
    ).n >= 20
  )
    throw Object.assign(
      new Error("Keep at most 20 unfinished uploads. Remove a draft first."),
      { status: 429 },
    );
  const id = randomUUID(),
    video = randomUUID(),
    key = `raw-${id}.upload`;
  const location = await storeFile(path, key, "application/octet-stream");
  transaction(() => {
    run(
      "INSERT INTO videos(id,user_id,caption,category,video_url,thumbnail_url,duration,status,privacy,parent_id,remix_mode) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      video,
      user,
      o.caption,
      o.category,
      "",
      "",
      1,
      o.mode === "draft" ? "draft" : "queued",
      o.privacy,
      o.parent_id || null,
      o.remix_mode || null,
    );
    run(
      "INSERT INTO media_jobs(id,user_id,video_id,raw_location,options_json,status) VALUES(?,?,?,?,?,?)",
      id,
      user,
      video,
      location,
      JSON.stringify(o),
      o.mode === "draft" ? "draft" : "queued",
    );
    run(
      "UPDATE videos SET source_json=? WHERE id=?",
      collaborationCredit(o),
      video,
    );
    tags(video, o.hashtags);
  });
  return publicJob(one("SELECT * FROM media_jobs WHERE id=?", id));
}
export function publicJob(j) {
  return {
    id: j.id,
    video_id: j.video_id,
    status: j.status,
    progress: j.progress,
    error: j.error,
    created_at: j.created_at,
    updated_at: j.updated_at,
    options: JSON.parse(j.options_json),
  };
}
export function updateDraft(j, o) {
  if (!["draft", "failed"].includes(j.status))
    throw Object.assign(
      new Error("Only drafts and failed uploads can be edited."),
      { status: 409 },
    );
  if (
    one("SELECT status FROM videos WHERE id=?", j.video_id)?.status ===
    "removed"
  )
    throw Object.assign(new Error("A removed upload cannot be republished."), {
      status: 403,
    });
  transaction(() => {
    run(
      "UPDATE media_jobs SET options_json=?,status=?,error='',progress=0,updated_at=CURRENT_TIMESTAMP WHERE id=?",
      JSON.stringify(o),
      o.mode === "draft" ? "draft" : "queued",
      j.id,
    );
    run(
      "UPDATE videos SET caption=?,category=?,privacy=?,parent_id=?,remix_mode=?,status=? WHERE id=?",
      o.caption,
      o.category,
      o.privacy,
      o.parent_id || null,
      o.remix_mode || null,
      o.mode === "draft" ? "draft" : "queued",
      j.video_id,
    );
    run(
      "UPDATE videos SET source_json=? WHERE id=?",
      collaborationCredit(o),
      j.video_id,
    );
    tags(j.video_id, o.hashtags);
  });
}
let timer,
  processing = false,
  stopped = false;
export function startWorker() {
  if (timer) return;
  stopped = false;
  // One worker per SQLite deployment. A crash leaves durable raw media for retry.
  run(
    "UPDATE media_jobs SET status='queued',progress=0 WHERE status='processing'",
  );
  timer = setInterval(
    () => tick().catch((e) => console.error("Media worker:", e.message)),
    1000,
  );
  timer.unref();
  void tick().catch((e) => console.error("Media worker:", e.message));
}
export async function stopWorker() {
  stopped = true;
  clearInterval(timer);
  timer = null;
  while (processing) await new Promise((r) => setTimeout(r, 100));
}
export async function tick() {
  if (processing || stopped) return;
  const j = one(
    "SELECT * FROM media_jobs WHERE status='queued' ORDER BY created_at,id LIMIT 1",
  );
  if (!j) return;
  processing = true;
  const path = resolve(`./data/tmp/job-${j.id}`);
  try {
    await mkdir(resolve("./data/tmp"), { recursive: true });
    run(
      "UPDATE media_jobs SET status='processing',attempts=attempts+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",
      j.id,
    );
    run("UPDATE videos SET status='processing' WHERE id=?", j.video_id);
    const owner = one(
      "SELECT suspended_until FROM users WHERE id=?",
      j.user_id,
    );
    if (!owner || owner.suspended_until > Date.now())
      throw new Error("The uploader account is suspended.");
    await materialize(j.raw_location, path);
    const o = JSON.parse(j.options_json);
    const m = await produce(
      path,
      j.video_id,
      o,
      (n) =>
        run(
          "UPDATE media_jobs SET progress=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
          n,
          j.id,
        ),
      j.user_id,
    );
    transaction(() => {
      const current = one("SELECT status FROM videos WHERE id=?", j.video_id);
      if (!current || current.status === "removed")
        throw new Error("This upload was removed during review.");
      if (
        one("SELECT suspended_until FROM users WHERE id=?", j.user_id)
          ?.suspended_until > Date.now()
      )
        throw new Error("The uploader account is suspended.");
      if (!sourceAllowed(o, j.user_id))
        throw new Error(
          "The original video is no longer available for collaboration.",
        );
      run(
        "UPDATE videos SET video_url=?,thumbnail_url=?,duration=?,status='ready',comments_enabled=?,allow_duet=?,allow_remix=?,captions_json=?,captions_status=?,hls=1,created_at=CURRENT_TIMESTAMP WHERE id=?",
        m.video_url,
        m.thumbnail_url,
        m.duration,
        Number(o.comments_enabled),
        Number(o.allow_duet),
        Number(o.allow_remix),
        JSON.stringify(m.cues),
        m.captionStatus,
        j.video_id,
      );
      run(
        "UPDATE media_jobs SET status='completed',progress=100,error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        m.captionError,
        j.id,
      );
    });
  } catch (e) {
    run(
      "UPDATE media_jobs SET status='failed',error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
      String(e.message).slice(0, 500),
      j.id,
    );
    run(
      "UPDATE videos SET status='failed' WHERE id=? AND status!='removed'",
      j.video_id,
    );
  } finally {
    await unlink(path).catch(() => {});
    processing = false;
  }
}
