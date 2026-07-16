param(
  [Parameter(Position = 0)]
  [ValidateSet(
    "preflight",
    "status",
    "start",
    "watch",
    "tick",
    "save",
    "paths",
    "recordings",
    "manifest",
    "freeze-replay",
    "export-session",
    "snapshot",
    "latest-frame",
    "latest-chunk",
    "tail-events",
    "inspect",
    "preview-start",
    "preview-stop",
    "preview-diagnose",
    "device-diagnose",
    "logs",
    "coach-start",
    "coach-stop",
    "say",
    "pause",
    "resume",
    "advance",
    "skip",
    "abort",
    "stop",
    "smoke",
    "help"
  )]
  [string]$Command = "preflight",

  [string]$BaseUrl = "http://127.0.0.1:3847",
  [string]$ProtocolId = "kitchen-tea-v1",
  [int]$WatchSeconds = 600,
  [int]$IntervalSeconds = 3,
  [int]$MaxChecks = 6,
  [int]$SupervisorIntervalMs = 5000,
  [int]$Tail = 20,
  [string]$Text = "",
  [string]$RunId = "",
  [string]$ReplayFixtureOut = "",
  [string]$SessionBundleOut = "",
  [switch]$NoPreview,
  [switch]$NoSupervisor,
  [switch]$Follow,
  [switch]$Json
)

$ErrorActionPreference = "Stop"

function Write-Section($text) {
  if ($Json) { return }
  Write-Host ""
  Write-Host "== $text ==" -ForegroundColor Cyan
}

function Write-Ok($text) {
  if ($Json) { return }
  Write-Host "[ok] $text" -ForegroundColor Green
}

function Write-Warn($text) {
  if ($Json) { return }
  Write-Host "[warn] $text" -ForegroundColor Yellow
}

function Write-Fail($text) {
  if ($Json) { return }
  Write-Host "[fail] $text" -ForegroundColor Red
}

function ConvertTo-CompactJson($value) {
  return ($value | ConvertTo-Json -Depth 40 -Compress)
}

function ConvertTo-LabOSJson($value, [int]$Depth = 0) {
  if ($Depth -gt 10) { return '"<max-depth>"' }
  if ($null -eq $value) { return "null" }

  if ($value -is [bool]) {
    if ($value) { return "true" }
    return "false"
  }

  if ($value -is [byte] -or
      $value -is [int] -or
      $value -is [long] -or
      $value -is [double] -or
      $value -is [decimal] -or
      $value -is [single]) {
    return ([string]$value).Replace(",", ".")
  }

  if ($value -is [datetime]) {
    return ConvertTo-LabOSJson $value.ToString("o") ($Depth + 1)
  }

  if ($value -is [string]) {
    $escaped = $value.Replace("\", "\\").Replace('"', '\"').Replace("`r", "\r").Replace("`n", "\n").Replace("`t", "\t")
    return '"' + $escaped + '"'
  }

  if ($value -is [System.Collections.IDictionary]) {
    $parts = @()
    foreach ($key in $value.Keys) {
      $jsonKey = ConvertTo-LabOSJson ([string]$key) ($Depth + 1)
      $jsonValue = ConvertTo-LabOSJson $value[$key] ($Depth + 1)
      $parts += "$jsonKey`:$jsonValue"
    }
    return "{" + ($parts -join ",") + "}"
  }

  if ($value -is [System.Collections.IEnumerable]) {
    $parts = @()
    $count = 0
    foreach ($item in $value) {
      if ($count -ge 50) {
        $parts += '"<truncated>"'
        break
      }
      $parts += ConvertTo-LabOSJson $item ($Depth + 1)
      $count += 1
    }
    return "[" + ($parts -join ",") + "]"
  }

  $properties = @($value.PSObject.Properties | Where-Object { $_.MemberType -in @("NoteProperty", "Property") })
  if ($properties.Count) {
    $parts = @()
    foreach ($property in $properties) {
      $jsonKey = ConvertTo-LabOSJson $property.Name ($Depth + 1)
      $jsonValue = ConvertTo-LabOSJson $property.Value ($Depth + 1)
      $parts += "$jsonKey`:$jsonValue"
    }
    return "{" + ($parts -join ",") + "}"
  }

  return ConvertTo-LabOSJson ([string]$value) ($Depth + 1)
}

function Get-RepoRoot {
  return (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

function Get-DashboardDataRoot {
  return Join-Path (Get-RepoRoot) "dashboard\data"
}

function Get-KitchenDataRoot {
  return Join-Path (Get-DashboardDataRoot) "kitchen"
}

function Get-DisplayPath($path) {
  if (-not $path) { return "" }
  try {
    return (Resolve-Path $path -ErrorAction Stop).Path
  } catch {
    return $path
  }
}

function Invoke-LabOSJson($method, $path, $body = $null, [int]$timeoutSec = 20) {
  $uri = "$BaseUrl$path"
  try {
    $params = @{
      Method = $method
      Uri = $uri
      TimeoutSec = $timeoutSec
      Headers = @{ "accept" = "application/json" }
    }
    if ($null -ne $body) {
      $params.ContentType = "application/json"
      $params.Body = ($body | ConvertTo-Json -Depth 40)
    }
    return @{ ok = $true; path = $path; value = Invoke-RestMethod @params }
  } catch {
    $message = $_.Exception.Message
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
      $message = "$message $($_.ErrorDetails.Message)"
    }
    return @{ ok = $false; path = $path; error = $message }
  }
}

function Invoke-LabOSDownload($path, $outFile, [int]$timeoutSec = 20) {
  $uri = "$BaseUrl$path"
  try {
    $parent = Split-Path -Parent $outFile
    if ($parent) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    Invoke-WebRequest -Uri $uri -OutFile $outFile -TimeoutSec $timeoutSec -Headers @{ "accept" = "image/jpeg" } | Out-Null
    $item = Get-Item $outFile
    return @{ ok = $true; path = $path; file = $item.FullName; bytes = $item.Length; lastWriteTime = $item.LastWriteTime }
  } catch {
    if ($outFile -and (Test-Path $outFile)) {
      Remove-Item -LiteralPath $outFile -Force -ErrorAction SilentlyContinue
    }
    $message = $_.Exception.Message
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
      $message = "$message $($_.ErrorDetails.Message)"
    }
    return @{ ok = $false; path = $path; file = $outFile; error = $message }
  }
}

