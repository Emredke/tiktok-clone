import { seed } from "./seed.js";
await seed();
import { spawn } from "node:child_process";
const commands = [
  ["node", ["--env-file-if-exists=.env", "--watch", "server/index.js"]],
  ["npx", ["vite"]],
];
const children = commands.map(([cmd, args]) =>
  spawn(cmd, args, { stdio: "inherit", env: process.env }),
);
for (const c of children)
  c.on("exit", () => {
    for (const other of children) other.kill();
  });
for (const s of ["SIGINT", "SIGTERM"])
  process.on(s, () => {
    for (const c of children) c.kill(s);
  });
