# Local AI execution assistant

## Purpose

The local model understands informal Arabic, Egyptian Arabic, and English ERP requests. It is an extraction component, not an autonomous database agent.

## Trust boundary

```text
Employee text
  -> deterministic parser
  -> read-only structured retrieval from the live ERP
  -> local Qwen extractor for unresolved text only
     + read-only active-model identity-marker attestation
  -> strict allowlist + deterministic re-parse
  -> database reference resolution
  -> human preview
  -> signed 10-minute plan
  -> explicit confirmation
  -> pre-operation backup
  -> one audited transaction
```

The Python service:

- binds only to `127.0.0.1:11437`;
- has no Prisma import, database path, session cookie, business-data query, write credential, or execution API;
- reads only the non-sensitive `D:\hatab-local-ai\active-model.json` identity marker to re-attest the promoted model on health and extraction calls; promotion writes that marker atomically after registry activation;
- receives only bounded, read-only entity matches selected by the Next.js layer;
- emits only operations currently marked `modelEnabled: true` in the canonical contract;
- may echo a user-supplied reference, including a numeric reference, but cannot resolve or choose a database ID;
- cannot supply prices, resolved execution payloads, or arbitrary action types.

The Next.js layer rejects unknown fields, invalid enums, bad dates, quantities outside `1..10000`, duplicate actions, malformed JSON, timeouts, and unavailable-model responses. Retrieved context cannot introduce a value that was absent from the employee request. In every failure mode, unresolved text remains blocked; structured commands still use the deterministic parser.

## Action coverage and ownership

`contracts/admin-assistant-operations.v2.json` is the sole operation-schema authority. Fourteen operations are registered for the deterministic application pipeline. The local model is currently enabled for only five:

- `CREATE_CLIENT`
- `CREATE_ORDER_BUNDLE`
- `UPDATE_PROJECT_STATUS`
- `CREATE_TASK`
- `ADD_PROJECT_ITEM`

The following nine operations remain deterministic-only until their candidate data, adapter, and golden gates are explicitly promoted: `UPDATE_CLIENT`, `DELETE_CLIENT`, `UPDATE_PROJECT`, `DELETE_PROJECT`, `UPDATE_PROJECT_ITEM`, `REMOVE_PROJECT_ITEM`, `UPDATE_TASK`, `DELETE_TASK`, and `UPDATE_SUPPLIER_ORDER_STATUS`.

The combined signed execution plan supports all registered operations:

- create, update, and safely delete an unlinked client;
- create a customer order bundle with the client, project/order, product, quantity, prices, supplier, delivery, priority, and notes shown in preview;
- update or delete a project/order;
- add, set, or remove a project item while synchronizing editable supplier-order lines and totals;
- create, update, or delete a task;
- control project, project-item, task, and supplier-order statuses.

Delete operations are high-risk actions. They require an explicit selected action, confirmation, a signed plan, a current-record recheck, and an `OPERATIONS` recovery backup. Items already shipped or delivered cannot be changed or removed through the assistant.

Preview actions expose their resolved fields and before/after values. The employee may deselect individual actions; the server validates that every selected ID belongs to the signed plan before applying the selected subset in one transaction.

## Model and data

- Base: `Qwen/Qwen3-0.6B` (Apache-2.0), pinned in code to Hugging Face commit `c1899de289a04d12100db370d81485cdf75e47ca`. Training and evaluation resolve that concrete revision directly; no caller-supplied revision or mutable `main` ref is trusted. Runtime continues using the promoted concrete snapshot even if `main` later moves.
- Adapter: LoRA on `q_proj` and `v_proj`, rank 8.
- Dataset: synthetic customer names, phones, projects, and wording variants. Only published catalog SKUs and supplier names are read from the ERP because they are non-customer business metadata.
- Manifest: records the exact base revision, a sorted SHA-256 map of every regular file in that cached snapshot and its canonical aggregate hash, dataset and adapter hashes, contract and prompt hashes, action coverage, deterministic sampling evidence, token limits, optimizer settings, and Python/Torch/Transformers/PEFT runtime versions. Code also pins the expected aggregate and the `config.json`, `model.safetensors`, and `tokenizer.json` hashes, so a self-consistent but unknown snapshot still fails closed.

Large model files remain under `D:\hatab-local-ai`; the application repository only holds code, manifests, tests, and small reports.

## Runtime wire contract

The application sends `POST /extract` only for text left unresolved by the deterministic parser. The authenticated JSON request has no additional fields:

| Field | Meaning |
| --- | --- |
| `message` | Non-empty unresolved employee text, maximum 8,000 characters |
| `context` | Optional bounded, read-only retrieval hints, maximum 6,000 characters |
| `schemaVersion` | Current operation schema identity |
| `contractVersion` | Current numeric contract version |
| `contractHash` | Current lowercase semantic SHA-256 |

The service returns `actions`, `unparsed`, `schemaVersion`, `contractVersion`, `contractHash`, `contractSha256`, and `latencyMs`. It also returns the following immutable promoted-model binding on every successful extraction:

| Field | Evidence bound to the result |
| --- | --- |
| `activeModelKey` | Active model-registry key |
| `baseModel` | Base-model identifier |
| `baseModelRevision` | Exact approved 40-character Hugging Face commit |
| `baseModelArtifactSha256` | Aggregate hash of the complete pinned base-model snapshot file map |
| `adapter` | Canonical adapter artifact-directory path |
| `adapterModelSha256` | Adapter weights hash |
| `adapterConfigSha256` | Adapter configuration hash |
| `adapterManifestSha256` | Training-manifest hash recorded at promotion |
| `evaluationReportSha256` | Passing golden-evaluation report hash |
| `readinessSemanticSha256` | Canonical semantic readiness evidence hash verified at promotion |
| `promptSha256` | Exact runtime system-prompt hash |
| `modelIdentitySha256` | Canonical aggregate identity hash binding base, adapter, evaluation, contract, and prompt evidence |
| `promotionVerified` | Must be exactly `true` |

