import { one, run } from "../server/db.js";
const email = process.argv[2],
  revoke = process.argv.includes("--revoke");
const user = one("SELECT id,verified FROM users WHERE email=?", email || "");
if (!user?.verified)
  throw new Error(
    "Choose an existing, verified account: npm run admin -- email@example.com [--revoke]",
  );
run("UPDATE users SET role=? WHERE id=?", revoke ? "member" : "admin", user.id);
console.log(revoke ? "Staff access revoked." : "Staff access granted.");
