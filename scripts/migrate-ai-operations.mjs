import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Database from "better-sqlite3";

export const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

export const AI_OPERATION_TABLES = Object.freeze([
  "AiConversation",
  "AiMessage",
  "AiModelVersion",
  "AiRun",
  "AiPlan",
  "AiStep",
  "AiToolCall",
  "AiApproval",
  "AiPolicyDecision",
  "AiFeedback",
]);

const CREATE_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS "AiConversation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "publicId" TEXT NOT NULL,
    "title" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'ar',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE'
      CHECK ("status" IN ('ACTIVE', 'ARCHIVED', 'CLOSED')),
    "actorId" INTEGER,
    "actorEmail" TEXT,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "lastMessageAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS "AiMessage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "conversationId" INTEGER NOT NULL,
    "runId" INTEGER,
    "role" TEXT NOT NULL
      CHECK ("role" IN ('USER', 'ASSISTANT', 'SYSTEM', 'TOOL')),
    "content" TEXT NOT NULL,
    "contentRedacted" TEXT,
    "attachments" TEXT NOT NULL DEFAULT '[]',
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "actorId" INTEGER,
    "actorEmail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiMessage_conversationId_fkey"
      FOREIGN KEY ("conversationId") REFERENCES "AiConversation" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AiMessage_runId_fkey"
      FOREIGN KEY ("runId") REFERENCES "AiRun" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE
  );

  CREATE TABLE IF NOT EXISTS "AiModelVersion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "key" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'LOCAL',
    "baseModel" TEXT NOT NULL,
    "adapter" TEXT,
    "quantization" TEXT,
    "runtime" TEXT NOT NULL,
    "artifactPath" TEXT,
    "artifactChecksum" TEXT,
    "promptVersion" TEXT NOT NULL,
    "toolSchemaVersion" TEXT NOT NULL,
    "evaluationMetrics" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'STAGED'
      CHECK ("status" IN ('STAGED', 'CANARY', 'ACTIVE', 'RETIRED', 'FAILED')),
    "isActive" BOOLEAN NOT NULL DEFAULT 0,
    "activatedAt" DATETIME,
    "retiredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS "AiRun" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "publicId" TEXT NOT NULL,
    "conversationId" INTEGER NOT NULL,
    "triggerMessageId" INTEGER,
    "modelVersionId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'QUEUED'
      CHECK ("status" IN ('QUEUED', 'PLANNING', 'WAITING_INPUT', 'WAITING_APPROVAL', 'EXECUTING', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
    "mode" TEXT NOT NULL DEFAULT 'PREVIEW'
      CHECK ("mode" IN ('READ_ONLY', 'PREVIEW', 'EXECUTE')),
    "intent" TEXT,
    "inputHash" TEXT,
    "inputSnapshot" TEXT NOT NULL DEFAULT '{}',
    "schemaVersion" INTEGER NOT NULL DEFAULT 1 CHECK ("schemaVersion" > 0),
    "toolSchemaVersion" TEXT NOT NULL DEFAULT 'v1',
    "policyVersion" TEXT NOT NULL DEFAULT 'v1',
    "retrievalVersion" TEXT,
    "maxSteps" INTEGER NOT NULL DEFAULT 12 CHECK ("maxSteps" > 0),
    "riskLevel" TEXT NOT NULL DEFAULT 'LOW'
      CHECK ("riskLevel" IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    "requiresApproval" BOOLEAN NOT NULL DEFAULT 0,
    "resultSummary" TEXT,
    "usage" TEXT NOT NULL DEFAULT '{}',
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "cancelledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiRun_conversationId_fkey"
      FOREIGN KEY ("conversationId") REFERENCES "AiConversation" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AiRun_triggerMessageId_fkey"
      FOREIGN KEY ("triggerMessageId") REFERENCES "AiMessage" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AiRun_modelVersionId_fkey"
      FOREIGN KEY ("modelVersionId") REFERENCES "AiModelVersion" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE
  );

  CREATE TABLE IF NOT EXISTS "AiPlan" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "runId" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1 CHECK ("revision" > 0),
    "status" TEXT NOT NULL DEFAULT 'DRAFT'
      CHECK ("status" IN ('DRAFT', 'READY', 'APPROVED', 'REJECTED', 'SUPERSEDED', 'EXECUTING', 'COMPLETED', 'FAILED')),
    "summary" TEXT,
    "rationale" TEXT,
    "actions" TEXT NOT NULL DEFAULT '[]',
    "assumptions" TEXT NOT NULL DEFAULT '[]',
    "warnings" TEXT NOT NULL DEFAULT '[]',
    "planHash" TEXT NOT NULL,
    "supersedesPlanId" INTEGER,
    "approvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiPlan_runId_fkey"
      FOREIGN KEY ("runId") REFERENCES "AiRun" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AiPlan_supersedesPlanId_fkey"
      FOREIGN KEY ("supersedesPlanId") REFERENCES "AiPlan" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE
  );

  CREATE TABLE IF NOT EXISTS "AiStep" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "runId" INTEGER NOT NULL,
    "planId" INTEGER,
    "sequence" INTEGER NOT NULL CHECK ("sequence" >= 0),
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING'
      CHECK ("status" IN ('PENDING', 'BLOCKED', 'READY', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED', 'CANCELLED')),
    "toolName" TEXT,
    "riskLevel" TEXT NOT NULL DEFAULT 'LOW'
      CHECK ("riskLevel" IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    "requiresApproval" BOOLEAN NOT NULL DEFAULT 0,
    "dependsOn" TEXT NOT NULL DEFAULT '[]',
    "input" TEXT NOT NULL DEFAULT '{}',
    "output" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0 CHECK ("attemptCount" >= 0),
    "maxAttempts" INTEGER NOT NULL DEFAULT 1 CHECK ("maxAttempts" > 0),
    "idempotencyKey" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiStep_runId_fkey"
      FOREIGN KEY ("runId") REFERENCES "AiRun" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AiStep_planId_fkey"
      FOREIGN KEY ("planId") REFERENCES "AiPlan" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE
  );

  CREATE TABLE IF NOT EXISTS "AiToolCall" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "stepId" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 1 CHECK ("sequence" > 0),
    "toolName" TEXT NOT NULL,
    "toolSchemaVersion" TEXT NOT NULL,
    "operation" TEXT NOT NULL DEFAULT 'READ'
      CHECK ("operation" IN ('READ', 'WRITE', 'EXTERNAL')),
    "status" TEXT NOT NULL DEFAULT 'PENDING'
      CHECK ("status" IN ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DENIED', 'CANCELLED')),
    "arguments" TEXT NOT NULL DEFAULT '{}',
    "result" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "permissionScope" TEXT,
    "riskLevel" TEXT NOT NULL DEFAULT 'LOW'
      CHECK ("riskLevel" IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    "idempotencyKey" TEXT,
    "durationMs" INTEGER CHECK ("durationMs" IS NULL OR "durationMs" >= 0),
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiToolCall_stepId_fkey"
      FOREIGN KEY ("stepId") REFERENCES "AiStep" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE
  );

  CREATE TABLE IF NOT EXISTS "AiApproval" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "runId" INTEGER NOT NULL,
    "planId" INTEGER,
    "stepId" INTEGER,
    "toolCallId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING'
      CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED')),
    "scope" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL
      CHECK ("riskLevel" IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    "requiredRole" TEXT,
    "requestedById" INTEGER,
    "requestedByEmail" TEXT,
    "requestSnapshot" TEXT NOT NULL DEFAULT '{}',
    "decisionReason" TEXT,
    "decidedById" INTEGER,
    "decidedByEmail" TEXT,
    "requestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" DATETIME,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiApproval_runId_fkey"
      FOREIGN KEY ("runId") REFERENCES "AiRun" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AiApproval_planId_fkey"
      FOREIGN KEY ("planId") REFERENCES "AiPlan" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AiApproval_stepId_fkey"
      FOREIGN KEY ("stepId") REFERENCES "AiStep" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AiApproval_toolCallId_fkey"
      FOREIGN KEY ("toolCallId") REFERENCES "AiToolCall" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE
  );

  CREATE TABLE IF NOT EXISTS "AiPolicyDecision" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "runId" INTEGER NOT NULL,
    "stepId" INTEGER,
    "toolCallId" INTEGER,
    "policyKey" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "effect" TEXT NOT NULL
      CHECK ("effect" IN ('ALLOW', 'DENY', 'REQUIRE_APPROVAL')),
    "reason" TEXT NOT NULL,
    "evaluationInput" TEXT NOT NULL DEFAULT '{}',
    "evaluationOutput" TEXT NOT NULL DEFAULT '{}',
    "evaluator" TEXT NOT NULL DEFAULT 'PROGRAMMATIC',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiPolicyDecision_runId_fkey"
      FOREIGN KEY ("runId") REFERENCES "AiRun" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AiPolicyDecision_stepId_fkey"
      FOREIGN KEY ("stepId") REFERENCES "AiStep" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AiPolicyDecision_toolCallId_fkey"
      FOREIGN KEY ("toolCallId") REFERENCES "AiToolCall" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE
  );

  CREATE TABLE IF NOT EXISTS "AiFeedback" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "conversationId" INTEGER NOT NULL,
    "runId" INTEGER,
    "messageId" INTEGER,
    "rating" INTEGER CHECK ("rating" IS NULL OR "rating" BETWEEN 1 AND 5),
    "category" TEXT,
    "comment" TEXT,
    "correction" TEXT,
    "isTrainingApproved" BOOLEAN NOT NULL DEFAULT 0,
    "approvedById" INTEGER,
    "approvedByEmail" TEXT,
    "approvedAt" DATETIME,
    "actorId" INTEGER,
    "actorEmail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiFeedback_conversationId_fkey"
      FOREIGN KEY ("conversationId") REFERENCES "AiConversation" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AiFeedback_runId_fkey"
      FOREIGN KEY ("runId") REFERENCES "AiRun" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AiFeedback_messageId_fkey"
      FOREIGN KEY ("messageId") REFERENCES "AiMessage" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE
  );
`;

const INDEX_DEFINITIONS = Object.freeze([
  ["AiConversation_publicId_key", "AiConversation", true, ["publicId"]],
  ["AiConversation_actorId_status_idx", "AiConversation", false, ["actorId", "status"]],
  ["AiConversation_status_lastMessageAt_idx", "AiConversation", false, ["status", "lastMessageAt"]],
  ["AiMessage_conversationId_createdAt_idx", "AiMessage", false, ["conversationId", "createdAt"]],
  ["AiMessage_runId_createdAt_idx", "AiMessage", false, ["runId", "createdAt"]],
  ["AiModelVersion_key_key", "AiModelVersion", true, ["key"]],
  ["AiModelVersion_status_isActive_idx", "AiModelVersion", false, ["status", "isActive"]],
  ["AiModelVersion_baseModel_idx", "AiModelVersion", false, ["baseModel"]],
  ["AiRun_publicId_key", "AiRun", true, ["publicId"]],
  ["AiRun_conversationId_createdAt_idx", "AiRun", false, ["conversationId", "createdAt"]],
  ["AiRun_status_createdAt_idx", "AiRun", false, ["status", "createdAt"]],
  ["AiRun_modelVersionId_idx", "AiRun", false, ["modelVersionId"]],
  ["AiRun_riskLevel_requiresApproval_idx", "AiRun", false, ["riskLevel", "requiresApproval"]],
  ["AiPlan_runId_status_idx", "AiPlan", false, ["runId", "status"]],
  ["AiPlan_supersedesPlanId_idx", "AiPlan", false, ["supersedesPlanId"]],
  ["AiPlan_runId_revision_key", "AiPlan", true, ["runId", "revision"]],
  ["AiStep_idempotencyKey_key", "AiStep", true, ["idempotencyKey"]],
  ["AiStep_planId_status_idx", "AiStep", false, ["planId", "status"]],
  ["AiStep_status_toolName_idx", "AiStep", false, ["status", "toolName"]],
  ["AiStep_runId_sequence_key", "AiStep", true, ["runId", "sequence"]],
  ["AiStep_runId_key_key", "AiStep", true, ["runId", "key"]],
  ["AiToolCall_idempotencyKey_key", "AiToolCall", true, ["idempotencyKey"]],
  ["AiToolCall_toolName_status_idx", "AiToolCall", false, ["toolName", "status"]],
  ["AiToolCall_status_startedAt_idx", "AiToolCall", false, ["status", "startedAt"]],
  ["AiToolCall_stepId_sequence_key", "AiToolCall", true, ["stepId", "sequence"]],
  ["AiApproval_runId_status_idx", "AiApproval", false, ["runId", "status"]],
  ["AiApproval_status_expiresAt_idx", "AiApproval", false, ["status", "expiresAt"]],
  ["AiApproval_planId_idx", "AiApproval", false, ["planId"]],
  ["AiApproval_stepId_idx", "AiApproval", false, ["stepId"]],
  ["AiApproval_toolCallId_idx", "AiApproval", false, ["toolCallId"]],
  ["AiPolicyDecision_runId_createdAt_idx", "AiPolicyDecision", false, ["runId", "createdAt"]],
  ["AiPolicyDecision_policyKey_effect_idx", "AiPolicyDecision", false, ["policyKey", "effect"]],
  ["AiPolicyDecision_stepId_idx", "AiPolicyDecision", false, ["stepId"]],
  ["AiPolicyDecision_toolCallId_idx", "AiPolicyDecision", false, ["toolCallId"]],
  ["AiFeedback_conversationId_createdAt_idx", "AiFeedback", false, ["conversationId", "createdAt"]],
  ["AiFeedback_runId_idx", "AiFeedback", false, ["runId"]],
  ["AiFeedback_messageId_idx", "AiFeedback", false, ["messageId"]],
  ["AiFeedback_isTrainingApproved_createdAt_idx", "AiFeedback", false, ["isTrainingApproved", "createdAt"]],
].map(([name, table, unique, columns]) => Object.freeze({
  name,
  table,
  unique,
  columns: Object.freeze(columns),
})));

function quoteIdentifier(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

function tableExists(database, tableName) {
  return Boolean(database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
  ).get(tableName));
}

function createIndexes(database) {
  for (const definition of INDEX_DEFINITIONS) {
    const unique = definition.unique ? "UNIQUE " : "";
    const columns = definition.columns.map(quoteIdentifier).join(", ");
    database.exec(
      `CREATE ${unique}INDEX IF NOT EXISTS ${quoteIdentifier(definition.name)} ` +
      `ON ${quoteIdentifier(definition.table)} (${columns})`,
    );
  }
}

function readTableManifest(database, tableName) {
  const columns = database.prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`).all()
    .map((column) => ({
      name: column.name,
      type: String(column.type).toUpperCase(),
      notNull: Boolean(column.notnull),
      defaultValue: column.dflt_value === null ? null : String(column.dflt_value),
      primaryKey: Number(column.pk),
    }));
  const foreignKeys = database.prepare(`PRAGMA foreign_key_list(${quoteIdentifier(tableName)})`).all()
    .map((foreignKey) => ({
      from: foreignKey.from,
      table: foreignKey.table,
      to: foreignKey.to,
      onUpdate: String(foreignKey.on_update).toUpperCase(),
      onDelete: String(foreignKey.on_delete).toUpperCase(),
      match: String(foreignKey.match).toUpperCase(),
    }))
    .sort((left, right) => left.from.localeCompare(right.from));
  const sql = database.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
  ).get(tableName)?.sql || "";
  return {
    columns,
    foreignKeys,
    checks: [...sql.matchAll(/\bCHECK\s*\(([^;]+?)\)(?=\s*(?:,|\n|$))/gis)]
      .map((match) => match[1].replace(/\s+/g, " ").trim().toUpperCase())
      .sort(),
  };
}

