import { z } from "zod";
import { randomUUID } from "node:crypto";
import { all, one, run, transaction } from "./db.js";
import { requireAuth, requireVerified, profile } from "./auth.js";
import { optionsSchema, publicJob, updateDraft, checkSource } from "./jobs.js";
import { serveAsset } from "./media.js";
export function installFeatures(
  app,
  { categories, validate, uid, visibleVideo, videoOr404, videos },
) {
  const ownedJob = (req, res, next) => {
    req.job = one(
      "SELECT * FROM media_jobs WHERE id=? AND user_id=?",
      req.params.id,
      uid(req),
    );
    if (!req.job) return res.status(404).json({ error: "Upload unavailable." });
    next();
  };
  const staff = (req, res, next) => {
    if (req.user.role !== "admin")
      return res.status(403).json({ error: "Staff access required." });
    next();
  };
  const ownedVideo = (req, res, next) => {
    if (req.video.user_id !== uid(req))
      return res
        .status(403)
        .json({ error: "Only the creator can edit this video." });
    next();
  };
  app.get("/api/preferences", requireAuth, (req, res) =>
    res.json({
      interests: all(
        "SELECT category FROM interests WHERE user_id=?",
        uid(req),
      ).map((x) => x.category),
      hidden: all(
        "SELECT f.*,CASE f.kind WHEN 'video' THEN (SELECT caption FROM videos WHERE id=f.target) WHEN 'creator' THEN (SELECT display_name FROM profiles WHERE user_id=f.target) ELSE f.target END label FROM feed_feedback f WHERE user_id=?",
        uid(req),
      ),
    }),
  );
  app.put(
    "/api/preferences",
    requireAuth,
    validate(
      z.object({
        interests: z.array(z.enum(categories)).max(categories.length),
      }),
    ),
    (req, res) => {
      transaction(() => {
        run("DELETE FROM interests WHERE user_id=?", uid(req));
        for (const c of new Set(req.body.interests))
          run("INSERT INTO interests VALUES(?,?)", uid(req), c);
        run("UPDATE users SET onboarded=1 WHERE id=?", uid(req));
      });
      res.json({ user: profile(uid(req)) });
    },
  );
  app.post(
    "/api/feedback",
    requireAuth,
    validate(
      z.object({
        kind: z.enum(["video", "category", "creator"]),
        target: z.string().min(1).max(64),
        active: z.boolean().default(true),
      }),
    ),
    (req, res) => {
      const b = req.body;
      if (b.kind === "category" && !categories.includes(b.target))
        return res.status(400).json({ error: "Unknown category." });
      if (b.kind === "video" && !visibleVideo(b.target, uid(req)) && b.active)
        return res.status(404).json({ error: "Video unavailable." });
      if (
        b.kind === "creator" &&
        !one("SELECT id FROM users WHERE id=?", b.target)
      )
        return res.status(404).json({ error: "Creator unavailable." });
      if (b.active)
        run(
          "INSERT OR IGNORE INTO feed_feedback(user_id,kind,target) VALUES(?,?,?)",
          uid(req),
          b.kind,
          b.target,
        );
      else
        run(
          "DELETE FROM feed_feedback WHERE user_id=? AND kind=? AND target=?",
          uid(req),
          b.kind,
          b.target,
        );
      res.json({ ok: true });
    },
  );
  app.get("/api/jobs", requireAuth, (req, res) =>
    res.json({
      jobs: all(
        "SELECT * FROM media_jobs WHERE user_id=? ORDER BY created_at DESC LIMIT 100",
        uid(req),
      ).map(publicJob),
    }),
  );
  app.get("/api/jobs/:id", requireAuth, ownedJob, (req, res) =>
    res.json({
      job: publicJob(req.job),
      video:
        req.job.status === "completed"
          ? videos("v.id=?", [req.job.video_id], uid(req), 1)[0]
          : null,
    }),
  );
  app.get("/api/jobs/:id/raw", requireAuth, ownedJob, async (req, res) =>
    serveAsset(req.job.raw_location, "video/mp4", req, res),
  );
  app.patch(
    "/api/jobs/:id",
    requireAuth,
    requireVerified,
    ownedJob,
    validate(optionsSchema(categories)),
    (req, res) => {
      checkSource(req.body, uid(req), visibleVideo);
      updateDraft(req.job, req.body);
      res.json({
        job: publicJob(one("SELECT * FROM media_jobs WHERE id=?", req.job.id)),
      });
    },
  );
  app.delete("/api/jobs/:id", requireAuth, ownedJob, (req, res) => {
    if (req.job.status === "processing")
      return res
        .status(409)
        .json({ error: "Wait for processing to finish before deleting." });
    run("DELETE FROM videos WHERE id=?", req.job.video_id);
    res.json({ ok: true });
  });
  app.get("/api/stream/:id/:name", videoOr404, async (req, res) => {
    const asset = one(
      "SELECT * FROM video_assets WHERE video_id=? AND name=?",
      req.params.id,
      req.params.name,
    );
    if (!asset) return res.sendStatus(404);
    await serveAsset(asset.location, asset.type, req, res);
  });
  const cues = z
    .array(
      z.object({
        start: z.number().min(0).max(180),
        end: z.number().min(0).max(180),
        text: z.string().trim().min(1).max(300),
      }),
    )
    .max(300);
  app.patch(
    "/api/videos/:id/settings",
    requireAuth,
    videoOr404,
    ownedVideo,
    validate(z.object({ allow_duet: z.boolean(), allow_remix: z.boolean() })),
    (req, res) => {
      run(
        "UPDATE videos SET allow_duet=?,allow_remix=? WHERE id=?",
        Number(req.body.allow_duet),
        Number(req.body.allow_remix),
        req.video.id,
      );
      res.json({ ok: true });
    },
  );
  app.patch(
    "/api/videos/:id/captions",
    requireAuth,
    videoOr404,
    ownedVideo,
    validate(z.object({ cues })),
    (req, res) => {
      if (
        req.body.cues.some(
          (c, i) =>
            c.end <= c.start ||
            c.end > req.video.duration + 0.1 ||
            (i > 0 && c.start < req.body.cues[i - 1].end),
        )
      )
        return res.status(400).json({
          error:
            "Caption cues must be ordered, non-overlapping, and within the video.",
        });
      run(
        "UPDATE videos SET captions_json=?,captions_status=? WHERE id=?",
        JSON.stringify(req.body.cues),
        req.body.cues.length ? "ready" : "off",
        req.video.id,
      );
      res.json({ ok: true });
    },
  );
  app.get("/api/videos/:id/captions.vtt", videoOr404, (req, res) => {
    const timestamp = (n) => {
      const ms = Math.round(n * 1000);
      return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
    };
    const text = JSON.parse(req.video.captions_json)
      .map(
        (c, i) =>
          `${i + 1}\n${timestamp(c.start)} --> ${timestamp(c.end)}\n${c.text
            .replace(/-->/g, "→")
            .replace(/[\r\n]+/g, " ")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")}\n`,
      )
      .join("\n");
    res
      .type("text/vtt")
      .set("Cache-Control", "private,max-age=30")
      .send(`WEBVTT\n\n${text}`);
  });
  app.get("/api/studio/analytics", requireAuth, (req, res) => {
    const days = [7, 30, 90].includes(Number(req.query.days))
        ? Number(req.query.days)
        : 30,
      from = new Date(Date.now() - days * 86400000)
        .toISOString()
        .slice(0, 19)
        .replace("T", " "),
      user = uid(req);
    const totals = one(
      `SELECT count(*) views,coalesce(sum(w.watch_seconds),0) watch_seconds,coalesce(avg(w.watch_seconds),0) average_watch,coalesce(avg(w.completed),0) completion_rate,coalesce(sum(w.rewatches),0) rewatches FROM video_views w JOIN videos v ON v.id=w.video_id WHERE v.user_id=? AND w.is_demo=0 AND w.created_at>=?`,
      user,
      from,
    );
    const growth = one(
      "SELECT coalesce(sum(change),0) net_followers,coalesce(sum(CASE WHEN change=1 THEN 1 ELSE 0 END),0) new_followers FROM follower_events WHERE creator_id=? AND created_at>=?",
      user,
      from,
    );
    const daily = all(
      `SELECT date(w.created_at) date,count(*) views,sum(w.watch_seconds) watch_seconds,avg(w.completed) completion_rate FROM video_views w JOIN videos v ON v.id=w.video_id WHERE v.user_id=? AND w.is_demo=0 AND w.created_at>=? GROUP BY date(w.created_at) ORDER BY date`,
      user,
      from,
    );
    const content = all(
      `SELECT v.id,v.caption,v.duration,v.status,(SELECT count(*) FROM video_views WHERE video_id=v.id AND is_demo=0 AND created_at>=?) views,(SELECT coalesce(avg(completed),0) FROM video_views WHERE video_id=v.id AND is_demo=0 AND created_at>=?) completion_rate,(SELECT coalesce(avg(watch_seconds),0) FROM video_views WHERE video_id=v.id AND is_demo=0 AND created_at>=?) average_watch,(SELECT count(*) FROM likes WHERE video_id=v.id AND created_at>=?) likes,(SELECT count(*) FROM shares WHERE video_id=v.id AND created_at>=?) shares FROM videos v WHERE v.user_id=? AND v.status IN ('ready','removed') ORDER BY views DESC LIMIT 100`,
      from,
      from,
      from,
      from,
      from,
      user,
    );
    res.json({
      days,
      totals: { ...totals, ...growth },
      daily,
      videos: content,
    });
  });
  app.get("/api/admin/reports", requireAuth, staff, (req, res) =>
    res.json({
      reports: all(
        `SELECT r.*,p.username reporter,(CASE r.target_type WHEN 'video' THEN (SELECT caption FROM videos WHERE id=r.target_id) WHEN 'comment' THEN (SELECT body FROM comments WHERE id=r.target_id) ELSE (SELECT username FROM profiles WHERE user_id=r.target_id) END) content FROM reports r JOIN profiles p ON p.user_id=r.reporter_id ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END,r.created_at DESC LIMIT 200`,
      ),
      actions: all(
        "SELECT a.*,p.username staff FROM moderation_actions a JOIN profiles p ON p.user_id=a.staff_id ORDER BY a.created_at DESC,a.rowid DESC LIMIT 100",
      ),
      accounts: all(
        "SELECT u.id,p.username,u.suspended_until FROM users u JOIN profiles p ON p.user_id=u.id WHERE u.suspended_until>?",
        Date.now(),
      ),
    }),
  );
  app.post(
    "/api/admin/reports/:id",
    requireAuth,
    staff,
    validate(
      z.object({
        action: z.enum(["dismiss", "remove", "suspend"]),
        reason: z.string().trim().min(3).max(1000),
        days: z.number().int().min(1).max(365).default(7),
      }),
    ),
    (req, res) => {
      const r = one("SELECT * FROM reports WHERE id=?", req.params.id);
      if (!r) return res.status(404).json({ error: "Report unavailable." });
      if (r.status !== "pending")
        return res
          .status(409)
          .json({ error: "This report has already been reviewed." });
      const b = req.body;
      let owner;
      if (r.target_type === "user") owner = r.target_id;
      else
        owner = one(
          `SELECT user_id FROM ${r.target_type === "video" ? "videos" : "comments"} WHERE id=?`,
          r.target_id,
        )?.user_id;
      if (
        b.action === "suspend" &&
        (!owner ||
          one("SELECT role FROM users WHERE id=?", owner)?.role === "admin")
      )
        return res
          .status(400)
          .json({ error: "This account cannot be suspended." });
      if (b.action === "remove" && r.target_type === "user")
        return res
          .status(400)
          .json({ error: "Use suspend for an account report." });
      transaction(() => {
        if (b.action === "remove" && r.target_type === "video")
          run(
            "WITH RECURSIVE descendants(id) AS (SELECT id FROM videos WHERE id=? UNION ALL SELECT v.id FROM videos v JOIN descendants d ON v.parent_id=d.id) UPDATE videos SET status='removed' WHERE id IN (SELECT id FROM descendants)",
            r.target_id,
          );
        if (b.action === "remove" && r.target_type === "comment")
          run("DELETE FROM comments WHERE id=?", r.target_id);
        if (b.action === "suspend")
          run(
            "UPDATE users SET suspended_until=? WHERE id=?",
            Date.now() + b.days * 86400000,
            owner,
          );
        run(
          "UPDATE reports SET status=? WHERE id=?",
          b.action === "dismiss"
            ? "dismissed"
            : b.action === "remove"
              ? "removed"
              : "reviewed",
          r.id,
        );
        run(
          "INSERT INTO moderation_actions(id,staff_id,report_id,action,target_type,target_id,reason) VALUES(?,?,?,?,?,?,?)",
          randomUUID(),
          uid(req),
          r.id,
          b.action,
          r.target_type,
          b.action === "suspend" ? owner : r.target_id,
          b.reason,
        );
      });
      res.json({ ok: true });
    },
  );
  app.post(
    "/api/admin/accounts/:id/restore",
    requireAuth,
    staff,
    validate(z.object({ reason: z.string().trim().min(3).max(1000) })),
    (req, res) => {
      if (!one("SELECT id FROM users WHERE id=?", req.params.id))
        return res.status(404).json({ error: "Account unavailable." });
      transaction(() => {
        run("UPDATE users SET suspended_until=0 WHERE id=?", req.params.id);
        run(
          "INSERT INTO moderation_actions(id,staff_id,action,target_type,target_id,reason) VALUES(?,?,?,?,?,?)",
          randomUUID(),
          uid(req),
          "restore",
          "user",
          req.params.id,
          req.body.reason,
        );
      });
      res.json({ ok: true });
    },
  );
}
