import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const databasePath = path.resolve(projectRoot, "dev.db");

if (!fs.existsSync(databasePath) || fs.statSync(databasePath).size === 0) {
  throw new Error(`Catalog database not found at ${databasePath}`);
}

const database = new Database(databasePath);
try {
  const columns = database.prepare('PRAGMA table_info("CatalogItem")').all();
  const hasDisplayOrder = columns.some((column) => column.name === "displayOrder");
  database.transaction(() => {
    if (!hasDisplayOrder) {
      database.exec('ALTER TABLE "CatalogItem" ADD COLUMN "displayOrder" INTEGER NOT NULL DEFAULT 0');
      database.exec('UPDATE "CatalogItem" SET "displayOrder" = "id"');
    }
    database.exec('CREATE INDEX IF NOT EXISTS "CatalogItem_displayOrder_idx" ON "CatalogItem"("displayOrder")');
  })();
  const count = database.prepare('SELECT COUNT(*) AS count FROM "CatalogItem"').get().count;
  console.log(`Catalog display order is ready for ${count} products.`);
} finally {
  database.close();
}