function readIndex(database, definition) {
  const index = database.prepare(
    "SELECT tbl_name AS tableName FROM sqlite_master WHERE type = 'index' AND name = ?",
  ).get(definition.name);
  if (!index) return null;
  const listEntry = database.prepare(`PRAGMA index_list(${quoteIdentifier(index.tableName)})`).all()
    .find((candidate) => candidate.name === definition.name);
  const columns = database.prepare(`PRAGMA index_xinfo(${quoteIdentifier(definition.name)})`).all()
    .filter((column) => column.key === 1)
    .sort((left, right) => left.seqno - right.seqno)
    .map((column) => column.name);
  return {
    table: index.tableName,
    unique: Boolean(listEntry?.unique),
    partial: Boolean(listEntry?.partial),
    columns,
  };
}

function createReferenceManifest() {
  const reference = new Database(":memory:");
  try {
    reference.pragma("foreign_keys = ON");
    reference.exec(CREATE_TABLES_SQL);
    createIndexes(reference);
    return {
      tables: new Map(AI_OPERATION_TABLES.map((tableName) => [
        tableName,
        readTableManifest(reference, tableName),
      ])),
      indexes: new Map(INDEX_DEFINITIONS.map((definition) => [
        definition.name,
        readIndex(reference, definition),
      ])),
    };
  } finally {
    reference.close();
  }
}

