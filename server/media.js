import { mixAudio } from "./sounds.js";
import { sourceAllowed } from "./policy.js";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { copyFile, readFile, writeFile, unlink } from "node:fs/promises";
import { basename, resolve } from "node:path";
import sharp from "sharp";
import { exec, probe, storeFile, mediaDir } from "./storage.js";
import { run, one } from "./db.js";
const s3 = () =>
  new S3Client({
    region: process.env.S3_REGION || "us-east-1",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: !!process.env.S3_ENDPOINT,
  });
export async function materialize(location, path) {
  if (location.startsWith("s3:")) {
    const object = await s3().send(
      new GetObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: location.slice(3),
      }),
    );
    await writeFile(path, await object.Body.transformToByteArray());
  } else await copyFile(resolve(mediaDir, basename(location)), path);
}
export async function serveAsset(location, type, req, res) {
  res.type(type).set("Cache-Control", "private,max-age=30");
  if (!location.startsWith("s3:"))
    return res.sendFile(resolve(mediaDir, basename(location)));
  const object = await s3().send(
    new GetObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: location.slice(3),
      Range: req.headers.range,
    }),
  );
  if (object.ContentRange)
    res.status(206).set("Content-Range", object.ContentRange);
  if (object.ContentLength !== undefined)
    res.set("Content-Length", String(object.ContentLength));
  res.set("Accept-Ranges", "bytes");
  object.Body.on("error", () => res.destroy()).pipe(res);
  res.on("close", () => object.Body.destroy());
}
const ffmpeg = (args) =>
  exec("ffmpeg", ["-nostdin", "-y", ...args], {
    timeout: 600000,
    maxBuffer: 4 * 1024 * 1024,
  });
