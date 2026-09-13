import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { File } from "node:buffer";
import Database from "better-sqlite3";
import ExcelJS from "exceljs";
import { migrateDataManagement } from "../scripts/migrate-data-management.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
// Copy the current ERP database so the release gate proves that today's real
// business data can complete the full export/import/backup/restore roundtrip.
const sourceDatabase = path.join(projectRoot, "dev.db");
const authSecret = "hatab-data-integration-secret-2026-at-least-32";

function safeRemoveTemporaryDirectory(directory) {
  const resolved = path.resolve(directory);
  const temporaryRoot = path.resolve(os.tmpdir());
  if (path.dirname(resolved) !== temporaryRoot || !path.basename(resolved).startsWith("hatab-data-integration-")) {
    throw new Error(`Refusing to remove non-test directory: ${resolved}`);
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}

function safeRemoveIntegrationDist(directory) {
  const resolved = path.resolve(directory);
  if (path.dirname(resolved) !== projectRoot || !path.basename(resolved).startsWith(".next-data-integration-")) {
    throw new Error(`Refusing to remove non-integration dist directory: ${resolved}`);
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}

function sessionCookie(user, mustChangePassword = false) {
  const payload = {
    sub: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    mustChangePassword,
    sessionVersion: user.sessionVersion,
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", authSecret).update(encoded).digest("base64url");
  return `hatab_admin_session=${encoded}.${signature}`;
}

async function unusedPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForServer(baseUrl, processHandle, logs) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (processHandle.exitCode !== null) throw new Error(`Next dev exited early (${processHandle.exitCode})\n${logs.join("")}`);
    try {
      const response = await fetch(`${baseUrl}/api/data-management/modules`, { signal: AbortSignal.timeout(2000) });
      if (response.status === 401) return;
    } catch { /* server is still compiling */ }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Timed out waiting for Next dev\n${logs.join("")}`);
}

async function api(baseUrl, cookie, pathname, init = {}) {
  const headers = new Headers(init.headers);
  if (cookie) headers.set("cookie", cookie);
  return fetch(`${baseUrl}${pathname}`, { ...init, headers, signal: AbortSignal.timeout(120_000) });
}

function databaseValue(databasePath, sql, ...parameters) {
  const database = new Database(databasePath, { readonly: true, fileMustExist: true });
  try { return database.prepare(sql).get(...parameters); }
  finally { database.close(); }
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonicalize(item)]));
  }
  return value;
}

function resignBackup(envelope) {
  const payload = Object.fromEntries(Object.entries(envelope).filter(([key]) => key !== "sourceHash"));
  envelope.sourceHash = createHash("sha256").update(JSON.stringify(canonicalize(payload))).digest("hex");
  return envelope;
}

test("real data-center roundtrip is atomic on a migrated temporary legacy database", { timeout: 240_000 }, async () => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "hatab-data-integration-"));
  const databasePath = path.join(temporaryDirectory, "roundtrip.db");
  const backupDirectory = path.join(temporaryDirectory, "recovery");
  const distDirectory = path.join(projectRoot, `.next-data-integration-${process.pid}-${Date.now()}`);
  fs.copyFileSync(sourceDatabase, databasePath);

  let serverProcess;
  const logs = [];
  try {
    const setup = new Database(databasePath, { fileMustExist: true });
    setup.pragma("foreign_keys = ON");
    migrateDataManagement(setup);
    setup.prepare(`
      insert into Client (externalKey, name, company, phone, email, address, notes, createdAt, updatedAt)
      values ('INTEGRATION-CLIENT', 'Integration Client', 'HATAB Test', '+201000000000', 'integration@example.test', 'Cairo', 'before import', datetime('now'), datetime('now'))
    `).run();
    setup.prepare(`update User set isActive = 1, mustChangePassword = 0, sessionVersion = 1 where id = 2`).run();
    const user = setup.prepare(`select id, name, email, role, sessionVersion from User where id = 2`).get();
    setup.close();
    assert.ok(user);

    const port = await unusedPort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const nextBinary = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");
    serverProcess = spawn(process.execPath, [nextBinary, "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
      cwd: projectRoot,
      env: {
        ...process.env,
        DATABASE_URL: `file:${databasePath.replaceAll("\\", "/")}`,
        DATA_BACKUP_DIR: backupDirectory,
        NEXT_DIST_DIR: path.basename(distDirectory),
        AUTH_SECRET: authSecret,
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const appendLog = (chunk) => {
      logs.push(String(chunk));
      while (logs.join("").length > 30_000) logs.shift();
    };
    serverProcess.stdout.on("data", appendLog);
    serverProcess.stderr.on("data", appendLog);
    await waitForServer(baseUrl, serverProcess, logs);

    const validCookie = sessionCookie(user, false);
    const forcedCookie = sessionCookie(user, true);
    assert.equal((await api(baseUrl, null, "/api/data-management/modules")).status, 401);
    assert.equal((await api(baseUrl, forcedCookie, "/api/data-management/modules")).status, 403);
    const moduleResponse = await api(baseUrl, validCookie, "/api/data-management/modules");
    assert.equal(moduleResponse.status, 200);
    const modulePayload = await moduleResponse.json();
    assert.equal(modulePayload.modules.length, 25);

    const templateResponse = await api(baseUrl, validCookie, "/api/data-management/template");
    if (templateResponse.status !== 200) throw new Error(`Template failed (${templateResponse.status}): ${await templateResponse.text()}`);
    const templateWorkbook = new ExcelJS.Workbook();
    await templateWorkbook.xlsx.load(Buffer.from(await templateResponse.arrayBuffer()));
    assert.deepEqual(
      new Set(templateWorkbook.worksheets.map((sheet) => sheet.name)),
      new Set(["_manifest", ...modulePayload.modules.map((entry) => entry.name)]),
    );

    const fullExportResponse = await api(baseUrl, validCookie, "/api/data-management/export");
    if (fullExportResponse.status !== 200) throw new Error(`Full export failed (${fullExportResponse.status}): ${await fullExportResponse.text()}`);
    const fullExportWorkbook = new ExcelJS.Workbook();
    await fullExportWorkbook.xlsx.load(Buffer.from(await fullExportResponse.arrayBuffer()));
    assert.deepEqual(
      new Set(fullExportWorkbook.worksheets.map((sheet) => sheet.name)),
      new Set(["_manifest", ...modulePayload.modules.map((entry) => entry.name)]),
    );

    const exportResponse = await api(baseUrl, validCookie, "/api/data-management/export?modules=clients");
    if (exportResponse.status !== 200) throw new Error(`Export failed (${exportResponse.status}): ${await exportResponse.text()}`);
    const exportBuffer = Buffer.from(await exportResponse.arrayBuffer());
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(exportBuffer);
    const clientSheet = workbook.getWorksheet("clients");
    assert.ok(clientSheet);
    const headers = new Map();
    clientSheet.getRow(1).eachCell((cell, column) => headers.set(String(cell.value), column));
    const externalKeyColumn = headers.get("external_key");
    const notesColumn = headers.get("notes");
    assert.ok(externalKeyColumn && notesColumn);
    let integrationRow;
    clientSheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1 && row.getCell(externalKeyColumn).value === "INTEGRATION-CLIENT") integrationRow = row;
    });
    assert.ok(integrationRow);
    integrationRow.getCell(notesColumn).value = "updated by spreadsheet";
    const changedWorkbook = Buffer.from(await workbook.xlsx.writeBuffer());

    const upload = async (dryRun) => {
      const form = new FormData();
      form.set("file", new File([changedWorkbook], "clients-roundtrip.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      form.set("dryRun", String(dryRun));
      return api(baseUrl, validCookie, "/api/data-management/import", { method: "POST", body: form });
    };
    const dryRunResponse = await upload(true);
    const dryRunResult = await dryRunResponse.json();
    assert.equal(dryRunResponse.status, 200, JSON.stringify(dryRunResult));
    assert.equal(dryRunResult.dryRun, true);
    assert.equal(databaseValue(databasePath, `select notes from Client where externalKey = 'INTEGRATION-CLIENT'`).notes, "before import");

    const applyResponse = await upload(false);
    const applyResult = await applyResponse.json();
    assert.equal(applyResponse.status, 200, JSON.stringify(applyResult));
    assert.equal(applyResult.errorCount, 0);
    assert.equal(databaseValue(databasePath, `select notes from Client where externalKey = 'INTEGRATION-CLIENT'`).notes, "updated by spreadsheet");
    const importJob = databaseValue(databasePath, `select status, resultName from DataTransferJob where id = ?`, applyResult.jobId);
    assert.equal(importJob.status, "SUCCESS");
    assert.ok(importJob.resultName);
    assert.ok(fs.existsSync(path.join(backupDirectory, importJob.resultName)));
    assert.ok(databaseValue(databasePath, `select count(*) as count from DataChangeAudit where jobId = ?`, applyResult.jobId).count > 0);

    const formulaWorkbook = new ExcelJS.Workbook();
    await formulaWorkbook.xlsx.load(exportBuffer);
    const formulaSheet = formulaWorkbook.getWorksheet("clients");
    let formulaRow;
    formulaSheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1 && row.getCell(externalKeyColumn).value === "INTEGRATION-CLIENT") formulaRow = row;
    });
    formulaRow.getCell(notesColumn).value = { formula: "1+1", result: 2 };
    const formulaForm = new FormData();
    formulaForm.set("file", new File([Buffer.from(await formulaWorkbook.xlsx.writeBuffer())], "formula.xlsx"));
    formulaForm.set("dryRun", "false");
    const formulaResponse = await api(baseUrl, validCookie, "/api/data-management/import", { method: "POST", body: formulaForm });
    const formulaResult = await formulaResponse.json();
    assert.equal(formulaResponse.status, 422, JSON.stringify(formulaResult));
    assert.ok(formulaResult.issues.some((entry) => entry.code === "FORMULA_NOT_ALLOWED"));
    assert.equal(databaseValue(databasePath, `select notes from Client where externalKey = 'INTEGRATION-CLIENT'`).notes, "updated by spreadsheet");

    const projectExportResponse = await api(baseUrl, validCookie, "/api/data-management/export?modules=projects");
    if (projectExportResponse.status !== 200) throw new Error(`Project export failed (${projectExportResponse.status}): ${await projectExportResponse.text()}`);
    const projectWorkbook = new ExcelJS.Workbook();
    await projectWorkbook.xlsx.load(Buffer.from(await projectExportResponse.arrayBuffer()));
    const projectSheet = projectWorkbook.getWorksheet("projects");
    const projectHeaders = new Map();
    projectSheet.getRow(1).eachCell((cell, column) => projectHeaders.set(String(cell.value), column));
    const firstProject = projectSheet.getRow(2);
    const projectRecordId = Number(firstProject.getCell(projectHeaders.get("record_id")).value);
    const projectBefore = databaseValue(databasePath, `select title from Project where id = ?`, projectRecordId).title;
    firstProject.getCell(projectHeaders.get("title")).value = "SHOULD NOT APPLY";
    firstProject.getCell(projectHeaders.get("client_external_key")).value = "MISSING-CLIENT-REFERENCE";
    const invalidReferenceForm = new FormData();
    invalidReferenceForm.set("file", new File([Buffer.from(await projectWorkbook.xlsx.writeBuffer())], "invalid-reference.xlsx"));
    invalidReferenceForm.set("dryRun", "false");
    const invalidReferenceResponse = await api(baseUrl, validCookie, "/api/data-management/import", { method: "POST", body: invalidReferenceForm });
    const invalidReferenceResult = await invalidReferenceResponse.json();
    assert.equal(invalidReferenceResponse.status, 422, JSON.stringify(invalidReferenceResult));
    assert.ok(invalidReferenceResult.issues.some((entry) => entry.code === "UNRESOLVED_REFERENCE"));
    assert.equal(databaseValue(databasePath, `select title from Project where id = ?`, projectRecordId).title, projectBefore);
    assert.equal(databaseValue(databasePath, `select count(*) as count from DataChangeAudit where jobId = ?`, invalidReferenceResult.jobId).count, 0);

    const backupByScope = new Map();
    for (const scope of ["FULL_BUSINESS", "CATALOG", "OPERATIONS", "CONTENT"]) {
      const response = await api(baseUrl, validCookie, "/api/data-management/backup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      if (response.status !== 200) throw new Error(`Backup ${scope} failed (${response.status}): ${await response.text()}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      const parsed = JSON.parse(buffer.toString("utf8"));
      assert.equal(parsed.scope, scope);
      assert.equal(parsed.format, "HATAB_ERP_LOGICAL_BACKUP");
      assert.equal(Object.hasOwn(parsed.records, "users"), false);
      backupByScope.set(scope, { buffer, parsed });
    }

    const full = backupByScope.get("FULL_BUSINESS");
    assert.ok(full);

    const contentAttack = structuredClone(backupByScope.get("CONTENT").parsed);
    contentAttack.records.settings.push({ id: 900001, key: "auth_secret", value: "must-not-import" });
    contentAttack.data.settings.push({ action: "UPSERT", key: "auth_secret", value: "must-not-import" });
    contentAttack.bindings.settings.push({ id: 900001, key: "auth_secret" });
    contentAttack.counts.settings += 1;
    contentAttack.records.site_content.push({
      id: 900002, key: "unregistered.banner", group: "unsafe", type: "BANNER", label: "Unsafe",
      valueAr: null, valueEn: null, mediaUrl: "https://evil.example/banner.jpg", altAr: null, altEn: null,
      linkUrl: "https://evil.example", metadata: "{}", isActive: true, sortOrder: 0,
      createdAt: "2026-08-25T12:00:00.000Z", updatedAt: "2026-08-25T12:00:00.000Z",
    });
    contentAttack.data.site_content.push({
      action: "UPSERT", key: "unregistered.banner", group: "unsafe", type: "BANNER", label: "Unsafe",
      value_ar: null, value_en: null, media_url: "https://evil.example/banner.jpg", alt_ar: null, alt_en: null,
      link_url: "https://evil.example", metadata: "{}", is_active: true, sort_order: 0,
    });
    contentAttack.bindings.site_content.push({ id: 900002, key: "unregistered.banner" });
    contentAttack.counts.site_content += 1;
    resignBackup(contentAttack);
    const contentAttackForm = new FormData();
    contentAttackForm.set("file", new File([JSON.stringify(contentAttack)], "self-hashed-content-attack.json", { type: "application/json" }));
    contentAttackForm.set("dryRun", "false");
    const contentAttackResponse = await api(baseUrl, validCookie, "/api/data-management/restore", { method: "POST", body: contentAttackForm });
    const contentAttackResult = await contentAttackResponse.json();
    assert.equal(contentAttackResponse.status, 422, JSON.stringify(contentAttackResult));
    assert.ok(contentAttackResult.issues.some((entry) => entry.code === "UNSAFE_SETTING_KEY"));
    assert.ok(contentAttackResult.issues.some((entry) => entry.code === "UNREGISTERED_CONTENT_KEY"));
    assert.equal(databaseValue(databasePath, `select count(*) as count from Setting where key = 'auth_secret'`).count, 0);
    assert.equal(databaseValue(databasePath, `select count(*) as count from SiteContent where key = 'unregistered.banner'`).count, 0);

    const tampered = structuredClone(full.parsed);
    const clientRecord = tampered.records.clients.find((row) => row.externalKey === "INTEGRATION-CLIENT");
    clientRecord.notes = "tampered without hash";
    const tamperForm = new FormData();
    tamperForm.set("file", new File([JSON.stringify(tampered)], "tampered.json", { type: "application/json" }));
    tamperForm.set("dryRun", "false");
    const tamperResponse = await api(baseUrl, validCookie, "/api/data-management/restore", { method: "POST", body: tamperForm });
    const tamperResult = await tamperResponse.json();
    assert.equal(tamperResponse.status, 422, JSON.stringify(tamperResult));
    assert.ok(tamperResult.issues.some((entry) => entry.code === "BACKUP_HASH"));
    assert.equal(databaseValue(databasePath, `select notes from Client where externalKey = 'INTEGRATION-CLIENT'`).notes, "updated by spreadsheet");

    const restoreRequest = async (dryRun) => {
      const form = new FormData();
      form.set("file", new File([full.buffer], "full-backup.json", { type: "application/json" }));
      form.set("dryRun", String(dryRun));
      return api(baseUrl, validCookie, "/api/data-management/restore", { method: "POST", body: form });
    };
    const restoreDryRunResponse = await restoreRequest(true);
    const restoreDryRun = await restoreDryRunResponse.json();
    assert.equal(restoreDryRunResponse.status, 200, JSON.stringify(restoreDryRun));
    assert.equal(restoreDryRun.dryRun, true);
    assert.equal(restoreDryRun.restoredCount, 0);

    const drift = new Database(databasePath, { fileMustExist: true });
    drift.prepare(`update Client set notes = 'drift after backup' where externalKey = 'INTEGRATION-CLIENT'`).run();
    drift.close();
    const restoreApplyResponse = await restoreRequest(false);
    const restoreApply = await restoreApplyResponse.json();
    assert.equal(restoreApplyResponse.status, 200, JSON.stringify(restoreApply));
    assert.ok(restoreApply.restoredCount > 0);
    assert.ok(restoreApply.preRestoreBackup);
    assert.ok(fs.existsSync(path.join(backupDirectory, restoreApply.preRestoreBackup)));
    assert.equal(databaseValue(databasePath, `select notes from Client where externalKey = 'INTEGRATION-CLIENT'`).notes, "updated by spreadsheet");
    const restoreJob = databaseValue(databasePath, `select status, resultName from DataTransferJob where id = ?`, restoreApply.jobId);
    assert.equal(restoreJob.status, "SUCCESS");
    assert.equal(restoreJob.resultName, restoreApply.preRestoreBackup);
  } finally {
    if (serverProcess && serverProcess.exitCode === null) {
      serverProcess.kill("SIGTERM");
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 5000);
        serverProcess.once("exit", () => { clearTimeout(timer); resolve(); });
      });
    }
    safeRemoveIntegrationDist(distDirectory);
    safeRemoveTemporaryDirectory(temporaryDirectory);
  }
});
