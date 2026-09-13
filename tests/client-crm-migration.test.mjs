import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";

test("CRM migration preserves clients, backs up the original and is idempotent", () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "hatab-crm-test-"));
  const databasePath = path.join(folder, "test.db");
  const db = new Database(databasePath);
  db.exec(`CREATE TABLE Client(id INTEGER PRIMARY KEY, name TEXT, phone TEXT); CREATE TABLE Project(id INTEGER PRIMARY KEY, clientId INTEGER, status TEXT); INSERT INTO Client VALUES (1, 'Existing', '01012345678'), (2, 'Prospect', ''); INSERT INTO Project VALUES (1, 1, 'APPROVED'), (2, 2, 'LEAD');`);
  db.close();
  const run = () => spawnSync(process.execPath, ["scripts/migrate-client-crm.mjs", databasePath], { cwd: process.cwd(), encoding: "utf8" });
  try {
    const first = run(); assert.equal(first.status, 0, first.stderr);
    const firstReport = JSON.parse(first.stdout); assert.ok(fs.existsSync(firstReport.backup)); assert.equal(firstReport.added.length, 4);
    const second = run(); assert.equal(second.status, 0, second.stderr); assert.deepEqual(JSON.parse(second.stdout).added, []);
    const check = new Database(databasePath, { readonly: true });
    assert.deepEqual(check.prepare("SELECT id,name,phone,stage FROM Client ORDER BY id").all(), [{ id: 1, name: "Existing", phone: "01012345678", stage: "CUSTOMER" }, { id: 2, name: "Prospect", phone: "", stage: "LEAD" }]);
    assert.equal(check.pragma("integrity_check", { simple: true }), "ok"); check.close();
  } finally {
    const resolved = path.resolve(folder);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith("hatab-crm-test-")) throw new Error("Refusing unexpected cleanup path");
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});