const REFERENCE_MANIFEST = createReferenceManifest();

function assertCompatibleExistingSchema(database) {
  for (const tableName of AI_OPERATION_TABLES) {
    if (!tableExists(database, tableName)) continue;
    const actual = readTableManifest(database, tableName);
    const expected = REFERENCE_MANIFEST.tables.get(tableName);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`Incompatible existing AI operations table ${tableName}`);
    }
  }
  for (const definition of INDEX_DEFINITIONS) {
    const actual = readIndex(database, definition);
    if (!actual) continue;
    const expected = REFERENCE_MANIFEST.indexes.get(definition.name);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`Incompatible existing AI operations index ${definition.name}`);
    }
  }
}

function assertCompleteSchema(database) {
  for (const tableName of AI_OPERATION_TABLES) {
    if (!tableExists(database, tableName)) {
      throw new Error(`Missing AI operations table ${tableName}`);
    }
    const actual = readTableManifest(database, tableName);
    const expected = REFERENCE_MANIFEST.tables.get(tableName);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`AI operations table verification failed for ${tableName}`);
    }
  }
  for (const definition of INDEX_DEFINITIONS) {
    const actual = readIndex(database, definition);
    const expected = REFERENCE_MANIFEST.indexes.get(definition.name);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`AI operations index verification failed for ${definition.name}`);
    }
  }
}