const encode = [
  "-r",
  "30",
  "-c:v",
  "libx264",
  "-preset",
  "veryfast",
  "-crf",
  "23",
  "-c:a",
  "aac",
  "-ar",
  "48000",
  "-ac",
  "2",
  "-movflags",
  "+faststart",
];
function escapeXML(s) {
  return s.replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
}
export async function produce(path, id, o, progress, user) {
  const temporary = [];
  const tmp = (ext) => {
    const p = `${path}.${ext}`;
    temporary.push(p);
    return p;
  };
  try {
    const duration = await probe(path);
    const from = Math.max(0, Math.min(duration - 1, o.start)),
      length = Math.min(duration - from, (o.end || duration) - from) / o.speed;
    if (length < 1 || length > 180)
      throw new Error("Choose a clip between 1 and 180 seconds after editing.");
    const processed = tmp("edited.mp4");
    const rotations = {
      0: "",
      90: "transpose=1,",
      180: "hflip,vflip,",
      270: "transpose=2,",
    };
    const size =
      o.fit === "cover"
        ? "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280"
        : "scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:color=black";
    let vf = `${rotations[o.rotation]}${size},setsar=1,setpts=PTS/${o.speed}`;
    const { stdout } = await exec("ffprobe", [
      "-v",
      "error",
      "-show_streams",
      "-of",
      "json",
      path,
    ]);
    const hasAudio =
      JSON.parse(stdout).streams.some((s) => s.codec_type === "audio") &&
      !o.mute;
    let args = ["-ss", String(from), "-i", path];
    if (!hasAudio) args.push("-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo");
    if (o.overlay.trim()) {
      const png = tmp("overlay.png");
      const wrapped =
        o.overlay
          .trim()
          .replace(/\s+/g, " ")
          .match(/.{1,32}(?:\s|$)|.{1,32}/g) || [];
      const lines = wrapped.map((s) => escapeXML(s.trim()));
      await sharp(
        Buffer.from(
          `<svg width="720" height="1280"><rect x="28" y="${o.overlay_position === "top" ? 95 : 870}" width="664" height="${lines.length * 52 + 24}" rx="14" fill="black" opacity="0.65"/>${lines.map((s, i) => `<text x="360" y="${(o.overlay_position === "top" ? 145 : 920) + i * 52}" text-anchor="middle" font-family="sans-serif" font-size="36" fill="white">${s}</text>`).join("")}</svg>`,
        ),
      )
        .png()
        .toFile(png);
      args.push(
        "-loop",
        "1",
        "-i",
        png,
        "-filter_complex",
        `[0:v]${vf}[base];[base][${hasAudio ? 1 : 2}:v]overlay=0:0:enable='between(t,${o.overlay_start},${o.overlay_end})'[out]`,
        "-map",
        "[out]",
      );
    } else args.push("-vf", vf, "-map", "0:v:0");
    args.push(
      "-map",
      hasAudio ? "0:a:0" : "1:a:0",
      "-af",
      hasAudio ? `atempo=${o.speed}` : "anull",
      "-t",
      String(length),
      ...encode,
      processed,
    );
    await ffmpeg(args);
    progress(35);
    let final = processed;
    if (o.parent_id) {
      const parent = one(
        "SELECT * FROM videos WHERE id=? AND status='ready' AND privacy='public'",
        o.parent_id,
      );
      if (
        !sourceAllowed(o, user) ||
        !parent ||
        !parent[o.remix_mode === "duet" ? "allow_duet" : "allow_remix"]
      )
        throw new Error(
          "The original creator no longer allows this collaboration.",
        );
      const original = tmp("original.mp4");
      await materialize(parent.video_url, original);
      const composite = tmp("collaboration.mp4");
      if (o.remix_mode === "duet") {
        const pane =
          "scale=360:1280:force_original_aspect_ratio=decrease,pad=360:1280:(ow-iw)/2:(oh-ih)/2,setsar=1";
        await ffmpeg([
          "-i",
          original,
          "-i",
          processed,
          "-filter_complex",
          `[0:v]${pane},tpad=stop_mode=clone:stop_duration=180[a];[1:v]${pane}[b];[a][b]hstack=inputs=2[v]`,
          "-map",
          "[v]",
          "-map",
          "1:a:0",
          "-t",
          String(length),
          ...encode,
          composite,
        ]);
      } else {
        const intro = tmp("intro.mp4");
        const sec = Math.min(8, parent.duration, 180 - length);
        if (sec < 1)
          throw new Error("Leave at least one second for the original video.");
        const info = JSON.parse(
          (
            await exec("ffprobe", [
              "-v",
              "error",
              "-show_streams",
              "-of",
              "json",
              original,
            ])
          ).stdout,
        );
        const audio = info.streams.some((s) => s.codec_type === "audio");
        const a = ["-i", original];
        if (!audio) a.push("-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo");
        a.push(
          "-map",
          "0:v:0",
          "-map",
          audio ? "0:a:0" : "1:a:0",
          "-vf",
          "scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,setsar=1",
          "-t",
          String(sec),
          ...encode,
          intro,
        );
        await ffmpeg(a);
        await ffmpeg([
          "-i",
          intro,
          "-i",
          processed,
          "-filter_complex",
          "[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[v][a]",
          "-map",
          "[v]",
          "-map",
          "[a]",
          ...encode,
          composite,
        ]);
      }
      final = composite;
    }
    if (
      o.sound_id ||
      o.voiceover_id ||
      (o.original_volume !== undefined && o.original_volume !== 1)
    ) {
      const mixed = tmp("mixed.mp4");
      await mixAudio(final, mixed, o, user, temporary);
      final = mixed;
    }
    progress(50);
    const finalDuration = await probe(final),
      thumb = tmp("jpg");
    await ffmpeg([
      "-ss",
      String(Math.min(finalDuration - 0.1, o.thumbnail)),
      "-i",
      final,
      "-frames:v",
      "1",
      "-vf",
      "scale=360:-2",
      thumb,
    ]);
    let cues = [],
      captionStatus = "off",
      captionError = "";
    if (o.auto_captions) {
      captionStatus = "ready";
      const json = tmp("captions.json");
      try {
        await exec(
          process.env.CAPTION_PYTHON ||
            resolve("./data/captions-venv/bin/python"),
          [resolve("scripts/transcribe.py"), final, json],
          { timeout: 600000, maxBuffer: 2 * 1024 * 1024 },
        );
        cues = JSON.parse(await readFile(json, "utf8"));
        if (!cues.length) captionStatus = "no_speech";
      } catch {
        captionStatus = "failed";
        captionError =
          "Automatic captions could not run. Check the local caption model setup; you can add captions in Creator Studio.";
      }
    }
    const video_url = await storeFile(final, `${id}.mp4`, "video/mp4");
    const thumbnail_url = await storeFile(thumb, `${id}.jpg`, "image/jpeg");
    progress(65);
    await buildHls(final, id, temporary, progress);
    return {
      video_url,
      thumbnail_url,
      duration: finalDuration,
      cues,
      captionStatus,
      captionError,
    };
  } finally {
    await Promise.all(temporary.map((p) => unlink(p).catch(() => {})));
  }
}
export async function buildHls(
  path,
  id,
  temporary = [],
  progress = () => {},
  threads = 0,
) {
  const variants = [];
  for (const [n, w, h, bandwidth] of [
    ["low", 240, 426, 350000],
    ["medium", 480, 854, 1000000],
    ["high", 720, 1280, 2400000],
  ]) {
    const playlist = `${path}.${n}.m3u8`,
      pattern = `${path}.${n}-%03d.ts`;
    temporary.push(playlist);
    await ffmpeg([
      "-i",
      path,
      "-vf",
      `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1`,
      "-c:v",
      "libx264",
      "-threads",
      String(threads),
      "-preset",
      "veryfast",
      "-b:v",
      String(bandwidth),
      "-maxrate",
      String(bandwidth),
      "-bufsize",
      String(bandwidth * 2),
      "-c:a",
      "aac",
      "-b:a",
      "96k",
      "-g",
      "60",
      "-keyint_min",
      "60",
      "-sc_threshold",
      "0",
      "-f",
      "hls",
      "-hls_time",
      "2",
      "-hls_playlist_type",
      "vod",
      "-hls_segment_filename",
      pattern,
      playlist,
    ]);
    let text = await readFile(playlist, "utf8");
    for (const name of text
      .split("\n")
      .filter((s) => s && !s.startsWith("#"))) {
      const segment = resolve(
        basename(path) === path ? "" : resolve(path, ".."),
        name,
      );
      temporary.push(segment);
      const assetName = `${n}-${name.match(/(\d{3})\.ts$/)[1]}.ts`;
      const location = await storeFile(
        segment,
        `${id}-${assetName}`,
        "video/mp2t",
      );
      run(
        "INSERT OR REPLACE INTO video_assets VALUES(?,?,?,?)",
        id,
        assetName,
        location,
        "video/mp2t",
      );
      text = text.replace(name, assetName);
    }
    const rewritten = `${playlist}.rewritten`;
    temporary.push(rewritten);
    await writeFile(rewritten, text);
    const location = await storeFile(
      rewritten,
      `${id}-${n}.m3u8`,
      "application/vnd.apple.mpegurl",
    );
    run(
      "INSERT OR REPLACE INTO video_assets VALUES(?,?,?,?)",
      id,
      `${n}.m3u8`,
      location,
      "application/vnd.apple.mpegurl",
    );
    variants.push(
      `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth + 96000},RESOLUTION=${w}x${h}\n${n}.m3u8`,
    );
    progress(n === "low" ? 75 : n === "medium" ? 85 : 95);
  }
  const master = `${path}.master.m3u8`;
  temporary.push(master);
  await writeFile(
    master,
    "#EXTM3U\n#EXT-X-VERSION:3\n" + variants.join("\n") + "\n",
  );
  run(
    "INSERT OR REPLACE INTO video_assets VALUES(?,?,?,?)",
    id,
    "master.m3u8",
    await storeFile(
      master,
      `${id}-master.m3u8`,
      "application/vnd.apple.mpegurl",
    ),
    "application/vnd.apple.mpegurl",
  );
}
