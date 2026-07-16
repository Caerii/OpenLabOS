$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$toolsDir = Join-Path $repoRoot ".tmp\tools"
$cloudflaredPath = Join-Path $toolsDir "cloudflared.exe"
$downloadUrl = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"

New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null

Write-Host "[OpenLabOS] Installing workspace-local cloudflared..."
Write-Host "[OpenLabOS] Target: $cloudflaredPath"
Invoke-WebRequest -Uri $downloadUrl -OutFile $cloudflaredPath

& $cloudflaredPath --version
Write-Host "[OpenLabOS] cloudflared installed. Start the tunnel with: pnpm local-agent:tunnel"
