import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const databasePath = path.resolve(process.argv[2] || path.join(root, "dev.db"));
if (!fs.existsSync(databasePath)) throw new Error(`Database missing: ${databasePath}`);
const db = new Database(databasePath, { fileMustExist: true });
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");
try {
  const columns = new Set(db.prepare('PRAGMA table_info("Client")').all().map((column) => column.name));
  if (!columns.has("id")) throw new Error("Client table missing");
  const additions = { stage: "TEXT NOT NULL DEFAULT 'LEAD'", brief: "TEXT", source: "TEXT", nextFollowUpAt: "DATETIME" };
  const missing = Object.keys(additions).filter((field) => !columns.has(field));
  let backup = null;
  if (missing.length) {
    const folder = path.join(path.dirname(databasePath), "backups", "migrations");
    fs.mkdirSync(folder, { recursive: true });
    backup = path.join(folder, `pre-client-crm-${Date.now()}.db`);
    await db.backup(backup);
  }
  db.transaction(() => {
    for (const field of missing) db.exec(`ALTER TABLE "Client" ADD COLUMN "${field}" ${additions[field]}`);
    if (missing.includes("stage") && db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='Project'").get()) {
      db.exec(`UPDATE "Client" SET "stage" = 'CUSTOMER' WHERE trim("phone") <> '' AND EXISTS (
        SELECT 1 FROM "Project" WHERE "Project"."clientId" = "Client"."id"
        AND "Project"."status" IN ('APPROVED', 'IN_PRODUCTION', 'READY', 'INSTALLING', 'COMPLETED'))`);
    }
    db.exec('CREATE INDEX IF NOT EXISTS "Client_stage_idx" ON "Client"("stage")');
    db.exec('CREATE INDEX IF NOT EXISTS "Client_nextFollowUpAt_idx" ON "Client"("nextFollowUpAt")');
  })();
  console.log(JSON.stringify({ database: databasePath, added: missing, backup, integrity: db.pragma("integrity_check", { simple: true }) }));
} finally { db.close(); }
