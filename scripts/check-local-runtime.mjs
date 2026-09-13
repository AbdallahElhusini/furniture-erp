import fs from "node:fs";
import path from "node:path";
import { createHmac } from "node:crypto";
import Database from "better-sqlite3";
import { loadProjectDatabaseUrl, resolveDatabasePath } from "./migrate-ai-operations.mjs";

const root = path.resolve(import.meta.dirname, "..");
const base = new URL(process.argv[2] || "http://localhost:3000");
if (!["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)) throw new Error("This smoke check is local-only.");
process.loadEnvFile(path.join(root, ".env"));
const db = new Database(resolveDatabasePath(loadProjectDatabaseUrl()), { readonly: true, fileMustExist: true });
const integrity = db.pragma("integrity_check", { simple: true });
const foreignKeyErrors = db.prepare("PRAGMA foreign_key_check").all().length;
const user = db.prepare("SELECT id,name,email,role,sessionVersion,mustChangePassword FROM User WHERE role='ADMIN' AND isActive=1 AND mustChangePassword=0 LIMIT 1").get();
db.close();
if (!user) throw new Error("No current administrator can run authenticated read-only checks. Sign in and finish password setup first.");
if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.trim().length < 32) throw new Error("AUTH_SECRET is not configured correctly.");
// The short-lived diagnostic session is never printed or stored. No business writes are made.
const encoded = Buffer.from(JSON.stringify({ sub: user.id, name: user.name, email: user.email, role: user.role, sessionVersion: user.sessionVersion, mustChangePassword: false, exp: Math.floor(Date.now() / 1000) + 300 })).toString("base64url");
const cookie = `hatab_admin_session=${encoded}.${createHmac("sha256", process.env.AUTH_SECRET.trim()).update(encoded).digest("base64url")}`;
const results = [];
const check = async (route, expected, options = {}) => {
  try {
    const response = await fetch(new URL(route, base), { redirect: "manual", signal: AbortSignal.timeout(45_000), ...options });
    const bytes = (await response.arrayBuffer()).byteLength;
    results.push({ route, status: response.status, expected, pass: response.status === expected, bytes, location: response.headers.get("location") });
  } catch (error) { results.push({ route, pass: false, error: error.message }); }
  console.log(`${results.at(-1).pass ? "PASS" : "FAIL"} ${route}: ${results.at(-1).status ?? "unavailable"}`);
};
for (const route of ["/", "/en", "/catalog", "/en/catalog", "/collections", "/login", "/robots.txt", "/sitemap.xml"]) await check(route, 200);
for (const route of ["/api/clients", "/api/accounting", "/api/admin-assistant/status"]) await check(route, 401);
for (const route of ["/admin", "/admin/assistant", "/admin/clients", "/admin/accounting", "/admin/projects", "/admin/catalog", "/admin/data-management", "/api/clients", "/api/accounting", "/api/reports/summary", "/api/admin-assistant/status"]) await check(route, 200, { headers: { cookie } });
await check("/api/auth/login", 400, { method: "POST", body: "{", headers: { "Content-Type": "application/json" } });
await check("/api/auth/login", 403, { method: "POST", body: "{}", headers: { origin: "https://invalid.example", "Content-Type": "application/json" } });
await check("/api/auth/logout", 403, { method: "POST", headers: { origin: "malformed-origin" } });
const report = { checkedAt: new Date().toISOString(), baseUrl: base.origin, database: { integrity, foreignKeyErrors }, status: results.every((entry) => entry.pass) && integrity === "ok" && !foreignKeyErrors ? "PASS" : "FAIL", results };
const output = path.join(root, "artifacts", "local-runtime-smoke.json");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(report, null, 2));
console.log(`${report.status}: ${output}`);
process.exitCode = report.status === "PASS" ? 0 : 1;