All string fields above must be non-empty and every SHA-256 must be 64 lowercase hexadecimal characters. The response may also carry `model` as a compatibility display alias for `baseModel`; it does not substitute for the required binding. The model-generated body itself must be exactly one JSON envelope; prose, Markdown fences, extra fields inside that envelope, disabled action kinds, and ungrounded values are rejected. Next.js independently requires the response `schemaVersion`, `contractVersion`, and `contractHash` to equal its loaded contract, then validates the action envelope and the complete promoted-model binding. Missing, malformed, unpromoted, or drifted evidence forces deterministic fallback. The accepted binding is signed into the plan and persisted with the run ledger; deterministic-only runs store no model binding.

`GET /health` and `/api/admin-assistant/status` use deliberately different status layers:

| Field | Owner | Exact interpretation |
| --- | --- | --- |
| `status` | Python service | `ready` means the promoted, attested adapter is loaded; `loading` means attestation passed but weights are not yet loaded; `incompatible` means attestation failed. |
| `adapterContractStatus` | Python service | Full adapter/promotion-attestation result: `compatible` or `incompatible`. Its blockers are exposed in `adapterContractErrors`. |
| `productionReady` | Python service | True only when the adapter is both loaded and its registry-supplied model identity, artifact hashes, passing evaluation, contract, prompt, runtime, enabled-kind coverage, and balanced-sampling evidence all verify. |
| `contractCompatible` | Next.js | Calculated by comparing health `schemaVersion`, `contractVersion`, and `contractHash` with the application contract. |
| `identityVerified` | Next.js | True only when every required promoted-model identity field is present and structurally valid. |
| `available` | Next.js | True only when `status === "ready"`, `contractCompatible === true`, `productionReady === true`, and `identityVerified === true`. This is the application decision to call the model. |
| `adapterContractErrors` | Python → Next.js | Machine-readable blockers for operator diagnosis; never treat an empty list alone as readiness. |

The authenticated admin status endpoint returns the normalized operational view plus the complete immutable `modelBinding` when identity validation succeeds. It also returns `operationContract` with the registered/model-enabled kind lists and safety flags, and is sent with `Cache-Control: no-store`. The UI badge maps the normalized state to available, loaded-but-unverified (a defensive/legacy health state), contract-drift, or deterministic-fallback messaging; a collapsed identity panel exposes every binding value for operator comparison. Status is informational: an actual model extraction must return the same complete binding, the signed plan carries it, and the run ledger independently resolves it to the exact active registry record before preview finalization and execution. When local inference is unavailable or rejected, the deterministic parser continues; no model failure authorizes a write.

## Operational checks

1. Run `npm run ai:storage-migrate` once per database before the first promotion; it creates the model registry and assistant run-ledger storage.
2. Run `npm run ai:setup` once per machine to prepare the isolated runtime under `D:\hatab-local-ai`.
3. Run `powershell -ExecutionPolicy Bypass -File .\local-ai\preflight.ps1`. This is deterministic and does not load or train a model.
4. Run `npm run ai:train` only in a maintenance window. It is synchronous and potentially long-running; it regenerates and validates the corpus, trains both stages into new pinned artifact paths, evaluates the golden suite, and writes `local-ai/reports/model-readiness-v2.json`. Each stage refuses a non-empty output directory to prevent overwriting provenance. Do not promote if it exits non-zero.
5. Run `npm run ai:promote -- --dry-run` and review `productionReady`, blockers, artifact/manifest hashes, contract hash, prompt hash, dataset validation hash, and golden gates.
6. Run `npm run ai:promote` only after the dry run reports `productionReady: true` with no blockers.
7. Run `npm run ai:active-model`; success proves exactly one registry entry is active and its adapter checksum and promotion evidence remain intact.
8. Run `npm start`. It resolves the verified registry entry, waits for the local model, and then starts Next.js. If local AI cannot start, the stack logs a warning and starts the website in deterministic-fallback mode. `npm run start:web` intentionally starts only Next.js.
9. Open `/admin/assistant` and verify the model badge. `ready` at the Python layer is insufficient; the application-level `available` field must be true.
10. Every proposed action must still be reviewed and explicitly confirmed in the ERP.

Model promotion accepts no caller-supplied model key, artifact path, checksum, prompt version, or contract version. It reads those values from the candidate readiness report, regenerates that report through `model_readiness.py --require-ready`, independently hashes the immutable adapter files and current contract, and verifies the embedded training manifest and golden report. Activation and retirement of the prior `AiModelVersion` happen in one immediate database transaction. A repeated promotion of the same active artifact is a no-op. The command never writes to the adapter directory.

To promote a non-default readiness report, pass only its path:

```powershell
npm run ai:promote -- --readiness .\local-ai\reports\model-readiness-v2.json --dry-run
```

Do not expose port 11437 outside localhost and do not add the ERP database path to the service environment. Do not launch Uvicorn directly unless `HATAB_LOCAL_AI_SECRET` is already set; the supported stack launcher is responsible for creating and applying the service credential.

The supported stack creates a 256-bit service key at `D:\hatab-local-ai\service.key` on first launch and restricts the file to the current Windows identity. The web server reads the same key; `/health` and `/extract` reject unauthenticated requests. Never print, commit, or pass that key on a command line. The extractor rejects stale request/response contract identities and refuses extraction when the adapter compatibility gate fails.
