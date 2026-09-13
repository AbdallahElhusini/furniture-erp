import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Database from "better-sqlite3";

export const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

export const EXTERNAL_KEY_TABLES = Object.freeze([
  "Client",
  "Project",
  "ProjectItem",
  "Supplier",
  "SupplierOrder",
  "OrderItem",
  "ProductAsset",
  "Technician",
  "Task",
  "QuoteRequest",
  "QuoteItem",
  "PortfolioProject",
  "Payment",
]);

const REQUIRED_LEGACY_TABLES = Object.freeze([
  ...EXTERNAL_KEY_TABLES,
  "User",
]);

const NEW_TABLE_NAMES = Object.freeze([
  "DataTransferJob",
  "DataTransferIssue",
  "DataChangeAudit",
  "SiteContent",
]);

function expectedColumn(
  name,
  type,
  { notNull = false, defaultValue = null, primaryKey = false } = {},
) {
  return Object.freeze({ name, type, notNull, defaultValue, primaryKey });
}

const NEW_TABLE_MANIFEST = Object.freeze({
  DataTransferJob: Object.freeze({
    autoincrement: true,
    columns: Object.freeze([
      expectedColumn("id", "INTEGER", { notNull: true, primaryKey: true }),
      expectedColumn("schemaVersion", "INTEGER", { notNull: true, defaultValue: "1" }),
      expectedColumn("kind", "TEXT", { notNull: true }),
      expectedColumn("scope", "TEXT", { notNull: true }),
      expectedColumn("module", "TEXT"),
      expectedColumn("fileName", "TEXT"),
      expectedColumn("sourceHash", "TEXT"),
      expectedColumn("idempotencyKey", "TEXT"),
      expectedColumn("status", "TEXT", { notNull: true, defaultValue: "'PENDING'" }),
      expectedColumn("dryRun", "BOOLEAN", { notNull: true, defaultValue: "0" }),
      expectedColumn("rowCount", "INTEGER", { notNull: true, defaultValue: "0" }),
      expectedColumn("insertedCount", "INTEGER", { notNull: true, defaultValue: "0" }),
      expectedColumn("updatedCount", "INTEGER", { notNull: true, defaultValue: "0" }),
      expectedColumn("skippedCount", "INTEGER", { notNull: true, defaultValue: "0" }),
      expectedColumn("errorCount", "INTEGER", { notNull: true, defaultValue: "0" }),
      expectedColumn("errors", "TEXT", { notNull: true, defaultValue: "'[]'" }),
      expectedColumn("summary", "TEXT", { notNull: true, defaultValue: "'{}'" }),
      expectedColumn("actorId", "INTEGER"),
      expectedColumn("actorEmail", "TEXT"),
      expectedColumn("resultName", "TEXT"),
      expectedColumn("startedAt", "DATETIME", { notNull: true, defaultValue: "CURRENT_TIMESTAMP" }),
      expectedColumn("createdAt", "DATETIME", { notNull: true, defaultValue: "CURRENT_TIMESTAMP" }),
      expectedColumn("completedAt", "DATETIME"),
    ]),
    foreignKeys: Object.freeze([]),
  }),
  DataTransferIssue: Object.freeze({
    autoincrement: true,
    columns: Object.freeze([
      expectedColumn("id", "INTEGER", { notNull: true, primaryKey: true }),
      expectedColumn("jobId", "INTEGER", { notNull: true }),
      expectedColumn("module", "TEXT", { notNull: true }),
      expectedColumn("sheet", "TEXT"),
      expectedColumn("rowNumber", "INTEGER"),
      expectedColumn("field", "TEXT"),
      expectedColumn("severity", "TEXT", { notNull: true, defaultValue: "'ERROR'" }),
      expectedColumn("code", "TEXT", { notNull: true }),
      expectedColumn("message", "TEXT", { notNull: true }),
      expectedColumn("rawData", "TEXT"),
      expectedColumn("createdAt", "DATETIME", { notNull: true, defaultValue: "CURRENT_TIMESTAMP" }),
    ]),
    foreignKeys: Object.freeze([
      Object.freeze({
        from: "jobId",
        table: "DataTransferJob",
        to: "id",
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
        match: "NONE",
      }),
    ]),
  }),
  DataChangeAudit: Object.freeze({
    autoincrement: true,
    columns: Object.freeze([
      expectedColumn("id", "INTEGER", { notNull: true, primaryKey: true }),
      expectedColumn("jobId", "INTEGER", { notNull: true }),
      expectedColumn("module", "TEXT", { notNull: true }),
      expectedColumn("recordKey", "TEXT", { notNull: true }),
      expectedColumn("action", "TEXT", { notNull: true }),
      expectedColumn("beforeData", "TEXT"),
      expectedColumn("afterData", "TEXT"),
      expectedColumn("actorId", "INTEGER"),
      expectedColumn("actorEmail", "TEXT"),
      expectedColumn("createdAt", "DATETIME", { notNull: true, defaultValue: "CURRENT_TIMESTAMP" }),
    ]),
    foreignKeys: Object.freeze([
      Object.freeze({
        from: "jobId",
        table: "DataTransferJob",
        to: "id",
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
        match: "NONE",
      }),
    ]),
  }),
  SiteContent: Object.freeze({
    autoincrement: true,
    columns: Object.freeze([
      expectedColumn("id", "INTEGER", { notNull: true, primaryKey: true }),
      expectedColumn("key", "TEXT", { notNull: true }),
      expectedColumn("group", "TEXT", { notNull: true }),
      expectedColumn("type", "TEXT", { notNull: true, defaultValue: "'TEXT'" }),
      expectedColumn("label", "TEXT", { notNull: true }),
      expectedColumn("valueAr", "TEXT"),
      expectedColumn("valueEn", "TEXT"),
      expectedColumn("mediaUrl", "TEXT"),
      expectedColumn("altAr", "TEXT"),
      expectedColumn("altEn", "TEXT"),
      expectedColumn("linkUrl", "TEXT"),
      expectedColumn("metadata", "TEXT"),
      expectedColumn("isActive", "BOOLEAN", { notNull: true, defaultValue: "1" }),
      expectedColumn("sortOrder", "INTEGER", { notNull: true, defaultValue: "0" }),
      expectedColumn("createdAt", "DATETIME", { notNull: true, defaultValue: "CURRENT_TIMESTAMP" }),
      expectedColumn("updatedAt", "DATETIME", { notNull: true, defaultValue: "CURRENT_TIMESTAMP" }),
    ]),
    foreignKeys: Object.freeze([]),
  }),
});