export function migrateAiOperations(database) {
  for (const requiredTable of ["User", "Project", "CatalogItem"]) {
    if (!tableExists(database, requiredTable)) {
      throw new Error(`Required ERP table ${requiredTable} is missing`);
    }
  }

  assertCompatibleExistingSchema(database);
  const missingTables = AI_OPERATION_TABLES.filter(
    (tableName) => !tableExists(database, tableName),
  );
  const missingIndexes = INDEX_DEFINITIONS.filter(
    (definition) => !readIndex(database, definition),
  );

  if (missingTables.length === 0 && missingIndexes.length === 0) {
    assertCompleteSchema(database);
    return { createdTables: 0, createdIndexes: 0, changed: false };
  }

  database.pragma("foreign_keys = ON");
  database.transaction(() => {
    database.exec(CREATE_TABLES_SQL);
    createIndexes(database);
    assertCompleteSchema(database);

    const foreignKeyIssues = database.prepare("PRAGMA foreign_key_check").all();
    if (foreignKeyIssues.length > 0) {
      throw new Error(`AI operations migration found ${foreignKeyIssues.length} foreign-key issue(s)`);
    }
    const integrity = database.pragma("integrity_check", { simple: true });
    if (integrity !== "ok") {
      throw new Error(`AI operations migration integrity check failed: ${integrity}`);
    }
  })();

  return {
    createdTables: missingTables.length,
    createdIndexes: missingIndexes.length,
    changed: true,
  };
}

