$ErrorActionPreference = 'Stop'
$Root = 'D:\hatab-local-ai'
$Venv = Join-Path $Root '.venv'
$Temp = Join-Path $Root 'temp'
$env:HF_HOME = Join-Path $Root 'hf-cache'
$env:PIP_CACHE_DIR = Join-Path $Root 'pip-cache'
$env:TEMP = $Temp
$env:TMP = $Temp

New-Item -ItemType Directory -Force -Path $Root, $Temp, $env:HF_HOME, $env:PIP_CACHE_DIR | Out-Null
if (-not (Test-Path (Join-Path $Venv 'Scripts\python.exe'))) {
  & 'C:\Users\Abdallah\AppData\Local\Programs\Python\Python311\python.exe' -m venv $Venv
}
$Python = Join-Path $Venv 'Scripts\python.exe'
& $Python -m pip install --upgrade pip wheel
& $Python -m pip install -r (Join-Path $PSScriptRoot 'requirements.txt')
& $Python -c "import torch, transformers, peft, fastapi; print({'torch': torch.__version__, 'transformers': transformers.__version__, 'peft': peft.__version__})"
