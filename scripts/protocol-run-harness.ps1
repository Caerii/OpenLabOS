param(
  [string]$BaseUrl = "http://127.0.0.1:3847",
  [string]$ProtocolId = "kitchen-tea-v1",
  [switch]$StartPreview,
  [switch]$StartRun,
  [switch]$StartSupervisor,
  [switch]$StopSupervisor,
  [switch]$AdherenceTick,
  [switch]$SaveManifest,
  [int]$WatchSeconds = 0,
  [int]$IntervalSeconds = 5
)

$ErrorActionPreference = "Stop"

function Write-Section($text) {
  Write-Host ""
  Write-Host "== $text ==" -ForegroundColor Cyan
}

function Write-Ok($text) {
  Write-Host "[ok] $text" -ForegroundColor Green
}

function Write-Warn($text) {
  Write-Host "[warn] $text" -ForegroundColor Yellow
}

function Write-Fail($text) {
  Write-Host "[fail] $text" -ForegroundColor Red
}

function Invoke-LabOSJson($method, $path, $body = $null) {
  $uri = "$BaseUrl$path"
  try {
    $params = @{
      Method = $method
      Uri = $uri
      TimeoutSec = 20
      Headers = @{ "accept" = "application/json" }
    }
    if ($null -ne $body) {
      $params.ContentType = "application/json"
      $params.Body = ($body | ConvertTo-Json -Depth 20)
    }
    return @{ ok = $true; value = Invoke-RestMethod @params }
  } catch {
    return @{ ok = $false; error = $_.Exception.Message }
  }
}

function Show-Result($label, $result, $summarize) {
  if ($result.ok) {
    Write-Ok "$label $(& $summarize $result.value)"
  } else {
    Write-Fail "$label $($result.error)"
  }
}

function Get-RunLine($runStatus) {
  if (-not $runStatus.active -and -not $runStatus.run) { return "no active run" }
  $run = $runStatus.run
  $step = $runStatus.currentStep
  if ($step) {
    return "run=$($run.status) step=$($step.number) '$($step.instruction)' verifications=$($step.verificationCount)"
  }
  return "run=$($run.status)"
}

Write-Section "LabOS Kitchen Demo Harness"
Write-Host "API: $BaseUrl"
Write-Host "Protocol: $ProtocolId"

Write-Section "Preflight"
Show-Result "server" (Invoke-LabOSJson "GET" "/api/health") { param($x) "mode=$($x.mode) ok=$($x.ok)" }
Show-Result "device" (Invoke-LabOSJson "GET" "/api/device/status") { param($x) "connected=$($x.connected) device=$($x.device) ip=$($x.ip)" }
Show-Result "labos app" (Invoke-LabOSJson "GET" "/api/labos/status") { param($x) "installed=$($x.isInstalled) running=$($x.isRunning) owner=$($x.isDeviceOwner)" }
Show-Result "preview" (Invoke-LabOSJson "GET" "/api/preview/health") { param($x) "streaming=$($x.streaming) fps=$($x.fps) frames=$($x.frameCount)" }
Show-Result "live coach" (Invoke-LabOSJson "GET" "/api/live-coach/health") { param($x) "configured=$($x.configured) route=$($x.audioRoute) recording=$($x.recordingsEnabled)" }
Show-Result "entity segmentation" (Invoke-LabOSJson "GET" "/api/kitchen/analyze/entity-segmentation/status?probe=1") { param($x) "mode=$($x.mode) configured=$($x.configured) health=$($x.health.ok) backend=$($x.health.backend)" }
Show-Result "runpod guard" (Invoke-LabOSJson "GET" "/api/runpod/guard") { param($x) "lifecycle=$($x.lifecycleConfigured) inference=$($x.inferenceConfigured)" }
Show-Result "kitchen run" (Invoke-LabOSJson "GET" "/api/kitchen/run/status") { param($x) Get-RunLine $x }
Show-Result "supervisor" (Invoke-LabOSJson "GET" "/api/kitchen/run/supervisor/status") { param($x) "running=$($x.running) ticks=$($x.tickCount) bufferFrames=$($x.buffer.frameCount) tap=$($x.previewTap.running)" }

if ($StartPreview) {
  Write-Section "Start Preview"
  Show-Result "preview start" (Invoke-LabOSJson "POST" "/api/preview/start" @{}) { param($x) "success=$($x.success) stream=$($x.streamUrl)" }
  Start-Sleep -Seconds 2
  Show-Result "preview health" (Invoke-LabOSJson "GET" "/api/preview/health") { param($x) "streaming=$($x.streaming) fps=$($x.fps) frames=$($x.frameCount)" }
}

