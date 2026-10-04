import {
  randomBytes,
  scrypt,
  timingSafeEqual,
  createHash,
  randomUUID,
} from "node:crypto";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import nodemailer from "nodemailer";
import { one, run } from "./db.js";
const derive = promisify(scrypt);
export const hashToken = (t) => createHash("sha256").update(t).digest("hex");
export async function passwordHash(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = await derive(password, salt, 64);
  return `${salt}:${hash.toString("hex")}`;
}
export async function passwordMatch(password, stored) {
  const [salt, hex] = stored.split(":");
  const value = await derive(password, salt, 64);
  return timingSafeEqual(value, Buffer.from(hex, "hex"));
}
export const profile = (id) =>
  one(
    "SELECT p.*,u.verified,u.demo,u.role,u.onboarded,u.suspended_until FROM profiles p JOIN users u ON u.id=p.user_id WHERE p.user_id=?",
    id,
  );
export function session(req, res, id) {
  const token = randomBytes(32).toString("hex");
  run(
    "INSERT INTO sessions VALUES (?,?,?)",
    hashToken(token),
    id,
    Date.now() + 30 * 86400000,
  );
  res.cookie("velo_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 30 * 86400000,
    path: "/",
  });
}
export function authMiddleware(req, res, next) {
  const token = req.cookies?.velo_session;
  req.user = token
    ? one(
        "SELECT u.id,u.verified,u.demo,u.role,u.onboarded,u.suspended_until FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?",
        hashToken(token),
        Date.now(),
      )
    : null;
  next();
}
export function requireAuth(req, res, next) {
  if (!req.user)
    return res.status(401).json({ error: "Please sign in to continue." });
  if (req.user.suspended_until > Date.now())
    return res
      .status(403)
      .json({ error: "Your account is temporarily suspended." });
  next();
}
export function requireVerified(req, res, next) {
  if (!req.user?.verified)
    return res
      .status(403)
      .json({ error: "Verify your email before posting or sending messages." });
  next();
}
export async function sendToken(id, email, purpose) {
  const token = randomBytes(32).toString("hex");
  const url = `${process.env.APP_ORIGIN || "http://localhost:5173"}/?${purpose}=${token}`;
  const mode = process.env.MAIL_MODE || "development";
  const subject =
    purpose === "verify"
      ? "Verify your Velo account"
      : "Reset your Velo password";
  if (mode === "smtp") {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      requireTLS: Number(process.env.SMTP_PORT) !== 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    });
    await transport.sendMail({
      from: process.env.MAIL_FROM,
      to: email,
      subject,
      text: `${subject}: ${url}\nThis link expires in one hour.`,
    });
  } else {
    if (process.env.NODE_ENV === "production")
      throw new Error("Production requires SMTP.");
    await mkdir("./data/mail", { recursive: true });
    await writeFile(
      `./data/mail/${randomUUID()}.json`,
      JSON.stringify({ to: email, subject, url }, null, 2),
    );
  }
  run("DELETE FROM auth_tokens WHERE user_id=? AND purpose=?", id, purpose);
  run(
    "INSERT INTO auth_tokens VALUES (?,?,?,?)",
    hashToken(token),
    id,
    purpose,
    Date.now() + 3600000,
  );
}
