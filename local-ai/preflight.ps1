param(
  [string]$PythonCommand = 'python',
  [string]$Adapter = 'D:\hatab-local-ai\artifacts\qwen3-0.6b-hatab-lora-candidate-v3-pinned-c1899de2',
  [string]$EvaluationReport = '',
  [switch]$RequireProductionReady
)
$ErrorActionPreference = 'Stop'

function Invoke-CheckedPython {
  param([string[]]$Arguments)
  & $PythonCommand @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Python preflight failed with exit code ${LASTEXITCODE}: $($Arguments -join ' ')"
  }
}

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Push-Location $RepoRoot
try {
  Invoke-CheckedPython -Arguments @('-m', 'unittest', 'discover', '-s', 'local-ai/tests', '-p', 'test_*.py', '-v')
  Invoke-CheckedPython -Arguments @('local-ai/dataset_validation.py', '--output', 'local-ai/reports/dataset-validation-v2.json')
  Invoke-CheckedPython -Arguments @('local-ai/sampling.py', '--policy', 'balanced-round-robin', '--output', 'local-ai/reports/sampling-preflight-v2.json')
  Invoke-CheckedPython -Arguments @('local-ai/sampling.py', '--policy', 'balanced-round-robin', '--natural-only', '--output', 'local-ai/reports/sampling-natural-preflight-v2.json')
  Invoke-CheckedPython -Arguments @('local-ai/evaluate_golden.py', '--output', 'local-ai/reports/golden-suite-validation-v2.json')
  $ReadinessArguments = @('local-ai/model_readiness.py', '--adapter', $Adapter, '--output', 'local-ai/reports/model-readiness-v2.json')
  if ($EvaluationReport) { $ReadinessArguments += @('--evaluation-report', $EvaluationReport) }
  if ($RequireProductionReady) { $ReadinessArguments += '--require-ready' }
  Invoke-CheckedPython -Arguments $ReadinessArguments
} finally {
  Pop-Location
}
