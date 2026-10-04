// Additive migrations preserve accounts, uploads, and existing sessions.
export function migrate(db) {
  const additions = {
    users: {
      role: "TEXT NOT NULL DEFAULT 'member'",
      suspended_until: "INTEGER NOT NULL DEFAULT 0",
      onboarded: "INTEGER NOT NULL DEFAULT 0",
    },
    messages: { reply_id: "TEXT REFERENCES messages(id) ON DELETE SET NULL" },
    video_views: { is_demo: "INTEGER NOT NULL DEFAULT 0" },
    videos: {
      status: "TEXT NOT NULL DEFAULT 'ready'",
      allow_duet: "INTEGER NOT NULL DEFAULT 1",
      allow_remix: "INTEGER NOT NULL DEFAULT 1",
      parent_id: "TEXT REFERENCES videos(id) ON DELETE CASCADE",
      remix_mode: "TEXT",
      source_json: "TEXT",
      captions_json: "TEXT NOT NULL DEFAULT '[]'",
      captions_status: "TEXT NOT NULL DEFAULT 'off'",
      audio_source_json: "TEXT",
      hls: "INTEGER NOT NULL DEFAULT 0",
    },
  };
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const [table, columns] of Object.entries(additions)) {
      const existing = new Set(
        db
          .prepare(`PRAGMA table_info(${table})`)
          .all()
          .map((c) => c.name),
      );
      for (const [name, type] of Object.entries(columns))
        if (!existing.has(name)) {
          db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
          if (table === "video_views" && name === "is_demo")
            db.exec(
              "UPDATE video_views SET is_demo=1 WHERE video_id LIKE 'seed-%' AND user_id IN (SELECT id FROM users WHERE demo=1)",
            );
        }
    }
    db.exec(`
      CREATE TABLE IF NOT EXISTS interests(user_id TEXT REFERENCES users(id) ON DELETE CASCADE, category TEXT NOT NULL, PRIMARY KEY(user_id,category));
      CREATE TABLE IF NOT EXISTS feed_feedback(user_id TEXT REFERENCES users(id) ON DELETE CASCADE, kind TEXT CHECK(kind IN ('video','creator','category')), target TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(user_id,kind,target));
      CREATE TABLE IF NOT EXISTS media_jobs(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, video_id TEXT UNIQUE NOT NULL REFERENCES videos(id) ON DELETE CASCADE, raw_location TEXT NOT NULL, options_json TEXT NOT NULL, status TEXT NOT NULL, progress INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0, error TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
      CREATE INDEX IF NOT EXISTS jobs_status ON media_jobs(status,created_at);
      CREATE TABLE IF NOT EXISTS video_assets(video_id TEXT REFERENCES videos(id) ON DELETE CASCADE, name TEXT NOT NULL, location TEXT NOT NULL, type TEXT NOT NULL, PRIMARY KEY(video_id,name));
      CREATE TABLE IF NOT EXISTS moderation_actions(id TEXT PRIMARY KEY, staff_id TEXT NOT NULL REFERENCES users(id), report_id TEXT REFERENCES reports(id), action TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS follower_events(id INTEGER PRIMARY KEY, creator_id TEXT REFERENCES users(id) ON DELETE CASCADE, follower_id TEXT REFERENCES users(id) ON DELETE CASCADE, change INTEGER NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
      CREATE INDEX IF NOT EXISTS follower_events_creator ON follower_events(creator_id,created_at);
    `);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
