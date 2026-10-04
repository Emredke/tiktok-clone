import { S3Client, HeadBucketCommand } from "@aws-sdk/client-s3";
import nodemailer from "nodemailer";
import { exec } from "../server/storage.js";
const failures = [];
if (!/^https:\/\//.test(process.env.APP_ORIGIN || ""))
  failures.push("Set HTTPS APP_ORIGIN to your public address.");
if (process.env.STORAGE_DRIVER !== "s3" || !process.env.S3_BUCKET)
  failures.push("Configure a private S3-compatible media bucket.");
else
  try {
    await new S3Client({
      region: process.env.S3_REGION || "us-east-1",
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: !!process.env.S3_ENDPOINT,
    }).send(new HeadBucketCommand({ Bucket: process.env.S3_BUCKET }));
  } catch {
    failures.push("Media bucket connection could not be verified.");
  }
if (
  process.env.MAIL_MODE !== "smtp" ||
  !process.env.SMTP_HOST ||
  !process.env.MAIL_FROM
)
  failures.push("Configure SMTP delivery and a verified sender domain.");
else
  try {
    await nodemailer
      .createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: Number(process.env.SMTP_PORT) === 465,
        requireTLS: Number(process.env.SMTP_PORT) !== 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
      })
      .verify();
  } catch {
    failures.push("SMTP connection could not be verified.");
  }
for (const command of ["ffmpeg", "ffprobe"])
  try {
    await exec(command, ["-version"]);
  } catch {
    failures.push(`${command} is unavailable.`);
  }
if (process.env.BACKUPS_ENABLED === "0")
  failures.push("Enable daily backups before launch.");
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    "Launch connections verified. Check your public HTTPS address, email verification, media playback, push opt-in, and restore before announcing launch.",
  );