const EXPECTED_INDEXES = Object.freeze([
  ...EXTERNAL_KEY_TABLES.map((tableName) =>
    Object.freeze({
      name: `${tableName}_externalKey_key`,
      table: tableName,
      unique: true,
      columns: Object.freeze(["externalKey"]),
    }),
  ),
  Object.freeze({
    name: "OrderItem_supplierOrderId_projectItemId_key",
    table: "OrderItem",
    unique: true,
    columns: Object.freeze(["supplierOrderId", "projectItemId"]),
  }),
  Object.freeze({ name: "DataTransferJob_idempotencyKey_key", table: "DataTransferJob", unique: true, columns: Object.freeze(["idempotencyKey"]) }),
  Object.freeze({ name: "DataTransferJob_kind_status_idx", table: "DataTransferJob", unique: false, columns: Object.freeze(["kind", "status"]) }),
  Object.freeze({ name: "DataTransferJob_sourceHash_idx", table: "DataTransferJob", unique: false, columns: Object.freeze(["sourceHash"]) }),
  Object.freeze({ name: "DataTransferJob_createdAt_idx", table: "DataTransferJob", unique: false, columns: Object.freeze(["createdAt"]) }),
  Object.freeze({ name: "DataTransferIssue_jobId_severity_idx", table: "DataTransferIssue", unique: false, columns: Object.freeze(["jobId", "severity"]) }),
  Object.freeze({ name: "DataTransferIssue_module_code_idx", table: "DataTransferIssue", unique: false, columns: Object.freeze(["module", "code"]) }),
  Object.freeze({ name: "DataChangeAudit_jobId_module_idx", table: "DataChangeAudit", unique: false, columns: Object.freeze(["jobId", "module"]) }),
  Object.freeze({ name: "DataChangeAudit_module_recordKey_idx", table: "DataChangeAudit", unique: false, columns: Object.freeze(["module", "recordKey"]) }),
  Object.freeze({ name: "SiteContent_key_key", table: "SiteContent", unique: true, columns: Object.freeze(["key"]) }),
  Object.freeze({ name: "SiteContent_group_sortOrder_idx", table: "SiteContent", unique: false, columns: Object.freeze(["group", "sortOrder"]) }),
  Object.freeze({ name: "SiteContent_type_idx", table: "SiteContent", unique: false, columns: Object.freeze(["type"]) }),
  Object.freeze({ name: "SiteContent_isActive_idx", table: "SiteContent", unique: false, columns: Object.freeze(["isActive"]) }),
]);

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

