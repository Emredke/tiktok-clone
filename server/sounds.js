import { randomUUID } from "node:crypto";
import { mkdir, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { all, one, run } from "./db.js";
import { exec, storeFile } from "./storage.js";
import { requireAuth, requireVerified } from "./auth.js";
export const sounds = [
  {
    id: "morning",
    name: "Morning Light",
    kind: "music",
    frequency: 220,
    tempo: 2,
  },
  {
    id: "midnight",
    name: "Midnight Pulse",
    kind: "music",
    frequency: 146.83,
    tempo: 3,
  },
  {
    id: "daydream",
    name: "Daydream",
    kind: "music",
    frequency: 261.63,
    tempo: 1,
  },
  {
    id: "sunrise",
    name: "Sunrise Steps",
    kind: "music",
    frequency: 196,
    tempo: 2.5,
  },
  {
    id: "float",
    name: "Float Away",
    kind: "music",
    frequency: 174.61,
    tempo: 1.5,
  },
  {
    id: "arcade",
    name: "Arcade Run",
    kind: "music",
    frequency: 329.63,
    tempo: 4,
  },
  {
    id: "chime",
    name: "Bright Chime",
    kind: "effect",
    frequency: 880,
    tempo: 1,
  },
  {
    id: "whoosh",
    name: "Soft Whoosh",
    kind: "effect",
    frequency: 80,
    tempo: 1,
  },
  { id: "pop", name: "Little Pop", kind: "effect", frequency: 440, tempo: 1 },
].map((s) => ({
  ...s,
  author: "Velo",
  license: "CC0 1.0",
  license_url: "https://creativecommons.org/publicdomain/zero/1.0/",
  duration: s.kind === "music" ? 30 : 2,
  url: `/api/sounds/${s.id}/audio`,
}));
const locations = new Map();
let preparing;
export function initSounds() {
  if (preparing) return preparing;
  preparing = (async () => {
    await mkdir(resolve("./data/tmp"), { recursive: true });
    for (const s of sounds) {
      const path = resolve(`./data/tmp/sound-${s.id}.mp3`);
      const f = s.frequency;
      const expression =
        s.kind === "music"
          ? `0.16*sin(2*PI*${f}*pow(2,mod(floor(t*${s.tempo}),4)/12)*t)*(0.55+0.45*cos(2*PI*${s.tempo}*t))+0.07*sin(2*PI*${f / 2}*t)+0.03*sin(2*PI*60*t)*exp(-18*mod(t,${1 / s.tempo}))`
          : s.id === "whoosh"
            ? "0.3*sin(2*PI*(80*t+300*t*t))*sin(PI*t/2)"
            : `0.3*sin(2*PI*${f}*t)*exp(-${s.id === "pop" ? 12 : 3}*t)`;
      try {
        await exec(
          "ffmpeg",
          [
            "-nostdin",
            "-y",
            "-f",
            "lavfi",
            "-i",
            `aevalsrc=${expression.replace(/,/g, "\\,")}:s=48000:d=${s.duration}`,
            "-af",
            "afade=t=in:d=0.02,afade=t=out:st=" +
              String(s.duration - 0.1) +
              ":d=0.1",
            "-c:a",
            "libmp3lame",
            "-b:a",
            "128k",
            path,
          ],
          { timeout: 30000, maxBuffer: 1024 * 1024 },
        );
        locations.set(
          s.id,
          await storeFile(path, `sound-${s.id}.mp3`, "audio/mpeg"),
        );
      } finally {
        await unlink(path).catch(() => {});
      }
    }
  })().catch((e) => {
    preparing = null;
    throw e;
  });
  return preparing;
}
export function checkAudio(o, user) {
  if (o.sound_id && !sounds.some((s) => s.id === o.sound_id))
    throw Object.assign(new Error("Choose a sound from the library."), {
      status: 400,
    });
  if (
    o.voiceover_id &&
    !one(
      "SELECT 1 FROM voiceovers WHERE id=? AND user_id=?",
      o.voiceover_id,
      user,
    )
  )
    throw Object.assign(new Error("Voice recording unavailable."), {
      status: 403,
    });
}
export function audioCredit(o) {
  const s = sounds.find((s) => s.id === o.sound_id);
  return s
    ? JSON.stringify({
        name: s.name,
        author: s.author,
        license: s.license,
        license_url: s.license_url,
      })
    : null;
}
export function installSounds(app) {
  app.get("/api/sounds", (req, res) =>
    res.json({ sounds: sounds.map(({ frequency, tempo, ...s }) => s) }),
  );
  app.get("/api/sounds/:id/audio", async (req, res) => {
    if (!sounds.some((s) => s.id === req.params.id))
      return res.status(404).json({ error: "Sound unavailable." });
    await initSounds();
    const { serveAsset } = await import("./media.js");
    await serveAsset(locations.get(req.params.id), "audio/mpeg", req, res);
  });
  const upload = multer({
    dest: resolve("./data/tmp"),
    limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  });
  const limit = rateLimit({
    windowMs: 900000,
    limit: 20,
    keyGenerator: (req) => req.user.id,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
  app.post(
    "/api/voiceovers",
    requireAuth,
    requireVerified,
    limit,
    upload.single("audio"),
    async (req, res) => {
      const file = req.file;
      if (!file)
        return res.status(400).json({ error: "Choose or record audio." });
      const converted = `${file.path}.m4a`;
      try {
        if (
          one("SELECT count(*) n FROM voiceovers WHERE user_id=?", req.user.id)
            .n >= 100
        )
          throw Object.assign(
            new Error(
              "Keep up to 100 voice recordings. Remove an unused one first.",
            ),
            { status: 429 },
          );
        const { stdout } = await exec(
          "ffprobe",
          [
            "-v",
            "error",
            "-show_format",
            "-show_streams",
            "-of",
            "json",
            file.path,
          ],
          { timeout: 20000, maxBuffer: 1024 * 1024 },
        );
        const info = JSON.parse(stdout);
        let duration = Number(info.format.duration);
        if (!Number.isFinite(duration)) {
          const packets = await exec(
            "ffprobe",
            [
              "-v",
              "error",
              "-select_streams",
              "a:0",
              "-show_entries",
              "packet=pts_time,duration_time",
              "-of",
              "csv=p=0",
              file.path,
            ],
            { timeout: 20000, maxBuffer: 8 * 1024 * 1024 },
          );
          duration = packets.stdout
            .trim()
            .split("\n")
            .reduce((max, line) => {
              const [time, length] = line.split(",").map(Number);
              return Number.isFinite(time)
                ? Math.max(max, time + (Number.isFinite(length) ? length : 0))
                : max;
            }, 0);
        }
        if (
          !info.streams.some((s) => s.codec_type === "audio") ||
          info.streams.some((s) => s.codec_type === "video") ||
          !Number.isFinite(duration) ||
          duration <= 0 ||
          duration > 180
        )
          throw Object.assign(
            new Error(
              "Audio must be between a moment and 180 seconds, without video.",
            ),
            { status: 400 },
          );
        await exec(
          "ffmpeg",
          [
            "-nostdin",
            "-y",
            "-i",
            file.path,
            "-map",
            "0:a:0",
            "-vn",
            "-c:a",
            "aac",
            "-ar",
            "48000",
            "-ac",
            "2",
            converted,
          ],
          { timeout: 60000, maxBuffer: 1024 * 1024 },
        );
        const id = randomUUID(),
          location = await storeFile(converted, `voice-${id}.m4a`, "audio/mp4");
        run(
          "INSERT INTO voiceovers(id,user_id,location,duration) VALUES(?,?,?,?)",
          id,
          req.user.id,
          location,
          duration,
        );
        res
          .status(201)
          .json({
            voiceover: { id, duration, url: `/api/voiceovers/${id}/audio` },
          });
      } catch (e) {
        if (!e.status) e.status = 400;
        throw e;
      } finally {
        await Promise.all(
          [file.path, converted].map((p) => unlink(p).catch(() => {})),
        );
      }
    },
  );
  app.get("/api/voiceovers/:id/audio", requireAuth, async (req, res) => {
    const voice = one(
      "SELECT * FROM voiceovers WHERE id=? AND user_id=?",
      req.params.id,
      req.user.id,
    );
    if (!voice)
      return res.status(404).json({ error: "Recording unavailable." });
    const { serveAsset } = await import("./media.js");
    await serveAsset(voice.location, "audio/mp4", req, res);
  });
  app.delete("/api/voiceovers/:id", requireAuth, (req, res) => {
    const v = one(
      "SELECT * FROM voiceovers WHERE id=? AND user_id=?",
      req.params.id,
      req.user.id,
    );
    if (!v) return res.status(404).json({ error: "Recording unavailable." });
    if (
      all(
        "SELECT options_json FROM media_jobs WHERE user_id=? AND status IN ('draft','failed','queued','processing')",
        req.user.id,
      ).some((j) => JSON.parse(j.options_json).voiceover_id === v.id)
    )
      return res
        .status(409)
        .json({ error: "This recording is used by an unfinished upload." });
    run("DELETE FROM voiceovers WHERE id=?", v.id);
    res.json({ ok: true });
  });
}
export async function mixAudio(input, output, o, user, temporary) {
  checkAudio(o, user);
  const args = ["-nostdin", "-y", "-i", input];
  let inputs = 1;
  const filters = [`[0:a]volume=${o.original_volume ?? 1}[a0]`],
    labels = ["[a0]"];
  const { materialize } = await import("./media.js");
  if (o.sound_id) {
    await initSounds();
    const sound = sounds.find((s) => s.id === o.sound_id),
      path = `${output}.sound.mp3`;
    temporary.push(path);
    await materialize(locations.get(sound.id), path);
    if (sound.kind === "music") args.push("-stream_loop", "-1");
    args.push("-i", path);
    filters.push(
      `[${inputs}:a]volume=${o.music_volume ?? 0.35},apad[a${inputs}]`,
    );
    labels.push(`[a${inputs++}]`);
  }
  if (o.voiceover_id) {
    const v = one(
        "SELECT * FROM voiceovers WHERE id=? AND user_id=?",
        o.voiceover_id,
        user,
      ),
      path = `${output}.voice.m4a`;
    temporary.push(path);
    await materialize(v.location, path);
    args.push("-i", path);
    filters.push(
      `[${inputs}:a]volume=${o.voiceover_volume ?? 1},adelay=${Math.round((o.voice_start || 0) * 1000)}:all=1,apad[a${inputs}]`,
    );
    labels.push(`[a${inputs++}]`);
  }
  filters.push(
    `${labels.join("")}amix=inputs=${inputs}:duration=first:normalize=0,alimiter=limit=0.95:level=false[a]`,
  );
  args.push(
    "-filter_complex",
    filters.join(";"),
    "-map",
    "0:v:0",
    "-map",
    "[a]",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-movflags",
    "+faststart",
    output,
  );
  await exec("ffmpeg", args, { timeout: 180000, maxBuffer: 2 * 1024 * 1024 });
}
