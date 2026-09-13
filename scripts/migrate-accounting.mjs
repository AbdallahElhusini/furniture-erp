import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { loadProjectDatabaseUrl, resolveDatabasePath, PROJECT_ROOT } from "./migrate-ai-operations.mjs";

export function migrateAccounting(database) {
  for (const table of ["Project", "SupplierOrder"]) {
    if (!database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)) throw new Error(`Missing ${table} table`);
  }
  const exists = database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='FinanceEntry'").get();
  if (exists) {
    const columns = new Set(database.prepare("PRAGMA table_info('FinanceEntry')").all().map((row) => row.name));
    for (const column of ["id", "externalKey", "kind", "amount", "method", "date", "description", "category", "notes", "projectId", "supplierOrderId", "status", "voidReason", "revision", "createdAt", "updatedAt"]) {
      if (!columns.has(column)) throw new Error(`Existing FinanceEntry schema missing ${column}; manual migration required`);
    }
  }
  database.pragma("foreign_keys = ON");
  database.transaction(() => {
    database.exec(`
      CREATE TABLE IF NOT EXISTS "FinanceEntry" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "externalKey" TEXT,
        "kind" TEXT NOT NULL CHECK ("kind" IN ('SUPPLIER_PAYMENT','EXPENSE','OTHER_INCOME')),
        "amount" REAL NOT NULL CHECK ("amount" > 0 AND "amount" <= 1000000000),
        "method" TEXT NOT NULL DEFAULT 'CASH' CHECK ("method" IN ('CASH','BANK_TRANSFER','CHECK')),
        "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "description" TEXT NOT NULL,
        "category" TEXT,
        "notes" TEXT,
        "projectId" INTEGER,
        "supplierOrderId" INTEGER,
        "status" TEXT NOT NULL DEFAULT 'POSTED' CHECK ("status" IN ('POSTED','VOID')),
        "voidReason" TEXT,
        "revision" INTEGER NOT NULL DEFAULT 1,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        FOREIGN KEY ("supplierOrderId") REFERENCES "SupplierOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CHECK (("kind" = 'SUPPLIER_PAYMENT' AND "supplierOrderId" IS NOT NULL) OR ("kind" != 'SUPPLIER_PAYMENT' AND "supplierOrderId" IS NULL))
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "FinanceEntry_externalKey_key" ON "FinanceEntry"("externalKey");
      CREATE INDEX IF NOT EXISTS "FinanceEntry_date_idx" ON "FinanceEntry"("date");
      CREATE INDEX IF NOT EXISTS "FinanceEntry_kind_status_idx" ON "FinanceEntry"("kind","status");
      CREATE INDEX IF NOT EXISTS "FinanceEntry_projectId_idx" ON "FinanceEntry"("projectId");
      CREATE INDEX IF NOT EXISTS "FinanceEntry_supplierOrderId_idx" ON "FinanceEntry"("supplierOrderId");
    `);
    if (database.pragma("integrity_check", { simple: true }) !== "ok") throw new Error("Accounting migration integrity check failed");
    if (database.prepare("PRAGMA foreign_key_check").all().length) throw new Error("Accounting migration foreign-key check failed");
  })();
  return { changed: !exists };
}

export async function migrateAccountingFile(databasePath) {
  const canonical = fs.realpathSync.native(path.resolve(databasePath));
  const db = new Database(canonical, { fileMustExist: true });
  try {
    db.pragma("busy_timeout = 5000");
    let backupPath = null;
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='FinanceEntry'").get()) {
      const directory = path.join(PROJECT_ROOT, "backups", "migrations");
      fs.mkdirSync(directory, { recursive: true });
      backupPath = path.join(directory, `pre-accounting-${new Date().toISOString().replace(/[:.]/g, "-")}.db`);
      await db.backup(backupPath);
      const backup = new Database(backupPath, { readonly: true, fileMustExist: true });
      try { if (backup.pragma("integrity_check", { simple: true }) !== "ok") throw new Error("Accounting backup is not valid"); }
      finally { backup.close(); }
    }
    return { databasePath: canonical, backupPath, ...migrateAccounting(db) };
  } finally { db.close(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await migrateAccountingFile(resolveDatabasePath(loadProjectDatabaseUrl())), null, 2));
}