export function resolveDatabasePath(
  configuredUrl,
  projectRoot = PROJECT_ROOT,
) {
  const databaseUrl = configuredUrl?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for data:migrate");
  }
  if (!databaseUrl.startsWith("file:")) {
    throw new Error("data:migrate supports local file: SQLite databases only");
  }

  const rawPath = databaseUrl.slice("file:".length);
  if (!rawPath || rawPath === ":memory:") {
    throw new Error("DATABASE_URL must point directly to a persistent SQLite file");
  }
  const projectRootUrl = pathToFileURL(`${path.resolve(projectRoot)}${path.sep}`);
  let databaseFileUrl;
  try {
    databaseFileUrl = new URL(databaseUrl, projectRootUrl);
  } catch {
    throw new Error("DATABASE_URL contains an invalid SQLite file URL");
  }
  if (
    databaseFileUrl.protocol !== "file:" ||
    databaseFileUrl.search ||
    databaseFileUrl.hash
  ) {
    throw new Error("DATABASE_URL must point directly to a persistent SQLite file");
  }
  try {
    return path.resolve(fileURLToPath(databaseFileUrl));
  } catch {
    throw new Error("DATABASE_URL contains an invalid or unsupported SQLite file path");
  }
}

export function loadProjectDatabaseUrl(projectRoot = PROJECT_ROOT) {
  if (!process.env.DATABASE_URL?.trim()) {
    // Node's env loader does not replace an existing empty value.
    delete process.env.DATABASE_URL;
    const envPath = path.join(projectRoot, ".env");
    if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
  }
  const configuredUrl = process.env.DATABASE_URL?.trim();
  if (!configuredUrl) {
    throw new Error(
      "DATABASE_URL is required; set it in the process environment or the project-root .env file",
    );
  }
  return configuredUrl;
}

function tableExists(database, tableName) {
  return Boolean(
    database
      .prepare(
        "select 1 from sqlite_master where type = 'table' and name = ? limit 1",
      )
      .get(tableName),
  );
}

function tableColumns(database, tableName) {
  return new Set(
    database
      .prepare(`pragma table_info(${quoteIdentifier(tableName)})`)
      .all()
      .map((column) => column.name),
  );
}

function tableColumnRows(database, tableName) {
  return database
    .prepare(`pragma table_info(${quoteIdentifier(tableName)})`)
    .all();
}

function normalizeDefault(value) {
  if (value === null || value === undefined) return null;
  let normalized = String(value).trim();
  while (normalized.startsWith("(") && normalized.endsWith(")")) {
    normalized = normalized.slice(1, -1).trim();
  }
  if (/^true$/i.test(normalized)) return "1";
  if (/^false$/i.test(normalized)) return "0";
  if (/^current_timestamp$/i.test(normalized)) return "CURRENT_TIMESTAMP";
  return normalized;
}

function describeColumn(column) {
  return `${column.name} ${String(column.type).toUpperCase()} ${column.notnull ? "NOT NULL" : "NULL"} default=${normalizeDefault(column.dflt_value) ?? "NULL"} pk=${column.pk ? "yes" : "no"}`;
}

