param(
  [string]$ProtocolId = "kitchen-tea-v1",
  [string]$DashboardUrl = "http://127.0.0.1:3847",
  [string]$OutputRoot = "",
  [string]$VoiceName = "",
  [int]$Rate = 1,
  [switch]$ApiOnly,
  [switch]$PlanOnly
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
if (-not $OutputRoot) {
  $OutputRoot = Join-Path $RepoRoot "dashboard\public\demo\protocol-voice-assets"
}

function Write-Section([string]$text) {
  Write-Host ""
  Write-Host "== $text ==" -ForegroundColor Cyan
}

function Get-VoicePlan {
  $api = "$($DashboardUrl.TrimEnd('/'))/api/live-coach/protocols/$ProtocolId/assets/plan"
  if ($ApiOnly) {
    return Invoke-RestMethod -Uri $api -TimeoutSec 30
  }

  try {
    return Invoke-RestMethod -Uri $api -TimeoutSec 10
  } catch {
    Write-Host "Dashboard API unavailable; generating plan via dashboard TS modules." -ForegroundColor Yellow
    Push-Location (Join-Path $RepoRoot "dashboard")
    try {
      $json = & pnpm tsx src/server/scripts/print-protocol-voice-plan.ts --protocolId $ProtocolId
      if ($LASTEXITCODE -ne 0) {
        throw "plan generation failed"
      }
      return $json | ConvertFrom-Json
    } finally {
      Pop-Location
    }
  }
}

function Write-JsonFile([string]$Path, [object]$Value) {
  $json = $Value | ConvertTo-Json -Depth 20
  [System.IO.File]::WriteAllText($Path, $json, (New-Object System.Text.UTF8Encoding $false))
}

function Write-EventsFile([string]$Path, [object]$Scenario) {
  $events = @(
    [ordered]@{ ts = (Get-Date).ToUniversalTime().ToString("o"); type = "session_start"; payload = [ordered]@{ title = $Scenario.title; scenarioId = $Scenario.id } },
    [ordered]@{ ts = (Get-Date).ToUniversalTime().ToString("o"); type = "client_text"; payload = [ordered]@{ text = $Scenario.prompt } },
    [ordered]@{ ts = (Get-Date).ToUniversalTime().ToString("o"); type = "model_text"; payload = [ordered]@{ text = $Scenario.script } },
    [ordered]@{ ts = (Get-Date).ToUniversalTime().ToString("o"); type = "session_stop"; payload = [ordered]@{ reason = "scripted_static_asset" } }
  )
  $lines = $events | ForEach-Object { $_ | ConvertTo-Json -Compress -Depth 8 }
  [System.IO.File]::WriteAllLines($Path, [string[]]$lines, (New-Object System.Text.UTF8Encoding $false))
}

function New-SpeechSynthesizer {
  try {
    Add-Type -AssemblyName System.Speech
    $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
    if ($VoiceName) {
      $synth.SelectVoice($VoiceName)
    }
    $synth.Rate = [Math]::Max(-10, [Math]::Min(10, $Rate))
    return $synth
  } catch {
    Write-Host "System.Speech is unavailable; manifest will use browser SpeechSynthesis fallback." -ForegroundColor Yellow
    return $null
  }
}

Write-Section "Protocol Voice Asset Generation"
Write-Host "Protocol: $ProtocolId"
Write-Host "Output root: $OutputRoot"

$plan = Get-VoicePlan
$protocolRoot = Join-Path $OutputRoot $ProtocolId
New-Item -ItemType Directory -Force -Path $protocolRoot | Out-Null

$planPath = Join-Path $protocolRoot "plan.json"
Write-JsonFile $planPath $plan

if ($PlanOnly) {
  Write-Host "Plan written: $planPath"
  exit 0
}

$synth = New-SpeechSynthesizer
$recordings = @()
$scenarios = @()
$generatedAt = (Get-Date).ToUniversalTime().ToString("o")

foreach ($scenario in $plan.scenarios) {
  $id = [string]$scenario.id
  $dir = Join-Path $protocolRoot $id
  New-Item -ItemType Directory -Force -Path $dir | Out-Null

  $wavPath = Join-Path $dir "output.wav"
  $eventsPath = Join-Path $dir "events.jsonl"
  $metadataPath = Join-Path $dir "metadata.json"

  $hasOutputWav = $false
  if ($synth) {
    try {
      $synth.SetOutputToWaveFile($wavPath)
      $synth.Speak([string]$scenario.script)
      $synth.SetOutputToNull()
      $hasOutputWav = (Test-Path $wavPath) -and ((Get-Item $wavPath).Length -gt 44)
    } catch {
      Write-Host "TTS unavailable for $id; using browser speech fallback." -ForegroundColor Yellow
      try { $synth.SetOutputToNull() } catch {}
      if (Test-Path $wavPath) {
        Remove-Item -LiteralPath $wavPath -Force
      }
    }
  } elseif (Test-Path $wavPath) {
    Remove-Item -LiteralPath $wavPath -Force
  }

  Write-EventsFile $eventsPath $scenario

  $metadata = [ordered]@{
    id = $id
    startedAt = $generatedAt
    endedAt = $generatedAt
    model = "offline-scripted-tts"
    audioRoute = "browser"
    title = $scenario.title
    scenarioId = $id
    protocolId = $ProtocolId
    category = $scenario.category
    stepNumber = $scenario.stepNumber
    eventCount = 4
    eventsPath = "events.jsonl"
    metadataPath = "metadata.json"
  }
  if ($hasOutputWav) {
    $metadata.outputWav = "output.wav"
  }
  Write-JsonFile $metadataPath $metadata

  $staticBaseUrl = "/demo/protocol-voice-assets/$ProtocolId/$id"
  $recordings += [ordered]@{
    id = $id
    title = $scenario.title
    scenarioId = $id
    protocolId = $ProtocolId
    category = $scenario.category
    stepNumber = $scenario.stepNumber
    startedAt = $generatedAt
    endedAt = $generatedAt
    model = "offline-scripted-tts"
    eventCount = 4
    eventsPath = "events.jsonl"
    metadataPath = "metadata.json"
    staticBaseUrl = $staticBaseUrl
    eventsUrl = "$staticBaseUrl/events.jsonl"
  }
  if ($hasOutputWav) {
    $recordings[-1].outputWav = "output.wav"
    $recordings[-1].outputUrl = "$staticBaseUrl/output.wav"
  }
  $scenarios += [ordered]@{
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
    outputUrl = "$staticBaseUrl/output.wav"
  }
}

$manifest = [ordered]@{
  generatedAt = $generatedAt
  mode = "protocol-scripted-static-replay"
  protocolId = $ProtocolId
  protocolName = $plan.protocolName
  scenarioCount = $scenarios.Count
  recordings = $recordings
  scenarios = $scenarios
}

$manifestPath = Join-Path $protocolRoot "manifest.json"
Write-JsonFile $manifestPath $manifest

Write-Host "Generated $($scenarios.Count) voice assets."
Write-Host "Manifest: $manifestPath"
