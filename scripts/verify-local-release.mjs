import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const tests = fs.readdirSync(path.join(root, "tests")).filter((name) => /\.test\.(?:ts|mjs)$/.test(name)).sort();
const reportPath = path.join(root, "artifacts", "local-release-verification.json");
const report = { startedAt: new Date().toISOString(), completedAt: null, status: "RUNNING", tests: tests.length, checks: [] };
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
const save = () => fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
save();

async function run(name, args) {
  const startedAt = new Date().toISOString();
  console.log(`Starting ${name}`);
  let output = "";
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    for (const stream of [child.stdout, child.stderr]) stream.on("data", (data) => {
      const text = String(data); output = (output + text).slice(-100_000); process.stdout.write(text);
    });
    child.on("error", (error) => { output += error.message; resolve(1); });
    child.on("close", (exitCode) => resolve(exitCode ?? 1));
  });
  report.checks.push({ name, startedAt, completedAt: new Date().toISOString(), exitCode: code, output });
  save();
  return code === 0;
}

const tested = await run("All isolated regression tests", ["--test", "--test-concurrency=1", "--experimental-strip-types", ...tests.map((name) => `tests/${name}`)]);
// Next test instances may rewrite tsconfig/next-env type includes. Check after tests finish.
const generated = await run("Canonical Next route types", ["node_modules/next/dist/bin/next", "typegen"]);
const typed = await run("TypeScript", ["node_modules/typescript/bin/tsc", "--noEmit", "--incremental", "false"]);
report.completedAt = new Date().toISOString();
report.status = tested && generated && typed ? "PASS" : "FAIL";
save();
console.log(`${report.status}: ${reportPath}`);
process.exitCode = report.status === "PASS" ? 0 : 1;