function assertColumnMatches(tableName, actual, expected) {
  const matches =
    actual &&
    String(actual.type).trim().toUpperCase() === expected.type &&
    Boolean(actual.notnull) === expected.notNull &&
    normalizeDefault(actual.dflt_value) === expected.defaultValue &&
    Boolean(actual.pk) === expected.primaryKey;
  if (!matches) {
    const actualDescription = actual ? describeColumn(actual) : "missing";
    throw new Error(
      `Incompatible schema for ${tableName}.${expected.name}: expected ${expected.type} ${expected.notNull ? "NOT NULL" : "NULL"} default=${expected.defaultValue ?? "NULL"} pk=${expected.primaryKey ? "yes" : "no"}; received ${actualDescription}`,
    );
  }
}

function assertExactTableManifest(database, tableName) {
  const manifest = NEW_TABLE_MANIFEST[tableName];
  const actualColumns = tableColumnRows(database, tableName);
  if (actualColumns.length !== manifest.columns.length) {
    throw new Error(
      `Incompatible partial ${tableName} table: expected ${manifest.columns.length} columns, received ${actualColumns.length}`,
    );
  }
  for (let index = 0; index < manifest.columns.length; index += 1) {
    const expected = manifest.columns[index];
    const actual = actualColumns[index];
    if (!actual || actual.name !== expected.name) {
      throw new Error(
        `Incompatible partial ${tableName} table: expected column ${expected.name} at position ${index + 1}`,
      );
    }
    assertColumnMatches(tableName, actual, expected);
  }

  const tableSql = database
    .prepare("select sql from sqlite_master where type = 'table' and name = ?")
    .get(tableName)?.sql;
  if (manifest.autoincrement && !/\bautoincrement\b/i.test(tableSql || "")) {
    throw new Error(`Incompatible partial ${tableName} table: id must use AUTOINCREMENT`);
  }

  const actualForeignKeys = database
    .prepare(`pragma foreign_key_list(${quoteIdentifier(tableName)})`)
    .all()
    .map((foreignKey) => ({
      from: foreignKey.from,
      table: foreignKey.table,
      to: foreignKey.to,
      onUpdate: String(foreignKey.on_update).toUpperCase(),
      onDelete: String(foreignKey.on_delete).toUpperCase(),
      match: String(foreignKey.match).toUpperCase(),
    }))
    .sort((left, right) => left.from.localeCompare(right.from));
  const expectedForeignKeys = [...manifest.foreignKeys].sort((left, right) =>
    left.from.localeCompare(right.from),
  );
  if (JSON.stringify(actualForeignKeys) !== JSON.stringify(expectedForeignKeys)) {
    throw new Error(`Incompatible foreign keys for ${tableName}`);
  }
}

function readIndexDefinition(database, indexName) {
  const indexRow = database
    .prepare("select name, tbl_name as tableName from sqlite_master where type = 'index' and name = ?")
    .get(indexName);
  if (!indexRow) return null;
  const listRow = database
    .prepare(`pragma index_list(${quoteIdentifier(indexRow.tableName)})`)
    .all()
    .find((index) => index.name === indexName);
  if (!listRow) {
    throw new Error(`Unable to inspect existing index ${indexName}`);
  }
  const columns = database
    .prepare(`pragma index_xinfo(${quoteIdentifier(indexName)})`)
    .all()
    .filter((column) => column.key === 1)
    .sort((left, right) => left.seqno - right.seqno)
    .map((column) => ({
      name: column.name,
      descending: Boolean(column.desc),
      collation: String(column.coll).toUpperCase(),
    }));
  return {
    table: indexRow.tableName,
    unique: Boolean(listRow.unique),
    partial: Boolean(listRow.partial),
    origin: listRow.origin,
    columns,
  };
}

