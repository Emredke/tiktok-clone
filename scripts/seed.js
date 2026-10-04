import sharp from "sharp";
import { existsSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { all, one, run, transaction } from "../server/db.js";
import { passwordHash } from "../server/auth.js";
import { exec, mediaDir, storeFile } from "../server/storage.js";
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
const titles = [
  [
    "Timing is everything",
    "The pause before the punchline",
    "Small things big laughs",
  ],
  ["Find your rhythm", "One more rep", "The art of momentum"],
  ["Follow the arc", "Practice makes progress", "The perfect bounce"],
  ["Next level energy", "Press play on possibility", "The final boss is focus"],
  ["A little zest", "Layers of flavor", "Made with a little love"],
  ["Take the scenic route", "Somewhere new", "Chasing the horizon"],
  ["Wild little wonders", "A softer kind of day", "Curiosity in motion"],
  ["Ideas in orbit", "Build something different", "Pixels to possibilities"],
  ["Color outside the lines", "Your everyday palette", "Make it your own"],
  ["Feel the frequency", "Let the rhythm breathe", "A moment on repeat"],
  ["My brain at midnight", "Currently buffering", "Mood for the weekend"],
  ["How waves work", "Patterns are everywhere", "The science of color"],
];
const palettes = [
  ["ff725e", "6b164f"],
  ["9be4c5", "183e65"],
  ["ffad55", "802537"],
  ["8d74ff", "102562"],
  ["ffc783", "7a3022"],
  ["64dddf", "08314a"],
  ["cae798", "36564c"],
  ["9aacf6", "202553"],
  ["eda4d5", "632574"],
  ["e1b6fd", "4b2780"],
  ["f79ea8", "793855"],
  ["84dcd6", "344784"],
];
export async function seed() {
  if (
    one("SELECT count(*) n FROM users WHERE demo=1").n >= 24 &&
    one("SELECT count(*) n FROM videos WHERE id LIKE ?", "seed-%").n >= 36
  )
    return;
  mkdirSync(mediaDir, { recursive: true });
  // Original procedural animation and synthesized sound; no third-party footage.
  for (let i = 0; i < 36; i++) {
    const cat = i % 12,
      n = Math.floor(i / 12),
      id = `seed-${String(i + 1).padStart(2, "0")}`,
      path = `${mediaDir}/${id}.mp4`,
      thumb = `${mediaDir}/${id}.jpg`;
    if (!existsSync(path)) {
      const [a, b] = palettes[cat];
      const title = titles[cat][n];
      const lines = title.length > 19 ? title.split(" ") : [title];
      let first = title,
        second = "";
      if (lines.length > 1) {
        const half = Math.ceil(lines.length / 2);
        first = lines.slice(0, half).join(" ");
        second = lines.slice(half).join(" ");
      }
      const overlay = `${mediaDir}/${id}-overlay.png`;
      const svg = `<svg width="360" height="640" xmlns="http://www.w3.org/2000/svg"><g fill="white" font-family="sans-serif"><text x="28" y="78" font-size="12" letter-spacing="3">VELO ORIGINALS</text><rect x="28" y="95" width="58" height="3"/><text x="28" y="290" font-size="30" font-weight="bold">${first}</text><text x="28" y="332" font-size="30" font-weight="bold">${second}</text><text x="28" y="392" font-size="13" letter-spacing="2">${categories[cat].toUpperCase()} / 0${n + 1}</text><text x="28" y="430" font-size="11" opacity="0.65">Original motion study</text></g></svg>`;
      await sharp(Buffer.from(svg)).png().toFile(overlay);
      await exec(
        "ffmpeg",
        [
          "-nostdin",
          "-y",
          "-f",
          "lavfi",
          "-i",
          `gradients=s=360x640:r=24:c0=0x${a}:c1=0x${b}:type=${["spiral", "radial", "circular"][n]}:speed=0.12:seed=${i + 1}`,
          "-f",
          "lavfi",
          "-i",
          `sine=frequency=${180 + i * 17}:sample_rate=44100`,
          "-loop",
          "1",
          "-i",
          overlay,
          "-t",
          "7",
          "-filter_complex",
          "[0:v][2:v]overlay=0:0",
          "-af",
          "volume=0.06,afade=t=in:d=0.5,afade=t=out:st=6.5:d=0.5",
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-crf",
          "26",
          "-pix_fmt",
          "yuv420p",
          "-c:a",
          "aac",
          "-movflags",
          "+faststart",
          path,
        ],
        { timeout: 60000, maxBuffer: 1024 * 1024 },
      );
      await exec(
        "ffmpeg",
        ["-nostdin", "-y", "-ss", "1", "-i", path, "-frames:v", "1", thumb],
        { timeout: 15000, maxBuffer: 1024 * 1024 },
      );
    }
    console.log(`Prepared original demo clip ${i + 1}/36`);
  }
  const hashed = await passwordHash("VeloDemo!2026");
  const media = [];
  for (let i = 0; i < 36; i++) {
    const id = `seed-${String(i + 1).padStart(2, "0")}`;
    media.push(
      process.env.STORAGE_DRIVER === "s3"
        ? {
            video: await storeFile(
              `${mediaDir}/${id}.mp4`,
              `${id}.mp4`,
              "video/mp4",
            ),
            thumbnail: await storeFile(
              `${mediaDir}/${id}.jpg`,
              `${id}.jpg`,
              "image/jpeg",
            ),
          }
        : { video: `/media/${id}.mp4`, thumbnail: `/media/${id}.jpg` },
    );
  }
  transaction(() => {
    for (let i = 0; i < 24; i++) {
      const id = `demo-${i + 1}`,
        category = categories[i % 12].toLowerCase();
      run(
        "INSERT OR IGNORE INTO users(id,email,password_hash,verified,demo) VALUES(?,?,?,1,1)",
        id,
        `${category}${i + 1}@demo.velo.invalid`,
        hashed,
      );
      run(
        "INSERT OR IGNORE INTO profiles(user_id,username,display_name,bio) VALUES(?,?,?,?)",
        id,
        `${category}_studio${i + 1}`,
        `${categories[i % 12]} Studio ${i + 1}`,
        `Fictional demo creator. Original ${category} motion studies, made for Velo.`,
      );
    }
    for (let i = 0; i < 36; i++) {
      const id = `seed-${String(i + 1).padStart(2, "0")}`,
        cat = i % 12,
        creator = `demo-${(i % 24) + 1}`,
        caption = `${titles[cat][Math.floor(i / 12)]} ✨ An original ${categories[cat].toLowerCase()} motion study. #velooriginals #${categories[cat].toLowerCase()}`;
      run(
        "INSERT OR IGNORE INTO videos(id,user_id,caption,category,audio,video_url,thumbnail_url,duration,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
        id,
        creator,
        caption,
        categories[cat],
        `Original frequency · ${180 + i * 17} Hz`,
        media[i].video,
        media[i].thumbnail,
        7,
        new Date(Date.now() - i * 3 * 3600000)
          .toISOString()
          .slice(0, 19)
          .replace("T", " "),
      );
      for (const name of [
        "velooriginals",
        categories[cat].toLowerCase(),
        "motion",
      ]) {
        run("INSERT OR IGNORE INTO hashtags(name) VALUES(?)", name);
        run(
          "INSERT OR IGNORE INTO video_hashtags VALUES(?,?)",
          id,
          one("SELECT id FROM hashtags WHERE name=?", name).id,
        );
      }
      for (let j = 0; j < 24; j++) {
        const viewer = `demo-${j + 1}`;
        if ((i + j) % 3 !== 0)
          run(
            "INSERT OR IGNORE INTO likes(user_id,video_id) VALUES(?,?)",
            viewer,
            id,
          );
        if ((i + j) % 7 === 0)
          run(
            "INSERT OR IGNORE INTO bookmarks(user_id,video_id) VALUES(?,?)",
            viewer,
            id,
          );
        if (
          !one(
            "SELECT 1 FROM video_views WHERE video_id=? AND user_id=?",
            id,
            viewer,
          )
        )
          run(
            "INSERT INTO video_views(video_id,user_id,watch_seconds,completion,completed,rewatches,skip_seconds) VALUES(?,?,?,?,?,?,?)",
            id,
            viewer,
            5 + (j % 4),
            0.5 + (j % 6) * 0.1,
            Number(j % 6 === 5),
            j % 4 === 0 ? 1 : 0,
            6,
          );
        if (j < 3) {
          const comment = `seed-comment-${i}-${j}`;
          const body = [
            "Love the colors on this one ✨",
            "The loop is so satisfying.",
            "How did you make this?",
          ][j];
          run(
            "INSERT OR IGNORE INTO comments(id,video_id,user_id,body) VALUES(?,?,?,?)",
            comment,
            id,
            viewer,
            body,
          );
          if (j === 2)
            run(
              "INSERT OR IGNORE INTO comments(id,video_id,user_id,parent_id,body) VALUES(?,?,?,?,?)",
              `seed-reply-${i}`,
              id,
              creator,
              comment,
              "Original procedural animation and synthesized audio!",
            );
        }
        if (j < 2)
          run(
            "INSERT OR IGNORE INTO shares(id,user_id,video_id,method) VALUES(?,?,?,?)",
            `seed-share-${i}-${j}`,
            viewer,
            id,
            "copy",
          );
      }
    }
    for (let i = 1; i <= 24; i++)
      for (let j = 1; j <= 24; j++)
        if (i !== j && (i + j) % 4 === 0)
          run(
            "INSERT OR IGNORE INTO follows(follower_id,following_id) VALUES(?,?)",
            `demo-${i}`,
            `demo-${j}`,
          );
  });
  console.log(
    "Seeded 24 fictional creators, 36 original videos, 576 likes, 144 comments/replies and follow relationships.",
  );
}
if (
  process.argv[1]?.endsWith("/seed.js") ||
  process.argv[1] === "scripts/seed.js"
)
  await seed();
