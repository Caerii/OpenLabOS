$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$tmpDir = Join-Path $repoRoot ".tmp"
$toolsDir = Join-Path $tmpDir "tools"
$cloudflaredPath = Join-Path $toolsDir "cloudflared.exe"
$apiLog = Join-Path $tmpDir "openlabos-api.log"
$webLog = Join-Path $tmpDir "openlabos-web.log"
$tunnelLog = Join-Path $tmpDir "openlabos-local-agent-tunnel.log"
$operatorUrl = if ($env:OPENLABOS_OPERATOR_URL) { $env:OPENLABOS_OPERATOR_URL } else { "http://localhost:5174/operate" }

New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null

function Test-PortListening([int]$Port) {
  return [bool](Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
}

function Start-HiddenPowerShell([string]$Command) {
  $ps = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
  Start-Process -FilePath $ps -ArgumentList "-NoExit", "-Command", $Command -WindowStyle Hidden -PassThru | Out-Null
}

function Get-TunnelUrl {
  if (!(Test-Path $tunnelLog)) { return $null }
  $text = Get-Content $tunnelLog -Raw -ErrorAction SilentlyContinue
  $match = [regex]::Match($text, "https://[a-zA-Z0-9-]+\.trycloudflare\.com")
  if ($match.Success) { return $match.Value }
  $match = [regex]::Match($text, "https://[a-zA-Z0-9.-]+\.ngrok[^\s]*")
  if ($match.Success) { return $match.Value.Trim('"', "'") }
  return $null
}

function Format-OperatorUrl([string]$TunnelUrl) {
  $separator = if ($operatorUrl.Contains("?")) { "&" } else { "?" }
  return "$operatorUrl${separator}localBackend=$TunnelUrl"
}

if (!(Test-Path $cloudflaredPath) -and $env:OPENLABOS_TUNNEL_PROVIDER -ne "ngrok") {
  & (Join-Path $repoRoot "scripts\install-cloudflared.ps1")
}

if (Test-PortListening 3847) {
  Write-Host "[OpenLabOS] Local agent already listening on http://localhost:3847"
} else {
  Write-Host "[OpenLabOS] Starting local agent on http://localhost:3847"
  $cmd = "Set-Location '$repoRoot'; `$env:CLOUD_MODE='false'; `$env:OPENLABOS_API_HOST='127.0.0.1'; pnpm local-agent *>&1 | Tee-Object -FilePath '$apiLog'"
  Start-HiddenPowerShell $cmd
}

if (Test-PortListening 5174) {
  Write-Host "[OpenLabOS] Local operator already listening on http://localhost:5174/operate"
} else {
  Write-Host "[OpenLabOS] Starting local operator on http://localhost:5174/operate"
  $cmd = "Set-Location '$repoRoot'; pnpm --filter @openlabos/web dev -- --host 0.0.0.0 *>&1 | Tee-Object -FilePath '$webLog'"
  Start-HiddenPowerShell $cmd
}

$cloudflaredRunning = [bool](Get-Process -Name cloudflared -ErrorAction SilentlyContinue)
if ($cloudflaredRunning) {
  Write-Host "[OpenLabOS] HTTPS tunnel process is already running"
} else {
  Write-Host "[OpenLabOS] Starting HTTPS tunnel for local agent"
  $cmd = "Set-Location '$repoRoot'; pnpm local-agent:tunnel *>&1 | Tee-Object -FilePath '$tunnelLog'"
  Start-HiddenPowerShell $cmd
}

Start-Sleep -Seconds 8

$tunnelUrl = Get-TunnelUrl
Write-Host ""
Write-Host "[OpenLabOS] Local operator: http://localhost:5174/operate"
Write-Host "[OpenLabOS] Local agent: http://localhost:3847"
if ($tunnelUrl) {
  Write-Host "[OpenLabOS] HTTPS local agent: $tunnelUrl"
  Write-Host "[OpenLabOS] Operator URL: $(Format-OperatorUrl $tunnelUrl)"
} else {
  Write-Host "[OpenLabOS] Tunnel URL not detected yet. Check: $tunnelLog"
}
