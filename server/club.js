import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { all, one, run, transaction } from "./db.js";
import { requireAuth, requireVerified, hashToken } from "./auth.js";
import { questWeek } from "./quests.js";
export const rewards = [
  {
    id: "paper",
    kind: "cover",
    name: "Field notes",
    detail: "The beginning of every good story.",
    level: 1,
  },
  {
    id: "cosmos",
    kind: "cover",
    name: "After dark",
    detail: "For the ones who follow the stars.",
    level: 2,
  },
  {
    id: "dawn",
    kind: "cover",
    name: "Golden hour",
    detail: "Carry a little sunshine.",
    level: 3,
  },
  {
    id: "forest",
    kind: "cover",
    name: "Wild at heart",
    detail: "Take the long way home.",
    level: 5,
  },
  {
    id: "plain",
    kind: "frame",
    name: "Essential",
    detail: "A clean circle. Entirely you.",
    level: 1,
  },
  {
    id: "orbit",
    kind: "frame",
    name: "Orbit",
    detail: "A small world of your own.",
    level: 2,
  },
  {
    id: "sunbeam",
    kind: "frame",
    name: "Sunbeam",
    detail: "A golden outline for bright ideas.",
    level: 4,
  },
  {
    id: "curious",
    kind: "title",
    name: "Curious soul",
    detail: "Always a little curious.",
    level: 1,
  },
  {
    id: "explorer",
    kind: "title",
    name: "Field explorer",
    detail: "There is more to discover.",
    level: 2,
  },
  {
    id: "worldbuilder",
    kind: "title",
    name: "World builder",
    detail: "Your perspective makes a difference.",
    level: 5,
  },
];
export const challengePrompts = [
  {
    id: "small-wonders",
    title: "Small wonders.",
    subtitle: "Look closer. There’s a whole world in the ordinary.",
    prompt:
      "Make a short film about one tiny detail you usually walk past. A texture, a shadow, a little living thing. Help us see it with fresh eyes.",
    color: "forest",
    cue: "LOOK A LITTLE CLOSER",
    tips: [
      "Start with one detail",
      "Let natural sound tell the story",
      "Keep it original and yours",
    ],
  },
  {
    id: "your-corner",
    title: "Your corner of the world.",
    subtitle: "Somewhere familiar. A perspective only you have.",
    prompt:
      "Show us a moment from your neighborhood. A familiar route, a quiet corner, a place that makes you stop. Respect people’s privacy while you film.",
    color: "dawn",
    cue: "A POSTCARD FROM YOU",
    tips: [
      "Choose a place you know",
      "Tell a story in three shots",
      "Ask before filming people",
    ],
  },
  {
    id: "unexpected",
    title: "Well, that’s unexpected.",
    subtitle: "A small surprise can change the whole day.",
    prompt:
      "Make a film about something that surprised you. Reveal a new perspective, a clever idea, or a beautiful little coincidence.",
    color: "cosmos",
    cue: "FOLLOW THE SURPRISE",
    tips: [
      "Set the scene",
      "Save the reveal",
      "Credit your own original footage",
    ],
  },
  {
    id: "a-little-ritual",
    title: "A little ritual.",
    subtitle: "The ordinary moments that make a day yours.",
    prompt:
      "Share a small everyday ritual. Making something, finding calm, taking a walk. Turn a familiar moment into a short story.",
    color: "forest",
    cue: "MAKE THE EVERYDAY MATTER",
    tips: [
      "Find your rhythm",
      "Try a different angle",
      "Use music you have permission to use",
    ],
  },
];
export function currentChallenge(now) {
  const week = questWeek(now),
    n = Math.floor(Date.parse(`${week.id}T00:00:00Z`) / (7 * 86400000));
  return {
    ...challengePrompts[
      ((n % challengePrompts.length) + challengePrompts.length) %
        challengePrompts.length
    ],
    week: week.id,
    ends: week.ends,
    since: week.since,
    xp: 75,
  };
}
const totalXp = (user) =>
  user
    ? one(
        "SELECT coalesce(sum(xp),0) xp FROM quest_claims WHERE user_id=?",
        user,
      ).xp
    : 0;
