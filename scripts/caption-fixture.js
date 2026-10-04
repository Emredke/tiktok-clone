// JFK's public inaugural speech, distributed as the Whisper repository test fixture.
import { mkdir, writeFile } from "node:fs/promises";
import { exec } from "../server/storage.js";
await mkdir("./data/fixtures", { recursive: true });
const response = await fetch(
  "https://raw.githubusercontent.com/openai/whisper/main/tests/jfk.flac",
);
if (!response.ok)
  throw new Error("Could not download the public speech test fixture.");
await writeFile(
  "./data/fixtures/jfk.flac",
  Buffer.from(await response.arrayBuffer()),
);
await exec("ffmpeg", [
  "-nostdin",
  "-y",
  "-stream_loop",
  "-1",
  "-i",
  "data/media/seed-01.mp4",
  "-i",
  "data/fixtures/jfk.flac",
  "-map",
  "0:v:0",
  "-map",
  "1:a:0",
  "-t",
  "11",
  "-c:v",
  "libx264",
  "-preset",
  "ultrafast",
  "-c:a",
  "aac",
  "data/fixtures/speech.mp4",
]);
