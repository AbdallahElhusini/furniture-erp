param(
  [switch]$Background,
  [int]$WaitSeconds = 120
)
$ErrorActionPreference = 'Stop'
$Root = 'D:\hatab-local-ai'
$env:HF_HOME = Join-Path $Root 'hf-cache'
$env:TRANSFORMERS_CACHE = Join-Path $env:HF_HOME 'transformers'
$env:PYTHONUTF8 = '1'
$Python = Join-Path $Root '.venv\Scripts\python.exe'
$Arguments = @('-m', 'uvicorn', 'serve:app', '--app-dir', $PSScriptRoot, '--host', '127.0.0.1', '--port', '11437')

# Create one local-only shared key on first start. The value is never printed,
# checked into source control, or passed on the command line.
$SecretFile = if ($env:HATAB_LOCAL_AI_SECRET_FILE) {
  $env:HATAB_LOCAL_AI_SECRET_FILE
} else {
  Join-Path $Root 'service.key'
}
$ServiceSecret = $env:HATAB_LOCAL_AI_SECRET
if (-not $ServiceSecret -and (Test-Path -LiteralPath $SecretFile)) {
  $ServiceSecret = (Get-Content -LiteralPath $SecretFile -Raw).Trim()
}
if (-not $ServiceSecret) {
  $SecretBytes = [byte[]]::new(32)
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($SecretBytes)
  $ServiceSecret = [Convert]::ToHexString($SecretBytes).ToLowerInvariant()
  [System.IO.File]::WriteAllText(
    $SecretFile,
    $ServiceSecret,
    [System.Text.UTF8Encoding]::new($false)
  )
}
if ($ServiceSecret.Length -lt 32) {
  throw 'HATAB local AI secret must contain at least 32 characters.'
}
$env:HATAB_LOCAL_AI_SECRET = $ServiceSecret
$env:HATAB_LOCAL_AI_SECRET_FILE = $SecretFile
try {
  $CurrentIdentity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
  & icacls.exe $SecretFile '/inheritance:r' '/grant:r' "$($CurrentIdentity):(F)" | Out-Null
} catch {
  Write-Warning 'Could not tighten the local AI key file ACL; review its filesystem permissions.'
}

$ActiveModelResolver = Join-Path (Split-Path -Parent $PSScriptRoot) 'scripts\resolve-active-local-ai-model.mjs'
$ResolvedModelJson = (& node $ActiveModelResolver 2>$null | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or -not $ResolvedModelJson) {
  throw 'No verified local AI model is active. The website will use deterministic fallback.'
}
try {
  $ResolvedModel = $ResolvedModelJson | ConvertFrom-Json
} catch {
  throw 'The active local AI model resolver returned invalid identity evidence.'
}

# The registry is authoritative. Always replace inherited adapter/model values so
# a shell-level override cannot bypass promotion or start stale model bytes.
$env:HATAB_LOCAL_AI_ADAPTER = [string]$ResolvedModel.artifactPath
$env:HATAB_LOCAL_AI_BASE_MODEL = [string]$ResolvedModel.baseModel
$env:HATAB_LOCAL_AI_BASE_MODEL_REVISION = [string]$ResolvedModel.baseModelRevision
$env:HATAB_LOCAL_AI_EXPECTED_BASE_ARTIFACT_SHA256 = [string]$ResolvedModel.baseModelArtifactSha256
$env:HATAB_LOCAL_AI_ACTIVE_MODEL_KEY = [string]$ResolvedModel.key
$env:HATAB_LOCAL_AI_EXPECTED_IDENTITY_SHA256 = [string]$ResolvedModel.identityHash
$env:HATAB_LOCAL_AI_ACTIVE_MARKER_PATH = Join-Path $Root 'active-model.json'
$env:HATAB_LOCAL_AI_EXPECTED_MODEL_SHA256 = [string]$ResolvedModel.adapterModelSha256
$env:HATAB_LOCAL_AI_EXPECTED_CONFIG_SHA256 = [string]$ResolvedModel.adapterConfigSha256
$env:HATAB_LOCAL_AI_EXPECTED_MANIFEST_SHA256 = [string]$ResolvedModel.adapterManifestSha256
$env:HATAB_LOCAL_AI_EXPECTED_EVALUATION_PATH = [string]$ResolvedModel.evaluationReportPath
$env:HATAB_LOCAL_AI_EXPECTED_EVALUATION_SHA256 = [string]$ResolvedModel.evaluationReportSha256
$env:HATAB_LOCAL_AI_EXPECTED_CONTRACT_SHA256 = [string]$ResolvedModel.contractSha256
$env:HATAB_LOCAL_AI_EXPECTED_PROMPT_SHA256 = [string]$ResolvedModel.promptSha256
$env:HATAB_LOCAL_AI_EXPECTED_READINESS_SHA256 = [string]$ResolvedModel.readinessSemanticSha256

