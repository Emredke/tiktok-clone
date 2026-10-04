import { one } from "./db.js";
// Collaboration chains remain unavailable when an original is removed or blocked.
export function ancestryVisible(id, viewer = "") {
  return !one(
    `WITH RECURSIVE ancestors AS (SELECT * FROM videos WHERE id=? UNION ALL SELECT v.* FROM videos v JOIN ancestors a ON v.id=a.parent_id) SELECT 1 FROM ancestors a JOIN users u ON u.id=a.user_id WHERE a.status!='ready' OR a.privacy!='public' OR u.suspended_until>? OR EXISTS(SELECT 1 FROM blocks WHERE (user_id=? AND blocked_id=a.user_id) OR (blocked_id=? AND user_id=a.user_id)) LIMIT 1`,
    id,
    Date.now(),
    viewer,
    viewer,
  );
}
export function sourceAllowed(o, viewer) {
  if (!o.parent_id) return true;
  const p = one("SELECT * FROM videos WHERE id=?", o.parent_id);
  return Boolean(
    p &&
    p[o.remix_mode === "duet" ? "allow_duet" : "allow_remix"] &&
    ancestryVisible(o.parent_id, viewer),
  );
}
export function collaborationCredit(o) {
  if (!o.parent_id) return null;
  const p = one("SELECT source_json FROM videos WHERE id=?", o.parent_id);
  if (!p?.source_json) return null;
  const credit = JSON.parse(p.source_json);
  credit.changes += ` ${o.remix_mode === "duet" ? "Combined side by side" : "Combined sequentially"} with a creator response.`;
  return JSON.stringify(credit);
}
