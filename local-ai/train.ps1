param(
  [int]$GeneralSteps = 240,
  [int]$GeneralAccumulation = 2,
  [int]$TargetedSteps = 160,
  [int]$MaxLength = 1024
)
$ErrorActionPreference = 'Stop'
$Root = 'D:\hatab-local-ai'
$env:HF_HOME = Join-Path $Root 'hf-cache'
$env:TRANSFORMERS_CACHE = Join-Path $env:HF_HOME 'transformers'
$env:TEMP = Join-Path $Root 'temp'
$env:TMP = $env:TEMP
$env:PYTHONUTF8 = '1'
$Python = Join-Path $Root '.venv\Scripts\python.exe'
$BaseModel = 'Qwen/Qwen3-0.6B'
function Invoke-CheckedPython {
  param([string[]]$Arguments)
  & $Python @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Python command failed with exit code ${LASTEXITCODE}: $($Arguments -join ' ')"
  }
}

Invoke-CheckedPython -Arguments @((Join-Path $PSScriptRoot 'generate_dataset.py'))
Invoke-CheckedPython -Arguments @((Join-Path $PSScriptRoot 'dataset_validation.py'))
Invoke-CheckedPython -Arguments @((Join-Path $PSScriptRoot 'evaluate_golden.py'))
$StageOne = Join-Path $Root 'artifacts\qwen3-0.6b-hatab-lora-stage1-v4-pinned-c1899de2'
$Candidate = Join-Path $Root 'artifacts\qwen3-0.6b-hatab-lora-candidate-v4-pinned-c1899de2'
Invoke-CheckedPython -Arguments @((Join-Path $PSScriptRoot 'train_lora.py'), '--base-model', $BaseModel, '--sampling-policy', 'balanced-round-robin', '--max-steps', $GeneralSteps, '--gradient-accumulation', $GeneralAccumulation, '--batch-size', '1', '--max-length', $MaxLength, '--threads', '8', '--abstention-weight', '2', '--multi-action-weight', '2', '--output', $StageOne)
Invoke-CheckedPython -Arguments @((Join-Path $PSScriptRoot 'train_lora.py'), '--base-model', $BaseModel, '--sampling-policy', 'balanced-round-robin', '--max-steps', $TargetedSteps, '--gradient-accumulation', '1', '--batch-size', '1', '--max-length', $MaxLength, '--threads', '8', '--learning-rate', '0.00005', '--natural-only', '--abstention-weight', '2', '--multi-action-weight', '2', '--resume-adapter', $StageOne, '--output', $Candidate)
$EvaluationArguments = @(
  (Join-Path $PSScriptRoot 'evaluate_adapter.py'),
  '--base-model', $BaseModel,
  '--adapter', $Candidate,
  '--golden', (Join-Path $PSScriptRoot 'data\golden-evaluation.v2.jsonl'),
  '--require-gates',
  '--output', (Join-Path $PSScriptRoot 'reports\adapter-candidate-v4-golden-v2.json')
)
Invoke-CheckedPython -Arguments $EvaluationArguments
$CandidateReport = Join-Path $PSScriptRoot 'reports\adapter-candidate-v4-golden-v2.json'
Invoke-CheckedPython -Arguments @((Join-Path $PSScriptRoot 'model_readiness.py'), '--adapter', $Candidate, '--evaluation-report', $CandidateReport, '--require-ready', '--output', (Join-Path $PSScriptRoot 'reports\model-readiness-v4.json'))
Write-Output "Candidate passed the contract and golden gates: $Candidate"
Write-Output 'Promotion is intentionally separate. Review the readiness report, then use npm run ai:promote -- --dry-run; never activate by setting HATAB_LOCAL_AI_ADAPTER manually.'
