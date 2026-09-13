import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { pathToFileURL } from "node:url";


const projectRoot = path.resolve(import.meta.dirname, "..");
const loaderPath = path.join(projectRoot, "tests", "support", "next-server-test-loader.mjs");
const fixturePath = path.join(projectRoot, "tests", "fixtures", "local-ai-status-contract.integration.ts");

test("local AI health and extraction wire identities remain fail-closed", () => {
  const result = spawnSync(process.execPath, [
    "--no-warnings",
    "--experimental-strip-types",
    "--experimental-loader",
    pathToFileURL(loaderPath).href,
    fixturePath,
  ], {
    cwd: projectRoot,
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "test", HATAB_LOCAL_AI_SECRET: "" },
  });

  assert.equal(result.status, 0, [result.stdout, result.stderr].filter(Boolean).join("\n"));
  assert.deepEqual(JSON.parse(result.stdout), {
    lifecycle: "passed",
    healthStates: ["ready", "identity-missing", "loaded-unverified", "contract-drift", "offline"],
    requestContractFields: ["message", "context", "schemaVersion", "contractVersion", "contractHash"],
    responseIdentityFields: [
      "schemaVersion",
      "contractVersion",
      "contractHash",
      "activeModelKey",
      "baseModel",
      "baseModelRevision",
      "baseModelArtifactSha256",
      "adapter",
      "adapterModelSha256",
      "adapterConfigSha256",
      "adapterManifestSha256",
      "evaluationReportSha256",
      "readinessSemanticSha256",
      "promptSha256",
      "modelIdentitySha256",
      "promotionVerified",
    ],
  });
});
