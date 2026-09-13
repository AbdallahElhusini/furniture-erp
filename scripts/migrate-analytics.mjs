import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const databasePath = path.resolve(projectRoot, "dev.db");

if (!fs.existsSync(databasePath) || fs.statSync(databasePath).size === 0) {
  throw new Error(`Analytics database not found at ${databasePath}`);
}

const database = new Database(databasePath);
database.pragma("foreign_keys = ON");

const tableExists = (name) => Boolean(
  database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name),
);

try {
  if (!tableExists("AnalyticsSession")) {
    const backupDirectory = path.resolve(projectRoot, "backups", "migrations");
    fs.mkdirSync(backupDirectory, { recursive: true });
    const timestamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
    fs.copyFileSync(
      databasePath,
      path.join(backupDirectory, `pre-analytics-${timestamp}.db`),
    );
  }

  database.transaction(() => {
    database.exec(`
      CREATE TABLE IF NOT EXISTS "AnalyticsSession" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "landingPath" TEXT NOT NULL,
        "lastPath" TEXT NOT NULL,
        "referrerHost" TEXT,
        "language" TEXT,
        "deviceType" TEXT,
        "campaignSource" TEXT,
        "campaignMedium" TEXT,
        "campaignName" TEXT,
        "eventCount" INTEGER NOT NULL DEFAULT 0,
        "convertedAt" DATETIME
      );

      CREATE INDEX IF NOT EXISTS "AnalyticsSession_startedAt_idx"
        ON "AnalyticsSession"("startedAt");
      CREATE INDEX IF NOT EXISTS "AnalyticsSession_lastSeenAt_idx"
        ON "AnalyticsSession"("lastSeenAt");
      CREATE INDEX IF NOT EXISTS "AnalyticsSession_convertedAt_idx"
        ON "AnalyticsSession"("convertedAt");

      CREATE TABLE IF NOT EXISTS "AnalyticsEvent" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "sessionId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "path" TEXT NOT NULL,
        "section" TEXT,
        "entityType" TEXT,
        "entityId" TEXT,
        "metadata" TEXT NOT NULL DEFAULT '{}',
        "occurredAt" DATETIME NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "AnalyticsEvent_sessionId_fkey"
          FOREIGN KEY ("sessionId") REFERENCES "AnalyticsSession"("id")
          ON DELETE CASCADE ON UPDATE CASCADE
      );

      CREATE INDEX IF NOT EXISTS "AnalyticsEvent_sessionId_occurredAt_idx"
        ON "AnalyticsEvent"("sessionId", "occurredAt");
      CREATE INDEX IF NOT EXISTS "AnalyticsEvent_name_occurredAt_idx"
        ON "AnalyticsEvent"("name", "occurredAt");
      CREATE INDEX IF NOT EXISTS "AnalyticsEvent_path_occurredAt_idx"
        ON "AnalyticsEvent"("path", "occurredAt");
      CREATE INDEX IF NOT EXISTS "AnalyticsEvent_section_occurredAt_idx"
        ON "AnalyticsEvent"("section", "occurredAt");
    `);
  })();

  console.log(JSON.stringify({
    database: databasePath,
    sessions: database.prepare('SELECT COUNT(*) AS count FROM "AnalyticsSession"').get().count,
    events: database.prepare('SELECT COUNT(*) AS count FROM "AnalyticsEvent"').get().count,
  }, null, 2));
} finally {
  database.close();
}
