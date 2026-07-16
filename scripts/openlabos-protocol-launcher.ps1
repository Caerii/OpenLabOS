$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $repoRoot ".tmp"
$logPath = Join-Path $logDir "openlabos-protocol-launcher.log"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

"[$(Get-Date -Format o)] Launch request: $($args -join ' ')" | Add-Content -Path $logPath

& (Join-Path $repoRoot "scripts\start-local-agent-stack.ps1") *>&1 | Tee-Object -FilePath $logPath -Append
