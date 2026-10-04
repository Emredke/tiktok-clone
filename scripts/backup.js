import { createBackup } from "../server/backups.js";
const result = await createBackup();
console.log(`Verified backup saved: ${result.path}`);