function Invoke-CommandCapture($label, $command, [int]$timeoutSec = 10) {
  try {
    $output = & powershell -NoProfile -Command $command 2>&1
    return @{ ok = $true; label = $label; command = $command; output = @($output | ForEach-Object { "$_" }) }
  } catch {
    return @{ ok = $false; label = $label; command = $command; error = $_.Exception.Message }
  }
}

function Show-Capture($capture) {
  if ($Json) { return }
  if ($capture.ok) {
    Write-Ok $capture.label
    foreach ($line in @($capture.output | Select-Object -First 30)) {
      if ($line) { Write-Host "  $line" }
    }
  } else {
    Write-Fail "$($capture.label) $($capture.error)"
  }
}

function Emit-Json($value) {
  if ($Json) {
    Write-Output (ConvertTo-LabOSJson $value)
  }
}

function Show-Result($label, $result, $summarize) {
  if ($Json) { return }
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

function Get-AdherenceLine($tick) {
  $entityChecks = @($tick.evidence | Where-Object { $_.modeId -eq "entity-segmentation" }).Count
  $chunks = @($tick.evidence | Where-Object { $_.artifactKind -eq "video_chunk" }).Count
  $confidence = 0
  if ($tick.adherence -and $null -ne $tick.adherence.confidence) {
    $confidence = [math]::Round(100 * [double]$tick.adherence.confidence)
  }
  return "action=$($tick.adherence.action) state=$($tick.adherence.state) advanced=$($tick.stepAdvanced) confidence=$confidence% checks=$(@($tick.evidence).Count) entityChecks=$entityChecks chunks=$chunks"
}

function Get-Preflight {
  return [ordered]@{
    server = Invoke-LabOSJson "GET" "/api/health"
    device = Invoke-LabOSJson "GET" "/api/device/status"
    labosApp = Invoke-LabOSJson "GET" "/api/labos/status"
    preview = Invoke-LabOSJson "GET" "/api/preview/health"
    previewBuffer = Invoke-LabOSJson "GET" "/api/preview/buffer"
    liveCoach = Invoke-LabOSJson "GET" "/api/live-coach/health"
    entitySegmentation = Invoke-LabOSJson "GET" "/api/kitchen/analyze/entity-segmentation/status?probe=1"
    runpodGuard = Invoke-LabOSJson "GET" "/api/runpod/guard"
    kitchenRun = Invoke-LabOSJson "GET" "/api/kitchen/run/status"
    supervisor = Invoke-LabOSJson "GET" "/api/kitchen/run/supervisor/status"
  }
}

function Show-Preflight($results) {
  Write-Section "Preflight"
  Show-Result "server" $results.server { param($x) "mode=$($x.mode) ok=$($x.ok)" }
  Show-Result "device" $results.device { param($x) "connected=$($x.connected) device=$($x.device) ip=$($x.ip)" }
  Show-Result "labos app" $results.labosApp { param($x) "installed=$($x.isInstalled) running=$($x.isRunning) owner=$($x.isDeviceOwner)" }
  Show-Result "preview" $results.preview { param($x) "streaming=$($x.streaming) fps=$($x.fps) frames=$($x.frameCount)" }
  Show-Result "preview buffer" $results.previewBuffer { param($x) "frames=$($x.buffer.frameCount) approxFps=$([math]::Round([double]$x.buffer.approxFps, 2)) bytes=$($x.buffer.totalBytes)" }
  Show-Result "live coach" $results.liveCoach { param($x) "configured=$($x.configured) route=$($x.audioRoute) recording=$($x.recordingsEnabled) active=$($x.activeRecordingId)" }
  Show-Result "entity segmentation" $results.entitySegmentation { param($x) "mode=$($x.mode) configured=$($x.configured) health=$($x.health.ok) backend=$($x.health.backend)" }
  Show-Result "runpod guard" $results.runpodGuard { param($x) "lifecycle=$($x.lifecycleConfigured) inference=$($x.inferenceConfigured)" }
  Show-Result "kitchen run" $results.kitchenRun { param($x) Get-RunLine $x }
  Show-Result "supervisor" $results.supervisor { param($x) "running=$($x.running) ticks=$($x.tickCount) bufferFrames=$($x.buffer.frameCount) tap=$($x.previewTap.running)" }
}

function Get-Status {
  return [ordered]@{
    preview = Invoke-LabOSJson "GET" "/api/preview/health"
    previewBuffer = Invoke-LabOSJson "GET" "/api/preview/buffer"
    kitchenRun = Invoke-LabOSJson "GET" "/api/kitchen/run/status"
    supervisor = Invoke-LabOSJson "GET" "/api/kitchen/run/supervisor/status"
    liveCoach = Invoke-LabOSJson "GET" "/api/live-coach/status"
    recordings = Invoke-LabOSJson "GET" "/api/live-coach/recordings?limit=3"
  }
}

function Show-Status($status) {
  Write-Section "Status"
  Show-Result "preview" $status.preview { param($x) "streaming=$($x.streaming) fps=$($x.fps) frames=$($x.frameCount)" }
  Show-Result "preview buffer" $status.previewBuffer { param($x) "frames=$($x.buffer.frameCount) approxFps=$([math]::Round([double]$x.buffer.approxFps, 2)) oldest=$($x.buffer.oldestTs) newest=$($x.buffer.newestTs)" }
  Show-Result "run" $status.kitchenRun { param($x) Get-RunLine $x }
  Show-Result "supervisor" $status.supervisor { param($x) "running=$($x.running) ticks=$($x.tickCount) lastTick=$($x.lastTickAt) lastError=$($x.lastError)" }
  Show-Result "coach" $status.liveCoach { param($x) "state=$($x.status.state) message=$($x.status.message) recording=$($x.status.recordingId)" }
  Show-Result "recordings" $status.recordings { param($x) "latest=$(@($x.recordings)[0].id) count=$(@($x.recordings).Count)" }
}

function Invoke-Start {
  $results = [ordered]@{}
  Write-Section "Start Live Run"
  if (-not $NoPreview) {
    $results.preview = Invoke-LabOSJson "POST" "/api/preview/start" @{} 30
    Show-Result "preview start" $results.preview { param($x) "success=$($x.success) stream=$($x.streamUrl)" }
    Start-Sleep -Seconds 2
  }
  $results.coach = Invoke-LabOSJson "POST" "/api/live-coach/start" @{} 30
  Show-Result "coach start" $results.coach { param($x) "success=$($x.success) state=$($x.status.state)" }
  $results.runStart = Invoke-LabOSJson "POST" "/api/kitchen/run/start" @{ protocolId = $ProtocolId } 30
  Show-Result "run start" $results.runStart { param($x) "success=$($x.success) status=$($x.run.status)" }
  $results.forceStart = Invoke-LabOSJson "POST" "/api/kitchen/run/force-start" @{} 30
  Show-Result "force start" $results.forceStart { param($x) "success=$($x.success) status=$($x.run.status)" }
  if (-not $NoSupervisor) {
    $results.supervisor = Invoke-LabOSJson "POST" "/api/kitchen/run/supervisor/start" @{
      intervalMs = $SupervisorIntervalMs
      maxChecks = $MaxChecks
      immediate = $true
    } 30
    Show-Result "supervisor start" $results.supervisor { param($x) "running=$($x.running) ticks=$($x.tickCount) intervalMs=$($x.intervalMs)" }
  }
  $results.status = Get-Status
  return $results
}

function Invoke-PreviewStart {
  Write-Section "Preview Start"
  $start = Invoke-LabOSJson "POST" "/api/preview/start" @{} 30
  Show-Result "preview start" $start { param($x) "success=$($x.success) stream=$($x.streamUrl)" }
  Start-Sleep -Seconds 2
  $health = Invoke-LabOSJson "GET" "/api/preview/health" $null 10
  Show-Result "preview health" $health { param($x) "streaming=$($x.streaming) fps=$($x.fps) frames=$($x.frameCount)" }
  $frameProbe = Invoke-LabOSDownload "/api/preview/frame" (Join-Path (Join-Path (Get-KitchenDataRoot) "debug-snapshots") "preview-probe.tmp.jpg") 10
  if ($frameProbe.ok) {
    Remove-Item -LiteralPath $frameProbe.file -Force -ErrorAction SilentlyContinue
    Write-Ok "frame probe reachable bytes=$($frameProbe.bytes)"
  } else {
    Write-Fail "frame probe $($frameProbe.error)"
    Write-Warn "The broadcast was accepted, but the on-device preview server is not reachable on forwarded tcp:8089."
  }
  return [ordered]@{
    start = $start
    health = $health
    frameProbe = $frameProbe
  }
}

function Invoke-PreviewDiagnose {
  Write-Section "Preview Diagnose"
  $probeFile = Join-Path (Join-Path (Get-KitchenDataRoot) "debug-snapshots") "preview-diagnose-probe.tmp.jpg"
  $result = [ordered]@{
    device = Invoke-LabOSJson "GET" "/api/device/status"
    labosApp = Invoke-LabOSJson "GET" "/api/labos/status"
    previewHealth = Invoke-LabOSJson "GET" "/api/preview/health"
    previewBuffer = Invoke-LabOSJson "GET" "/api/preview/buffer"
    capabilities = Invoke-LabOSJson "GET" "/api/preview/capabilities" $null 15
    frameProbe = Invoke-LabOSDownload "/api/preview/frame" $probeFile 10
  }
  if ($result.frameProbe.ok) {
    Remove-Item -LiteralPath $result.frameProbe.file -Force -ErrorAction SilentlyContinue
  }
  if (-not $Json) {
    Show-Result "device" $result.device { param($x) "connected=$($x.connected) device=$($x.device) ip=$($x.ip)" }
    Show-Result "labos app" $result.labosApp { param($x) "installed=$($x.isInstalled) running=$($x.isRunning) owner=$($x.isDeviceOwner)" }
    Show-Result "preview health" $result.previewHealth { param($x) "streaming=$($x.streaming) fps=$($x.fps) frames=$($x.frameCount)" }
    Show-Result "preview buffer" $result.previewBuffer { param($x) "frames=$($x.buffer.frameCount) bytes=$($x.buffer.totalBytes)" }
    Show-Result "capabilities" $result.capabilities { param($x) ConvertTo-CompactJson $x }
    if ($result.frameProbe.ok) {
      Write-Ok "frame probe reachable bytes=$($result.frameProbe.bytes)"
    } else {
      Write-Fail "frame probe $($result.frameProbe.error)"
    }
  }
  return $result
}

function Invoke-DeviceDiagnose {
  Write-Section "Device Diagnose"
  $commands = @(
    @{ label = "adb devices"; command = "adb devices" },
    @{ label = "product model"; command = "adb shell getprop ro.product.model" },
    @{ label = "battery"; command = "adb shell dumpsys battery" },
    @{ label = "openlabos packages"; command = "adb shell pm list packages | findstr openlabos" },
    @{ label = "openlabos processes"; command = "adb shell ps -A | findstr openlabos" },
    @{ label = "camera pid"; command = "adb shell pidof com.openlab.labos.camera" },
    @{ label = "labos pid"; command = "adb shell pidof com.openlab.labos" },
    @{ label = "preview socket grep"; command = "adb shell cat /proc/net/tcp | findstr 1F99" }
  )
  $captures = @()
  foreach ($cmd in $commands) {
    $capture = Invoke-CommandCapture $cmd.label $cmd.command
    $captures += $capture
    Show-Capture $capture
  }
  return @{ ok = $true; captures = $captures }
}

function Invoke-Logs {
  Write-Section "Device Logs"
  $filter = if ($Text) { $Text } else { "LabOS|Preview|CameraCommandReceiver|NanoHTTPD|CameraService|openlabos" }
  $escapedFilter = $filter.Replace("'", "''")
  $command = "adb logcat -d -t 300 | Select-String -Pattern '$escapedFilter'"
  $capture = Invoke-CommandCapture "logcat filter=$filter" $command
  Show-Capture $capture
  return $capture
}

function Invoke-Watch {
  Write-Section "Watch"
  $deadline = (Get-Date).AddSeconds($WatchSeconds)
  while ((Get-Date) -lt $deadline) {
    $status = Get-Status
    if ($Json) {
      Emit-Json ([ordered]@{ ts = (Get-Date).ToString("o"); status = $status })
    } else {
      $parts = @()
      if ($status.preview.ok) { $parts += "preview fps=$($status.preview.value.fps) frames=$($status.preview.value.frameCount)" } else { $parts += "preview=ERR" }
      if ($status.previewBuffer.ok) { $parts += "buffer=$($status.previewBuffer.value.buffer.frameCount)" } else { $parts += "buffer=ERR" }
      if ($status.kitchenRun.ok) { $parts += (Get-RunLine $status.kitchenRun.value) } else { $parts += "run=ERR" }
      if ($status.liveCoach.ok) { $parts += "coach=$($status.liveCoach.value.status.state)" } else { $parts += "coach=ERR" }
      if ($status.supervisor.ok) { $parts += "supervisor=$($status.supervisor.value.running) ticks=$($status.supervisor.value.tickCount)" } else { $parts += "supervisor=ERR" }
      Write-Host ("[{0}] {1}" -f (Get-Date -Format "HH:mm:ss"), ($parts -join " | "))
    }
    Start-Sleep -Seconds $IntervalSeconds
  }
}

function Invoke-Tick {
  Write-Section "Adherence Tick"
  $result = Invoke-LabOSJson "POST" "/api/kitchen/run/adherence-tick" @{ maxChecks = $MaxChecks } 60
  Show-Result "auto check" $result { param($x) Get-AdherenceLine $x }
  return $result
}

function Invoke-Save {
  Write-Section "Save Manifest"
  $body = @{}
  if ($RunId) { $body.runId = $RunId }
  $result = Invoke-LabOSJson "POST" "/api/kitchen/session/manifest/save" $body 30
  Show-Result "manifest" $result { param($x) "success=$($x.success) ref=$($x.manifestRef)" }
  return $result
}

function Invoke-Manifest {
  Write-Section "Manifest"
  $path = "/api/kitchen/session/manifest"
  if ($RunId) { $path = "$path?runId=$([uri]::EscapeDataString($RunId))" }
  $result = Invoke-LabOSJson "GET" $path
  if (-not $Json) {
    Show-Result "manifest" $result { param($x) "run=$($x.run.id) protocol=$($x.run.protocolId) steps=$(@($x.steps).Count) frames=$(@($x.frames).Count) chunks=$(@($x.chunks).Count) adherence=$(@($x.adherence).Count)" }
  }
  return $result
}

function Invoke-FreezeReplay {
  Write-Section "Freeze Replay Fixture"
  $save = Invoke-Save
  if (-not $save.ok) { return $save }

  $manifestRef = $save.value.manifestRef
  $manifestPath = Join-Path (Get-DashboardDataRoot) $manifestRef
  $runId = if ($save.value.manifest.run.id) { $save.value.manifest.run.id } else { $RunId }
  $outPath = if ($ReplayFixtureOut) {
    $ReplayFixtureOut
  } else {
    Join-Path (Join-Path (Get-RepoRoot) "dashboard\src\server\tests\fixtures\kitchen") "$runId-replay.json"
  }

  try {
    $dashboardRoot = Join-Path (Get-RepoRoot) "dashboard"
    $output = & pnpm -C $dashboardRoot replay:fixture -- --manifest $manifestPath --out $outPath 2>&1
    if (-not $Json) {
      foreach ($line in @($output)) { if ($line) { Write-Host "  $line" } }
      Write-Ok "replay fixture $outPath"
    }
    return [ordered]@{
      ok = $true
      manifest = $manifestPath
      fixture = $outPath
      output = @($output | ForEach-Object { "$_" })
    }
  } catch {
    if (-not $Json) { Write-Fail "freeze replay $($_.Exception.Message)" }
    return [ordered]@{ ok = $false; manifest = $manifestPath; fixture = $outPath; error = $_.Exception.Message }
  }
}

function Invoke-ExportSession {
  Write-Section "Export Session Bundle"
  $save = Invoke-Save
  if (-not $save.ok) { return $save }

  $manifestRef = $save.value.manifestRef
  $manifestPath = Join-Path (Get-DashboardDataRoot) $manifestRef
  $runId = if ($save.value.manifest.run.id) { $save.value.manifest.run.id } else { $RunId }
  $outPath = if ($SessionBundleOut) {
    $SessionBundleOut
  } else {
    Join-Path (Join-Path (Get-KitchenDataRoot) "bundles") $runId
  }

  try {
    $dashboardRoot = Join-Path (Get-RepoRoot) "dashboard"
    $output = & pnpm -C $dashboardRoot session:export -- --manifest $manifestPath --out $outPath 2>&1
    if (-not $Json) {
      foreach ($line in @($output)) { if ($line) { Write-Host "  $line" } }
      Write-Ok "session bundle $outPath"
    }
    return [ordered]@{
      ok = $true
      manifest = $manifestPath
      bundle = $outPath
      output = @($output | ForEach-Object { "$_" })
    }
  } catch {
    if (-not $Json) { Write-Fail "export session $($_.Exception.Message)" }
    return [ordered]@{ ok = $false; manifest = $manifestPath; bundle = $outPath; error = $_.Exception.Message }
  }
}

function Invoke-Paths {
  $root = Get-RepoRoot
  $paths = [ordered]@{
    dashboardRoot = $root
    phoneUrl = "http://192.168.50.177:5175"
    backendUrl = $BaseUrl
    kitchenFrames = Join-Path $root "dashboard\data\kitchen\frames"
    kitchenChunks = Join-Path $root "dashboard\data\kitchen\chunks"
    debugSnapshots = Join-Path $root "dashboard\data\kitchen\debug-snapshots"
    kitchenEvents = Join-Path $root "dashboard\data\kitchen\run_events.jsonl"
    currentRun = Join-Path $root "dashboard\data\kitchen\current_run.json"
    manifests = Join-Path $root "dashboard\data\kitchen\manifests"
    liveCoachRecordings = Join-Path $root "dashboard\data\live-coach-recordings"
    trainingRawTarget = "F:\Github\OpenLabOS\openlabos-training\data\raw\openlabos-runs"
  }
  if (-not $Json) {
    Write-Section "Paths"
    foreach ($key in $paths.Keys) {
      Write-Host ("{0}: {1}" -f $key, $paths[$key])
    }
  }
  return $paths
}

function Get-LatestFiles($roots, $extensions, [int]$limit = 5) {
  $items = @()
  foreach ($root in $roots) {
    if (-not (Test-Path $root)) { continue }
    $items += Get-ChildItem -Path $root -Recurse -File -ErrorAction SilentlyContinue |
      Where-Object { $extensions -contains $_.Extension.ToLowerInvariant() }
  }
  return @($items | Sort-Object LastWriteTime -Descending | Select-Object -First $limit)
}

function Get-LatestFrameRecords([int]$limit = 5) {
  $kitchen = Get-KitchenDataRoot
  $roots = @(
    (Join-Path $kitchen "debug-snapshots"),
    (Join-Path $kitchen "frames"),
    (Join-Path $kitchen "chunks")
  )
  return Get-LatestFiles $roots @(".jpg", ".jpeg", ".png") $limit
}

function Get-LatestChunkRecords([int]$limit = 5) {
  $chunksRoot = Join-Path (Get-KitchenDataRoot) "chunks"
  if (-not (Test-Path $chunksRoot)) { return @() }
  return @(Get-ChildItem -Path $chunksRoot -Filter "chunk.mp4" -Recurse -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First $limit)
}

function Read-JsonFile($path) {
  try {
    if (-not (Test-Path $path)) { return $null }
    return (Get-Content $path -Raw | ConvertFrom-Json)
  } catch {
    return $null
  }
}

function Invoke-Snapshot {
  Write-Section "Snapshot"
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss-fff"
  $outDir = Join-Path (Get-KitchenDataRoot) "debug-snapshots"
  $outFile = Join-Path $outDir "snapshot-$stamp.jpg"
  $result = Invoke-LabOSDownload "/api/preview/frame" $outFile 30
  if (-not $Json) {
    if ($result.ok) {
      Write-Ok "snapshot file=$($result.file) bytes=$($result.bytes)"
    } else {
      Write-Fail "snapshot $($result.error)"
      Write-Warn "If preview is not streaming, run: powershell -ExecutionPolicy Bypass -File scripts\labos-live.ps1 start -NoSupervisor"
    }
  }
  return $result
}

function Invoke-LatestFrame {
  Write-Section "Latest Frames"
  $frames = @(Get-LatestFrameRecords $Tail)
  $result = [ordered]@{
    count = $frames.Count
    frames = @($frames | ForEach-Object {
      [ordered]@{
        file = $_.FullName
        bytes = $_.Length
        lastWriteTime = $_.LastWriteTime.ToString("o")
      }
    })
  }
  if (-not $Json) {
    if (-not $frames.Count) {
      Write-Warn "No saved frames found under dashboard\data\kitchen."
    } else {
      foreach ($frame in $frames) {
        Write-Host ("- {0} bytes={1} time={2}" -f $frame.FullName, $frame.Length, $frame.LastWriteTime)
      }
    }
  }
  return $result
}

function Invoke-LatestChunk {
  Write-Section "Latest Chunks"
  $chunks = @(Get-LatestChunkRecords $Tail)
  $resultChunks = @()
  foreach ($chunk in $chunks) {
    $indexPath = Join-Path $chunk.DirectoryName "index.json"
    $index = Read-JsonFile $indexPath
    $resultChunks += [ordered]@{
      file = $chunk.FullName
      bytes = $chunk.Length
      lastWriteTime = $chunk.LastWriteTime.ToString("o")
      index = $indexPath
      metadata = $index
    }
  }
  $result = [ordered]@{ count = $resultChunks.Count; chunks = $resultChunks }
  if (-not $Json) {
    if (-not $chunks.Count) {
      Write-Warn "No materialized video chunks found under dashboard\data\kitchen\chunks."
    } else {
      foreach ($chunk in $resultChunks) {
        $meta = $chunk.metadata
        $summary = ""
        if ($meta) {
          $summary = " frames=$($meta.frameCount) fps=$($meta.fps) durationMs=$($meta.durationMs)"
        }
        Write-Host ("- {0} bytes={1}{2}" -f $chunk.file, $chunk.bytes, $summary)
      }
    }
  }
  return $result
}

function Convert-EventLine($line) {
  try {
    $evt = $line | ConvertFrom-Json
    $time = if ($evt.ts) { ([DateTimeOffset]::FromUnixTimeMilliseconds([int64]$evt.ts)).LocalDateTime.ToString("HH:mm:ss") } else { "unknown" }
    $step = ""
    if ($evt.payload -and $evt.payload.stepNumber) { $step = " step=$($evt.payload.stepNumber)" }
    return "[${time}] $($evt.type) run=$($evt.runId) protocol=$($evt.protocolId)$step"
  } catch {
    return $line
  }
}

function Invoke-TailEvents {
  Write-Section "Run Events"
  $file = Join-Path (Get-KitchenDataRoot) "run_events.jsonl"
  if (-not (Test-Path $file)) {
    if (-not $Json) { Write-Warn "No run events file at $file" }
    return @{ ok = $false; file = $file; error = "events file not found" }
  }

  $lines = @(Get-Content $file -Tail $Tail)
  $result = [ordered]@{
    ok = $true
    file = (Get-DisplayPath $file)
    lines = $lines
  }
  if (-not $Json) {
    foreach ($line in $lines) {
      Write-Host (Convert-EventLine $line)
    }
  }

  if ($Follow) {
    $deadline = (Get-Date).AddSeconds($WatchSeconds)
    $seen = (Get-Item $file).Length
    while ((Get-Date) -lt $deadline) {
      Start-Sleep -Seconds $IntervalSeconds
      $item = Get-Item $file
      if ($item.Length -le $seen) { continue }
      $stream = [System.IO.File]::Open($file, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
      try {
        $stream.Seek($seen, [System.IO.SeekOrigin]::Begin) | Out-Null
        $reader = New-Object System.IO.StreamReader($stream)
        $newText = $reader.ReadToEnd()
        $seen = $item.Length
      } finally {
        $stream.Close()
      }
      foreach ($line in @($newText -split "`r?`n" | Where-Object { $_ })) {
        if ($Json) {
          Emit-Json ([ordered]@{ ts = (Get-Date).ToString("o"); line = $line })
        } else {
          Write-Host (Convert-EventLine $line)
        }
      }
    }
  }
  return $result
}

function Invoke-Recordings {
  Write-Section "Recordings"
  $result = Invoke-LabOSJson "GET" "/api/live-coach/recordings?limit=10"
  if (-not $Json) {
    Show-Result "recordings" $result { param($x) "count=$(@($x.recordings).Count)" }
    if ($result.ok) {
      foreach ($recording in @($result.value.recordings)) {
        Write-Host ("- {0} events={1} output={2} title={3}" -f $recording.id, $recording.eventCount, $recording.outputWav, $recording.title)
      }
    }
  }
  return $result
}

function Invoke-SimplePost($section, $label, $path, $body = @{}) {
  Write-Section $section
  $result = Invoke-LabOSJson "POST" $path $body 30
  Show-Result $label $result { param($x) ConvertTo-CompactJson $x }
  return $result
}

function Invoke-Smoke {
  $results = [ordered]@{}
  Write-Section "Smoke"
  $results.preflight = Get-Preflight
  Show-Preflight $results.preflight
  $results.status = Get-Status
  Show-Status $results.status
  $results.paths = Invoke-Paths
  $results.recordings = Invoke-Recordings
  return $results
}

function Get-ApiError($result) {
  if ($result.ok) { return $null }
  return $result.error
}

function Get-StatusSummary($status) {
  $preview = if ($status.preview.ok) { $status.preview.value } else { $null }
  $buffer = if ($status.previewBuffer.ok) { $status.previewBuffer.value.buffer } else { $null }
  $run = if ($status.kitchenRun.ok) { $status.kitchenRun.value } else { $null }
  $supervisor = if ($status.supervisor.ok) { $status.supervisor.value } else { $null }
  $coach = if ($status.liveCoach.ok) { $status.liveCoach.value.status } else { $null }
  return [ordered]@{
    preview = [ordered]@{
      ok = [bool]$status.preview.ok
      error = Get-ApiError $status.preview
      streaming = if ($preview) { $preview.streaming } else { $null }
      fps = if ($preview) { $preview.fps } else { $null }
      frameCount = if ($preview) { $preview.frameCount } else { $null }
    }
    buffer = [ordered]@{
      ok = [bool]$status.previewBuffer.ok
      error = Get-ApiError $status.previewBuffer
      frameCount = if ($buffer) { $buffer.frameCount } else { $null }
      approxFps = if ($buffer) { $buffer.approxFps } else { $null }
      totalBytes = if ($buffer) { $buffer.totalBytes } else { $null }
    }
    run = [ordered]@{
      ok = [bool]$status.kitchenRun.ok
      error = Get-ApiError $status.kitchenRun
      active = if ($run) { $run.active } else { $null }
      id = if ($run -and $run.run) { $run.run.id } else { $null }
      status = if ($run -and $run.run) { $run.run.status } else { $null }
      protocolId = if ($run -and $run.run) { $run.run.protocolId } else { $null }
      currentStep = if ($run -and $run.currentStep) { $run.currentStep.number } else { $null }
      instruction = if ($run -and $run.currentStep) { $run.currentStep.instruction } else { $null }
    }
    supervisor = [ordered]@{
      ok = [bool]$status.supervisor.ok
      error = Get-ApiError $status.supervisor
      running = if ($supervisor) { $supervisor.running } else { $null }
      tickCount = if ($supervisor) { $supervisor.tickCount } else { $null }
      inFlight = if ($supervisor) { $supervisor.inFlight } else { $null }
      lastError = if ($supervisor) { $supervisor.lastError } else { $null }
    }
    coach = [ordered]@{
      ok = [bool]$status.liveCoach.ok
      error = Get-ApiError $status.liveCoach
      state = if ($coach) { $coach.state } else { $null }
      model = if ($coach) { $coach.model } else { $null }
      audioRoute = if ($coach) { $coach.audioRoute } else { $null }
      recordingId = if ($coach) { $coach.recordingId } else { $null }
    }
  }
}

function Get-ManifestSummary($manifestResult) {
  if (-not $manifestResult.ok) {
    return [ordered]@{
      ok = $false
      error = $manifestResult.error
    }
  }
  $manifest = $manifestResult.value
  return [ordered]@{
    ok = $true
    runId = $manifest.run.id
    protocolId = $manifest.run.protocolId
    status = $manifest.run.status
    stepCount = @($manifest.steps).Count
    frameCount = @($manifest.frames).Count
    chunkCount = @($manifest.chunks).Count
    adherenceCount = @($manifest.adherence).Count
  }
}

function Get-RecordingSummaries($recordingsResult) {
  if (-not $recordingsResult.ok) {
    return [ordered]@{ ok = $false; error = $recordingsResult.error; items = @() }
  }
  return [ordered]@{
    ok = $true
    items = @($recordingsResult.value.recordings | Select-Object -First 3 | ForEach-Object {
      [ordered]@{
        id = $_.id
        title = $_.title
        scenarioId = $_.scenarioId
        eventCount = $_.eventCount
        outputWav = $_.outputWav
        startedAt = $_.startedAt
      }
    })
  }
}

function Get-EventSummaries($lines) {
  return @($lines | ForEach-Object {
    [ordered]@{
      display = Convert-EventLine $_
      raw = $_
    }
  })
}

function Invoke-Inspect {
  Write-Section "Inspect"
  $status = Get-Status
  $latestFrames = @(Get-LatestFrameRecords 3)
  $latestChunks = @(Get-LatestChunkRecords 3)
  $eventsFile = Join-Path (Get-KitchenDataRoot) "run_events.jsonl"
  $events = if (Test-Path $eventsFile) { @(Get-Content $eventsFile -Tail 5) } else { @() }
  $manifest = Invoke-LabOSJson "GET" "/api/kitchen/session/manifest" $null 5
  $recordings = $status.recordings
  $result = [ordered]@{
    ok = $true
    generatedAt = (Get-Date).ToString("o")
    status = Get-StatusSummary $status
    latestFrames = @($latestFrames | ForEach-Object { [ordered]@{ file = $_.FullName; bytes = $_.Length; lastWriteTime = $_.LastWriteTime.ToString("o") } })
    latestChunks = @($latestChunks | ForEach-Object {
      $indexPath = Join-Path $_.DirectoryName "index.json"
      $metadata = Read-JsonFile $indexPath
      [ordered]@{
        file = $_.FullName
        bytes = $_.Length
        lastWriteTime = $_.LastWriteTime.ToString("o")
        index = $indexPath
        frameCount = if ($metadata) { $metadata.frameCount } else { $null }
        fps = if ($metadata) { $metadata.fps } else { $null }
        durationMs = if ($metadata) { $metadata.durationMs } else { $null }
      }
    })
    recentEvents = Get-EventSummaries $events
    recordings = Get-RecordingSummaries $recordings
    manifest = Get-ManifestSummary $manifest
  }
  if (-not $Json) {
    Show-Status $status
    Write-Section "Manifest"
    if ($result.manifest.ok) {
      Write-Ok "manifest run=$($result.manifest.runId) protocol=$($result.manifest.protocolId) steps=$($result.manifest.stepCount) frames=$($result.manifest.frameCount) chunks=$($result.manifest.chunkCount)"
    } else {
      Write-Warn "manifest $($result.manifest.error)"
    }
    Write-Section "Visual Artifacts"
    if ($latestFrames.Count) {
      Write-Host "Latest frame: $($latestFrames[0].FullName)"
    } else {
      Write-Warn "No latest frame found."
    }
    if ($latestChunks.Count) {
      Write-Host "Latest chunk: $($latestChunks[0].FullName)"
    } else {
      Write-Warn "No latest chunk found."
    }
    Write-Section "Recent Events"
    foreach ($event in $result.recentEvents) { Write-Host $event.display }
  }
  return $result
}

function Show-Help {
  Write-Section "Commands"
  Write-Host "preflight   Check server, glasses, LabOS app, preview, Gemini Live, segmentation, RunPod, run, supervisor."
  Write-Host "status      Show current preview/run/supervisor/coach state and latest recordings."
  Write-Host "smoke       Run preflight + status + paths + recordings without mutating live state."
  Write-Host "paths       Print where frames, chunks, manifests, run events, and recordings are stored."
  Write-Host "start       Start preview, Gemini Live, protocol run, and realtime supervisor."
  Write-Host "watch       Poll live state while the kitchen run is happening."
  Write-Host "tick        Run one manual adherence check against the current active step."
  Write-Host "save        Save the current run manifest."
  Write-Host "manifest    Print current run manifest summary; add -Json for full JSON."
  Write-Host "freeze-replay Save manifest and generate a deterministic replay fixture for regression tests."
  Write-Host "export-session Save manifest and write a bundle with manifest, replay fixture, and referenced media."
  Write-Host "snapshot    Capture /api/preview/frame to dashboard\data\kitchen\debug-snapshots."
  Write-Host "latest-frame Print newest saved debug/kitchen/chunk frames; control count with -Tail."
  Write-Host "latest-chunk Print newest materialized video chunks and index metadata."
  Write-Host "tail-events Print recent run_events.jsonl lines; add -Follow to stream new lines."
  Write-Host "inspect     One-shot combined status, latest artifacts, recent events, manifest, recordings."
  Write-Host "preview-start Start glasses preview without starting a protocol run."
  Write-Host "preview-stop  Stop glasses preview without changing protocol state."
  Write-Host "preview-diagnose Probe device/app/preview/capabilities/frame reachability."
  Write-Host "device-diagnose  Run ADB package/process/battery/socket checks."
  Write-Host "logs        Print recent filtered ADB logcat lines; override filter with -Text."
  Write-Host "recordings  List latest Gemini Live recordings."
  Write-Host "say         Send text to Gemini Live; requires -Text."
  Write-Host "pause       Pause the run and stop supervisor."
  Write-Host "resume      Resume the run."
  Write-Host "advance     Manually mark current step complete."
  Write-Host "skip        Skip current step."
  Write-Host "stop        Stop supervisor and Gemini Live."
  Write-Host "abort       Abort the active run."
  Write-Host ""
  Write-Host "Examples:"
  Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\labos-live.ps1 smoke"
  Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\labos-live.ps1 start"
  Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\labos-live.ps1 watch -WatchSeconds 1200 -IntervalSeconds 3"
  Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\labos-live.ps1 tick"
  Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\labos-live.ps1 snapshot"
  Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\labos-live.ps1 inspect"
  Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\labos-live.ps1 save"
  return @{ ok = $true }
}

Write-Section "LabOS Live CLI"
if (-not $Json) {
  Write-Host "Command: $Command"
  Write-Host "API: $BaseUrl"
  Write-Host "Protocol: $ProtocolId"
}

$output = switch ($Command) {
  "preflight" {
    $r = Get-Preflight
    Show-Preflight $r
    $r
  }
  "status" {
    $r = Get-Status
    Show-Status $r
    $r
  }
  "start" { Invoke-Start }
  "watch" { Invoke-Watch; @{ ok = $true } }
  "tick" { Invoke-Tick }
  "save" { Invoke-Save }
  "paths" { Invoke-Paths }
  "recordings" { Invoke-Recordings }
  "manifest" { Invoke-Manifest }
  "freeze-replay" { Invoke-FreezeReplay }
  "export-session" { Invoke-ExportSession }
  "snapshot" { Invoke-Snapshot }
  "latest-frame" { Invoke-LatestFrame }
  "latest-chunk" { Invoke-LatestChunk }
  "tail-events" { Invoke-TailEvents }
  "inspect" { Invoke-Inspect }
  "preview-start" { Invoke-PreviewStart }
  "preview-stop" { Invoke-SimplePost "Preview Stop" "preview" "/api/preview/stop" @{} }
  "preview-diagnose" { Invoke-PreviewDiagnose }
  "device-diagnose" { Invoke-DeviceDiagnose }
  "logs" { Invoke-Logs }
  "coach-start" { Invoke-SimplePost "Coach Start" "coach" "/api/live-coach/start" @{} }
  "coach-stop" { Invoke-SimplePost "Coach Stop" "coach" "/api/live-coach/stop" @{} }
  "say" {
    if (-not $Text) { throw "-Text is required for say" }
    Invoke-SimplePost "Coach Say" "text" "/api/live-coach/text" @{ text = $Text }
  }
  "pause" { Invoke-SimplePost "Pause Run" "pause" "/api/kitchen/run/pause" @{} }
  "resume" { Invoke-SimplePost "Resume Run" "resume" "/api/kitchen/run/resume" @{} }
  "advance" { Invoke-SimplePost "Manual Advance" "complete-step" "/api/kitchen/run/complete-step" @{} }
  "skip" { Invoke-SimplePost "Skip Step" "skip-step" "/api/kitchen/run/skip-step" @{} }
  "abort" { Invoke-SimplePost "Abort Run" "abort" "/api/kitchen/run/abort" @{ reason = "operator_cli_abort" } }
  "stop" {
    $r = [ordered]@{
      supervisor = Invoke-SimplePost "Stop Supervisor" "supervisor" "/api/kitchen/run/supervisor/stop" @{}
      coach = Invoke-SimplePost "Stop Coach" "coach" "/api/live-coach/stop" @{}
    }
    $r
  }
  "smoke" { Invoke-Smoke }
  "help" { Show-Help }
}

Emit-Json $output
