import { all } from "./db.js";
// Replace this function with a model-backed ranker without changing the feed contract.
export function rankVideos(candidates, userId) {
  if (!userId)
    return candidates
      .map((v) => ({ ...v, score: quality(v) + fresh(v) }))
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const signals = all(
    `SELECT v.id,v.category,v.user_id,coalesce(group_concat(h.name),'') tags,
 (SELECT count(*) FROM likes WHERE user_id=? AND video_id=v.id) liked,
 (SELECT count(*) FROM comments WHERE user_id=? AND video_id=v.id) commented,
 (SELECT count(*) FROM bookmarks WHERE user_id=? AND video_id=v.id) saved,
 (SELECT count(*) FROM shares WHERE user_id=? AND video_id=v.id) shared,
 (SELECT coalesce(sum(completion*3+completed*2+rewatches*2-CASE WHEN skip_seconds<2 AND completion<0.2 THEN 4 ELSE 0 END),0) FROM video_views WHERE user_id=? AND video_id=v.id) watch,
 (SELECT count(*) FROM video_views WHERE user_id=? AND video_id=v.id) seen
 FROM videos v LEFT JOIN video_hashtags vh ON vh.video_id=v.id LEFT JOIN hashtags h ON h.id=vh.hashtag_id
 WHERE v.id IN (SELECT video_id FROM video_views WHERE user_id=? UNION SELECT video_id FROM likes WHERE user_id=? UNION SELECT video_id FROM bookmarks WHERE user_id=? UNION SELECT video_id FROM comments WHERE user_id=? UNION SELECT video_id FROM shares WHERE user_id=?) GROUP BY v.id`,
    ...Array(11).fill(userId),
  );
  const categories = {},
    tags = {},
    creators = {},
    seen = {};
  for (const s of signals) {
    const weight =
      s.liked * 3 +
      s.commented * 4 +
      s.saved * 5 +
      s.shared * 6 +
      Math.max(-12, Math.min(12, s.watch));
    categories[s.category] = (categories[s.category] || 0) + weight;
    creators[s.user_id] = (creators[s.user_id] || 0) + weight;
    for (const tag of s.tags.split(",")) tags[tag] = (tags[tag] || 0) + weight;
    seen[s.id] = s.seen;
  }
  const follows = new Set(
    all("SELECT following_id FROM follows WHERE follower_id=?", userId).map(
      (f) => f.following_id,
    ),
  );
  return candidates
    .map((v) => ({
      ...v,
      score:
        quality(v) +
        fresh(v) +
        Math.tanh((categories[v.category] || 0) / 15) * 7 +
        Math.tanh((creators[v.user_id] || 0) / 15) * 5 +
        (v.hashtags || []).reduce(
          (sum, t) => sum + Math.tanh((tags[t] || 0) / 15) * 2,
          0,
        ) +
        (follows.has(v.user_id) ? 6 : 0) -
        (seen[v.id] || 0) * 4 +
        exploration(v.id, userId),
    }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}
function quality(v) {
  const views = Math.max(v.views_count || 0, 10);
  return (
    Math.log1p(v.likes_count + v.comments_count * 2 + v.shares_count * 3) *
      0.7 +
    Math.min(
      3,
      (v.likes_count + v.comments_count * 2 + v.shares_count * 3) / views,
    ) *
      2 +
    (v.completion_rate || 0) * 3
  );
}
function fresh(v) {
  return (
    4 *
    Math.exp(
      -Math.max(0, Date.now() - Date.parse(v.created_at + "Z")) /
        (86400000 * 7),
    )
  );
}
function exploration(id, user) {
  let h = 0;
  for (const c of `${user}:${id}:${new Date().toISOString().slice(0, 10)}`)
    h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 10 === 0 ? 3 : 0;
}
