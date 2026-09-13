import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { pathToFileURL } from "node:url";

import Database from "better-sqlite3";
import { migrateAiOperations } from "../scripts/migrate-ai-operations.mjs";
import { migrateAccounting } from "../scripts/migrate-accounting.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const sourceDatabase = path.join(projectRoot, "dev.db");
const loaderPath = path.join(projectRoot, "tests", "support", "next-server-test-loader.mjs");
const fixturePath = path.join(projectRoot, "tests", "fixtures", "admin-assistant-run-ledger.integration.ts");

test("assistant run ledger enforces the audited approval lifecycle in an isolated database", async (context) => {
  assert.equal(fs.existsSync(sourceDatabase), true, "The ERP database fixture is required");
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "hatab-run-ledger-"));
  const targetDatabase = path.join(temporaryDirectory, "ledger.db");
  context.after(() => fs.rmSync(temporaryDirectory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  }));

  const source = new Database(sourceDatabase, { readonly: true, fileMustExist: true });
  try {
    await source.backup(targetDatabase);
  } finally {
    source.close();
  }
  const crmMigration = spawnSync(process.execPath, [path.join(projectRoot, "scripts", "migrate-client-crm.mjs"), targetDatabase], { cwd: projectRoot, encoding: "utf8" });
  assert.equal(crmMigration.status, 0, crmMigration.stderr);
  const isolatedDatabase = new Database(targetDatabase);
  try {
    migrateAiOperations(isolatedDatabase);
    migrateAccounting(isolatedDatabase);
    assert.equal(isolatedDatabase.pragma("integrity_check", { simple: true }), "ok");
  } finally {
    isolatedDatabase.close();
  }

  const normalizedDatabasePath = targetDatabase.replaceAll("\\", "/");
  const result = spawnSync(process.execPath, [
    "--no-warnings",
    "--experimental-strip-types",
    "--experimental-loader",
    pathToFileURL(loaderPath).href,
    fixturePath,
  ], {
    cwd: projectRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_ENV: "test",
      AUTH_SECRET: "hatab-ledger-test-secret-that-is-long-enough-2026",
      DATABASE_URL: `file:${normalizedDatabasePath}`,
      DATA_BACKUP_DIR: path.join(temporaryDirectory, "backups"),
    },
  });

  assert.equal(result.status, 0, [result.stdout, result.stderr].filter(Boolean).join("\n"));
  const report = JSON.parse(result.stdout.trim());
  assert.deepEqual(report, {
    lifecycle: "passed",
    conversationalOrder: "passed",
    financialDeletionGuards: "passed",
    runId: report.runId,
    revisionCount: 2,
    completedSteps: 2,
    rejectedTamperCases: 17,
  });
  assert.match(report.runId, /^c/);
});
