import { randomUUID } from "node:crypto";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { all, one, run, transaction } from "./db.js";
import { requireAuth, requireVerified, hashToken } from "./auth.js";
import {
  settings,
  blocked,
  pair,
  sendMessage,
  live,
  subscribe,
  streamCount,
} from "./social.js";
export function installCommunity(app, { validate, uid, visibleVideo, videos }) {
  const page = (req) =>
    Math.floor(Math.max(0, Math.min(100000, Number(req.query.offset) || 0)));
  const itemVideos = (ids, user) =>
    ids.map((id) => videos("v.id=?", [id], user, 1)[0]).filter(Boolean);
  app.get("/api/settings", requireAuth, (req, res) =>
    res.json({ settings: settings(uid(req)) }),
  );
  app.put(
    "/api/settings",
    requireAuth,
    validate(
      z.object({
        history_enabled: z.boolean(),
        message_policy: z.enum(["requests", "friends", "off"]),
        push_messages: z.boolean(),
        push_replies: z.boolean(),
        push_uploads: z.boolean(),
        mute_until: z
          .number()
          .int()
          .min(0)
          .max(Date.now() + 366 * 86400000),
      }),
    ),
    (req, res) => {
      const b = req.body;
      settings(uid(req));
      run(
        "UPDATE account_settings SET history_enabled=?,message_policy=?,push_messages=?,push_replies=?,push_uploads=?,mute_until=? WHERE user_id=?",
        +b.history_enabled,
        b.message_policy,
        +b.push_messages,
        +b.push_replies,
        +b.push_uploads,
        b.mute_until,
        uid(req),
      );
      res.json({ settings: settings(uid(req)) });
    },
  );
  app.get("/api/history", requireAuth, (req, res) => {
    const rows = all(
      "SELECT * FROM watch_history WHERE user_id=? ORDER BY watched_at DESC,video_id LIMIT 51 OFFSET ?",
      uid(req),
      page(req),
    );
    res.json({
      videos: rows.slice(0, 50).flatMap((h) => {
        const v = itemVideos([h.video_id], uid(req))[0];
        return v
          ? [{ ...v, position: h.position, watched_at: h.watched_at }]
          : [];
      }),
      hasMore: rows.length > 50,
    });
  });
  app.delete("/api/history", requireAuth, (req, res) => {
    run("DELETE FROM watch_history WHERE user_id=?", uid(req));
    res.json({ ok: true });
  });
  app.delete("/api/history/:id", requireAuth, (req, res) => {
    run(
      "DELETE FROM watch_history WHERE user_id=? AND video_id=?",
      uid(req),
      req.params.id,
    );
    res.json({ ok: true });
  });
  app.get("/api/libraries", requireAuth, (req, res) =>
    res.json({
      libraries: all(
        "SELECT l.*,(SELECT count(*) FROM library_items WHERE library_id=l.id) count FROM libraries l WHERE user_id=? ORDER BY created_at DESC,id",
        uid(req),
      ),
    }),
  );
  app.post(
    "/api/libraries",
    requireAuth,
    validate(
      z.object({
        kind: z.enum(["collection", "playlist"]),
        name: z.string().trim().min(1).max(60),
      }),
    ),
    (req, res) => {
      if (
        one("SELECT count(*) n FROM libraries WHERE user_id=?", uid(req)).n >=
        100
      )
        return res
          .status(429)
          .json({ error: "Keep up to 100 collections and playlists." });
      const id = randomUUID();
      run(
        "INSERT INTO libraries(id,user_id,kind,name) VALUES(?,?,?,?)",
        id,
        uid(req),
        req.body.kind,
        req.body.name,
      );
      res
        .status(201)
        .json({ library: one("SELECT * FROM libraries WHERE id=?", id) });
    },
  );
  app.get("/api/profiles/:username/playlists", (req, res) => {
    const p = one(
      "SELECT p.user_id,u.suspended_until FROM profiles p JOIN users u ON u.id=p.user_id WHERE username=?",
      req.params.username,
    );
    if (
      !p ||
      p.suspended_until > Date.now() ||
      (req.user && blocked(uid(req), p.user_id))
    )
      return res.status(404).json({ error: "Creator unavailable." });
    res.json({
      libraries: all(
        "SELECT * FROM libraries WHERE user_id=? AND kind='playlist' ORDER BY created_at DESC",
        p.user_id,
      ).map((l) => ({
        ...l,
        count: all(
          "SELECT video_id FROM library_items WHERE library_id=?",
          l.id,
        ).filter((i) => visibleVideo(i.video_id, uid(req))).length,
      })),
    });
  });
  const owned = (req, res, next) => {
    const l = one(
      "SELECT * FROM libraries WHERE id=? AND user_id=?",
      req.params.id,
      uid(req),
    );
    if (!l) return res.status(404).json({ error: "Collection unavailable." });
    req.library = l;
    next();
  };
  app.get("/api/libraries/:id", (req, res) => {
    const l = one("SELECT * FROM libraries WHERE id=?", req.params.id);
    if (
      !l ||
      (l.kind === "collection" && l.user_id !== uid(req)) ||
      (uid(req) && blocked(uid(req), l.user_id)) ||
      one("SELECT suspended_until FROM users WHERE id=?", l.user_id)
        ?.suspended_until > Date.now()
    )
      return res.status(404).json({ error: "Collection unavailable." });
    const ids = all(
      "SELECT video_id FROM library_items WHERE library_id=? ORDER BY position,video_id LIMIT 51 OFFSET ?",
      l.id,
      page(req),
    );
    res.json({
      library: l,
      videos: itemVideos(
        ids.slice(0, 50).map((i) => i.video_id),
        uid(req),
      ),
      hasMore: ids.length > 50,
    });
  });
  app.patch(
    "/api/libraries/:id",
    requireAuth,
    owned,
    validate(z.object({ name: z.string().trim().min(1).max(60) })),
    (req, res) => {
      run(
        "UPDATE libraries SET name=? WHERE id=?",
        req.body.name,
        req.library.id,
      );
      res.json({ ok: true });
    },
  );
  app.delete("/api/libraries/:id", requireAuth, owned, (req, res) => {
    run("DELETE FROM libraries WHERE id=?", req.library.id);
    res.json({ ok: true });
  });
  app.post(
    "/api/libraries/:id/items",
    requireAuth,
    owned,
    validate(z.object({ video_id: z.string().min(1).max(64) })),
    (req, res) => {
      const v = visibleVideo(req.body.video_id, uid(req));
      if (!v) return res.status(404).json({ error: "Video unavailable." });
      if (
        req.library.kind === "playlist" &&
        (v.user_id !== uid(req) || v.privacy !== "public")
      )
        return res
          .status(403)
          .json({ error: "Playlists contain your own public videos." });
      if (
        one(
          "SELECT count(*) n FROM library_items WHERE library_id=?",
          req.library.id,
        ).n >= 1000
      )
        return res
          .status(429)
          .json({ error: "A collection can hold up to 1,000 videos." });
      transaction(() => {
        run(
          "INSERT OR IGNORE INTO library_items(library_id,video_id,position) VALUES(?,?,?)",
          req.library.id,
          v.id,
          one(
            "SELECT coalesce(max(position),0)+1 n FROM library_items WHERE library_id=?",
            req.library.id,
          ).n,
        );
        if (req.library.kind === "collection")
          run(
            "INSERT OR IGNORE INTO bookmarks(user_id,video_id) VALUES(?,?)",
            uid(req),
            v.id,
          );
      });
      res.json({ ok: true });
    },
  );
  app.delete(
    "/api/libraries/:id/items/:video",
    requireAuth,
    owned,
    (req, res) => {
      run(
        "DELETE FROM library_items WHERE library_id=? AND video_id=?",
        req.library.id,
        req.params.video,
      );
      res.json({ ok: true });
    },
  );
  app.put(
    "/api/libraries/:id/order",
    requireAuth,
    owned,
    validate(z.object({ ids: z.array(z.string().max(64)).max(1000) })),
    (req, res) => {
      const current = all(
        "SELECT video_id FROM library_items WHERE library_id=?",
        req.library.id,
      ).map((i) => i.video_id);
      if (
        current.length !== req.body.ids.length ||
        new Set(req.body.ids).size !== current.length ||
        current.some((id) => !req.body.ids.includes(id))
      )
        return res
          .status(400)
          .json({ error: "Include every video exactly once." });
      transaction(() =>
        req.body.ids.forEach((id, index) =>
          run(
            "UPDATE library_items SET position=? WHERE library_id=? AND video_id=?",
            index,
            req.library.id,
            id,
          ),
        ),
      );
      res.json({ ok: true });
    },
  );
  app.get("/api/live", requireAuth, (req, res) => {
    if (streamCount(uid(req)) >= 5)
      return res.status(429).json({ error: "Too many open connections." });
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache,no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    res.write("event: ready\ndata: {}\n\n");
    const off = subscribe(uid(req), res),
      token = hashToken(req.cookies.velo_session || req.cookies.session || "");
    const heartbeat = setInterval(() => {
      const u = one("SELECT suspended_until FROM users WHERE id=?", uid(req));
      const session = one(
        "SELECT expires_at FROM sessions WHERE token_hash=?",
        token,
      );
      if (
        !u ||
        u.suspended_until > Date.now() ||
        !session ||
        session.expires_at < Date.now()
      )
        return res.end();
      res.write(": heartbeat\n\n");
    }, 15000);
    heartbeat.unref();
    req.on("close", () => {
      clearInterval(heartbeat);
      off();
    });
  });
  const peer = (req, res, next) => {
    const p = one(
      "SELECT p.*,u.suspended_until FROM profiles p JOIN users u ON u.id=p.user_id WHERE username=?",
      req.params.username,
    );
    if (
      !p ||
      p.user_id === uid(req) ||
      p.suspended_until > Date.now() ||
      blocked(uid(req), p.user_id)
    )
      return res.status(404).json({ error: "Conversation unavailable." });
    req.peer = p;
    next();
  };
  const thread = (user, other, before = 9223372036854775807n) =>
    all(
      "SELECT * FROM messages WHERE ((sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?)) AND rowid<? ORDER BY rowid DESC LIMIT 101",
      user,
      other,
      other,
      user,
      before,
    );
  app.get("/api/chats", requireAuth, (req, res) => {
    const peers = all(
      "SELECT DISTINCT CASE WHEN sender_id=? THEN recipient_id ELSE sender_id END id FROM messages WHERE sender_id=? OR recipient_id=? LIMIT 200",
      uid(req),
      uid(req),
      uid(req),
    );
    res.json({
      chats: peers
        .flatMap(({ id }) => {
          const p = one(
            "SELECT p.*,u.suspended_until FROM profiles p JOIN users u ON p.user_id=u.id WHERE user_id=?",
            id,
          );
          if (!p || p.suspended_until > Date.now() || blocked(uid(req), id))
            return [];
          const c = pair(uid(req), id);
          const messages = thread(uid(req), id);
          return [
            {
              ...p,
              accepted: c.accepted,
              request: !c.accepted && messages.at(-1)?.sender_id === id,
              muted: !!c[uid(req) === c.a ? "muted_by_a" : "muted_by_b"],
              unread: one(
                "SELECT count(*) n FROM messages WHERE sender_id=? AND recipient_id=? AND read_at IS NULL",
                id,
                uid(req),
              ).n,
              last: messages[0],
            },
          ];
        })
        .sort((a, b) => b.last.created_at.localeCompare(a.last.created_at)),
    });
  });
  app.get("/api/chats/:username", requireAuth, peer, (req, res) => {
    let before = 9223372036854775807n;
    if (req.query.before) {
      const cursor = one(
        "SELECT rowid FROM messages WHERE id=? AND ((sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?))",
        String(req.query.before),
        uid(req),
        req.peer.user_id,
        req.peer.user_id,
        uid(req),
      );
      if (!cursor)
        return res.status(400).json({ error: "Invalid conversation cursor." });
      before = cursor.rowid;
    }
    const rows = thread(uid(req), req.peer.user_id, before),
      c = pair(uid(req), req.peer.user_id);
    res.json({
      peer: req.peer,
      accepted: c.accepted,
      request: !c.accepted && rows.at(-1)?.sender_id === req.peer.user_id,
      messages: rows
        .slice(0, 100)
        .reverse()
        .map((m) => ({
          ...m,
          video:
            m.video_id && visibleVideo(m.video_id, uid(req))
              ? itemVideos([m.video_id], uid(req))[0]
              : null,
        })),
      hasMore: rows.length > 100,
    });
  });
  const chatRate = rateLimit({
    windowMs: 60000,
    limit: 30,
    keyGenerator: (req) => uid(req),
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
  app.post(
    "/api/chats/:username",
    requireAuth,
    requireVerified,
    peer,
    chatRate,
    validate(
      z
        .object({
          body: z.string().trim().max(2000).default(""),
          video_id: z.string().max(64).optional(),
          reply_id: z.string().max(64).optional(),
        })
        .refine(
          (b) => b.body || b.video_id,
          "Write a message or choose a video.",
        ),
    ),
    (req, res) => {
      const id = sendMessage(
        uid(req),
        req.peer.user_id,
        req.body,
        visibleVideo,
      );
      res.status(201).json({ id });
    },
  );
  app.post("/api/chats/:username/accept", requireAuth, peer, (req, res) => {
    if (
      !one(
        "SELECT 1 FROM messages WHERE sender_id=? AND recipient_id=?",
        req.peer.user_id,
        uid(req),
      )
    )
      return res.status(400).json({ error: "No request to accept." });
    const c = pair(uid(req), req.peer.user_id);
    run("UPDATE chat_pairs SET accepted=1 WHERE a=? AND b=?", c.a, c.b);
    live(req.peer.user_id);
    res.json({ ok: true });
  });
  app.post("/api/chats/:username/read", requireAuth, peer, (req, res) => {
    if (!pair(uid(req), req.peer.user_id).accepted)
      return res.json({ ok: true });
    const changed = run(
      "UPDATE messages SET read_at=CURRENT_TIMESTAMP WHERE sender_id=? AND recipient_id=? AND read_at IS NULL",
      req.peer.user_id,
      uid(req),
    );
    if (changed.changes) live(req.peer.user_id);
    res.json({ ok: true });
  });
  app.post(
    "/api/chats/:username/mute",
    requireAuth,
    peer,
    validate(z.object({ muted: z.boolean() })),
    (req, res) => {
      const c = pair(uid(req), req.peer.user_id);
      run(
        `UPDATE chat_pairs SET ${uid(req) === c.a ? "muted_by_a" : "muted_by_b"}=? WHERE a=? AND b=?`,
        +req.body.muted,
        c.a,
        c.b,
      );
      res.json({ ok: true });
    },
  );
}
