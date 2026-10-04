import { all, one, run, transaction } from "./db.js";
import { requireAuth, requireVerified } from "./auth.js";

export const questCatalog = [
  {
    id: "scout",
    title: "Take the scenic route",
    description: "Save a video from three different topics this week.",
    goal: 3,
    xp: 40,
    badge: "Pathfinder",
    action: "Explore topics",
    path: "/discover",
    icon: "compass",
  },
  {
    id: "curator",
    title: "Make a little collection",
    description:
      "Create a collection this week with videos from two different creators.",
    goal: 2,
    xp: 60,
    badge: "Curator",
    action: "Open your library",
    path: "/library",
    icon: "collection",
  },
  {
    id: "maker",
    title: "Put your idea out there",
    description:
      "Publish one original public video this week. Imports and remixes don’t count.",
    goal: 1,
    xp: 100,
    badge: "Storyteller",
    action: "Create a video",
    path: "/create",
    icon: "camera",
  },
];

export function questWeek(now = new Date()) {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  return {
    id: start.toISOString().slice(0, 10),
    since: start.toISOString().slice(0, 19).replace("T", " "),
    ends: new Date(+start + 7 * 86400000).toISOString(),
  };
}

export function questState(user, visibleVideo, now) {
  const week = questWeek(now);
  const counts = { scout: 0, curator: 0, maker: 0 };
  if (user) {
    counts.scout = new Set(
      all(
        "SELECT v.id,v.category FROM bookmarks b JOIN videos v ON v.id=b.video_id WHERE b.user_id=? AND b.created_at>=? AND v.user_id<>?",
        user,
        week.since,
        user,
      )
        .filter((v) => visibleVideo(v.id, user))
        .map((v) => v.category),
    ).size;
    const collections = all(
      "SELECT l.id,i.video_id,v.user_id creator FROM libraries l JOIN library_items i ON i.library_id=l.id JOIN videos v ON v.id=i.video_id WHERE l.user_id=? AND l.kind='collection' AND l.created_at>=? AND v.user_id<>?",
      user,
      week.since,
      user,
    );
    const creators = new Map();
    for (const item of collections)
      if (visibleVideo(item.video_id, user)) {
        if (!creators.has(item.id)) creators.set(item.id, new Set());
        creators.get(item.id).add(item.creator);
      }
    counts.curator = Math.max(0, ...[...creators.values()].map((v) => v.size));
    counts.maker = one(
      "SELECT count(*) n FROM videos WHERE user_id=? AND created_at>=? AND status='ready' AND privacy='public' AND parent_id IS NULL AND source_json IS NULL AND duration>=1 AND id NOT LIKE 'seed-%'",
      user,
      week.since,
    ).n;
  }
  const claims = user
    ? all(
        "SELECT * FROM quest_claims WHERE user_id=? ORDER BY claimed_at,quest_id",
        user,
      )
    : [];
  const xp = claims.reduce((sum, claim) => sum + claim.xp, 0);
  const level = Math.floor(xp / 200) + 1;
  return {
    week: week.id,
    ends: week.ends,
    xp,
    level,
    levelXp: xp % 200,
    nextLevelXp: 200,
    rank:
      level >= 10
        ? "Trailblazer"
        : level >= 5
          ? "Wayfinder"
          : level >= 2
            ? "Explorer"
            : "Newcomer",
    badges: [
      ...questCatalog,
      { id: "first-adventure", badge: "First light", icon: "compass" },
      { id: "challenge", badge: "Trail maker", icon: "camera" },
    ]
      .filter((q) => claims.some((c) => c.quest_id === q.id))
      .map((q) => ({ id: q.id, name: q.badge, icon: q.icon })),
    quests: questCatalog.map((q) => ({
      ...q,
      progress: Math.min(q.goal, counts[q.id]),
      completed: counts[q.id] >= q.goal,
      claimed: claims.some((c) => c.quest_id === q.id && c.week === week.id),
    })),
  };
}

export function installQuests(app, { uid, visibleVideo }) {
  app.get("/api/quests", (req, res) => {
    res.set("Cache-Control", "private,no-store");
    res.json(
      questState(
        req.user?.suspended_until > Date.now() ? "" : uid(req),
        visibleVideo,
      ),
    );
  });
  app.post(
    "/api/quests/:id/claim",
    requireAuth,
    requireVerified,
    (req, res) => {
      const quest = questCatalog.find((q) => q.id === req.params.id);
      if (!quest) return res.status(404).json({ error: "Quest unavailable." });
      const result = transaction(() => {
        const state = questState(uid(req), visibleVideo);
        const current = state.quests.find((q) => q.id === quest.id);
        if (current.claimed) return { awarded: 0, state };
        if (!current.completed) return null;
        run(
          "INSERT INTO quest_claims(user_id,week,quest_id,xp) VALUES(?,?,?,?)",
          uid(req),
          state.week,
          quest.id,
          quest.xp,
        );
        return { awarded: quest.xp, state: questState(uid(req), visibleVideo) };
      });
      if (!result)
        return res
          .status(409)
          .json({ error: "Complete this quest before collecting XP." });
      res.json(result);
    },
  );
}
