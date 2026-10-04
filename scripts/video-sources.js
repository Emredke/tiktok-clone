import { createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

export function validateSource(source) {
  const url = new URL(source.url);
  const page = new URL(source.page);
  const license = new URL(source.license_url);
  const version = source.license.match(
    /^CC BY (4\.0|3\.0|2\.5|2\.0|1\.0)$/,
  )?.[1];
  const licensed =
    license.hostname === "creativecommons.org" &&
    ["http:", "https:"].includes(license.protocol) &&
    (source.license === "CC0"
      ? /^\/publicdomain\/zero\/1\.0(?:\/|$)/.test(license.pathname)
      : (version && license.pathname.startsWith(`/licenses/by/${version}/`)) ||
        (version && license.pathname === `/licenses/by/${version}`));
  if (
    !/^open-[a-f0-9]{12}$/.test(source.id) ||
    url.protocol !== "https:" ||
    url.hostname !== "upload.wikimedia.org" ||
    url.username ||
    url.password ||
    url.port ||
    page.protocol !== "https:" ||
    page.hostname !== "commons.wikimedia.org" ||
    !licensed ||
    !source.author?.trim() ||
    !source.caption?.trim() ||
    !source.category?.trim() ||
    (source.thumbnail_at !== undefined &&
      (!Number.isFinite(source.thumbnail_at) ||
        source.thumbnail_at < 0 ||
        source.thumbnail_at > 12)) ||
    !source.changes?.trim()
  )
    throw new Error("Unsupported source, attribution, or license.");
  return source;
}

// Stream to disk with a hard byte cap; bounded retries accommodate temporary host failures.
export async function downloadSource(
  url,
  path,
  {
    fetchImpl = fetch,
    maxBytes = 100 * 1024 * 1024,
    attempts = 4,
    pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = {},
) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    let retry = true;
    try {
      const response = await fetchImpl(url, {
        redirect: "error",
        signal: AbortSignal.timeout(180000),
        headers: {
          "User-Agent": "Velo/1.2 (https://github.com/Emredke/tiktok-clone)",
        },
      });
      if (!response.ok) {
        retry = response.status === 429 || response.status >= 500;
        await response.body?.cancel();
        throw new Error(`Source returned ${response.status}`);
      }
      if (
        !response.body ||
        Number(response.headers.get("content-length")) > maxBytes
      ) {
        retry = false;
        await response.body?.cancel();
        throw new Error("Source is empty or exceeds the download limit.");
      }
      let bytes = 0;
      await pipeline(
        Readable.fromWeb(response.body),
        new Transform({
          transform(chunk, _, callback) {
            bytes += chunk.length;
            if (bytes > maxBytes) {
              retry = false;
              callback(new Error("Source exceeds the download limit."));
            } else callback(null, chunk);
          },
        }),
        createWriteStream(path),
      );
      return bytes;
    } catch (error) {
      await unlink(path).catch(() => {});
      if (!retry || attempt === attempts - 1) throw error;
      await pause(Math.min(10000, 1000 * 2 ** attempt));
    }
  }
}
