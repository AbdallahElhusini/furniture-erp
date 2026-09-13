# Admin assistant post-training smoke check

Run this only after training has finished, the candidate passes promotion dry-run, and the intended model is promoted. Do not restart either service during training. Use an `ADMIN` or `MANAGER` account and a unique `SMOKE-YYYYMMDD-HHMM` suffix. All applied edit/delete cases below must target disposable tasks; project and supplier-order control cases are preview-only.

## 1. Release gate and exact model identity

After the approved restart, run the automated gates serially:

```powershell
npm run test:admin-assistant
npm run test:task-commands
npm run test:ai-run-ledger
npm run test:ai-active-model
npm run ai:active-model
```

Any non-zero result blocks the smoke test. `ai:active-model` must return exactly one verified active registry row.

Read service health without printing its secret:

```powershell
$hatabAiKey = (Get-Content -LiteralPath 'D:\hatab-local-ai\service.key' -Raw).Trim()
$health = Invoke-RestMethod -Uri 'http://127.0.0.1:11437/health' -Headers @{ 'X-HATAB-AI-KEY' = $hatabAiKey }
$registry = node .\scripts\resolve-active-local-ai-model.mjs | ConvertFrom-Json

$identityChecks = [ordered]@{
  ready                    = $health.status -eq 'ready'
  productionReady          = $health.productionReady -eq $true
  promotionVerified        = $health.promotionVerified -eq $true
  activeModelKey           = $health.activeModelKey -eq $registry.key
  baseModel                = $health.baseModel -eq $registry.baseModel
  baseModelRevision        = $health.baseModelRevision -eq $registry.baseModelRevision
  baseModelArtifactSha256  = $health.baseModelArtifactSha256 -eq $registry.baseModelArtifactSha256
  modelIdentitySha256      = $health.modelIdentitySha256 -eq $registry.identityHash
  adapter                  = $health.adapter -eq $registry.artifactPath
  adapterModelSha256       = $health.adapterModelSha256 -eq $registry.adapterModelSha256
  adapterConfigSha256      = $health.adapterConfigSha256 -eq $registry.adapterConfigSha256
  adapterManifestSha256    = $health.adapterManifestSha256 -eq $registry.adapterManifestSha256
  evaluationReportSha256   = $health.evaluationReportSha256 -eq $registry.evaluationReportSha256
  readinessSemanticSha256  = $health.readinessSemanticSha256 -eq $registry.readinessSemanticSha256
  promptSha256             = $health.promptSha256 -eq $registry.promptSha256
  contractSha256           = $health.contractHash -eq $registry.contractSha256
}
$identityChecks
if ($identityChecks.Values -contains $false) { throw 'Active-model identity mismatch' }
Remove-Variable hatabAiKey
```

In an authenticated browser, open `/admin/assistant`, then inspect `GET /api/admin-assistant/status` in DevTools.

- Expect HTTP 200 and `Cache-Control: no-store`.
- Require `available`, `contractCompatible`, `productionReady`, and `identityVerified` all to be `true`; `adapterContractErrors` must be empty.
- Require `localModel.modelBinding` to equal the `/health` binding above field-for-field. Require `operationContract.hash === $registry.contractSha256`.
- Expand **Active model identity** in the UI. The active key, base revision, canonical adapter path, and every displayed SHA-256 must match the same binding.
- Record the status JSON and a screenshot. A green badge alone is not evidence.

## 2. Preview and language matrix

Use one request per preview. The first two phrases deliberately bypass the deterministic parser and therefore exercise the promoted local model.

| Case | Prompt | Required preview |
| --- | --- | --- |
| Arabic add | `اعمل مهمة SMOKE-AR-<STAMP> موعدها 2099-12-31 أولوية عالية نوعها معاينة` | One `CREATE_TASK`; `HIGH`; `INSPECTION`; `extractor.mode === "local-model"` |
| English add | `Create task SMOKE-EN-<STAMP> due 2099-12-31 priority HIGH type INSPECTION` | One semantically equivalent `CREATE_TASK`; `extractor.mode === "local-model"` |
| Arabic digits | `عملية: CREATE_TASK \| مهمة: SMOKE-DIGITS-<STAMP> \| موعد: ٢٠٩٩-١٢-٣١ \| أولوية: عالية \| نوع: معاينة` | One `CREATE_TASK`; date normalized correctly; deterministic mode is acceptable |
| Mixed language | `Create task متابعة المصنع due 2099-12-31 priority URGENT type SUPPLIER_FOLLOWUP` | One grounded `CREATE_TASK`; no translated or invented title/reference |

For every local-model preview:

- Require `extractor.modelBinding` to exactly equal the status binding, including `activeModelKey`, base revision/artifact hash, aggregate model identity, adapter/config/manifest hashes, evaluation/readiness hashes, prompt hash, and `promotionVerified: true`.
- Require a non-null `planToken`, `run.runId`, plan revision, and expiry only when there are no blocking issues.
- Review the before/after details. Preview must not change `/api/tasks` or any other ERP record.

The current UI chrome and validation messages are Arabic; English support means English intent/payload parity, not an English admin-page translation.

### Natural linked requests (2–5 actions)

Use a single sentence—not new lines or semicolons—for both checks:

```text
Update project <SAFE_PROJECT_ID> status to <DIFFERENT_STATUS> وبعدها اعمل مهمة SMOKE-LINK-2-<STAMP> موعدها 2099-12-31 أولوية منخفضة نوعها عامة للمشروع <SAFE_PROJECT_ID>
```

Require two ordered, grounded actions and `extractor.mode === "local-model"`; keep this preview-only because it contains project control.