export function resolveDatabasePath(configuredUrl, projectRoot = PROJECT_ROOT) {
  const databaseUrl = configuredUrl?.trim();
  if (!databaseUrl?.startsWith("file:")) {
    throw new Error("AI operations migration requires a persistent file: SQLite DATABASE_URL");
  }
  const rawPath = databaseUrl.slice("file:".length);
  if (!rawPath || rawPath === ":memory:") {
    throw new Error("DATABASE_URL must point to a persistent SQLite file");
  }
  const projectRootUrl = pathToFileURL(`${path.resolve(projectRoot)}${path.sep}`);
  let databaseFileUrl;
  try {
    databaseFileUrl = new URL(databaseUrl, projectRootUrl);
  } catch {
    throw new Error("DATABASE_URL contains an invalid SQLite file URL");
  }
  if (databaseFileUrl.protocol !== "file:" || databaseFileUrl.search || databaseFileUrl.hash) {
    throw new Error("DATABASE_URL must point directly to a persistent SQLite file");
  }
  return path.resolve(fileURLToPath(databaseFileUrl));
}

export function loadProjectDatabaseUrl(projectRoot = PROJECT_ROOT) {
  if (!process.env.DATABASE_URL?.trim()) {
    delete process.env.DATABASE_URL;
    const envPath = path.join(projectRoot, ".env");
    if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
  }
  const configuredUrl = process.env.DATABASE_URL?.trim();
  if (!configuredUrl) throw new Error("DATABASE_URL is required");
  return configuredUrl;
}

