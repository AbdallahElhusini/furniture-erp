import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import test from "node:test";
import Database from "better-sqlite3";

const root = path.resolve(import.meta.dirname, "..");
const secret = "crm-integration-fixture-secret-at-least-32-chars";
async function unusedPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer(); server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { const port = server.address().port; server.close(() => resolve(port)); });
  });
}
function cookie(user) {
  const encoded = Buffer.from(JSON.stringify({ sub: user.id, name: user.name, email: user.email, role: user.role, sessionVersion: 1, mustChangePassword: false, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  return `hatab_admin_session=${encoded}.${createHmac("sha256", secret).update(encoded).digest("base64url")}`;
}

test("client CRM API keeps conversation leads, conversion and audit writes consistent", { timeout: 240000 }, async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "hatab-crm-api-"));
  const databasePath = path.join(folder, "test.db");
  const dist = path.join(root, `.next-crm-test-${process.pid}`);
  let server;
  try {
    const source = new Database(path.join(root, "dev.db"), { readonly: true });
    await source.backup(databasePath); source.close();
    const fixture = new Database(databasePath);
    const admin = fixture.prepare("SELECT id,name,email,role FROM User WHERE role='ADMIN' LIMIT 1").get();
    assert.ok(admin);
    fixture.prepare("UPDATE User SET isActive=1,mustChangePassword=0,sessionVersion=1 WHERE id=?").run(admin.id);
    fixture.close();
    const port = await unusedPort();
    const base = `http://127.0.0.1:${port}`;
    server = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
      cwd: root, env: { ...process.env, DATABASE_URL: `file:${databasePath.replaceAll("\\", "/")}`, DATA_BACKUP_DIR: path.join(folder, "backups"), AUTH_SECRET: secret, NEXT_DIST_DIR: path.basename(dist), NEXT_TELEMETRY_DISABLED: "1" }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    });
    let logs = ""; for (const stream of [server.stdout, server.stderr]) stream.on("data", (chunk) => { logs = (logs + String(chunk)).slice(-18000); });
    const deadline = Date.now() + 120000;
    let ready = false;
    while (Date.now() < deadline && server.exitCode === null) {
      try { if ((await fetch(`${base}/api/clients`, { signal: AbortSignal.timeout(2000) })).status === 401) { ready = true; break; } } catch {}
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    assert.ok(ready, `CRM test server did not start: ${logs}`);
    const call = (url, method = "GET", body, headers = {}) => fetch(base + url, { method, signal: AbortSignal.timeout(45000), headers: { cookie: cookie(admin), "Content-Type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    assert.equal((await call("/api/clients", "POST", { name: "Blocked" }, { origin: "https://foreign.example" })).status, 403);
    const create = await call("/api/clients", "POST", { name: "CRM isolated test", brief: "مكتب عند محمود الأبيض", source: "مكالمة", nextFollowUpAt: "2026-09-14" });
    assert.equal(create.status, 201, await create.clone().text());
    const lead = await create.json();
    assert.equal(lead.phone, ""); assert.equal(lead.stage, "LEAD");
    assert.equal((await call(`/api/clients/${lead.id}`, "PUT", { stage: "CUSTOMER" })).status, 400);
    const update = await call(`/api/clients/${lead.id}`, "PUT", { stage: "CUSTOMER", phone: "+۹۹۹ ۸۷۶ ۵۴۳۲۱", expectedUpdatedAt: lead.updatedAt });
    assert.equal(update.status, 200, await update.clone().text());
    const customer = await update.json();
    assert.equal(customer.phone, "+99987654321"); assert.equal(customer.brief, lead.brief);
    assert.equal((await call(`/api/clients/${lead.id}`, "PUT", { brief: "stale", expectedUpdatedAt: lead.updatedAt })).status, 409);
    assert.equal((await call("/api/clients", "POST", { name: "Duplicate", phone: "+999-876-54321" })).status, 400);
    assert.equal((await call(`/api/clients/${lead.id}junk`)).status, 400);
    const link = new Database(databasePath); const project = link.prepare("INSERT INTO Project(clientId,title,type,status,totalCost,totalPrice,amountPaid,shippingCost,installationCost,priority,createdAt,updatedAt) VALUES (?,'Isolated project','SIMPLE_ORDER','LEAD',0,0,0,0,0,'MEDIUM',datetime('now'),datetime('now'))").run(lead.id); link.close();
    assert.equal((await call(`/api/clients/${lead.id}`, "DELETE")).status, 400);
    const check = new Database(databasePath, { readonly: true });
    assert.ok(check.prepare("SELECT id FROM Project WHERE id=?").get(project.lastInsertRowid));
    assert.equal(check.prepare("SELECT count(*) AS n FROM DataChangeAudit WHERE module='clients' AND recordKey=? AND actorId=?").get(String(lead.id), admin.id).n, 2);
    check.close();
    const listed = await call("/api/clients?stage=CUSTOMER&search=CRM%20isolated");
    assert.equal(listed.status, 200); assert.equal((await listed.json()).length, 1);
    const formulaLead = await call("/api/clients", "POST", { name: "CRM formula text", brief: "=SUM(1+1)" });
    assert.equal(formulaLead.status, 201);
    const exported = await call("/api/data-management/export?modules=clients&format=csv");
    assert.equal(exported.status, 200, await exported.clone().text());
    assert.match(await exported.text(), /'=SUM\(1\+1\)/);
    const file = new FormData();
    file.set("file", new File(["external_key,name,phone,stage,brief,source,next_follow_up_at\nCRM-SHEET-LEAD-001,Sheet lead,,LEAD,Office brief,Phone,2026-09-15"], "crm.csv", { type: "text/csv" }));
    file.set("module", "clients"); file.set("dryRun", "false");
    const imported = await fetch(base + "/api/data-management/import", { method: "POST", headers: { cookie: cookie(admin) }, body: file, signal: AbortSignal.timeout(45000) });
    assert.equal(imported.status, 200, await imported.clone().text());
    const importedCheck = new Database(databasePath, { readonly: true });
    assert.deepEqual(importedCheck.prepare("SELECT phone,stage,brief,source FROM Client WHERE externalKey='CRM-SHEET-LEAD-001'").get(), { phone: "", stage: "LEAD", brief: "Office brief", source: "Phone" });
    importedCheck.close();
  } finally {
    if (server && server.exitCode === null) { server.kill(); await new Promise((resolve) => { server.once("exit", resolve); setTimeout(resolve, 5000); }); }
    for (const [target, parent, prefix] of [[folder, os.tmpdir(), "hatab-crm-api-"], [dist, root, ".next-crm-test-"]]) {
      const resolved = path.resolve(target);
      if (path.dirname(resolved) !== path.resolve(parent) || !path.basename(resolved).startsWith(prefix)) throw new Error("Refusing unexpected test cleanup target");
      fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 8, retryDelay: 500 });
    }
  }
});