```text
Create task SMOKE-LINK-A-<STAMP> due 2099-12-31 priority LOW type GENERAL, then create task SMOKE-LINK-B-<STAMP> due 2099-12-30 priority LOW type GENERAL, then create task SMOKE-LINK-C-<STAMP> due 2099-12-29 priority LOW type GENERAL, then create task SMOKE-LINK-D-<STAMP> due 2099-12-28 priority LOW type GENERAL, and then create task SMOKE-LINK-E-<STAMP> due 2099-12-27 priority LOW type GENERAL
```

Require five ordered `CREATE_TASK` actions from one preview. Change the selection after ticking confirmation: confirmation must reset. Apply only A and D, then prove A/D exist and B/C/E do not.

For partial understanding, preview one sentence containing a safe create followed by an unsupported bulk clause:

```text
Create task SMOKE-PARTIAL-<STAMP> due 2099-12-31 priority LOW type GENERAL, and then delete every old task
```

The understood task may be shown, but the unsupported clause must appear as a blocking issue. Require `planToken === null`, disabled action selectors, no confirmation button, run status `WAITING_INPUT`, and no write. The operator must edit and preview the whole request again.

## 3. Add, edit, remove, and control

Apply one Arabic or English `CREATE_TASK` preview above. Find the created disposable ID with `GET /api/tasks?search=SMOKE-...`, then exercise:

| Capability | Prompt | Expected |
| --- | --- | --- |
| Edit | `operation: UPDATE_TASK \| task: <TASK_ID> \| status: IN_PROGRESS \| priority: HIGH` | One `UPDATE_TASK`, risk `LOW`, old and new values visible; apply updates exactly that task |
| Remove | `operation: DELETE_TASK \| task: <TASK_ID>` | One `DELETE_TASK`, risk `MEDIUM`; apply removes exactly the disposable task |
| Project control | `operation: UPDATE_PROJECT_STATUS \| project: <SAFE_PROJECT_ID> \| status: <DIFFERENT_STATUS>` | One `UPDATE_PROJECT_STATUS`, risk `MEDIUM`, correct current/new status; **preview only** |
| Supplier control | `operation: UPDATE_SUPPLIER_ORDER_STATUS \| supplier order: <SAFE_ORDER_ID> \| status: <DIFFERENT_STATUS>` | One `UPDATE_SUPPLIER_ORDER_STATUS`, risk `MEDIUM`, correct project/supplier/current/new status; **preview only** |

The current model-enabled set is `CREATE_CLIENT`, `CREATE_ORDER_BUNDLE`, `UPDATE_PROJECT_STATUS`, `CREATE_TASK`, and `ADD_PROJECT_ITEM`. Sensitive edit/remove operations and supplier-order control are intentionally deterministic-only; the assistant still previews and executes them through registered server handlers. Confirm that `status.operationContract.modelEnabledKinds` and `registeredKinds` reflect that split.

For each applied task action, verify the result through `GET /api/tasks`, then confirm history contains one run, one approval, one data job, the correct actor, and a recovery artifact. No unrelated row may change.

## 4. Ambiguity must fail closed

Create two disposable tasks with the exact title `SMOKE-DUP-<STAMP>`, then preview:

```text
operation: UPDATE_TASK | task: SMOKE-DUP-<STAMP> | status: DONE
```

Require a blocking ambiguity message, `planToken === null`, no confirm/apply control, and no database change. Repeat with one exact numeric task ID and require exactly one action. Also verify each of these blocks with no token:

- `احذف كل المهام القديمة` (bulk destructive, no exact reference)
- `operation: UPDATE_TASK | task: <TASK_ID> | status: MAYBE` (invalid enum)
- one valid line plus one unclear line (the valid action may be shown, but the whole preview remains non-executable)

## 5. API tamper, subset, and replay checks

Use DevTools Console so the authenticated browser cookie is reused:

```js
async function hatabApi(path, options = {}) {
  const response = await fetch(path, { cache: "no-store", ...options });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: response.status, body };
}
const postJson = (body) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
```

Reuse the five-action single-sentence preview from section 2 and save its response as `preview`. Do not paste its token into tickets or logs.

- `confirmed: false` must return 400.
- Repeated `actionIds` must return 400.
- An unknown action ID must return 400.
- Change the first character of the signature segment, append a third `.unsigned` segment, or pair the token with another valid-looking `runId`; each must return 409/400 and write nothing.
- Apply only two selected actions. Require HTTP 200, `duplicate === false`, `status === "SUCCESS"`, and only those tasks to exist.
- Replay the byte-equivalent apply body. Require HTTP 200, `duplicate === true`, the same `jobId`, and no second task, approval, message, or mutation.
- Reuse the completed token/run with a different action subset. Require 409 because the completed selected-plan hash differs.
- Keep a separate preview for more than 10 minutes, then apply it. Require 409 and no write.

Do not rotate or corrupt the real active model for a manual smoke test. Active-model switch, registry mismatch, adapter/config/manifest/evaluation tamper, incomplete identity, and concurrent execution claims are covered by `test:ai-run-ledger`, `test:ai-active-model`, and `test:admin-assistant` using isolated fixtures.

## 6. Pass criteria

Pass only when all of the following are true:

- Registry, `/health`, app status, and every local-model preview identify the exact same promoted model and contract.
- Arabic, English, mixed-language, and Arabic-digit inputs produce grounded equivalent operations without invented values.
- Add/edit/remove work only after review and explicit confirmation; control previews show correct before/after state.
- Ambiguous, incomplete, expired, tampered, cross-run, changed-subset, or concurrent/replayed requests fail closed.
- Exact successful replay is idempotent, and every successful write has one actor-bound ledger trail and recovery artifact.

Capture the stamp, active key, model identity SHA, contract hash, run IDs, job IDs, HTTP statuses, before/after task queries, and screenshots in the release record. Never capture the service key or full signed plan token.
