import webpush from "web-push";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { all, one, run } from "./db.js";
import { requireAuth } from "./auth.js";
import { settings, blocked, pair } from "./social.js";
let keys,
  timer,
  busy = false;
export async function initPush() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
    keys = {
      publicKey: process.env.VAPID_PUBLIC_KEY,
      privateKey: process.env.VAPID_PRIVATE_KEY,
    };
  else {
    const path = resolve(process.env.VAPID_FILE || "./data/vapid.json");
    await mkdir(resolve(path, ".."), { recursive: true });
    try {
      keys = JSON.parse(await readFile(path, "utf8"));
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
      keys = webpush.generateVAPIDKeys();
      await writeFile(path, JSON.stringify(keys), { mode: 0o600, flag: "wx" });
    }
  }
}
export function validEndpoint(value) {
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      [
        "fcm.googleapis.com",
        "updates.push.services.mozilla.com",
        "web.push.apple.com",
      ].includes(u.hostname) &&
      u.pathname.length > 1
    );
  } catch {
    return false;
  }
}
export function installPush(app, { validate, uid }) {
  app.get("/api/push/config", requireAuth, (req, res) =>
    res.json({ publicKey: keys?.publicKey || null }),
  );
  app.post(
    "/api/push/subscriptions",
    requireAuth,
    validate(
      z.object({
        endpoint: z
          .string()
          .max(2048)
          .refine(validEndpoint, "Unsupported push service."),
        keys: z.object({
          p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}$/),
          auth: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
        }),
      }),
    ),
    (req, res) => {
      if (!keys)
        return res
          .status(503)
          .json({ error: "Notifications are starting. Try again shortly." });
      if (
        one(
          "SELECT count(*) n FROM push_subscriptions WHERE user_id=?",
          uid(req),
        ).n >= 10
      )
        return res
          .status(429)
          .json({ error: "Keep up to ten notification devices." });
      run(
        "INSERT INTO push_subscriptions(endpoint,user_id,keys_json) VALUES(?,?,?) ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,keys_json=excluded.keys_json",
        req.body.endpoint,
        uid(req),
        JSON.stringify(req.body.keys),
      );
      res.status(201).json({ ok: true });
    },
  );
  app.delete(
    "/api/push/subscriptions",
    requireAuth,
    validate(z.object({ endpoint: z.string().max(2048) })),
    (req, res) => {
      run(
        "DELETE FROM push_subscriptions WHERE endpoint=? AND user_id=?",
        req.body.endpoint,
        uid(req),
      );
      res.json({ ok: true });
    },
  );
}
export async function deliverPush(
  send = webpush.sendNotification.bind(webpush),
) {
  if (busy || !keys) return;
  busy = true;
  try {
    for (const j of all(
      "SELECT * FROM push_queue WHERE next_at<=? ORDER BY id LIMIT 25",
      Date.now(),
    )) {
      const s = settings(j.user_id),
        owner = one("SELECT suspended_until FROM users WHERE id=?", j.user_id);
      const actor = one(
        "SELECT suspended_until FROM users WHERE id=?",
        j.actor_id,
      );
      let allowed =
        owner &&
        actor &&
        owner.suspended_until <= Date.now() &&
        actor.suspended_until <= Date.now() &&
        !blocked(j.user_id, j.actor_id) &&
        s.mute_until <= Date.now() &&
        s[`push_${j.kind}`] &&
        Date.now() - j.created_at < 86400000;
      if (j.kind === "messages") {
        const c = pair(j.user_id, j.actor_id);
        allowed =
          allowed &&
          s.message_policy !== "off" &&
          !c[j.user_id === c.a ? "muted_by_a" : "muted_by_b"];
      }
      if (j.video_id) {
        const v = one(
          "SELECT privacy,status FROM videos WHERE id=?",
          j.video_id,
        );
        allowed = allowed && v?.status === "ready" && v.privacy === "public";
      }
      let retry = false;
      if (allowed)
        for (const sub of all(
          "SELECT * FROM push_subscriptions WHERE user_id=?",
          j.user_id,
        )) {
          if (!validEndpoint(sub.endpoint)) {
            run(
              "DELETE FROM push_subscriptions WHERE endpoint=?",
              sub.endpoint,
            );
            continue;
          }
          try {
            await send(
              { endpoint: sub.endpoint, keys: JSON.parse(sub.keys_json) },
              JSON.stringify({
                title: "Velo",
                body:
                  j.kind === "messages"
                    ? "You have a new message."
                    : j.kind === "uploads"
                      ? "A creator you follow posted a video."
                      : "You have a new comment or reply.",
                url: j.kind === "messages" ? "/chat" : "/inbox",
              }),
              {
                vapidDetails: {
                  ...keys,
                  subject:
                    process.env.VAPID_SUBJECT ||
                    "mailto:notifications@velo.example",
                },
                TTL: 3600,
                timeout: 10000,
              },
            );
          } catch (e) {
            if ([404, 410].includes(e.statusCode))
              run(
                "DELETE FROM push_subscriptions WHERE endpoint=?",
                sub.endpoint,
              );
            else retry = true;
          }
        }
      if (retry && j.attempts < 4)
        run(
          "UPDATE push_queue SET attempts=attempts+1,next_at=? WHERE id=?",
          Date.now() + Math.min(3600000, 30000 * 2 ** j.attempts),
          j.id,
        );
      else run("DELETE FROM push_queue WHERE id=?", j.id);
    }
  } finally {
    busy = false;
  }
}
export function startPushWorker() {
  if (timer) return;
  timer = setInterval(
    () =>
      deliverPush().catch((e) =>
        console.error("Notification delivery:", e.message),
      ),
    5000,
  );
  timer.unref();
}
export async function stopPushWorker() {
  clearInterval(timer);
  timer = null;
  while (busy) await new Promise((r) => setTimeout(r, 100));
}
