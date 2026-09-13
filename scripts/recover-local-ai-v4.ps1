param(
  [ValidatePattern('^[a-z0-9-]+$')][string]$RunTag = 'v4-recovery-20260913',
  [int]$Steps = 160,
  [int]$MaxLength = 4096,
  [switch]$PrepareOnly
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$RuntimeRoot = 'D:\hatab-local-ai'
$Python = Join-Path $RuntimeRoot '.venv\Scripts\python.exe'
$StageOne = Join-Path $RuntimeRoot 'artifacts\qwen3-0.6b-hatab-lora-stage1-v4-pinned-c1899de2'
$Candidate = Join-Path $RuntimeRoot "artifacts\qwen3-0.6b-hatab-lora-$RunTag"
$Dataset = Join-Path $ProjectRoot "local-ai\data\$RunTag"
$Evaluation = Join-Path $ProjectRoot 'local-ai\reports\adapter-candidate-v4-golden-v2.json'
$Readiness = Join-Path $ProjectRoot 'local-ai\reports\model-readiness-v4.json'

function Invoke-Checked {
  param([string]$FilePath, [string[]]$Arguments)
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Command failed with exit code ${LASTEXITCODE}: $FilePath $($Arguments -join ' ')" }
}

Set-Location -LiteralPath $ProjectRoot
$env:HF_HOME = Join-Path $RuntimeRoot 'hf-cache'
$env:HF_HUB_OFFLINE = '1'
$env:TRANSFORMERS_OFFLINE = '1'
$env:PYTHONUTF8 = '1'
$env:HATAB_LOCAL_AI_PYTHON = $Python
$env:TEMP = Join-Path $RuntimeRoot 'temp'
$env:TMP = $env:TEMP

# The completed first stage is immutable. Reuse its weights only after checking
# the pinned base, operation contract, and both adapter artifact checksums.
$Manifest = Get-Content -LiteralPath (Join-Path $StageOne 'hatab-training-manifest.json') -Raw | ConvertFrom-Json
if ($Manifest.baseModelRevision -ne 'c1899de289a04d12100db370d81485cdf75e47ca') { throw 'Stage-one base revision mismatch.' }
foreach ($Entry in @(@{File='adapter_model.safetensors';Hash=$Manifest.adapterModelSha256}, @{File='adapter_config.json';Hash=$Manifest.adapterConfigSha256})) {
  $Observed = (Get-FileHash -LiteralPath (Join-Path $StageOne $Entry.File) -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($Observed -ne $Entry.Hash) { throw "Stage-one artifact checksum mismatch: $($Entry.File)" }
}
Invoke-Checked $Python @('local-ai\generate_dataset.py', '--output', $Dataset)
$DatasetManifest = Get-Content -LiteralPath (Join-Path $Dataset 'manifest.json') -Raw | ConvertFrom-Json
if ($Manifest.contractSha256 -ne $DatasetManifest.contractSha256) {
  # Reviewed additive training transition: same 14 operation kinds, explicit
  # unitPrice/unitCost fields and 25-action batch support. This permits only
  # further training from these exact artifacts, never direct serving.
  $ReviewedSource = 'f97ff4b2b4309c19893dd8b4ed304aec45c7303a27abb805844a3576b95d612d'
  $ReviewedTarget = '7e03d9e0daabe53e0866aa7999d8069c6087a39da45b92e8e8b3dbb302748ec3'
  if ($Manifest.contractSha256 -ne $ReviewedSource -or $DatasetManifest.contractSha256 -ne $ReviewedTarget) {
    throw 'Contract changed outside the reviewed additive training transition.'
  }
  Write-Output 'Validated reviewed contract v2-to-v3 training transition; promotion gates remain unchanged.'
}
Invoke-Checked $Python @('local-ai\dataset_validation.py', '--train', (Join-Path $Dataset 'train.jsonl'), '--eval', (Join-Path $Dataset 'eval.jsonl'), '--manifest', (Join-Path $Dataset 'manifest.json'))
if ($PrepareOnly) { Write-Output 'Recovery dataset validated; original stage-one artifacts verified and preserved.'; exit 0 }

# Prompt adaptation is recorded in a new candidate. It does not grant serving
# rights: evaluation, readiness, promotion, and startup retain their strict gates.
Invoke-Checked $Python @(
  'local-ai\train_lora.py', '--base-model', 'Qwen/Qwen3-0.6B',
  '--train', (Join-Path $Dataset 'train.jsonl'), '--resume-adapter', $StageOne,
  '--allow-legacy-resume', '--natural-only', '--sampling-policy', 'balanced-round-robin',
  '--max-steps', [string]$Steps, '--gradient-accumulation', '1', '--batch-size', '1',
  '--max-length', [string]$MaxLength, '--threads', '6', '--learning-rate', '0.00005',
  '--abstention-weight', '2', '--multi-action-weight', '2', '--output', $Candidate
)
Invoke-Checked $Python @('local-ai\evaluate_adapter.py', '--base-model', 'Qwen/Qwen3-0.6B', '--adapter', $Candidate, '--golden', 'local-ai\data\golden-evaluation.v2.jsonl', '--threads', '6', '--require-gates', '--output', $Evaluation)
Invoke-Checked $Python @('local-ai\model_readiness.py', '--adapter', $Candidate, '--evaluation-report', $Evaluation, '--require-ready', '--output', $Readiness)
Invoke-Checked 'node' @('scripts\promote-local-ai-model.mjs', '--readiness', $Readiness, '--dry-run')
Invoke-Checked 'node' @('scripts\promote-local-ai-model.mjs', '--readiness', $Readiness)
Invoke-Checked 'powershell' @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'local-ai\start.ps1', '-Background', '-WaitSeconds', '180')
Write-Output 'Recovered V4 candidate passed all promotion gates and is serving.'