if ($StartRun) {
  Write-Section "Start Kitchen Run"
  Show-Result "run start" (Invoke-LabOSJson "POST" "/api/kitchen/run/start" @{ protocolId = $ProtocolId }) { param($x) "success=$($x.success) status=$($x.run.status)" }
  Show-Result "force start" (Invoke-LabOSJson "POST" "/api/kitchen/run/force-start" @{}) { param($x) "success=$($x.success) status=$($x.run.status)" }
  Show-Result "run status" (Invoke-LabOSJson "GET" "/api/kitchen/run/status") { param($x) Get-RunLine $x }
}

if ($StartSupervisor) {
  Write-Section "Start Realtime Supervisor"
  Show-Result "supervisor start" (Invoke-LabOSJson "POST" "/api/kitchen/run/supervisor/start" @{ intervalMs = 5000; maxChecks = 6; immediate = $true }) {
    param($x)
    "running=$($x.running) ticks=$($x.tickCount) intervalMs=$($x.intervalMs)"
  }
}

if ($StopSupervisor) {
  Write-Section "Stop Realtime Supervisor"
  Show-Result "supervisor stop" (Invoke-LabOSJson "POST" "/api/kitchen/run/supervisor/stop" @{}) {
    param($x)
    "running=$($x.running) reason=$($x.stopReason)"
  }
}

if ($AdherenceTick) {
  Write-Section "Adherence Tick"
  Show-Result "auto check" (Invoke-LabOSJson "POST" "/api/kitchen/run/adherence-tick" @{ maxChecks = 6 }) {
    param($x)
    $entityChecks = @($x.evidence | Where-Object { $_.modeId -eq "entity-segmentation" }).Count
    $chunks = @($x.evidence | Where-Object { $_.artifactKind -eq "video_chunk" }).Count
    "action=$($x.adherence.action) state=$($x.adherence.state) advanced=$($x.stepAdvanced) confidence=$([math]::Round(100 * [double]$x.adherence.confidence))% checks=$(@($x.evidence).Count) entityChecks=$entityChecks chunks=$chunks"
  }
}

if ($SaveManifest) {
  Write-Section "Save Session Manifest"
  Show-Result "manifest save" (Invoke-LabOSJson "POST" "/api/kitchen/session/manifest/save" @{}) { param($x) "success=$($x.success) ref=$($x.manifestRef)" }
}

if ($WatchSeconds -gt 0) {
  Write-Section "Watch"
  $deadline = (Get-Date).AddSeconds($WatchSeconds)
  while ((Get-Date) -lt $deadline) {
    $preview = Invoke-LabOSJson "GET" "/api/preview/health"
    $run = Invoke-LabOSJson "GET" "/api/kitchen/run/status"
    $coach = Invoke-LabOSJson "GET" "/api/live-coach/status"
    $supervisor = Invoke-LabOSJson "GET" "/api/kitchen/run/supervisor/status"
    $segmentation = Invoke-LabOSJson "GET" "/api/kitchen/analyze/entity-segmentation/status"
    $parts = @()
    if ($preview.ok) { $parts += "preview fps=$($preview.value.fps) frames=$($preview.value.frameCount)" } else { $parts += "preview=ERR" }
    if ($run.ok) { $parts += (Get-RunLine $run.value) } else { $parts += "run=ERR" }
    if ($coach.ok) { $parts += "coach=$($coach.value.status.state)" } else { $parts += "coach=ERR" }
    if ($segmentation.ok) { $parts += "entities=$($segmentation.value.mode)" } else { $parts += "entities=ERR" }
    if ($supervisor.ok) { $parts += "supervisor=$($supervisor.value.running) ticks=$($supervisor.value.tickCount) buffer=$($supervisor.value.buffer.frameCount) tap=$($supervisor.value.previewTap.running)" } else { $parts += "supervisor=ERR" }
    Write-Host ("[{0}] {1}" -f (Get-Date -Format "HH:mm:ss"), ($parts -join " | "))
    Start-Sleep -Seconds $IntervalSeconds
  }
}

Write-Section "Kitchen Operator Checklist"
Write-Host "1. Put mug, kettle/hot water, tea bag, spoon, and tray in the workspace."
Write-Host "2. Keep the glasses pointed at the active work area; avoid looking down at the floor during checks."
Write-Host "3. Open Kitchen Demo > Guided Demo in the browser; use sandbox tabs only for debugging."
Write-Host "4. Use Start Realtime Supervisor for backend hands-free checks, or run this script with -AdherenceTick for one manual tick."
Write-Host "5. After the run, save the manifest with -SaveManifest or the dashboard endpoint."
