param(
  [string]$Edition = "java",
  [string]$BaseUrl = "http://127.0.0.1:3847",
  [int]$DurationSeconds = 10,
  [int]$HealthSamples = 10,
  [int]$FrameIntervalMs = 250,
  [switch]$SkipReset,
  [switch]$SkipPreviewMutation,
  [switch]$SkipRecordingMutation
)

$ErrorActionPreference = "Stop"

function Invoke-Json($Method, $Path, $Body = $null, [int]$TimeoutSec = 20) {
  $uri = "$BaseUrl$Path"
  $params = @{
    Method = $Method
    Uri = $uri
    TimeoutSec = $TimeoutSec
    Headers = @{ "accept" = "application/json" }
    DisableKeepAlive = $true
  }
  if ($null -ne $Body) {
    $params.ContentType = "application/json"
    $params.Body = ($Body | ConvertTo-Json -Depth 20)
  }
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    $value = Invoke-RestMethod @params
    $sw.Stop()
    return @{ ok = $true; latencyMs = $sw.Elapsed.TotalMilliseconds; value = $value }
  } catch {
    $sw.Stop()
    return @{ ok = $false; latencyMs = $sw.Elapsed.TotalMilliseconds; error = $_.Exception.Message }
  }
}

function Invoke-Frame([int]$TimeoutSec = 10) {
  $uri = "$BaseUrl/api/preview/frame"
  $temp = [System.IO.Path]::GetTempFileName()
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    Invoke-WebRequest -Uri $uri -OutFile $temp -TimeoutSec $TimeoutSec -DisableKeepAlive | Out-Null
    $sw.Stop()
    $item = Get-Item $temp
    return @{ ok = $true; latencyMs = $sw.Elapsed.TotalMilliseconds; bytes = $item.Length }
  } catch {
    $sw.Stop()
    return @{ ok = $false; latencyMs = $sw.Elapsed.TotalMilliseconds; error = $_.Exception.Message; bytes = 0 }
  } finally {
    Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue
  }
}

function Percentile($Values, [double]$Percentile) {
  $items = @($Values | Sort-Object)
  if ($items.Count -eq 0) { return $null }
  $index = [math]::Ceiling(($Percentile / 100.0) * $items.Count) - 1
  $index = [math]::Max(0, [math]::Min($items.Count - 1, $index))
  return [math]::Round([double]$items[$index], 2)
}

function Average($Values) {
  $items = @($Values)
  if ($items.Count -eq 0) { return $null }
  $sum = 0.0
  foreach ($item in $items) { $sum += [double]$item }
  return [math]::Round($sum / $items.Count, 2)
}

$startedAt = Get-Date

$resetBefore = $null
if (-not $SkipReset) {
  $resetBefore = Invoke-Json "POST" "/api/control/reset" @{} 10
}

$diagnosticsBefore = Invoke-Json "GET" "/api/diagnostics" $null 10

$healthSamplesOut = @()
for ($i = 0; $i -lt $HealthSamples; $i++) {
  $healthSamplesOut += Invoke-Json "GET" "/api/health" $null 10
}

$deviceStatus = Invoke-Json "GET" "/api/device/status" $null 10
$labosStatus = Invoke-Json "GET" "/api/labos/status" $null 15

$previewStart = $null
if (-not $SkipPreviewMutation) {
  $previewStart = Invoke-Json "POST" "/api/preview/start" @{} 30
  Start-Sleep -Milliseconds 500
}

$firstFrame = Invoke-Frame 15
$frameSamples = @()
$deadline = (Get-Date).AddSeconds($DurationSeconds)
while ((Get-Date) -lt $deadline) {
  $frameSamples += Invoke-Frame 10
  Start-Sleep -Milliseconds $FrameIntervalMs
}

$previewHealth = Invoke-Json "GET" "/api/preview/health" $null 10

$recordingStart = $null
$recordingStop = $null
if (-not $SkipRecordingMutation) {
  $recordingStart = Invoke-Json "POST" "/api/preview/recording/start" @{ edition = $Edition } 30
  Start-Sleep -Milliseconds 500
  $recordingStop = Invoke-Json "POST" "/api/preview/recording/stop" @{ edition = $Edition } 30
}
$recordingStatus = Invoke-Json "GET" "/api/preview/recording/status" $null 10
$metrics = Invoke-Json "GET" "/api/metrics" $null 10
$events = Invoke-Json "GET" "/api/events" $null 10

$previewStop = $null
if (-not $SkipPreviewMutation) {
  $previewStop = Invoke-Json "POST" "/api/preview/stop" @{} 30
}

$healthLatencies = @($healthSamplesOut | Where-Object { $_.ok } | ForEach-Object { $_.latencyMs })
$successfulFrames = @($frameSamples | Where-Object { $_.ok })
$frameBytes = @($successfulFrames | ForEach-Object { $_.bytes })
$durationMeasured = [math]::Max(1, $DurationSeconds)

$result = [ordered]@{
  edition = $Edition
  baseUrl = $BaseUrl
  startedAt = $startedAt.ToString("o")
  durationSeconds = $DurationSeconds
  resetBefore = $resetBefore
  diagnosticsBefore = $diagnosticsBefore
  health = [ordered]@{
    samples = $HealthSamples
    successCount = @($healthSamplesOut | Where-Object { $_.ok }).Count
    p50Ms = Percentile $healthLatencies 50
    p95Ms = Percentile $healthLatencies 95
    errors = @($healthSamplesOut | Where-Object { -not $_.ok } | ForEach-Object { $_.error })
  }
  deviceStatus = $deviceStatus
  labosStatus = $labosStatus
  preview = [ordered]@{
    start = $previewStart
    firstFrame = $firstFrame
    health = $previewHealth
    stop = $previewStop
  }
  frames = [ordered]@{
    attempted = $frameSamples.Count
    successCount = $successfulFrames.Count
    polledFps = [math]::Round($successfulFrames.Count / $durationMeasured, 2)
    avgBytes = Average $frameBytes
    p50LatencyMs = Percentile (@($successfulFrames | ForEach-Object { $_.latencyMs })) 50
    p95LatencyMs = Percentile (@($successfulFrames | ForEach-Object { $_.latencyMs })) 95
  }
  recording = [ordered]@{
    start = $recordingStart
    stop = $recordingStop
    status = $recordingStatus
  }
  metrics = $metrics
  events = $events
}

$runsDir = Join-Path (Join-Path $PSScriptRoot "..") "device\editions\benchmarks\runs"
New-Item -ItemType Directory -Force -Path $runsDir | Out-Null
$safeEdition = $Edition -replace "[^a-zA-Z0-9_.-]", "-"
$outFile = Join-Path $runsDir ("{0}-{1}.json" -f (Get-Date -Format "yyyyMMdd-HHmmss"), $safeEdition)
$result | ConvertTo-Json -Depth 80 | Set-Content -Path $outFile -Encoding UTF8

Write-Host "Edition: $Edition"
Write-Host "Base URL: $BaseUrl"
Write-Host "Health p50/p95 ms: $($result.health.p50Ms) / $($result.health.p95Ms)"
Write-Host "Frames: $($result.frames.successCount)/$($result.frames.attempted) polledFps=$($result.frames.polledFps) avgBytes=$($result.frames.avgBytes)"
if ($previewStart) { Write-Host "Preview start ms: $([math]::Round([double]$previewStart.latencyMs, 2)) success=$($previewStart.ok)" }
if ($recordingStart) { Write-Host "Recording start ms: $([math]::Round([double]$recordingStart.latencyMs, 2)) success=$($recordingStart.ok)" }
Write-Host "Wrote: $outFile"
