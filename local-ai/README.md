# HATAB private ERP model

This directory contains the isolated local intent model for the ERP assistant. The model only converts Arabic, Egyptian Arabic, or English text into an allowlisted action schema and cannot execute an action. It has no ERP database path or credential. Every health check and extraction re-attests the promoted model against the non-sensitive, atomically written `D:\hatab-local-ai\active-model.json` identity marker. The Next.js layer may attach a bounded read-only list of matching ERP references; values still have to be grounded in the employee's own message before they can enter a signed plan.

The complete operator runbook and wire/status field definitions are in `../docs/local-ai-assistant.md`.

The Next.js application may attach a bounded, display-only list of live entity matches to an extraction request. That context is reference-only: retrieval remains read-only inside Next.js, the Python service never receives database access, and every emitted value is still grounded against the original employee text before a plan can be created.

## Selected model

`Qwen/Qwen3-0.6B` is Apache-2.0 licensed, multilingual, small enough for the current CPU-only machine, and supports the chat template used for structured extraction. Training and evaluation resolve the code-pinned commit `c1899de289a04d12100db370d81485cdf75e47ca` directly; there is no caller-controlled revision and a mutable `main` ref is ignored. The manifest records a sorted SHA-256 map of every regular file in that resolved snapshot plus its canonical aggregate hash, while code pins the aggregate and key model/config/tokenizer file hashes. Readiness re-hashes that concrete snapshot before promotion; runtime then stays on the promoted commit if `main` later moves. A LoRA adapter is trained over synthetic HATAB ERP commands. Real customer names, phone numbers, and orders are excluded.

The source of truth for model-output fields is `../contracts/admin-assistant-operations.v2.json`. Python prompts, validation, serving, dataset reports, and evaluation reports all include its semantic SHA-256. Only operations marked `modelEnabled: true` are advertised to or accepted from the active model. Registered but disabled operations remain available to deterministic application code and candidate datasets, but cannot cross the model-serving boundary until a matching adapter passes the golden gate.

## Runtime directories

All large files are placed on `D:\hatab-local-ai`:

- `.venv`: Python runtime
- `hf-cache`: Hugging Face model cache
- `artifacts`: LoRA adapters
- `logs`: local service logs

## Commands

The supported first-time and promotion flow is:

```powershell
npm run ai:storage-migrate
npm run ai:setup
powershell -ExecutionPolicy Bypass -File .\local-ai\preflight.ps1
npm run ai:train
npm run ai:promote -- --dry-run
npm run ai:promote
npm run ai:active-model
npm start
```

Training is synchronous and can be long-running. Run it only in a maintenance window, and never skip the preflight, dry run, or active-model verification. Each training stage refuses a non-empty output directory, so use a new artifact path rather than overwriting evidence from an earlier or interrupted run. `npm run ai:start` starts only the verified local service in the background; `npm start` is the supported full-stack launch and degrades the web application to deterministic parsing if the local service cannot start. See the operator runbook before using non-default readiness paths or training step counts.

Before any tuning run, validate the checked-in corpus and bilingual golden suite:

```powershell
powershell -ExecutionPolicy Bypass -File .\local-ai\preflight.ps1
```

The preflight is deterministic and does not load or train a model. It runs the Python tests, `dataset_validation.py`, full-corpus and natural-only sampling previews, `evaluate_golden.py`, and `model_readiness.py`. Sampling evidence is written to `local-ai/reports/sampling-preflight-v2.json` and `local-ai/reports/sampling-natural-preflight-v2.json`.

`dataset_validation.py` fails on contract/prompt drift, malformed outputs, model-disabled or unregistered actions, missing enabled-action coverage, manifest hash mismatches, and exact train/eval leakage. `evaluate_golden.py` validates Arabic, English, and code-switch scenarios plus ambiguity, unsupported, bulk-destructive, prompt-injection, invalid-type, missing-patch, invalid-enum, and extra-field cases.

`train_lora.py` safely defaults to deterministic `balanced-round-robin` sampling. It independently shuffles each action/abstention bucket from the recorded seed, oversamples every bucket to the largest source bucket, and interleaves one row from every bucket per cycle. This prevents `CREATE_ORDER_BUNDLE` from starving rarer operations or negative examples during short CPU runs. Both stages in `train.ps1` explicitly select this policy. The final adapter manifest records the policy, source and sampled counts, oversampling counts, required coverage, abstention presence, seed, and sampled-order SHA-256. Use `--sampling-policy natural` only for a deliberate experiment; such an adapter is rejected by the production readiness gate.

The `--natural-only` second stage is also coverage-gated: every currently model-enabled kind plus explicit abstention rows must remain after pipe-delimited prompts are removed. The checked-in generator includes natural Arabic, English, and code-switch task commands so `CREATE_TASK` is represented in that slice. Any future generator change that drops an enabled kind fails tests and stops training before the model is loaded.

`model_readiness.py` is the promotion gate that does not load the model. It combines corpus/fixture validity with adapter-manifest compatibility, balanced-sampling evidence, artifact hashes, runtime versions, and the scored golden report. Use `--require-ready` in deployment automation. Its stable report path is `local-ai/reports/model-readiness-v2.json`; promotion must require top-level `productionReady: true` and preserve `readinessSha256`, `adapter.manifestSha256`, and `evaluation.reportSha256` for the audit ledger.

Score a running service without enabling future actions:

```powershell
$HatabAiKey = (Get-Content -LiteralPath 'D:\hatab-local-ai\service.key' -Raw).Trim()
python .\local-ai\evaluate_golden.py --endpoint http://127.0.0.1:11437 --scope model --api-key $HatabAiKey
```

To prepare candidate data for all registered actions, use `generate_dataset.py --include-disabled`. That flag is for offline candidate training/evaluation only. It does not change `modelEnabled` and does not authorize serving those actions.

The service only binds to `127.0.0.1:11437`. The stack launcher creates a 256-bit local key at `D:\hatab-local-ai\service.key` on first start, restricts its ACL to the current Windows identity, and shares it with the ERP through `HATAB_LOCAL_AI_SECRET_FILE`. An explicit `HATAB_LOCAL_AI_SECRET` overrides the file when deployment secret management is available.

Runtime status is fail-closed. Python reports `status: "ready"` only when a promoted, fully attested adapter is loaded, and `productionReady: true` only for that same state. Next.js still independently reports `available: true` only when the service is ready, the Python and TypeScript contract identities match, and production readiness is true. The supported launcher resolves the adapter and immutable evidence from the promoted-model registry before starting Python. `/extract` requires `schemaVersion`, `contractVersion`, and `contractHash` on every request and repeats those identities in every successful response; either side rejects drift.

Every successful `/extract` response also carries the required promoted-model binding: `activeModelKey`, `baseModel`, exact `baseModelRevision`, aggregate `baseModelArtifactSha256`, canonical `adapter` path, `adapterModelSha256`, `adapterConfigSha256`, `adapterManifestSha256`, `evaluationReportSha256`, `promptSha256`, aggregate `modelIdentitySha256`, and `promotionVerified: true`. Next.js rejects the entire model result if any field is absent or malformed, signs the accepted binding into the preview plan, and persists it with the run ledger. A health badge is operational status only; it is not model provenance for a run.

The web application must validate model output with the deterministic parser, resolve database references, show field-level before/after details, require confirmation, create a backup, and audit the transaction. Never grant the Python service database or filesystem access to the ERP database. A newly trained adapter is not production-compatible merely because training finished: its manifest must match the current contract/prompt hashes, cover every enabled kind, and pass the golden gates before promotion.
