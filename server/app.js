import { installClub, publicStyle, consumeInvite } from "./club.js";
import { installQuests } from "./quests.js";
import { installSounds } from "./sounds.js";
import { installPush } from "./push.js";
import { installCommunity } from "./community.js";
import { notify, settings, sendMessage, pair, live } from "./social.js";
import { ancestryVisible } from "./policy.js";
import { installFeatures } from "./features.js";
import { enqueue, optionsSchema, checkSource } from "./jobs.js";
import express from "express";
import helmet from "helmet";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import cookieParser from "cookie-parser";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { resolve, basename } from "node:path";
import { z } from "zod";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { all, one, run, transaction } from "./db.js";
import {
  authMiddleware,
  requireAuth,
  requireVerified,
  passwordHash,
  passwordMatch,
  profile,
  session,
  hashToken,
  sendToken,
} from "./auth.js";
import { rankVideos } from "./recommend.js";
import { mediaDir, processVideo, exec, storeFile } from "./storage.js";
export const categories = [
  "Comedy",
  "Sports",
  "Basketball",
  "Gaming",
  "Food",
  "Travel",
  "Animals",
  "Technology",
  "Fashion",
  "Music",
  "Memes",
  "Education",
];
export const app = express();
if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: [
          "'self'",
          "blob:",
          ...(process.env.S3_PUBLIC_URL ? [process.env.S3_PUBLIC_URL] : []),
          ...(process.env.S3_ENDPOINT ? [process.env.S3_ENDPOINT] : []),
          ...(process.env.S3_BUCKET
            ? [
                `https://${process.env.S3_BUCKET}.s3.${process.env.S3_REGION || "us-east-1"}.amazonaws.com`,
              ]
            : []),
        ],
        mediaSrc: [
          "'self'",
          "blob:",
          ...(process.env.S3_PUBLIC_URL ? [process.env.S3_PUBLIC_URL] : []),
          ...(process.env.S3_ENDPOINT ? [process.env.S3_ENDPOINT] : []),
          ...(process.env.S3_BUCKET
            ? [
                `https://${process.env.S3_BUCKET}.s3.${process.env.S3_REGION || "us-east-1"}.amazonaws.com`,
              ]
            : []),
        ],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests:
          process.env.NODE_ENV === "production" ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);
app.use(express.json({ limit: "64kb" }));
app.use(cookieParser());
app.use(authMiddleware);
app.use(
  "/api",
  rateLimit({
    windowMs: 60000,
    limit: 250,
    skip: (req) =>
      req.path.startsWith("/media/") ||
      req.path.startsWith("/stream/") ||
      req.path.startsWith("/avatars/"),
    keyGenerator: (req) =>
      req.user ? `user:${req.user.id}` : `ip:${ipKeyGenerator(req.ip)}`,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many requests. Try again in a minute." },
  }),
);
const mediaRate = rateLimit({
  windowMs: 60000,
  limit: 1200,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) =>
    req.user ? `user:${req.user.id}` : `ip:${ipKeyGenerator(req.ip)}`,
  message: { error: "Too many media requests. Try again shortly." },
});
app.use("/api/media", mediaRate);
app.use("/api/stream", mediaRate);
app.use("/api/avatars", mediaRate);
app.use("/api", (req, res, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.headers.origin;
    if (
      origin &&
      origin !== (process.env.APP_ORIGIN || "http://localhost:5173")
    )
      return res.status(403).json({ error: "Request origin is not allowed." });
    if (req.headers["sec-fetch-site"] === "cross-site")
      return res.status(403).json({ error: "Cross-site request denied." });
    if (!req.is("application/json") && !req.is("multipart/form-data"))
      return res
        .status(415)
        .json({ error: "Use JSON or multipart form data." });
  }
  next();
});
const authRate = rateLimit({
  windowMs: 15 * 60000,
  limit: 20,
  message: { error: "Too many account attempts. Try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});
const validate = (schema) => (req, res, next) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success)
    return res
      .status(400)
      .json({ error: parsed.error.issues[0]?.message || "Invalid input." });
  req.body = parsed.data;
  next();
};
const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9_]{3,24}$/,
    "Username must be 3–24 letters, numbers or underscores.",
  );
const email = z.email().max(254);
const password = z.string().min(10, "Use at least 10 characters.").max(128);
const text = (max) => z.string().trim().min(1).max(max);
const visibility = (uid, alias = "v") =>
  `${alias}.status='ready' AND NOT EXISTS(SELECT 1 FROM users su WHERE su.id=${alias}.user_id AND su.suspended_until>${Date.now()}) AND (${alias}.privacy='public' OR ${alias}.user_id='${uid || ""}' OR (${alias}.privacy='followers' AND EXISTS(SELECT 1 FROM follows WHERE follower_id='${uid || ""}' AND following_id=${alias}.user_id))) AND NOT EXISTS(SELECT 1 FROM blocks WHERE (user_id='${uid || ""}' AND blocked_id=${alias}.user_id) OR (blocked_id='${uid || ""}' AND user_id=${alias}.user_id))`;
// IDs are generated UUIDs; never interpolate request-provided IDs into SQL.
const uid = (req) => req.user?.id || "";
const blocked = (a, b) =>
  !!one(
    "SELECT 1 FROM blocks WHERE (user_id=? AND blocked_id=?) OR (user_id=? AND blocked_id=?)",
    a,
    b,
    b,
    a,
  );
