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
const server = app.listen(Number(process.env.PORT || 3001), "0.0.0.0", () =>
  console.log(`Velo API listening on ${process.env.PORT || 3001}`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close(() => process.exit(0)));
