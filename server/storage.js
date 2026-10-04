import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { mkdir, readFile, copyFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
export const exec = promisify(execFile);
export const mediaDir = resolve(process.env.MEDIA_DIR || "./data/media");
export async function storeFile(path, key, type) {
  if (process.env.STORAGE_DRIVER === "s3") {
    const s3 = new S3Client({
      region: process.env.S3_REGION || "us-east-1",
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: !!process.env.S3_ENDPOINT,
    });
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        Body: await readFile(path),
        ContentType: type,
        CacheControl: "private,max-age=60",
      }),
    );
    return `s3:${key}`;
  }
  await mkdir(mediaDir, { recursive: true });
  await copyFile(path, resolve(mediaDir, key));
  return `/media/${key}`;
}
export async function probe(path) {
  const { stdout } = await exec(
    "ffprobe",
    ["-v", "error", "-show_format", "-show_streams", "-of", "json", path],
    { timeout: 20000, maxBuffer: 1024 * 1024 },
  );
  const p = JSON.parse(stdout);
  const video = p.streams.find((s) => s.codec_type === "video");
  if (
    !video ||
    !["h264", "hevc", "vp8", "vp9", "av1", "mpeg4"].includes(video.codec_name)
  )
    throw new Error("Invalid video file.");
  let duration = Number(p.format.duration);
  if (!Number.isFinite(duration)) {
    const { stdout: packets } = await exec(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "packet=pts_time",
        "-of",
        "csv=p=0",
        path,
      ],
      { timeout: 20000, maxBuffer: 8 * 1024 * 1024 },
    );
    const times = packets
      .trim()
      .split(/\s+/)
      .map(Number)
      .filter(Number.isFinite);
    duration = times.reduce((max, n) => Math.max(max, n), 0) + 0.05;
  }
  if (
    duration < 1 ||
    duration > 180 ||
    video.width > 4096 ||
    video.height > 4096
  )
    throw new Error("Video must be 1–180 seconds and at most 4K.");
  return duration;
}
export async function processVideo(path, id, start, end, thumbAt) {
  const duration = await probe(path);
  const from = Math.max(0, Math.min(duration - 1, start || 0));
  const length = Math.min(duration - from, (end || duration) - from);
  if (length < 1 || length > 180)
    throw new Error("Select at least one second.");
  const out = `${path}.mp4`,
    thumb = `${path}.jpg`;
  try {
    await exec(
      "ffmpeg",
      [
        "-nostdin",
        "-y",
        "-ss",
        String(from),
        "-i",
        path,
        "-t",
        String(length),
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-vf",
        "scale='min(1080,iw)':-2",
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
        "-movflags",
        "+faststart",
        out,
      ],
      { timeout: 180000, maxBuffer: 1024 * 1024 },
    );
    await exec(
      "ffmpeg",
      [
        "-nostdin",
        "-y",
        "-ss",
        String(Math.min(length - 0.1, Math.max(0, thumbAt || 0))),
        "-i",
        out,
        "-frames:v",
        "1",
        "-vf",
        "scale=360:-2",
        thumb,
      ],
      { timeout: 20000, maxBuffer: 1024 * 1024 },
    );
    const video_url = await storeFile(out, `${id}.mp4`, "video/mp4");
    const thumbnail_url = await storeFile(thumb, `${id}.jpg`, "image/jpeg");
    return { video_url, thumbnail_url, duration: length };
  } finally {
    await Promise.all([out, thumb].map((p) => unlink(p).catch(() => {})));
  }
}