function visibleVideo(id, user) {
  const video = one(
    `SELECT v.* FROM videos v WHERE v.id=? AND ${visibility(user)}`,
    id,
  );
  return video && (!video.parent_id || ancestryVisible(video.parent_id, user))
    ? video
    : null;
}
function videoOr404(req, res, next) {
  req.video = visibleVideo(req.params.id, uid(req));
  if (!req.video) return res.status(404).json({ error: "Video unavailable." });
  next();
}

function analytics(user, video, event, value = 1) {
  run(
    "INSERT INTO analytics_events(user_id,video_id,event,value) VALUES(?,?,?,?)",
    user || null,
    video,
    event,
    value,
  );
}
function addTags(id, values) {
  for (const value of [...new Set(values)].slice(0, 10)) {
    const name = value.toLowerCase().replace(/^#/, "");
    if (!/^[a-z0-9_]{1,32}$/.test(name)) continue;
    run("INSERT OR IGNORE INTO hashtags(name) VALUES(?)", name);
    run(
      "INSERT INTO video_hashtags VALUES(?,?)",
      id,
      one("SELECT id FROM hashtags WHERE name=?", name).id,
    );
  }
}
function videos(where, args, user, limit = 200) {
  return all(
    `SELECT v.*,p.username,p.display_name,p.avatar,u.demo,
 (SELECT count(*) FROM likes WHERE video_id=v.id) likes_count,
 (SELECT count(*) FROM comments WHERE video_id=v.id) comments_count,
 (SELECT count(*) FROM bookmarks WHERE video_id=v.id) saves_count,
 (SELECT count(*) FROM shares WHERE video_id=v.id) shares_count,
 (SELECT count(*) FROM video_views WHERE video_id=v.id) views_count,
 (SELECT coalesce(avg(completion),0) FROM video_views WHERE video_id=v.id) completion_rate,
 EXISTS(SELECT 1 FROM likes WHERE user_id=? AND video_id=v.id) liked,
 EXISTS(SELECT 1 FROM bookmarks WHERE user_id=? AND video_id=v.id) saved,
 EXISTS(SELECT 1 FROM follows WHERE follower_id=? AND following_id=v.user_id) following
 FROM videos v JOIN profiles p ON p.user_id=v.user_id JOIN users u ON u.id=v.user_id WHERE (${where}) AND ${visibility(user)} ORDER BY v.created_at DESC,v.id LIMIT ?`,
    user,
    user,
    user,
    ...args,
    limit,
  )
    .filter((v) => !v.parent_id || ancestryVisible(v.parent_id, user))
    .map((v) => ({
      ...v,
      video_url: `/api/media/${v.id}/video`,
      thumbnail_url: `/api/media/${v.id}/thumbnail`,
      hls_url: v.hls ? `/api/stream/${v.id}/master.m3u8` : null,
      audio_source: v.audio_source_json
        ? JSON.parse(v.audio_source_json)
        : null,
      source: v.source_json ? JSON.parse(v.source_json) : null,
      captions_url:
        v.captions_status === "ready"
          ? `/api/videos/${v.id}/captions.vtt`
          : null,
      parent: v.parent_id
        ? one("SELECT id,caption,user_id FROM videos WHERE id=?", v.parent_id)
        : null,
      hashtags: all(
        "SELECT h.name FROM hashtags h JOIN video_hashtags vh ON vh.hashtag_id=h.id WHERE vh.video_id=?",
        v.id,
      ).map((h) => h.name),
    }));
}
function profileInfo(id, viewer) {
  const p = profile(id);
  if (!p || blocked(id, viewer)) return null;
  return {
    ...p,
    club_style: publicStyle(id),
    video_count: all(
      `SELECT v.parent_id FROM videos v WHERE v.user_id=? AND ${visibility(viewer)}`,
      id,
    ).filter((v) => !v.parent_id || ancestryVisible(v.parent_id, viewer))
      .length,
    followers: one("SELECT count(*) n FROM follows WHERE following_id=?", id).n,
    following: one("SELECT count(*) n FROM follows WHERE follower_id=?", id).n,
    total_likes: one(
      "SELECT count(*) n FROM likes l JOIN videos v ON v.id=l.video_id WHERE v.user_id=? AND v.privacy='public'",
      id,
    ).n,
    is_following: !!one(
      "SELECT 1 FROM follows WHERE follower_id=? AND following_id=?",
      viewer,
      id,
    ),
  };
}
app.get("/api/health", (req, res) => res.json({ ok: !!one("SELECT 1") }));
app.get("/api/config", (req, res) =>
  res.json({
    categories,
    mailMode: process.env.MAIL_MODE || "development",
    inviteOnly: process.env.BETA_INVITE_ONLY === "1",
  }),
);
app.get("/api/auth/me", (req, res) =>
  res.json({ user: req.user ? profile(req.user.id) : null }),
);
app.post(
  "/api/auth/signup",
  authRate,
  validate(
    z.object({
      email,
      password,
      username,
      display_name: text(50),
      invite: z.string().max(128).optional(),
    }),
  ),
  async (req, res) => {
    const b = req.body;
    const id = randomUUID();
    const hashed = await passwordHash(b.password);
    try {
      transaction(() => {
        run(
          "INSERT INTO users(id,email,password_hash) VALUES(?,?,?)",
          id,
          b.email,
          hashed,
        );
        run(
          "INSERT INTO profiles(user_id,username,display_name) VALUES(?,?,?)",
          id,
          b.username,
          b.display_name,
        );
        consumeInvite(b.invite, id);
      });
    } catch (e) {
      if (e.message.includes("UNIQUE"))
        return res
          .status(409)
          .json({ error: "Email or username is already in use." });
      throw e;
    }
    session(req, res, id);
    let emailSent = true;
    try {
      await sendToken(id, b.email, "verify");
    } catch {
      emailSent = false;
    }
    res.status(201).json({
      user: profile(id),
      emailSent,
      message: emailSent
        ? "Check your email to verify your account."
        : "Account created. Verification delivery failed; use Resend verification.",
    });
  },
);
app.post(
  "/api/auth/login",
  authRate,
  validate(z.object({ email, password: z.string().max(128) })),
  async (req, res) => {
    const u = one("SELECT * FROM users WHERE email=?", req.body.email);
    const dummy = "00000000000000000000000000000000:" + "00".repeat(64);
    const valid = await passwordMatch(
      req.body.password,
      u?.password_hash || dummy,
    );
    if (!u || !valid || (u.demo && process.env.NODE_ENV === "production"))
      return res.status(401).json({ error: "Email or password is incorrect." });
    session(req, res, u.id);
    res.json({ user: profile(u.id) });
  },
);
app.post("/api/auth/logout", requireAuth, (req, res) => {
  run(
    "DELETE FROM sessions WHERE token_hash=?",
    hashToken(req.cookies.velo_session),
  );
  res.clearCookie("velo_session", {
    path: "/",
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
  });
  res.json({ ok: true });
});
app.post(
  "/api/auth/forgot",
  authRate,
  validate(z.object({ email })),
  async (req, res) => {
    const u = one("SELECT id FROM users WHERE email=?", req.body.email);
    if (u) await sendToken(u.id, req.body.email, "reset").catch(() => {});
    res.json({
      message: "If that account exists, a reset link is on its way.",
    });
  },
);
app.post("/api/auth/resend", authRate, requireAuth, async (req, res) => {
  if (req.user.verified)
    return res.json({ message: "Your email is already verified." });
  const u = one("SELECT email FROM users WHERE id=?", uid(req));
  await sendToken(uid(req), u.email, "verify");
  res.json({ message: "Verification link sent." });
});
app.post(
  "/api/auth/verify",
  authRate,
  validate(z.object({ token: text(128) })),
  (req, res) => {
    const t = one(
      "SELECT * FROM auth_tokens WHERE token_hash=? AND purpose='verify' AND expires_at>?",
      hashToken(req.body.token),
      Date.now(),
    );
    if (!t)
      return res
        .status(400)
        .json({ error: "This link expired or has already been used." });
    transaction(() => {
      run("UPDATE users SET verified=1 WHERE id=?", t.user_id);
      run("DELETE FROM auth_tokens WHERE token_hash=?", t.token_hash);
    });
    res.json({ ok: true, user: profile(t.user_id) });
  },
);
app.post(
  "/api/auth/reset",
  authRate,
  validate(z.object({ token: text(128), password })),
  async (req, res) => {
    const tokenHash = hashToken(req.body.token);
    const t = one(
      "SELECT * FROM auth_tokens WHERE token_hash=? AND purpose='reset' AND expires_at>?",
      tokenHash,
      Date.now(),
    );
    if (!t) return res.status(400).json({ error: "This reset link expired." });
    const hashed = await passwordHash(req.body.password);
    const changed = transaction(() => {
      const current = one(
        "SELECT * FROM auth_tokens WHERE token_hash=? AND purpose='reset' AND expires_at>?",
        tokenHash,
        Date.now(),
      );
      if (!current) return false;
      run("UPDATE users SET password_hash=? WHERE id=?", hashed, t.user_id);
      run("DELETE FROM auth_tokens WHERE user_id=?", t.user_id);
      run("DELETE FROM sessions WHERE user_id=?", t.user_id);
      return true;
    });
    if (!changed)
      return res
        .status(400)
        .json({ error: "This reset link has already been used." });
    res.json({ ok: true });
  },
);
app.get("/api/feed", (req, res) => {
  const excluded = String(req.query.exclude || "")
    .split(",")
    .filter((v) => /^[a-z0-9-]{1,64}$/i.test(v))
    .slice(0, 500);
  const mode = req.query.mode === "following" ? "following" : "foryou";
  let where = "1=1",
    args = [];
  if (excluded.length) {
    where += ` AND v.id NOT IN (${excluded.map(() => "?").join(",")})`;
    args.push(...excluded);
  }
  if (mode === "following") {
    where +=
      " AND EXISTS(SELECT 1 FROM follows WHERE follower_id=? AND following_id=v.user_id)";
    args.push(uid(req));
  }
  if (mode === "foryou" && req.user) {
    where +=
      " AND NOT EXISTS(SELECT 1 FROM feed_feedback f WHERE f.user_id=? AND ((f.kind='video' AND f.target=v.id) OR (f.kind='creator' AND f.target=v.user_id) OR (f.kind='category' AND f.target=v.category)))";
    args.push(uid(req));
  }
  const items = videos(where, args, uid(req));
  const ranked =
    mode === "following"
      ? items.map((v) => ({ ...v, reason: "From a creator you follow" }))
      : rankVideos(items, uid(req));
  res.json({
    videos: ranked.slice(0, 8).map(({ score, ...v }) => v),
    hasMore: items.length > 8,
  });
});
app.get("/api/videos/:id", videoOr404, (req, res) =>
  res.json({ video: videos("v.id=?", [req.params.id], uid(req), 1)[0] }),
);
app.get("/api/media/:id/:kind", videoOr404, async (req, res) => {
  const location =
    req.params.kind === "video"
      ? req.video.video_url
      : req.params.kind === "thumbnail"
        ? req.video.thumbnail_url
        : null;
  if (!location) return res.sendStatus(404);
  res.set("Cache-Control", "private,max-age=30");
  if (location.startsWith("s3:")) {
    const s3 = new S3Client({
      region: process.env.S3_REGION || "us-east-1",
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: !!process.env.S3_ENDPOINT,
    });
    const url = await getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: location.slice(3),
      }),
      { expiresIn: 60 },
    );
    return res.redirect(url);
  }
  res.sendFile(resolve(mediaDir, basename(location)));
});
app.post(
  "/api/videos/:id/like",
  requireAuth,
  videoOr404,
  validate(z.object({ active: z.boolean() })),
  (req, res) => {
    const active = req.body.active;
    transaction(() => {
      if (active) {
        const changed = run(
          "INSERT OR IGNORE INTO likes(user_id,video_id) VALUES(?,?)",
          uid(req),
          req.video.id,
        ).changes;
        if (changed) {
          notify(req.video.user_id, uid(req), "like", req.video.id);
          analytics(uid(req), req.video.id, "like");
        }
      } else
        run(
          "DELETE FROM likes WHERE user_id=? AND video_id=?",
          uid(req),
          req.video.id,
        );
    });
    res.json({
      liked: active,
      count: one("SELECT count(*) n FROM likes WHERE video_id=?", req.video.id)
        .n,
    });
  },
);
app.post(
  "/api/videos/:id/save",
  requireAuth,
  videoOr404,
  validate(z.object({ active: z.boolean() })),
  (req, res) => {
    transaction(() => {
      if (req.body.active) {
        const changed = run(
          "INSERT OR IGNORE INTO bookmarks(user_id,video_id) VALUES(?,?)",
          uid(req),
          req.video.id,
        ).changes;
        if (changed) analytics(uid(req), req.video.id, "save");
      } else
        run(
          "DELETE FROM bookmarks WHERE user_id=? AND video_id=?",
          uid(req),
          req.video.id,
        );
    });
    res.json({
      saved: req.body.active,
      count: one(
        "SELECT count(*) n FROM bookmarks WHERE video_id=?",
        req.video.id,
      ).n,
    });
  },
);
app.post(
  "/api/videos/:id/view",
  videoOr404,
  validate(
    z.object({
      position: z.number().min(0).max(180).optional(),
      watch_seconds: z.number().min(0).max(3600),
      completion: z.number().min(0).max(1),
      rewatches: z.number().int().min(0).max(100),
      skip_seconds: z.number().min(0).max(3600),
    }),
  ),
  (req, res) => {
    const b = req.body;
    run(
      "INSERT INTO video_views(video_id,user_id,watch_seconds,completion,completed,rewatches,skip_seconds) VALUES(?,?,?,?,?,?,?)",
      req.video.id,
      req.user?.id || null,
      b.watch_seconds,
      b.completion,
      Number(b.completion >= 0.95),
      b.rewatches,
      b.skip_seconds,
    );
    if (
      req.user &&
      settings(uid(req)).history_enabled &&
      req.user.suspended_until <= Date.now()
    ) {
      run(
        "INSERT INTO watch_history(user_id,video_id,position) VALUES(?,?,?) ON CONFLICT(user_id,video_id) DO UPDATE SET position=excluded.position,watched_at=CURRENT_TIMESTAMP",
        uid(req),
        req.video.id,
        Math.min(req.video.duration, b.position ?? 0),
      );
      run(
        "DELETE FROM watch_history WHERE user_id=? AND video_id NOT IN (SELECT video_id FROM watch_history WHERE user_id=? ORDER BY watched_at DESC,video_id LIMIT 1000)",
        uid(req),
        uid(req),
      );
    }
    analytics(uid(req), req.video.id, "view", b.watch_seconds);
    if (b.completion >= 0.95)
      analytics(uid(req), req.video.id, "completed_view");
    if (b.rewatches) analytics(uid(req), req.video.id, "rewatch", b.rewatches);
    if (b.skip_seconds < 2 && b.completion < 0.2)
      analytics(uid(req), req.video.id, "skip", b.skip_seconds);
    res.json({ ok: true });
  },
);
app.post(
  "/api/videos/:id/share",
  requireAuth,
  videoOr404,
  validate(
    z.object({
      method: z.enum(["copy", "device", "message"]),
      recipient: username.optional(),
    }),
  ),
  (req, res) => {
    const b = req.body;
    transaction(() => {
      if (b.method === "message") {
        const p = one(
          "SELECT user_id FROM profiles WHERE username=?",
          b.recipient || "",
        );
        if (!p || blocked(uid(req), p.user_id)) {
          const e = new Error("Recipient unavailable.");
          e.status = 404;
          throw e;
        }
        if (!req.user.verified) {
          const e = new Error("Verify your email before messaging.");
          e.status = 403;
          throw e;
        }
        if (!visibleVideo(req.video.id, p.user_id)) {
          const e = new Error("This recipient cannot view the video.");
          e.status = 403;
          throw e;
        }
        sendMessage(
          uid(req),
          p.user_id,
          { video_id: req.video.id },
          visibleVideo,
        );
      }
      run(
        "INSERT INTO shares(id,user_id,video_id,method) VALUES(?,?,?,?)",
        randomUUID(),
        uid(req),
        req.video.id,
        b.method,
      );
      analytics(uid(req), req.video.id, "share");
    });
    res.json({
      count: one("SELECT count(*) n FROM shares WHERE video_id=?", req.video.id)
        .n,
      url: `${process.env.APP_ORIGIN || "http://localhost:5173"}/v/${req.video.id}`,
    });
  },
);
app.delete("/api/videos/:id", requireAuth, videoOr404, (req, res) => {
  if (req.video.user_id !== uid(req))
    return res
      .status(403)
      .json({ error: "Only the creator can delete this video." });
  run("DELETE FROM videos WHERE id=?", req.video.id);
  res.json({ ok: true });
});
app.get("/api/videos/:id/comments", videoOr404, (req, res) => {
  const offset = Math.min(10000, Math.max(0, Number(req.query.offset) || 0));
  const comments = all(
    `SELECT c.*,p.username,p.avatar,(SELECT count(*) FROM comment_likes WHERE comment_id=c.id) likes_count,EXISTS(SELECT 1 FROM comment_likes WHERE user_id=? AND comment_id=c.id) liked FROM comments c JOIN profiles p ON p.user_id=c.user_id WHERE c.video_id=? AND NOT EXISTS(SELECT 1 FROM blocks WHERE (user_id=? AND blocked_id=c.user_id) OR (blocked_id=? AND user_id=c.user_id)) ORDER BY c.created_at,c.id LIMIT 50 OFFSET ?`,
    uid(req),
    req.video.id,
    uid(req),
    uid(req),
    offset,
  );
  res.json({
    comments,
    total: one("SELECT count(*) n FROM comments WHERE video_id=?", req.video.id)
      .n,
    hasMore: comments.length === 50,
  });
});
app.post(
  "/api/videos/:id/comments",
  requireAuth,
  videoOr404,
  validate(
    z.object({
      body: text(500),
      parent_id: z.string().max(64).nullable().optional(),
    }),
  ),
  (req, res) => {
    if (!req.video.comments_enabled)
      return res.status(403).json({ error: "Comments are turned off." });
    const b = req.body;
    let parent = null;
    if (b.parent_id) {
      parent = one(
        "SELECT * FROM comments WHERE id=? AND video_id=?",
        b.parent_id,
        req.video.id,
      );
      if (!parent || blocked(uid(req), parent.user_id))
        return res.status(404).json({ error: "Reply unavailable." });
    }
    const id = randomUUID();
    transaction(() => {
      run(
        "INSERT INTO comments(id,video_id,user_id,parent_id,body) VALUES(?,?,?,?,?)",
        id,
        req.video.id,
        uid(req),
        b.parent_id || null,
        b.body,
      );
      notify(req.video.user_id, uid(req), "comment", req.video.id, id);
      analytics(uid(req), req.video.id, "comment");
      if (parent) notify(parent.user_id, uid(req), "reply", req.video.id, id);
    });
    res.status(201).json({ id });
  },
);
app.delete("/api/comments/:id", requireAuth, (req, res) => {
  const c = one("SELECT * FROM comments WHERE id=?", req.params.id);
  if (!c) return res.sendStatus(404);
  if (c.user_id !== uid(req))
    return res
      .status(403)
      .json({ error: "Only the author can delete this comment." });
  run("DELETE FROM comments WHERE id=?", c.id);
  res.json({ ok: true });
});
app.post(
  "/api/comments/:id/like",
  requireAuth,
  validate(z.object({ active: z.boolean() })),
  (req, res) => {
    const c = one("SELECT * FROM comments WHERE id=?", req.params.id);
    if (
      !c ||
      !visibleVideo(c.video_id, uid(req)) ||
      blocked(uid(req), c.user_id)
    )
      return res.sendStatus(404);
    transaction(() => {
      if (req.body.active) {
        const changed = run(
          "INSERT OR IGNORE INTO comment_likes VALUES(?,?)",
          uid(req),
          c.id,
        ).changes;
        if (changed)
          notify(c.user_id, uid(req), "comment_like", c.video_id, c.id);
      } else
        run(
          "DELETE FROM comment_likes WHERE user_id=? AND comment_id=?",
          uid(req),
          c.id,
        );
    });
    res.json({ ok: true });
  },
);
app.get("/api/profiles/:username", (req, res) => {
  const p = one(
    "SELECT user_id FROM profiles WHERE username=?",
    req.params.username,
  );
  const result = p && profileInfo(p.user_id, uid(req));
  if (!result) return res.status(404).json({ error: "Profile unavailable." });
  res.json({ profile: result });
});
app.get("/api/profiles/:username/videos", (req, res) => {
  const p = one(
    "SELECT user_id FROM profiles WHERE username=?",
    req.params.username,
  );
  if (!p || blocked(p.user_id, uid(req))) return res.sendStatus(404);
  const tab = req.query.tab || "uploads";
  if (tab === "saved" && p.user_id !== uid(req))
    return res.status(403).json({ error: "Saved videos are private." });
  let where = "v.user_id=?";
  if (tab === "liked")
    where = "v.id IN(SELECT video_id FROM likes WHERE user_id=?)";
  if (tab === "saved")
    where = "v.id IN(SELECT video_id FROM bookmarks WHERE user_id=?)";
  const offset = Math.max(0, Math.min(10000, Number(req.query.offset) || 0));
  const result = videos(where, [p.user_id], uid(req), offset + 25);
  res.json({
    videos: result.slice(offset, offset + 24),
    hasMore: result.length > offset + 24,
  });
});
app.patch(
  "/api/profile",
  requireAuth,
  validate(
    z.object({
      username,
      display_name: text(50),
      bio: z.string().trim().max(160),
    }),
  ),
  (req, res) => {
    const b = req.body;
    try {
      run(
        "UPDATE profiles SET username=?,display_name=?,bio=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?",
        b.username,
        b.display_name,
        b.bio,
        uid(req),
      );
    } catch (e) {
      if (e.message.includes("UNIQUE"))
        return res
          .status(409)
          .json({ error: "That username is already taken." });
      throw e;
    }
    res.json({ user: profile(uid(req)) });
  },
);
app.post(
  "/api/profiles/:username/follow",
  requireAuth,
  validate(
    z.object({ active: z.boolean(), video_id: z.string().max(64).optional() }),
  ),
  (req, res) => {
    const p = one(
      "SELECT user_id FROM profiles WHERE username=?",
      req.params.username,
    );
    if (!p || p.user_id === uid(req) || blocked(uid(req), p.user_id))
      return res.status(400).json({ error: "Cannot follow this account." });
    transaction(() => {
      if (req.body.active) {
        const changed = run(
          "INSERT OR IGNORE INTO follows(follower_id,following_id) VALUES(?,?)",
          uid(req),
          p.user_id,
        ).changes;
        if (changed) {
          run(
            "INSERT INTO follower_events(creator_id,follower_id,change) VALUES(?,?,1)",
            p.user_id,
            uid(req),
          );
          notify(p.user_id, uid(req), "follow");
          const viewed = req.body.video_id
            ? visibleVideo(req.body.video_id, uid(req))
            : one(
                "SELECT v.* FROM videos v JOIN video_views w ON w.video_id=v.id WHERE w.user_id=? AND v.user_id=? AND w.created_at>datetime('now','-30 minutes') ORDER BY w.created_at DESC LIMIT 1",
                uid(req),
                p.user_id,
              );
          if (viewed && viewed.user_id === p.user_id)
            analytics(uid(req), viewed.id, "follow_after_watch");
        }
      } else {
        const removed = run(
          "DELETE FROM follows WHERE follower_id=? AND following_id=?",
          uid(req),
          p.user_id,
        );
        if (removed.changes)
          run(
            "INSERT INTO follower_events(creator_id,follower_id,change) VALUES(?,?,-1)",
            p.user_id,
            uid(req),
          );
      }
    });
    res.json({ profile: profileInfo(p.user_id, uid(req)) });
  },
);
app.get("/api/profiles/:username/connections", (req, res) => {
  const p = one(
    "SELECT user_id FROM profiles WHERE username=?",
    req.params.username,
  );
  if (!p || blocked(uid(req), p.user_id)) return res.sendStatus(404);
  const following = req.query.type === "following";
  const result = all(
    `SELECT p.*,u.demo FROM follows f JOIN profiles p ON p.user_id=f.${following ? "following_id" : "follower_id"} JOIN users u ON u.id=p.user_id WHERE f.${following ? "follower_id" : "following_id"}=? AND NOT EXISTS(SELECT 1 FROM blocks WHERE (user_id=? AND blocked_id=p.user_id) OR (blocked_id=? AND user_id=p.user_id)) ORDER BY f.created_at DESC LIMIT 50 OFFSET ?`,
    p.user_id,
    uid(req),
    uid(req),
    Math.max(0, Math.min(10000, Number(req.query.offset) || 0)),
  );
  res.json({ profiles: result, hasMore: result.length === 50 });
});
app.get("/api/discover", (req, res) => {
  const q = String(req.query.q || "")
    .trim()
    .slice(0, 80);
  const pattern = `%${q.replace(/[%_\\]/g, (c) => "\\" + c).replace(/^#/, "")}%`;
  const offset = Math.max(0, Math.min(10000, Number(req.query.offset) || 0));
  const people = all(
    `SELECT p.*,u.demo FROM profiles p JOIN users u ON u.id=p.user_id WHERE (p.username LIKE ? ESCAPE '\\' OR p.display_name LIKE ? ESCAPE '\\') AND NOT EXISTS(SELECT 1 FROM blocks WHERE (user_id=? AND blocked_id=p.user_id) OR (blocked_id=? AND user_id=p.user_id)) LIMIT 20 OFFSET ?`,
    pattern,
    pattern,
    uid(req),
    uid(req),
    offset,
  );
  const where = q
    ? `(v.caption LIKE ? ESCAPE '\\' OR v.category LIKE ? ESCAPE '\\' OR v.id IN(SELECT vh.video_id FROM video_hashtags vh JOIN hashtags h ON h.id=vh.hashtag_id WHERE h.name LIKE ? ESCAPE '\\'))`
    : "1=1";
  const matches = videos(
    where,
    q ? [pattern, pattern, pattern] : [],
    uid(req),
    offset + 25,
  );
  const trending = all(
    `SELECT h.name,count(DISTINCT v.id) videos_count FROM hashtags h JOIN video_hashtags vh ON vh.hashtag_id=h.id JOIN videos v ON v.id=vh.video_id WHERE ${visibility(uid(req))} GROUP BY h.id ORDER BY videos_count DESC,h.name LIMIT 12`,
  );
  res.json({
    profiles: people,
    // Keep the discovery order stable as the library spans multiple pages.
    videos: matches.slice(offset, offset + 24),
    hashtags: trending,
    hasMore: matches.length > offset + 24 || people.length === 20,
  });
});
app.get("/api/inbox", requireAuth, (req, res) => {
  const offset = Math.max(0, Math.min(10000, Number(req.query.offset) || 0));
  const notifications = all(
    `SELECT n.*,p.username,p.avatar FROM notifications n JOIN profiles p ON p.user_id=n.actor_id WHERE n.user_id=? AND NOT EXISTS(SELECT 1 FROM blocks WHERE (user_id=? AND blocked_id=n.actor_id) OR (blocked_id=? AND user_id=n.actor_id)) ORDER BY n.created_at DESC,n.id LIMIT 50 OFFSET ?`,
    uid(req),
    uid(req),
    uid(req),
    offset,
  ).filter((n) => !n.video_id || visibleVideo(n.video_id, uid(req)));
  const messages = all(
    "SELECT m.*,p.username,p.avatar FROM messages m JOIN profiles p ON p.user_id=m.sender_id WHERE m.recipient_id=? ORDER BY m.created_at DESC,m.id LIMIT 50 OFFSET ?",
    uid(req),
    offset,
  ).filter(
    (m) =>
      !blocked(uid(req), m.sender_id) &&
      (!m.video_id || visibleVideo(m.video_id, uid(req))),
  );
  res.json({
    notifications,
    messages,
    hasMore: notifications.length === 50 || messages.length === 50,
  });
});
app.post(
  "/api/inbox/read",
  requireAuth,
  validate(
    z.object({
      ids: z.array(z.string().max(64)).max(100).default([]),
      all: z.boolean().optional(),
    }),
  ),
  (req, res) => {
    transaction(() => {
      if (req.body.all) {
        run(
          "UPDATE notifications SET read_at=CURRENT_TIMESTAMP WHERE user_id=? AND read_at IS NULL",
          uid(req),
        );
        for (const m of all(
          "SELECT id,sender_id FROM messages WHERE recipient_id=? AND read_at IS NULL",
          uid(req),
        )) {
          if (pair(uid(req), m.sender_id).accepted) {
            run(
              "UPDATE messages SET read_at=CURRENT_TIMESTAMP WHERE id=?",
              m.id,
            );
            live(m.sender_id);
          }
        }
      }
      for (const id of req.body.ids) {
        run(
          "UPDATE notifications SET read_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?",
          id,
          uid(req),
        );
        const m = one(
          "SELECT sender_id FROM messages WHERE id=? AND recipient_id=?",
          id,
          uid(req),
        );
        if (m && pair(uid(req), m.sender_id).accepted) {
          run("UPDATE messages SET read_at=CURRENT_TIMESTAMP WHERE id=?", id);
          live(m.sender_id);
        }
      }
    });
    res.json({ ok: true });
  },
);
app.post(
  "/api/reports",
  requireAuth,
  validate(
    z.object({
      target_type: z.enum(["video", "user", "comment"]),
      target_id: text(64),
      reason: text(500),
    }),
  ),
  (req, res) => {
    const b = req.body;
    let valid = false;
    if (b.target_type === "video")
      valid = !!visibleVideo(b.target_id, uid(req));
    else if (b.target_type === "user")
      valid = !!profileInfo(b.target_id, uid(req));
    else {
      const c = one("SELECT * FROM comments WHERE id=?", b.target_id);
      valid =
        !!c &&
        !!visibleVideo(c.video_id, uid(req)) &&
        !blocked(uid(req), c.user_id);
    }
    if (!valid) return res.sendStatus(404);
    run(
      "INSERT INTO reports(id,reporter_id,target_type,target_id,reason) VALUES(?,?,?,?,?)",
      randomUUID(),
      uid(req),
      b.target_type,
      b.target_id,
      b.reason,
    );
    res.status(201).json({ ok: true });
  },
);
app.get("/api/blocks", requireAuth, (req, res) =>
  res.json({
    profiles: all(
      "SELECT p.* FROM blocks b JOIN profiles p ON p.user_id=b.blocked_id WHERE b.user_id=?",
      uid(req),
    ),
  }),
);
app.post(
  "/api/blocks",
  requireAuth,
  validate(z.object({ user_id: text(64), active: z.boolean() })),
  (req, res) => {
    const id = req.body.user_id;
    if (id === uid(req) || !profile(id)) return res.sendStatus(400);
    transaction(() => {
      if (req.body.active) {
        run("INSERT OR IGNORE INTO blocks VALUES(?,?)", uid(req), id);
        for (const f of all(
          "SELECT * FROM follows WHERE (follower_id=? AND following_id=?) OR (follower_id=? AND following_id=?)",
          uid(req),
          id,
          id,
          uid(req),
        ))
          run(
            "INSERT INTO follower_events(creator_id,follower_id,change) VALUES(?,?,-1)",
            f.following_id,
            f.follower_id,
          );
        run(
          "DELETE FROM follows WHERE (follower_id=? AND following_id=?) OR (follower_id=? AND following_id=?)",
          uid(req),
          id,
          id,
          uid(req),
        );
      } else
        run(
          "DELETE FROM blocks WHERE user_id=? AND blocked_id=?",
          uid(req),
          id,
        );
    });
    res.json({ ok: true });
  },
);
mkdirSync("./data/tmp", { recursive: true });
const upload = multer({
  dest: "./data/tmp",
  limits: {
    fileSize: 100 * 1024 * 1024,
    files: 1,
    fields: 30,
    fieldSize: 4096,
  },
  fileFilter: (req, file, cb) =>
    cb(
      null,
      ["video/mp4", "video/webm", "video/quicktime"].includes(file.mimetype),
    ),
});
const uploadRate = rateLimit({
  windowMs: 3600000,
  limit: 10,
  keyGenerator: (req) => `user:${req.user.id}`,
  message: { error: "Upload limit reached. Try again in one hour." },
});
app.post(
  "/api/upload",
  requireAuth,
  requireVerified,
  uploadRate,
  upload.single("video"),
  async (req, res) => {
    if (!req.file)
      return res
        .status(400)
        .json({ error: "Select an MP4, MOV, or WebM video (up to 100 MB)." });
    try {
      const parsed = optionsSchema(categories).safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({ error: parsed.error.issues[0].message });
      checkSource(parsed.data, uid(req), visibleVideo);
      let job;
      try {
        job = await enqueue(req.file.path, uid(req), parsed.data);
      } catch (e) {
        e.status ||= 400;
        throw e;
      }
      res.status(202).json({ job });
    } finally {
      await unlink(req.file.path).catch(() => {});
    }
  },
);
const avatarUpload = multer({
  dest: "./data/tmp",
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 },
  fileFilter: (req, file, cb) =>
    cb(null, ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)),
});
app.post(
  "/api/profile/avatar",
  requireAuth,
  avatarUpload.single("avatar"),
  async (req, res) => {
    if (!req.file)
      return res
        .status(400)
        .json({ error: "Use a JPG, PNG, or WebP image under 5 MB." });
    const output = `${req.file.path}.jpg`;
    try {
      await exec(
        "ffmpeg",
        [
          "-nostdin",
          "-y",
          "-i",
          req.file.path,
          "-frames:v",
          "1",
          "-vf",
          "scale=256:256:force_original_aspect_ratio=increase,crop=256:256",
          output,
        ],
        { timeout: 15000, maxBuffer: 1024 * 1024 },
      );
      const location = await storeFile(
        output,
        `avatar-${randomUUID()}.jpg`,
        "image/jpeg",
      );
      run("UPDATE profiles SET avatar=? WHERE user_id=?", location, uid(req));
      res.json({ user: profile(uid(req)) });
    } catch {
      return res.status(400).json({ error: "Unable to read that image." });
    } finally {
      await Promise.all(
        [req.file.path, output].map((p) => unlink(p).catch(() => {})),
      );
    }
  },
);
// Avatar object keys are never sent to clients. Use a mediated URL just like video assets.
app.get("/api/avatars/:id", async (req, res) => {
  const p = profile(req.params.id);
  if (!p || blocked(uid(req), req.params.id) || !p.avatar)
    return res.sendStatus(404);
  res.set("Cache-Control", "private,max-age=300");
  if (p.avatar.startsWith("s3:")) {
    const s3 = new S3Client({
      region: process.env.S3_REGION || "us-east-1",
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: !!process.env.S3_ENDPOINT,
    });
    return res.redirect(
      await getSignedUrl(
        s3,
        new GetObjectCommand({
          Bucket: process.env.S3_BUCKET,
          Key: p.avatar.slice(3),
        }),
        { expiresIn: 60 },
      ),
    );
  }
  res.sendFile(resolve(mediaDir, basename(p.avatar)));
});
installSounds(app);
installQuests(app, { uid, visibleVideo });
installClub(app, { uid, validate, visibleVideo, videos });
installPush(app, { validate, uid });
installCommunity(app, { validate, uid, visibleVideo, videos });
installFeatures(app, {
  categories,
  validate,
  uid,
  visibleVideo,
  videoOr404,
  videos,
});
app.use("/api", (req, res) =>
  res.status(404).json({ error: "Endpoint not found." }),
);
app.use(
  express.static(resolve("dist"), {
    maxAge: process.env.NODE_ENV === "production" ? "1h" : 0,
  }),
);
app.get("/{*path}", (req, res, next) =>
  res.sendFile(resolve("dist/index.html"), (e) => (e ? next(e) : null)),
);
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err instanceof multer.MulterError)
    return res.status(400).json({
      error:
        err.code === "LIMIT_FILE_SIZE"
          ? "File exceeds the size limit."
          : "Invalid upload.",
    });
  const status = err.status || 500;
  if (status >= 500) console.error("Request failed:", err.message);
  res.status(status).json({
    error:
      status < 500 ? err.message : "Something went wrong. Please try again.",
  });
});