function assertIndexMatches(database, expected, required) {
  const actual = readIndexDefinition(database, expected.name);
  if (!actual) {
    if (required) throw new Error(`Missing required index ${expected.name}`);
    return false;
  }
  if (
    actual.table !== expected.table ||
    actual.unique !== expected.unique ||
    actual.partial ||
    actual.origin !== "c" ||
    JSON.stringify(actual.columns) !==
      JSON.stringify(
        expected.columns.map((name) => ({
          name,
          descending: false,
          collation: "BINARY",
        })),
      )
  ) {
    throw new Error(`Incompatible existing index ${expected.name}`);
  }
  return true;
}

function assertAddedLegacyColumns(database, required) {
  for (const tableName of EXTERNAL_KEY_TABLES) {
    const actual = tableColumnRows(database, tableName).find(
      (column) => column.name === "externalKey",
    );
    if (!actual && !required) continue;
    assertColumnMatches(
      tableName,
      actual,
      expectedColumn("externalKey", "TEXT"),
    );
  }
  for (const expected of [
    expectedColumn("sessionVersion", "INTEGER", { notNull: true, defaultValue: "1" }),
    expectedColumn("passwordChangedAt", "DATETIME"),
  ]) {
    const actual = tableColumnRows(database, "User").find(
      (column) => column.name === expected.name,
    );
    if (!actual && !required) continue;
    assertColumnMatches("User", actual, expected);
  }
}

function assertLegacySchema(database) {
  const missing = REQUIRED_LEGACY_TABLES.filter(
    (tableName) => !tableExists(database, tableName),
  );
  if (missing.length > 0) {
    throw new Error(
      `The active database is missing required legacy tables: ${missing.join(", ")}`,
    );
  }
}

function assertNoDuplicateExternalKeys(database) {
  for (const tableName of EXTERNAL_KEY_TABLES) {
    if (!tableColumns(database, tableName).has("externalKey")) continue;
    const duplicate = database
      .prepare(
         `select "externalKey", count(*) as count
         from ${quoteIdentifier(tableName)}
         where "externalKey" is not null
         group by "externalKey"
         having count(*) > 1
         limit 1`,
      )
      .get();
    if (duplicate) {
      throw new Error(
        `${tableName}.externalKey contains a duplicate value; migration was not started`,
      );
    }
  }
}

export function preflightDataManagementMigration(database) {
  assertLegacySchema(database);
  assertAddedLegacyColumns(database, false);
  for (const expected of EXPECTED_INDEXES) {
    assertIndexMatches(database, expected, false);
  }

  const existingNewTables = NEW_TABLE_NAMES.filter((tableName) =>
    tableExists(database, tableName),
  );
  if (
    existingNewTables.length > 0 &&
    existingNewTables.length !== NEW_TABLE_NAMES.length
  ) {
    throw new Error(
      `Incompatible partial data-management schema: found ${existingNewTables.join(", ")}; expected all or none of ${NEW_TABLE_NAMES.join(", ")}`,
    );
  }
  if (existingNewTables.length === NEW_TABLE_NAMES.length) {
    for (const tableName of NEW_TABLE_NAMES) {
      assertExactTableManifest(database, tableName);
    }
    // New tables are created in the same transaction as the legacy additions.
    // Their presence therefore requires the whole migration to be complete.
    assertAddedLegacyColumns(database, true);
    for (const expected of EXPECTED_INDEXES) {
      assertIndexMatches(database, expected, true);
    }
  }

  assertNoDuplicateExternalKeys(database);
  assertNoDuplicateOrderItemLinks(database);
}

function assertNoDuplicateOrderItemLinks(database) {
  const duplicate = database
    .prepare(
      `select "supplierOrderId", "projectItemId", count(*) as count
       from "OrderItem"
       group by "supplierOrderId", "projectItemId"
       having count(*) > 1
       limit 1`,
    )
    .get();
  if (duplicate) {
    throw new Error(
      "OrderItem contains duplicate supplierOrderId/projectItemId links; migration was not started",
    );
  }
}

function addColumnIfMissing(database, tableName, columnName, declaration) {
  if (tableColumns(database, tableName).has(columnName)) return false;
  database.exec(
    `alter table ${quoteIdentifier(tableName)} add column ${quoteIdentifier(columnName)} ${declaration}`,
  );
  return true;
}

