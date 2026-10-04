import { randomUUID } from "node:crypto";
import { all, one, run } from "./db.js";
const streams = new Map();
export const blocked = (a, b) =>
  !!one(
    "SELECT 1 FROM blocks WHERE (user_id=? AND blocked_id=?) OR (user_id=? AND blocked_id=?)",
    a,
    b,
    b,
    a,
  );
export function settings(user) {
  run("INSERT OR IGNORE INTO account_settings(user_id) VALUES(?)", user);
  return one("SELECT * FROM account_settings WHERE user_id=?", user);
}
export function live(user) {
  for (const res of streams.get(user) || []) {
    if (!res.writableEnded) res.write("event: refresh\ndata: {}\n\n");
  }
}
export function streamCount(user) {
  return streams.get(user)?.size || 0;
}
export function subscribe(user, res) {
  if (!streams.has(user)) streams.set(user, new Set());
  streams.get(user).add(res);
  return () => {
    streams.get(user)?.delete(res);
    if (!streams.get(user)?.size) streams.delete(user);
  };
}
export function pushEvent(user, actor, kind, video = null) {
  if (user === actor || blocked(user, actor)) return;
  const p = settings(user);
  if (p.mute_until > Date.now() || !p[`push_${kind}`]) return;
  run(
    "INSERT INTO push_queue(user_id,actor_id,kind,video_id,created_at) VALUES(?,?,?,?,?)",
    user,
    actor,
    kind,
    video,
    Date.now(),
  );
}
export function notify(user, actor, type, video = null, comment = null) {
  if (user === actor || blocked(user, actor)) return;
  run(
    "INSERT INTO notifications(id,user_id,actor_id,type,video_id,comment_id) VALUES(?,?,?,?,?,?)",
    randomUUID(),
    user,
    actor,
    type,
    video,
    comment,
  );
  live(user);
  if (["reply", "comment"].includes(type))
    pushEvent(user, actor, "replies", video);
}
export function published(video, user) {
  for (const f of all(
    "SELECT follower_id FROM follows WHERE following_id=?",
    user,
  )) {
    notify(f.follower_id, user, "upload", video);
    pushEvent(f.follower_id, user, "uploads", video);
  }
}
export function pair(a, b) {
  [a, b] = [a, b].sort();
  run("INSERT OR IGNORE INTO chat_pairs(a,b) VALUES(?,?)", a, b);
  const p = one("SELECT * FROM chat_pairs WHERE a=? AND b=?", a, b);
  const mutual =
    one("SELECT 1 FROM follows WHERE follower_id=? AND following_id=?", a, b) &&
    one("SELECT 1 FROM follows WHERE follower_id=? AND following_id=?", b, a);
  return { ...p, accepted: !!(p.accepted || mutual) };
}
export function sendMessage(
  sender,
  recipient,
  { body = "", video_id = null, reply_id = null },
  visibleVideo,
) {
  const target = one("SELECT suspended_until FROM users WHERE id=?", recipient);
  if (
    !target ||
    target.suspended_until > Date.now() ||
    recipient === sender ||
    blocked(sender, recipient)
  )
    throw Object.assign(new Error("Recipient unavailable."), { status: 404 });
  const p = pair(sender, recipient),
    preferences = settings(recipient);
  if (
    preferences.message_policy === "off" ||
    (preferences.message_policy === "friends" && !p.accepted)
  )
    throw Object.assign(new Error("This creator is not accepting messages."), {
      status: 403,
    });
  if (
    !p.accepted &&
    !one(
      "SELECT 1 FROM messages WHERE sender_id=? AND recipient_id=?",
      recipient,
      sender,
    ) &&
    one(
      "SELECT count(*) n FROM messages WHERE sender_id=? AND recipient_id=?",
      sender,
      recipient,
    ).n >= 3
  )
    throw Object.assign(
      new Error("Wait for this person to accept your message request."),
      { status: 429 },
    );
  if (
    video_id &&
    (!visibleVideo(video_id, sender) || !visibleVideo(video_id, recipient))
  )
    throw Object.assign(
      new Error("This video is unavailable to this conversation."),
      { status: 403 },
    );
  if (
    reply_id &&
    !one(
      "SELECT 1 FROM messages WHERE id=? AND ((sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?))",
      reply_id,
      sender,
      recipient,
      recipient,
      sender,
    )
  )
    throw Object.assign(new Error("Reply unavailable."), { status: 404 });
  if (
    one(
      "SELECT 1 FROM messages WHERE sender_id=? AND recipient_id=?",
      recipient,
      sender,
    )
  )
    run("UPDATE chat_pairs SET accepted=1 WHERE a=? AND b=?", p.a, p.b);
  const id = randomUUID();
  run(
    "INSERT INTO messages(id,sender_id,recipient_id,body,video_id,reply_id) VALUES(?,?,?,?,?,?)",
    id,
    sender,
    recipient,
    body,
    video_id,
    reply_id,
  );
  live(sender);
  live(recipient);
  pushEvent(recipient, sender, "messages", video_id);
  return id;
}