function verifyBackupIntegrity(backupPath) {
  const backup = new Database(backupPath, { readonly: true, fileMustExist: true });
  try {
    const result = backup.pragma("integrity_check", { simple: true });
    if (result !== "ok") throw new Error(`Backup integrity check failed: ${result}`);
  } finally {
    backup.close();
  }
}

export async function migrateDatabaseFile(databasePath) {
  const canonicalPath = fs.realpathSync.native(path.resolve(databasePath));
  const database = new Database(canonicalPath);
  try {
    database.pragma("busy_timeout = 5000");
    assertCompatibleExistingSchema(database);
    const needsMigration = AI_OPERATION_TABLES.some(
      (tableName) => !tableExists(database, tableName),
    ) || INDEX_DEFINITIONS.some((definition) => !readIndex(database, definition));

    let backupPath = null;
    if (needsMigration) {
      const backupDirectory = path.resolve(PROJECT_ROOT, "backups", "migrations");
      fs.mkdirSync(backupDirectory, { recursive: true });
      const timestamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
      backupPath = path.join(backupDirectory, `pre-ai-operations-${timestamp}.db`);
      await database.backup(backupPath);
      verifyBackupIntegrity(backupPath);
    }

    const result = migrateAiOperations(database);
    return { databasePath: canonicalPath, backupPath, ...result };
  } finally {
    database.close();
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const databaseUrl = loadProjectDatabaseUrl();
  const databasePath = resolveDatabasePath(databaseUrl);
  if (!fs.existsSync(databasePath) || fs.statSync(databasePath).size === 0) {
    throw new Error(`ERP database not found at ${databasePath}`);
  }
  const result = await migrateDatabaseFile(databasePath);
  console.log(JSON.stringify(result, null, 2));
}