function createDataManagementTables(database) {
  database.exec(`
    create table if not exists "DataTransferJob" (
      "id" integer not null primary key autoincrement,
      "schemaVersion" integer not null default 1,
      "kind" text not null,
      "scope" text not null,
      "module" text,
      "fileName" text,
      "sourceHash" text,
      "idempotencyKey" text,
      "status" text not null default 'PENDING',
      "dryRun" boolean not null default 0,
      "rowCount" integer not null default 0,
      "insertedCount" integer not null default 0,
      "updatedCount" integer not null default 0,
      "skippedCount" integer not null default 0,
      "errorCount" integer not null default 0,
      "errors" text not null default '[]',
      "summary" text not null default '{}',
      "actorId" integer,
      "actorEmail" text,
      "resultName" text,
      "startedAt" datetime not null default current_timestamp,
      "createdAt" datetime not null default current_timestamp,
      "completedAt" datetime
    );

    create table if not exists "DataTransferIssue" (
      "id" integer not null primary key autoincrement,
      "jobId" integer not null,
      "module" text not null,
      "sheet" text,
      "rowNumber" integer,
      "field" text,
      "severity" text not null default 'ERROR',
      "code" text not null,
      "message" text not null,
      "rawData" text,
      "createdAt" datetime not null default current_timestamp,
      constraint "DataTransferIssue_jobId_fkey"
        foreign key ("jobId") references "DataTransferJob" ("id")
        on delete cascade on update cascade
    );

    create table if not exists "DataChangeAudit" (
      "id" integer not null primary key autoincrement,
      "jobId" integer not null,
      "module" text not null,
      "recordKey" text not null,
      "action" text not null,
      "beforeData" text,
      "afterData" text,
      "actorId" integer,
      "actorEmail" text,
      "createdAt" datetime not null default current_timestamp,
      constraint "DataChangeAudit_jobId_fkey"
        foreign key ("jobId") references "DataTransferJob" ("id")
        on delete cascade on update cascade
    );

    create table if not exists "SiteContent" (
      "id" integer not null primary key autoincrement,
      "key" text not null,
      "group" text not null,
      "type" text not null default 'TEXT',
      "label" text not null,
      "valueAr" text,
      "valueEn" text,
      "mediaUrl" text,
      "altAr" text,
      "altEn" text,
      "linkUrl" text,
      "metadata" text,
      "isActive" boolean not null default 1,
      "sortOrder" integer not null default 0,
      "createdAt" datetime not null default current_timestamp,
      "updatedAt" datetime not null default current_timestamp
    );
  `);
}

function createDataManagementIndexes(database) {
  for (const tableName of EXTERNAL_KEY_TABLES) {
    database.exec(
      `create unique index if not exists ${quoteIdentifier(`${tableName}_externalKey_key`)}
       on ${quoteIdentifier(tableName)} ("externalKey")`,
    );
  }

  database.exec(`
    create unique index if not exists "OrderItem_supplierOrderId_projectItemId_key"
      on "OrderItem" ("supplierOrderId", "projectItemId");
    create unique index if not exists "DataTransferJob_idempotencyKey_key"
      on "DataTransferJob" ("idempotencyKey");
    create index if not exists "DataTransferJob_kind_status_idx"
      on "DataTransferJob" ("kind", "status");
    create index if not exists "DataTransferJob_sourceHash_idx"
      on "DataTransferJob" ("sourceHash");
    create index if not exists "DataTransferJob_createdAt_idx"
      on "DataTransferJob" ("createdAt");
    create index if not exists "DataTransferIssue_jobId_severity_idx"
      on "DataTransferIssue" ("jobId", "severity");
    create index if not exists "DataTransferIssue_module_code_idx"
      on "DataTransferIssue" ("module", "code");
    create index if not exists "DataChangeAudit_jobId_module_idx"
      on "DataChangeAudit" ("jobId", "module");
    create index if not exists "DataChangeAudit_module_recordKey_idx"
      on "DataChangeAudit" ("module", "recordKey");
    create unique index if not exists "SiteContent_key_key"
      on "SiteContent" ("key");
    create index if not exists "SiteContent_group_sortOrder_idx"
      on "SiteContent" ("group", "sortOrder");
    create index if not exists "SiteContent_type_idx"
      on "SiteContent" ("type");
    create index if not exists "SiteContent_isActive_idx"
      on "SiteContent" ("isActive");
  `);
}

