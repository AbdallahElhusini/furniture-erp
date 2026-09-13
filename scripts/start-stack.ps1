param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$NextArguments
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$AiLauncher = Join-Path $ProjectRoot 'local-ai\start.ps1'
$NextExecutable = Join-Path $ProjectRoot 'node_modules\.bin\next.cmd'

try {
  & powershell -NoProfile -ExecutionPolicy Bypass -File $AiLauncher -Background -WaitSeconds 120
} catch {
  Write-Warning "The website will start with deterministic fallback because local AI was not ready: $($_.Exception.Message)"
}

# Local by default. A deliberate --hostname/-H argument can opt into LAN access.
if (($NextArguments -notcontains '--hostname') -and ($NextArguments -notcontains '-H')) {
  $NextArguments = @('--hostname', '127.0.0.1') + @($NextArguments)
}
& $NextExecutable start @NextArguments
exit $LASTEXITCODE