function Get-HatabAiHealth {
  try {
    return Invoke-RestMethod -Uri 'http://127.0.0.1:11437/health' -Method Get -Headers @{ 'X-HATAB-AI-Key' = $ServiceSecret } -TimeoutSec 2
  } catch {
    return $null
  }
}

function Test-HatabAiIdentity {
  param($Response)
  if (-not $Response) { return $false }
  return (
    [string]$Response.activeModelKey -ceq [string]$ResolvedModel.key -and
    [string]$Response.modelIdentitySha256 -ceq [string]$ResolvedModel.identityHash -and
    [string]$Response.baseModel -ceq [string]$ResolvedModel.baseModel -and
    [string]$Response.baseModelRevision -ceq [string]$ResolvedModel.baseModelRevision -and
    [string]$Response.baseModelArtifactSha256 -ceq [string]$ResolvedModel.baseModelArtifactSha256 -and
    [string]$Response.adapter -ceq [string]$ResolvedModel.artifactPath -and
    [string]$Response.adapterModelSha256 -ceq [string]$ResolvedModel.adapterModelSha256 -and
    [string]$Response.adapterConfigSha256 -ceq [string]$ResolvedModel.adapterConfigSha256 -and
    [string]$Response.adapterManifestSha256 -ceq [string]$ResolvedModel.adapterManifestSha256 -and
    [string]$Response.evaluationReportSha256 -ceq [string]$ResolvedModel.evaluationReportSha256 -and
    [string]$Response.contractSha256 -ceq [string]$ResolvedModel.contractSha256 -and
    [string]$Response.promptSha256 -ceq [string]$ResolvedModel.promptSha256
  )
}

function Test-HatabAiReady {
  $Response = Get-HatabAiHealth
  return (
    (Test-HatabAiIdentity -Response $Response) -and
    $Response.status -eq 'ready' -and
    $Response.productionReady -eq $true -and
    $Response.promotionVerified -eq $true
  )
}

function Wait-HatabAiReady {
  param([int]$TimeoutSeconds)
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    if (Test-HatabAiReady) { return $true }
    Start-Sleep -Milliseconds 750
  } while ((Get-Date) -lt $deadline)
  return $false
}

$InitialHealth = Get-HatabAiHealth
if ($InitialHealth -and -not (Test-HatabAiIdentity -Response $InitialHealth)) {
  throw 'A different or unverified local AI model is already serving on 127.0.0.1:11437. Stop it before activating the current registry version.'
}
if (
  (Test-HatabAiIdentity -Response $InitialHealth) -and
  $InitialHealth.status -eq 'ready' -and
  $InitialHealth.productionReady -eq $true -and
  $InitialHealth.promotionVerified -eq $true
) {
  Write-Output 'HATAB local AI is already ready on 127.0.0.1:11437'
  exit 0
}

$PidFile = Join-Path $Root 'service.pid'
$ExistingProcess = $null
if (Test-Path -LiteralPath $PidFile) {
  $ExistingPid = (Get-Content -LiteralPath $PidFile -Raw).Trim()
  if ($ExistingPid -match '^\d+$') {
    $ExistingProcess = Get-Process -Id ([int]$ExistingPid) -ErrorAction SilentlyContinue
  }
}

if ($Background) {
  $LogDirectory = Join-Path $Root 'logs'
  New-Item -ItemType Directory -Force -Path $LogDirectory | Out-Null
  $Stdout = Join-Path $LogDirectory 'service.stdout.log'
  $Stderr = Join-Path $LogDirectory 'service.stderr.log'
  if (-not $ExistingProcess) {
    $process = Start-Process -FilePath $Python -ArgumentList $Arguments -WindowStyle Hidden -RedirectStandardOutput $Stdout -RedirectStandardError $Stderr -PassThru
    Set-Content -LiteralPath $PidFile -Value $process.Id
    Write-Output "Started HATAB local AI as PID $($process.Id); waiting for the model to load"
  } else {
    Write-Output "HATAB local AI PID $($ExistingProcess.Id) is still loading; waiting for readiness"
  }
  if (-not (Wait-HatabAiReady -TimeoutSeconds $WaitSeconds)) {
    throw "HATAB local AI did not become ready within $WaitSeconds seconds. Review $Stderr"
  }
  Write-Output 'HATAB local AI is ready'
} else {
  & $Python @Arguments
}
