import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import Database from "better-sqlite3";
import {
  AI_OPERATION_TABLES,
  migrateAiOperations,
} from "../scripts/migrate-ai-operations.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const sourceDatabase = path.join(projectRoot, "dev.db");

function temporaryDatabase(fileName) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hatab-ai-storage-"));
  const target = path.join(directory, fileName);
  fs.copyFileSync(sourceDatabase, target);
  // The checked-in/local fixture may already be migrated. Reconstruct the
  // legacy starting point so this test remains repeatable after deployment.
  const database = new Database(target);
  database.pragma("foreign_keys = OFF");
  for (const tableName of [...AI_OPERATION_TABLES].reverse()) {
    database.exec(`DROP TABLE IF EXISTS "${tableName}"`);
  }
  database.close();
  return { directory, target };
}

function removeTemporaryDirectory(directory) {
  fs.rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

function tableNames(database) {
  return database.prepare(
    `SELECT name FROM sqlite_master
     WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
     ORDER BY name`,
  ).all().map((row) => row.name);
}

function indexNames(database) {
  return database.prepare(
    `SELECT name FROM sqlite_master
     WHERE type = 'index' AND name NOT LIKE 'sqlite_%'
     ORDER BY name`,
  ).all().map((row) => row.name);
}

function dataFingerprints(database, excludedTables = new Set()) {
  const fingerprints = new Map();
  for (const tableName of tableNames(database)) {
    if (excludedTables.has(tableName)) continue;
    const quoted = `"${tableName.replaceAll('"', '""')}"`;
    const rows = database.prepare(`SELECT * FROM ${quoted} ORDER BY rowid`).all();
    fingerprints.set(tableName, {
      count: rows.length,
      hash: createHash("sha256").update(JSON.stringify(rows)).digest("hex"),
    });
  }
  return fingerprints;
}

function assertDataUnchanged(database, before) {
  for (const [tableName, expected] of before) {
    const quoted = `"${tableName.replaceAll('"', '""')}"`;
    const rows = database.prepare(`SELECT * FROM ${quoted} ORDER BY rowid`).all();
    assert.equal(rows.length, expected.count, `${tableName} row count changed`);
    assert.equal(
      createHash("sha256").update(JSON.stringify(rows)).digest("hex"),
      expected.hash,
      `${tableName} data changed`,
    );
  }
}

test("AI operations migration preserves ERP data and is idempotent", (context) => {
  assert.equal(fs.existsSync(sourceDatabase), true, "The real ERP dev.db fixture is required");
  const { directory, target } = temporaryDatabase("erp-copy.db");
  context.after(() => removeTemporaryDirectory(directory));
  const database = new Database(target);
  database.pragma("foreign_keys = ON");
  const before = dataFingerprints(database, new Set(AI_OPERATION_TABLES));

  const first = migrateAiOperations(database);
  const second = migrateAiOperations(database);

  assert.deepEqual(first, { createdTables: 10, createdIndexes: 38, changed: true });
  assert.deepEqual(second, { createdTables: 0, createdIndexes: 0, changed: false });
  assertDataUnchanged(database, before);
  for (const tableName of AI_OPERATION_TABLES) {
    assert.ok(tableNames(database).includes(tableName), `missing ${tableName}`);
  }

  const indexes = new Set(indexNames(database));
  for (const expected of [
    "AiConversation_publicId_key",
    "AiRun_publicId_key",
    "AiPlan_runId_revision_key",
    "AiStep_idempotencyKey_key",
    "AiToolCall_idempotencyKey_key",
    "AiApproval_status_expiresAt_idx",
    "AiFeedback_isTrainingApproved_createdAt_idx",
  ]) {
    assert.ok(indexes.has(expected), `missing ${expected}`);
  }
  assert.equal(database.pragma("foreign_key_check").length, 0);

  database.prepare(
    `INSERT INTO "AiConversation" ("publicId", "status") VALUES (?, ?)`,
  ).run("constraint-check", "ACTIVE");
  assert.throws(
    () => database.prepare(
      `INSERT INTO "AiMessage" ("conversationId", "role", "content") VALUES (?, ?, ?)`,
    ).run(1, "UNTRUSTED", "not accepted"),
    /CHECK constraint failed/,
  );
  assert.throws(
    () => database.prepare(
      `INSERT INTO "AiFeedback" ("conversationId", "rating") VALUES (?, ?)`,
    ).run(1, 6),
    /CHECK constraint failed/,
  );
  database.close();
});

test("migration rejects an incompatible partial control-plane schema before changes", (context) => {
  const { directory, target } = temporaryDatabase("partial-copy.db");
  context.after(() => removeTemporaryDirectory(directory));
  const database = new Database(target);
  database.exec(`CREATE TABLE "AiConversation" ("id" INTEGER PRIMARY KEY)`);
  const before = dataFingerprints(database, new Set(["AiConversation"]));

  assert.throws(
    () => migrateAiOperations(database),
    /Incompatible existing AI operations table AiConversation/,
  );
  assert.deepEqual(
    tableNames(database).filter((name) => name.startsWith("Ai")),
    ["AiConversation"],
  );
  assertDataUnchanged(database, before);
  database.close();
});

test("generated Prisma client can persist and traverse a complete audited run", (context) => {
  const { directory, target } = temporaryDatabase("prisma-copy.db");
  context.after(() => removeTemporaryDirectory(directory));
  const database = new Database(target);
  database.pragma("foreign_keys = ON");
  migrateAiOperations(database);
  database.close();

  const smokeScript = String.raw`
    import { PrismaClient } from "@prisma/client";
    import { PrismaLibSql } from "@prisma/adapter-libsql";
    const normalizedPath = process.env.HATAB_AI_TEST_DB.replaceAll("\\", "/");
    const prisma = new PrismaClient({ adapter: new PrismaLibSql({ url: "file:" + normalizedPath }) });
    try {
      const conversation = await prisma.aiConversation.create({
        data: { locale: "ar", actorId: 1, actorEmail: "admin@example.test" },
      });
      const request = await prisma.aiMessage.create({
        data: {
          conversationId: conversation.id,
          role: "USER",
          content: "Create a reviewed task",
          contentRedacted: "Create a reviewed task",
        },
      });
      const model = await prisma.aiModelVersion.create({
        data: {
          key: "test-model-v1",
          displayName: "Test model",
          baseModel: "local/test",
          runtime: "test-runtime",
          promptVersion: "prompt-v1",
          toolSchemaVersion: "tools-v1",
        },
      });
      const run = await prisma.aiRun.create({
        data: {
          conversationId: conversation.id,
          triggerMessageId: request.id,
          modelVersionId: model.id,
          status: "WAITING_APPROVAL",
          intent: "CREATE_TASK",
          requiresApproval: true,
          toolSchemaVersion: "tools-v1",
        },
      });
      await prisma.aiMessage.create({
        data: {
          conversationId: conversation.id,
          runId: run.id,
          role: "ASSISTANT",
          content: "The plan is ready for approval.",
        },
      });
      const plan = await prisma.aiPlan.create({
        data: {
          runId: run.id,
          planHash: "sha256:test-plan",
          status: "READY",
          actions: JSON.stringify([{ tool: "tasks.create" }]),
        },
      });
      const step = await prisma.aiStep.create({
        data: {
          runId: run.id,
          planId: plan.id,
          sequence: 1,
          key: "create-task",
          kind: "TOOL",
          title: "Create task",
          toolName: "tasks.create",
          requiresApproval: true,
          idempotencyKey: "test-run:create-task",
        },
      });
      const toolCall = await prisma.aiToolCall.create({
        data: {
          stepId: step.id,
          toolName: "tasks.create",
          toolSchemaVersion: "tools-v1",
          operation: "WRITE",
          idempotencyKey: "test-run:create-task:1",
        },
      });
      await prisma.aiPolicyDecision.create({
        data: {
          runId: run.id,
          stepId: step.id,
          toolCallId: toolCall.id,
          policyKey: "write-requires-approval",
          policyVersion: "policy-v1",
          effect: "REQUIRE_APPROVAL",
          reason: "All writes require explicit confirmation.",
        },
      });
      await prisma.aiApproval.create({
        data: {
          runId: run.id,
          planId: plan.id,
          stepId: step.id,
          toolCallId: toolCall.id,
          scope: "tasks.create",
          riskLevel: "MEDIUM",
          requestedById: 1,
        },
      });
      await prisma.aiFeedback.create({
        data: {
          conversationId: conversation.id,
          runId: run.id,
          rating: 5,
          category: "PLAN_QUALITY",
        },
      });

      const persisted = await prisma.aiRun.findUniqueOrThrow({
        where: { id: run.id },
        include: {
          plans: true,
          steps: { include: { toolCalls: true, policyDecisions: true } },
          approvals: true,
          outputMessages: true,
          feedback: true,
          modelVersion: true,
        },
      });
      if (persisted.plans.length !== 1 || persisted.steps[0].toolCalls.length !== 1) {
        throw new Error("complete run graph was not persisted");
      }
      if (persisted.approvals.length !== 1 || persisted.steps[0].policyDecisions.length !== 1) {
        throw new Error("safety decisions were not persisted");
      }
      if (persisted.outputMessages.length !== 1 || persisted.feedback.length !== 1) {
        throw new Error("conversation outcome was not persisted");
      }
      if (persisted.modelVersion?.key !== "test-model-v1") {
        throw new Error("model lineage was not persisted");
      }

      await prisma.aiConversation.delete({ where: { id: conversation.id } });
      const residue = {
        runs: await prisma.aiRun.count(),
        messages: await prisma.aiMessage.count(),
        plans: await prisma.aiPlan.count(),
        steps: await prisma.aiStep.count(),
        calls: await prisma.aiToolCall.count(),
        approvals: await prisma.aiApproval.count(),
        policies: await prisma.aiPolicyDecision.count(),
        feedback: await prisma.aiFeedback.count(),
        models: await prisma.aiModelVersion.count(),
      };
      if (Object.entries(residue).some(([key, count]) => key !== "models" && count !== 0)) {
        throw new Error("conversation cascade left execution residue: " + JSON.stringify(residue));
      }
      if (residue.models !== 1) throw new Error("model registry must outlive conversations");
      process.stdout.write(JSON.stringify({ ok: true, residue }));
    } finally {
      await prisma.$disconnect();
    }
  `;
  const smoke = spawnSync(
    process.execPath,
    ["--input-type=module", "--eval", smokeScript],
    {
      cwd: projectRoot,
      env: { ...process.env, HATAB_AI_TEST_DB: target },
      encoding: "utf8",
      timeout: 30_000,
    },
  );
  assert.equal(smoke.status, 0, smoke.stderr || smoke.stdout || "Prisma smoke failed");
  assert.equal(JSON.parse(smoke.stdout).ok, true);
});
