param(
  [string]$ProtocolId = "kitchen-tea-v1",
  [string]$DashboardUrl = "http://127.0.0.1:3847",
  [string]$OutputRoot = "",
  [int]$PerScenarioTimeoutSeconds = 20,
  [int]$StableAudioMs = 1800,
  [double]$MinOutputSeconds = 0.75,
  [int]$PauseSeconds = 2,
  [string[]]$Categories = @(),
  [int]$Limit = 0
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
if (-not $OutputRoot) {
  $OutputRoot = Join-Path $RepoRoot "dashboard\public\demo\protocol-voice-assets"
}

function Invoke-Json([string]$Method, [string]$Path, [object]$Body = $null, [int]$TimeoutSec = 60) {
  $uri = "$($DashboardUrl.TrimEnd('/'))$Path"
  if ($Body -eq $null) {
    return Invoke-RestMethod -Method $Method -Uri $uri -TimeoutSec $TimeoutSec
  }
  return Invoke-RestMethod -Method $Method -Uri $uri -ContentType "application/json" -Body ($Body | ConvertTo-Json -Depth 8) -TimeoutSec $TimeoutSec
}

function Download-File([string]$Path, [string]$OutFile) {
  $uri = "$($DashboardUrl.TrimEnd('/'))$Path"
  Invoke-WebRequest -Uri $uri -OutFile $OutFile -TimeoutSec 60 | Out-Null
}

function Write-JsonFile([string]$Path, [object]$Value) {
  $json = $Value | ConvertTo-Json -Depth 20
  [System.IO.File]::WriteAllText($Path, $json, (New-Object System.Text.UTF8Encoding $false))
}

Write-Host ""
Write-Host "== Gemini Live Protocol Asset Generation ==" -ForegroundColor Cyan
Write-Host "Protocol: $ProtocolId"
Write-Host "Output root: $OutputRoot"

$health = Invoke-Json "GET" "/api/live-coach/health" $null 30
if (-not $health.configured) {
  throw "Gemini Live is not configured. Set GOOGLE_GENERATIVE_AI_API_KEY or use generate-protocol-voice-assets.ps1 for scripted fallback."
}

$plan = Invoke-Json "GET" "/api/live-coach/protocols/$ProtocolId/assets/plan" $null 30
$scenarios = @($plan.scenarios)
if ($Categories.Count -gt 0) {
  $allowed = @{}
  foreach ($cat in $Categories) { $allowed[$cat] = $true }
  $scenarios = @($scenarios | Where-Object { $allowed.ContainsKey([string]$_.category) })
}
if ($Limit -gt 0) {
  $scenarios = @($scenarios | Select-Object -First $Limit)
}

$protocolRoot = Join-Path $OutputRoot $ProtocolId
New-Item -ItemType Directory -Force -Path $protocolRoot | Out-Null
Write-JsonFile (Join-Path $protocolRoot "plan.json") $plan

$recordings = @()
$manifestScenarios = @()
$generatedAt = (Get-Date).ToUniversalTime().ToString("o")

foreach ($scenario in $scenarios) {
  $id = [string]$scenario.id
  Write-Host "Generating: $id"
  $run = Invoke-Json "POST" "/api/live-coach/protocols/$ProtocolId/scenarios/$id/run" @{} 60
  $recordingId = [string]$run.recordingId
  if (-not $recordingId) {
    throw "No recording id returned for $id"
  }
  $finalized = Invoke-Json "POST" "/api/live-coach/recordings/$recordingId/finalize" @{
    stableAudioMs = $StableAudioMs
    minOutputSeconds = $MinOutputSeconds
    maxWaitMs = $PerScenarioTimeoutSeconds * 1000
  } ($PerScenarioTimeoutSeconds + 10)
  $hasAudio = $finalized.stats -and $finalized.stats.outputBytes -gt 0
  if (-not $finalized.complete) {
    Write-Host "Recording finalized via $($finalized.reason) for $id; output may need review." -ForegroundColor Yellow
  }
  Start-Sleep -Seconds $PauseSeconds

  $dir = Join-Path $protocolRoot $id
  New-Item -ItemType Directory -Force -Path $dir | Out-Null

  $eventsPath = Join-Path $dir "events.jsonl"
  $metadataPath = Join-Path $dir "metadata.json"
  Download-File "/api/live-coach/recordings/$recordingId/events.jsonl" $eventsPath
  Download-File "/api/live-coach/recordings/$recordingId/metadata.json" $metadataPath
  if ($hasAudio) {
    Download-File "/api/live-coach/recordings/$recordingId/output.wav" (Join-Path $dir "output.wav")
  } else {
    Write-Host "No output audio detected for $id; static UI will use script fallback." -ForegroundColor Yellow
  }

  $staticBaseUrl = "/demo/protocol-voice-assets/$ProtocolId/$id"
  $recording = [ordered]@{
    id = $id
    sourceRecordingId = $recordingId
    title = $scenario.title
    scenarioId = $id
    protocolId = $ProtocolId
    category = $scenario.category
    stepNumber = $scenario.stepNumber
    startedAt = $generatedAt
    endedAt = $generatedAt
    model = $health.model
    eventCount = 4
    eventsPath = "events.jsonl"
    metadataPath = "metadata.json"
    staticBaseUrl = $staticBaseUrl
    eventsUrl = "$staticBaseUrl/events.jsonl"
  }
  if ($hasAudio) {
    $recording.outputWav = "output.wav"
    $recording.outputUrl = "$staticBaseUrl/output.wav"
  }
  $recordings += $recording

  $manifestScenarios += [ordered]@{
    id = $id
    title = $scenario.title
    category = $scenario.category
    protocolId = $ProtocolId
    stepNumber = $scenario.stepNumber
    trigger = $scenario.trigger
    mood = $scenario.mood
    prompt = $scenario.prompt
    script = $scenario.script
    recordingId = $id
    outputUrl = if ($hasAudio) { "$staticBaseUrl/output.wav" } else { $null }
  }
}

$manifest = [ordered]@{
  generatedAt = $generatedAt
  mode = "gemini-live-static-replay"
  protocolId = $ProtocolId
  protocolName = $plan.protocolName
  scenarioCount = $manifestScenarios.Count
  recordings = $recordings
  scenarios = $manifestScenarios
}

Write-JsonFile (Join-Path $protocolRoot "manifest.json") $manifest
Write-Host "Generated $($manifestScenarios.Count) Gemini Live assets."
