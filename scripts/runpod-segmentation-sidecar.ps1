param(
  [string]$PodHost,
  [int]$SshPort = 22,
  [string]$SshUser = "root",
  [string]$KeyPath = "$env:USERPROFILE\.ssh\runpod_openlabos_ed25519",
  [string]$RemoteDir = "/workspace/openlabos-perception",
  [int]$ServicePort = 8787,
  [string]$PublicUrl,
  [string]$Token,
  [ValidateSet("mock", "grounded_sam2")]
  [string]$Backend = "grounded_sam2",
  [switch]$Deploy,
  [switch]$Install,
  [switch]$Start,
  [switch]$Stop,
  [switch]$Smoke,
  [switch]$PrintDashboardEnv
)

$ErrorActionPreference = "Stop"

function Require-PodHost {
  if (-not $PodHost) {
    throw "PodHost is required for SSH actions. Use the RunPod Connect tab host/IP, e.g. -PodHost 213.x.x.x -SshPort 17445."
  }
}

function Invoke-Ssh {
  param([string]$Command)
  Require-PodHost
  & ssh -i $KeyPath -p $SshPort -o StrictHostKeyChecking=accept-new "$SshUser@$PodHost" $Command
  if ($LASTEXITCODE -ne 0) { throw "ssh command failed: $Command" }
}

function Copy-ToPod {
  param([string]$Source, [string]$Target)
  Require-PodHost
  & scp -i $KeyPath -P $SshPort -o StrictHostKeyChecking=accept-new $Source "$SshUser@$PodHost`:$Target"
  if ($LASTEXITCODE -ne 0) { throw "scp failed: $Source -> $Target" }
}

function New-Token {
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$sidecarDir = Join-Path $root "services\perception"
$tokenToUse = if ($Token) { $Token } else { New-Token }

if (-not ($Deploy -or $Install -or $Start -or $Stop -or $Smoke -or $PrintDashboardEnv)) {
  $Deploy = $true
  $Install = $true
  $Start = $true
  $Smoke = $true
  $PrintDashboardEnv = $true
}

if ($Deploy) {
  $tempZip = Join-Path ([System.IO.Path]::GetTempPath()) "openlabos-perception.zip"
  if (Test-Path -LiteralPath $tempZip) { Remove-Item -LiteralPath $tempZip -Force }
  Compress-Archive -Path (Join-Path $sidecarDir "*") -DestinationPath $tempZip -Force
  Invoke-Ssh "mkdir -p $RemoteDir"
  Copy-ToPod $tempZip "$RemoteDir/sidecar.zip"
  Invoke-Ssh "cd $RemoteDir && python3 - <<'PY'
import zipfile
with zipfile.ZipFile('sidecar.zip') as z:
    z.extractall('.')
PY"
}

if ($Install) {
  Invoke-Ssh "cd $RemoteDir && python3 -m venv .venv && . .venv/bin/activate && pip install --upgrade pip && pip install -r requirements.txt && pip install 'git+https://github.com/facebookresearch/sam2.git'"
}

if ($Stop) {
  Invoke-Ssh "pkill -f 'uvicorn app:app' || true"
}

if ($Start) {
  $remoteEnv = "LABOS_SEGMENTATION_BACKEND=$Backend LABOS_SEGMENTATION_TOKEN=$tokenToUse"
  Invoke-Ssh "cd $RemoteDir && pkill -f 'uvicorn app:app' || true"
  Invoke-Ssh "cd $RemoteDir && . .venv/bin/activate && nohup env $remoteEnv python -m uvicorn app:app --host 0.0.0.0 --port $ServicePort > sidecar.log 2>&1 &"
  Start-Sleep -Seconds 3
  Invoke-Ssh "tail -n 40 $RemoteDir/sidecar.log || true"
}

if ($Smoke) {
  $baseUrl = if ($PublicUrl) { $PublicUrl.TrimEnd("/") } elseif ($PodHost) { "http://$PodHost`:$ServicePort" } else { "" }
  if (-not $baseUrl) { throw "PublicUrl or PodHost is required for smoke testing." }
  $headers = @{ "Content-Type" = "application/json" }
  if ($tokenToUse) { $headers["Authorization"] = "Bearer $tokenToUse" }
  $health = Invoke-RestMethod -Method GET -Uri "$baseUrl/health" -Headers $headers -TimeoutSec 20
  Write-Host "[health] ok=$($health.ok) backend=$($health.backend) authRequired=$($health.authRequired)"

  $pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="
  $body = @{
    imageBase64 = $pngBase64
    prompts = @("mug", "kettle", "tea bag", "hand")
    includeMasks = $true
    includeTracks = $true
    frameId = "runpod-smoke"
    timestampMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  } | ConvertTo-Json -Depth 8
  $result = Invoke-RestMethod -Method POST -Uri "$baseUrl/segment" -Headers $headers -Body $body -TimeoutSec 90
  Write-Host "[segment] observations=$($result.observations.Count) tracks=$($result.tracks.Count) masks=$($result.summary.hasMasks) avgConfidence=$([math]::Round([double]$result.summary.averageConfidence, 3))"
}

if ($PrintDashboardEnv) {
  $baseUrl = if ($PublicUrl) { $PublicUrl.TrimEnd("/") } elseif ($PodHost) { "http://$PodHost`:$ServicePort" } else { "https://<pod-id>-$ServicePort.proxy.runpod.net" }
  Write-Host ""
  Write-Host "Add to services/api/.env while this pod is running:"
  Write-Host "LABOS_ENTITY_SEGMENTATION_MODE=sidecar"
  Write-Host "LABOS_SEGMENTATION_SIDECAR_URL=$baseUrl"
  Write-Host "LABOS_SEGMENTATION_SIDECAR_TOKEN=$tokenToUse"
  Write-Host ""
  Write-Host "Expose HTTP port $ServicePort on RunPod. Proxy URL format: https://<POD_ID>-$ServicePort.proxy.runpod.net"
}