function verifyMigration(database) {
  assertAddedLegacyColumns(database, true);
  for (const tableName of NEW_TABLE_NAMES) {
    if (!tableExists(database, tableName)) {
      throw new Error(`Migration verification failed for ${tableName}`);
    }
    assertExactTableManifest(database, tableName);
  }
  for (const expected of EXPECTED_INDEXES) {
    assertIndexMatches(database, expected, true);
  }
  const foreignKeyIssues = database.prepare("pragma foreign_key_check").all();
  if (foreignKeyIssues.length > 0) {
    throw new Error(
      `Migration verification found ${foreignKeyIssues.length} foreign-key issue(s)`,
    );
  }
}

export function migrateDataManagement(database) {
  preflightDataManagementMigration(database);

  const migrate = database.transaction(() => {
    let addedColumns = 0;
    for (const tableName of EXTERNAL_KEY_TABLES) {
      if (addColumnIfMissing(database, tableName, "externalKey", "text")) {
        addedColumns += 1;
      }
    }
    if (
      addColumnIfMissing(
        database,
        "User",
        "sessionVersion",
        "integer not null default 1",
      )
    ) {
      addedColumns += 1;
    }
    if (addColumnIfMissing(database, "User", "passwordChangedAt", "datetime")) {
      addedColumns += 1;
    }

    createDataManagementTables(database);
    createDataManagementIndexes(database);
    verifyMigration(database);
    return { addedColumns };
  });

  return migrate();
}

function timestampForFile(date = new Date()) {
  return date.toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

function verifyBackupIntegrity(backupPath) {
  const backup = new Database(backupPath, {
    readonly: true,
    fileMustExist: true,
  });
  try {
    const result = backup.pragma("integrity_check", { simple: true });
    if (String(result).toLowerCase() !== "ok") {
      throw new Error(`SQLite backup integrity check failed: ${result}`);
    }
  } finally {
    backup.close();
  }
}

export async function migrateDatabaseFile(databasePath) {
  const resolvedPath = path.resolve(databasePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`SQLite database was not found at ${resolvedPath}; no file was created`);
  }
  const canonicalPath = fs.realpathSync.native(resolvedPath);
  const backupDirectory = path.join(
    path.dirname(canonicalPath),
    "backups",
    "migrations",
  );
  const database = new Database(canonicalPath, { fileMustExist: true });
  database.pragma("busy_timeout = 5000");
  database.pragma("foreign_keys = ON");

  try {
    // Fail incompatible partial schemas before any filesystem or database mutation.
    preflightDataManagementMigration(database);
    fs.mkdirSync(backupDirectory, { recursive: true });
    const backupPath = path.join(
      backupDirectory,
      `pre-data-management-${timestampForFile()}.db`,
    );
    await database.backup(backupPath);
    verifyBackupIntegrity(backupPath);
    const result = migrateDataManagement(database);
    return { databasePath: canonicalPath, backupPath, ...result };
  } finally {
    database.close();
  }
}

async function main() {
  const configuredUrl = loadProjectDatabaseUrl(PROJECT_ROOT);
  const databasePath = resolveDatabasePath(configuredUrl, PROJECT_ROOT);
  const canonicalTarget = fs.existsSync(databasePath)
    ? fs.realpathSync.native(databasePath)
    : path.resolve(databasePath);
  process.stdout.write(`Data-management migration target: ${canonicalTarget}\n`);
  const result = await migrateDatabaseFile(databasePath);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : "Unknown migration error";
    process.stderr.write(`Data-management migration failed: ${message}\n`);
    process.exitCode = 1;
  });
}
