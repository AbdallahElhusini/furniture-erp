param(
  [int]$GeneralSteps = 240,
  [int]$GeneralAccumulation = 2,
  [int]$TargetedSteps = 160,
  [int]$MaxLength = 1024
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$RuntimeRoot = 'D:\hatab-local-ai'
$Python = Join-Path $RuntimeRoot '.venv\Scripts\python.exe'
$StageOne = Join-Path $RuntimeRoot 'artifacts\qwen3-0.6b-hatab-lora-stage1-v4-pinned-c1899de2'
$Candidate = Join-Path $RuntimeRoot 'artifacts\qwen3-0.6b-hatab-lora-candidate-v4-pinned-c1899de2'
$Evaluation = Join-Path $ProjectRoot 'local-ai\reports\adapter-candidate-v4-golden-v2.json'
$Readiness = Join-Path $ProjectRoot 'local-ai\reports\model-readiness-v4.json'

$env:HF_HOME = Join-Path $RuntimeRoot 'hf-cache'
$env:TRANSFORMERS_CACHE = Join-Path $env:HF_HOME 'transformers'
$env:HF_HUB_OFFLINE = '1'
$env:TRANSFORMERS_OFFLINE = '1'
$env:PYTHONUTF8 = '1'
$env:TEMP = Join-Path $RuntimeRoot 'temp'
$env:TMP = $env:TEMP
$env:HATAB_LOCAL_AI_PYTHON = $Python

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$Arguments
  )
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code ${LASTEXITCODE}: $FilePath $($Arguments -join ' ')"
  }
}

Set-Location -LiteralPath $ProjectRoot
Invoke-Checked $Python @('local-ai\dataset_validation.py')
Invoke-Checked $Python @('local-ai\evaluate_golden.py')

Invoke-Checked $Python @(
  'local-ai\train_lora.py',
  '--base-model', 'Qwen/Qwen3-0.6B',
  '--sampling-policy', 'balanced-round-robin',
  '--max-steps', [string]$GeneralSteps,
  '--gradient-accumulation', [string]$GeneralAccumulation,
  '--batch-size', '1',
  '--max-length', [string]$MaxLength,
  '--threads', '8',
  '--abstention-weight', '2',
  '--multi-action-weight', '2',
  '--output', $StageOne
)

Invoke-Checked $Python @(
  'local-ai\train_lora.py',
  '--base-model', 'Qwen/Qwen3-0.6B',
  '--sampling-policy', 'balanced-round-robin',
  '--max-steps', [string]$TargetedSteps,
  '--gradient-accumulation', '1',
  '--batch-size', '1',
  '--max-length', [string]$MaxLength,
  '--threads', '8',
  '--learning-rate', '0.00005',
  '--natural-only',
  '--abstention-weight', '2',
  '--multi-action-weight', '2',
  '--resume-adapter', $StageOne,
  '--output', $Candidate
)

Invoke-Checked $Python @(
  'local-ai\evaluate_adapter.py',
  '--base-model', 'Qwen/Qwen3-0.6B',
  '--adapter', $Candidate,
  '--golden', 'local-ai\data\golden-evaluation.v2.jsonl',
  '--require-gates',
  '--output', $Evaluation
)

Invoke-Checked $Python @(
  'local-ai\model_readiness.py',
  '--adapter', $Candidate,
  '--evaluation-report', $Evaluation,
  '--require-ready',
  '--output', $Readiness
)

Invoke-Checked 'node' @('scripts\promote-local-ai-model.mjs', '--readiness', $Readiness, '--dry-run')
Invoke-Checked 'node' @('scripts\promote-local-ai-model.mjs', '--readiness', $Readiness)
Invoke-Checked 'powershell' @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'local-ai\start.ps1', '-Background', '-WaitSeconds', '180')

Write-Output 'HATAB local AI v4 passed every gate, was promoted, and is serving on 127.0.0.1:11437.'
