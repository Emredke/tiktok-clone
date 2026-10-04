import { app } from "./app.js";
if (process.env.NODE_ENV === "production") {
  if (!process.env.APP_ORIGIN?.startsWith("https://"))
    throw new Error("Production requires an HTTPS APP_ORIGIN.");
  if (
    process.env.MAIL_MODE !== "smtp" ||
    !process.env.SMTP_HOST ||
    !process.env.MAIL_FROM
  )
    throw new Error("Configure production SMTP delivery.");
  if (process.env.STORAGE_DRIVER !== "s3" || !process.env.S3_BUCKET)
    throw new Error("Configure production S3 object storage.");
}
const { seed } = await import("../scripts/seed.js");
await seed();
const { startWorker, stopWorker } = await import("./jobs.js");
startWorker();
if (process.env.NODE_ENV !== "test" && process.env.IMPORT_REAL_VIDEOS !== "0") {
  import("../scripts/import-videos.js")
    .then((m) => m.importVideos())
    .catch((e) => console.error("Open collection:", e.message));
}
const server = app.listen(Number(process.env.PORT || 3001), "0.0.0.0", () =>
  console.log(`Velo API listening on ${process.env.PORT || 3001}`),
);
let closing = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    if (closing) return;
    closing = true;
    server.close();
    await stopWorker();
    process.exit(0);
  });