export function publicStyle(user) {
  const chosen = one(
      "SELECT cover,frame,title FROM club_passports WHERE user_id=?",
      user,
    ) || { cover: "paper", frame: "plain", title: "curious" },
    level = Math.floor(totalXp(user) / 200) + 1,
    style = {};
  for (const kind of ["cover", "frame", "title"]) {
    const r =
      rewards.find(
        (r) => r.id === chosen[kind] && r.kind === kind && r.level <= level,
      ) || rewards.find((r) => r.kind === kind && r.level === 1);
    style[kind] = r.id;
    if (kind === "title") style.titleLabel = r.name;
  }
  return style;
}
export function adventureState(user, visibleVideo) {
  const interests =
    !!user && !!one("SELECT 1 FROM interests WHERE user_id=? LIMIT 1", user);
  const saved =
    !!user &&
    all("SELECT video_id FROM bookmarks WHERE user_id=?", user).some((v) =>
      visibleVideo(v.video_id, user),
    );
  const verified =
    !!user && !!one("SELECT verified FROM users WHERE id=?", user)?.verified;
  const claimed =
    !!user &&
    !!one(
      "SELECT 1 FROM quest_claims WHERE user_id=? AND week='lifetime' AND quest_id='first-adventure'",
      user,
    );
  const dismissed =
    !!user &&
    !!one(
      "SELECT adventure_dismissed FROM club_passports WHERE user_id=?",
      user,
    )?.adventure_dismissed;
  return {
    interests,
    saved,
    verified,
    claimed,
    dismissed,
    completed: interests && saved && verified,
    xp: 25,
  };
}
export function consumeInvite(token, user) {
  if (!token && process.env.BETA_INVITE_ONLY !== "1") return;
  const i =
    token &&
    one(
      "SELECT * FROM beta_invites WHERE token_hash=? AND revoked=0 AND expires_at>? AND used_at IS NULL",
      hashToken(token),
      Date.now(),
    );
  if (!i)
    throw Object.assign(
      new Error(
        "This invite is unavailable or expired. Ask the club host for a new one.",
      ),
      { status: 403 },
    );
  if (one("SELECT 1 FROM beta_invites WHERE used_by=?", user))
    throw Object.assign(new Error("You already have a beta membership."), {
      status: 409,
    });
  run(
    "UPDATE beta_invites SET used_by=?,used_at=CURRENT_TIMESTAMP WHERE id=?",
    user,
    i.id,
  );
}
function original(v, user, since) {
  return (
    v &&
    v.user_id === user &&
    v.status === "ready" &&
    v.privacy === "public" &&
    v.created_at >= since &&
    !v.parent_id &&
    !v.source_json &&
    !v.id.startsWith("seed-") &&
    v.duration >= 1
  );
}
export function installClub(app, { uid, validate, visibleVideo, videos }) {
  const privateResponse = (req, res, next) => {
    res.set("Cache-Control", "private,no-store");
    next();
  };
  const staff = (req, res, next) =>
    req.user.role === "admin"
      ? next()
      : res.status(403).json({ error: "Staff access required." });
  const member = (req, res, next) =>
    req.user.role === "admin" ||
    one("SELECT 1 FROM beta_invites WHERE used_by=?", uid(req))
      ? next()
      : res.status(403).json({ error: "A beta invite is required." });
  const clubState = (user) => ({
    xp: totalXp(user),
    level: Math.floor(totalXp(user) / 200) + 1,
    style: publicStyle(user),
    rewards: rewards.map((r) => ({
      ...r,
      unlocked: r.level <= Math.floor(totalXp(user) / 200) + 1,
    })),
    adventure: adventureState(user, visibleVideo),
    beta: !!user && !!one("SELECT 1 FROM beta_invites WHERE used_by=?", user),
  });
  app.get("/api/club", privateResponse, (req, res) => {
    const user = req.user?.suspended_until > Date.now() ? "" : uid(req);
    const films = all(
      "SELECT v.id FROM videos v WHERE v.source_json IS NOT NULL AND v.status='ready' AND v.privacy='public'",
    ).filter((v) => visibleVideo(v.id, user)).length;
    res.json({ ...clubState(user), films, challenge: currentChallenge() });
  });
  app.put(
    "/api/club/style",
    requireAuth,
    validate(
      z.object({
        kind: z.enum(["cover", "frame", "title"]),
        id: z.string().max(40),
      }),
    ),
    (req, res) => {
      const r = rewards.find(
        (r) => r.id === req.body.id && r.kind === req.body.kind,
      );
      if (!r || r.level > Math.floor(totalXp(uid(req)) / 200) + 1)
        return res
          .status(403)
          .json({ error: "Earn the required level to unlock this style." });
      run("INSERT OR IGNORE INTO club_passports(user_id) VALUES(?)", uid(req));
      run(
        `UPDATE club_passports SET ${r.kind}=? WHERE user_id=?`,
        r.id,
        uid(req),
      );
      res.json(clubState(uid(req)));
    },
  );
  app.put(
    "/api/club/adventure",
    requireAuth,
    validate(z.object({ dismissed: z.boolean() })),
    (req, res) => {
      run("INSERT OR IGNORE INTO club_passports(user_id) VALUES(?)", uid(req));
      run(
        "UPDATE club_passports SET adventure_dismissed=? WHERE user_id=?",
        req.body.dismissed ? 1 : 0,
        uid(req),
      );
      res.json(clubState(uid(req)));
    },
  );
  app.post(
    "/api/club/adventure/claim",
    requireAuth,
    requireVerified,
    (req, res) => {
      const result = transaction(() => {
        const a = adventureState(uid(req), visibleVideo);
        if (a.claimed) return { awarded: 0 };
        if (!a.completed) return null;
        run(
          "INSERT INTO quest_claims(user_id,week,quest_id,xp) VALUES(?,'lifetime','first-adventure',25)",
          uid(req),
        );
        return { awarded: 25 };
      });
      if (!result)
        return res.status(409).json({
          error:
            "Choose an interest, save a film, and verify your email first.",
        });
      res.json({ ...result, ...clubState(uid(req)) });
    },
  );
  app.get("/api/challenges", privateResponse, (req, res) => {
    const c = currentChallenge(),
      user = req.user?.suspended_until > Date.now() ? "" : uid(req);
    const entries = videos(
      "v.id IN (SELECT video_id FROM challenge_entries WHERE week=?) AND v.privacy='public'",
      [c.week],
      user,
      100,
    );
    const offset = Math.min(100, Math.max(0, parseInt(req.query.offset) || 0));
    const own = user
      ? one(
          "SELECT video_id FROM challenge_entries WHERE user_id=? AND week=?",
          user,
          c.week,
        )
      : null;
    res.json({
      challenge: c,
      entries: entries.slice(offset, offset + 12),
      total: entries.length,
      hasMore: offset + 12 < entries.length,
      entry:
        own && original(visibleVideo(own.video_id, user), user, c.since)
          ? own
          : null,
      claimed:
        !!user &&
        !!one(
          "SELECT 1 FROM quest_claims WHERE user_id=? AND week=? AND quest_id='challenge'",
          user,
          c.week,
        ),
      candidates: user
        ? videos(
            "v.user_id=? AND v.privacy='public' AND v.created_at>=? AND v.parent_id IS NULL AND v.source_json IS NULL AND v.id NOT LIKE 'seed-%'",
            [user, c.since],
            user,
            50,
          )
        : [],
    });
  });
  app.post(
    "/api/challenges/entry",
    requireAuth,
    requireVerified,
    validate(z.object({ video_id: z.string().min(1).max(64) })),
    (req, res) => {
      const c = currentChallenge();
      if (
        !original(visibleVideo(req.body.video_id, uid(req)), uid(req), c.since)
      )
        return res.status(409).json({
          error: "Choose your own original public film published this week.",
        });
      run(
        "INSERT INTO challenge_entries(user_id,week,challenge_id,video_id) VALUES(?,?,?,?) ON CONFLICT(user_id,week) DO UPDATE SET video_id=excluded.video_id,challenge_id=excluded.challenge_id",
        uid(req),
        c.week,
        c.id,
        req.body.video_id,
      );
      res.status(201).json({ ok: true });
    },
  );
  app.delete("/api/challenges/entry", requireAuth, (req, res) => {
    run(
      "DELETE FROM challenge_entries WHERE user_id=? AND week=?",
      uid(req),
      currentChallenge().week,
    );
    res.json({ ok: true });
  });
  app.post(
    "/api/challenges/claim",
    requireAuth,
    requireVerified,
    (req, res) => {
      const result = transaction(() => {
        const c = currentChallenge();
        if (
          one(
            "SELECT 1 FROM quest_claims WHERE user_id=? AND week=? AND quest_id='challenge'",
            uid(req),
            c.week,
          )
        )
          return { awarded: 0 };
        const entry = one(
          "SELECT video_id FROM challenge_entries WHERE user_id=? AND week=?",
          uid(req),
          c.week,
        );
        if (
          !entry ||
          !original(visibleVideo(entry.video_id, uid(req)), uid(req), c.since)
        )
          return null;
        run(
          "INSERT INTO quest_claims(user_id,week,quest_id,xp) VALUES(?,?,'challenge',75)",
          uid(req),
          c.week,
        );
        return { awarded: 75 };
      });
      if (!result)
        return res.status(409).json({
          error: "Submit a qualifying film before collecting this reward.",
        });
      res.json({ ...result, ...clubState(uid(req)) });
    },
  );
  app.get("/api/beta", requireAuth, member, privateResponse, (req, res) =>
    res.json({
      member: true,
      staff: req.user.role === "admin",
      feedback: all(
        "SELECT id,kind,body,status,created_at FROM beta_feedback WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 30",
        uid(req),
      ),
      devices: all(
        "SELECT * FROM beta_devices WHERE user_id=? ORDER BY created_at DESC LIMIT 10",
        uid(req),
      ).map((d) => ({
        ...d,
        results: JSON.parse(d.results_json),
        results_json: undefined,
      })),
    }),
  );
  app.post(
    "/api/beta/join",
    requireAuth,
    requireVerified,
    validate(z.object({ token: z.string().min(32).max(128) })),
    (req, res) => {
      transaction(() => consumeInvite(req.body.token, uid(req)));
      res.json({ ok: true });
    },
  );
  app.post(
    "/api/beta/feedback",
    requireAuth,
    member,
    validate(
      z.object({
        kind: z.enum(["bug", "idea", "delight"]),
        body: z.string().trim().min(10).max(2000),
        page: z.string().max(200).default(""),
      }),
    ),
    (req, res) => {
      if (
        one(
          "SELECT count(*) n FROM beta_feedback WHERE user_id=? AND created_at>datetime('now','-1 day')",
          uid(req),
        ).n >= 10
      )
        return res
          .status(429)
          .json({ error: "You can send 10 notes a day. Try again tomorrow." });
      const id = randomUUID();
      run(
        "INSERT INTO beta_feedback(id,user_id,kind,body,page) VALUES(?,?,?,?,?)",
        id,
        uid(req),
        req.body.kind,
        req.body.body,
        req.body.page,
      );
      res.status(201).json({ id });
    },
  );
  const resultSchema = z.enum(["pass", "fail", "untested"]);
  app.post(
    "/api/beta/devices",
    requireAuth,
    member,
    validate(
      z.object({
        model: z.string().trim().min(2).max(80),
        platform: z.enum(["ios", "android"]),
        browser: z.string().trim().min(2).max(80),
        results: z.object({
          playback: resultSchema,
          camera: resultSchema,
          upload: resultSchema,
          accessibility: resultSchema,
        }),
        notes: z.string().max(1000).default(""),
      }),
    ),
    (req, res) => {
      if (
        one(
          "SELECT count(*) n FROM beta_devices WHERE user_id=? AND created_at>datetime('now','-1 day')",
          uid(req),
        ).n >= 10
      )
        return res
          .status(429)
          .json({ error: "You can record 10 device checks a day." });
      const b = req.body;
      run(
        "INSERT INTO beta_devices(id,user_id,model,platform,browser,results_json,notes) VALUES(?,?,?,?,?,?,?)",
        randomUUID(),
        uid(req),
        b.model,
        b.platform,
        b.browser,
        JSON.stringify(b.results),
        b.notes,
      );
      res.status(201).json({ ok: true });
    },
  );
  app.get("/api/beta/manage", requireAuth, staff, privateResponse, (req, res) =>
    res.json({
      limit: 10,
      invites: all(
        "SELECT i.id,i.label,i.expires_at,i.revoked,i.used_at,p.username FROM beta_invites i LEFT JOIN profiles p ON p.user_id=i.used_by ORDER BY i.created_at DESC",
      ),
      feedback: all(
        "SELECT f.*,p.username FROM beta_feedback f JOIN profiles p ON p.user_id=f.user_id ORDER BY f.created_at DESC,f.id DESC LIMIT 100",
      ),
      devices: all(
        "SELECT d.*,p.username FROM beta_devices d JOIN profiles p ON p.user_id=d.user_id ORDER BY d.created_at DESC LIMIT 50",
      ).map((d) => ({
        ...d,
        results: JSON.parse(d.results_json),
        results_json: undefined,
      })),
    }),
  );
  app.post(
    "/api/beta/invites",
    requireAuth,
    staff,
    validate(z.object({ label: z.string().trim().min(1).max(50) })),
    (req, res) => {
      const result = transaction(() => {
        if (
          one(
            "SELECT count(*) n FROM beta_invites WHERE used_at IS NOT NULL OR (revoked=0 AND expires_at>?)",
            Date.now(),
          ).n >= 10
        )
          return null;
        const id = randomUUID(),
          token = randomBytes(32).toString("hex"),
          expires = Date.now() + 14 * 86400000;
        run(
          "INSERT INTO beta_invites(id,token_hash,label,issued_by,expires_at) VALUES(?,?,?,?,?)",
          id,
          hashToken(token),
          req.body.label,
          uid(req),
          expires,
        );
        return { id, token, expires_at: expires };
      });
      if (!result)
        return res.status(409).json({
          error:
            "All 10 beta places are reserved. Revoke an unused invite to make room.",
        });
      res.status(201).json(result);
    },
  );
  app.delete("/api/beta/invites/:id", requireAuth, staff, (req, res) => {
    const i = one("SELECT * FROM beta_invites WHERE id=?", req.params.id);
    if (!i || i.used_at)
      return res
        .status(409)
        .json({ error: "Only unused invitations can be revoked." });
    run("UPDATE beta_invites SET revoked=1 WHERE id=?", i.id);
    res.json({ ok: true });
  });
  app.put(
    "/api/beta/feedback/:id",
    requireAuth,
    staff,
    validate(z.object({ status: z.enum(["new", "reviewing", "done"]) })),
    (req, res) => {
      if (!one("SELECT 1 FROM beta_feedback WHERE id=?", req.params.id))
        return res.status(404).json({ error: "Note unavailable." });
      run(
        "UPDATE beta_feedback SET status=? WHERE id=?",
        req.body.status,
        req.params.id,
      );
      res.json({ ok: true });
    },
  );
}
