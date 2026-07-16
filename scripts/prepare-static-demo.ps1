param(
  [string]$DashboardRoot = (Join-Path $PSScriptRoot "..\dashboard"),
  [string]$TrainingRoot = (Join-Path $PSScriptRoot "..\..\openlabos-training"),
  [string]$SamplesManifest = "",
  [int]$ClipLimit = 10,
  [switch]$CleanKitchenAssets
)

$ErrorActionPreference = "Stop"

function Resolve-FullPath([string]$PathValue) {
  if ([System.IO.Path]::IsPathRooted($PathValue)) {
    return [System.IO.Path]::GetFullPath($PathValue)
  }
  return [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $PathValue))
}

function Read-Jsonl([string]$PathValue) {
  if (!(Test-Path $PathValue)) { return @() }
  return @(
    Get-Content -Path $PathValue |
      Where-Object { $_.Trim().Length -gt 0 } |
      ForEach-Object { $_ | ConvertFrom-Json }
  )
}

function Get-JsonValue($Primary, $Secondary, [string]$Name, $Fallback = "") {
  if ($Primary -and $Primary.PSObject.Properties[$Name] -and $null -ne $Primary.PSObject.Properties[$Name].Value -and [string]$Primary.PSObject.Properties[$Name].Value -ne "") {
    return $Primary.PSObject.Properties[$Name].Value
  }
  if ($Secondary -and $Secondary.PSObject.Properties[$Name] -and $null -ne $Secondary.PSObject.Properties[$Name].Value -and [string]$Secondary.PSObject.Properties[$Name].Value -ne "") {
    return $Secondary.PSObject.Properties[$Name].Value
  }
  return $Fallback
}

function Write-JsonUtf8NoBom([string]$PathValue, $Value) {
  $json = $Value | ConvertTo-Json -Depth 10
  $encoding = New-Object System.Text.UTF8Encoding -ArgumentList $false
  [System.IO.File]::WriteAllText($PathValue, $json + [Environment]::NewLine, $encoding)
}

$dashboard = Resolve-FullPath $DashboardRoot
$training = Resolve-FullPath $TrainingRoot
$publicDemo = Join-Path $dashboard "public\demo"
$recordingsSrc = Join-Path $dashboard "data\live-coach-recordings"
$recordingsOut = Join-Path $publicDemo "live-coach-recordings"
$clipsOut = Join-Path $publicDemo "kitchen-clips"
$framesOut = Join-Path $publicDemo "kitchen-frames"
$samplesManifest = if ($SamplesManifest) {
  Resolve-FullPath $SamplesManifest
} else {
  Join-Path $training "data\raw\youtube_qwen35_seed\manifests\samples.jsonl"
}

New-Item -ItemType Directory -Force -Path $recordingsOut | Out-Null
if ($CleanKitchenAssets) {
  $publicDemoFull = [System.IO.Path]::GetFullPath($publicDemo)
  foreach ($target in @($clipsOut, $framesOut)) {
    $targetFull = [System.IO.Path]::GetFullPath($target)
    if (!$targetFull.StartsWith($publicDemoFull, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "Refusing to clean path outside public demo root: $targetFull"
    }
    if (Test-Path $targetFull) {
      Remove-Item -Path $targetFull -Recurse -Force
    }
  }
}
New-Item -ItemType Directory -Force -Path $clipsOut | Out-Null
New-Item -ItemType Directory -Force -Path $framesOut | Out-Null

$recordings = @()
if (Test-Path $recordingsSrc) {
  $seenScenarios = @{}
  Get-ChildItem -Path $recordingsSrc -Directory |
    Sort-Object Name -Descending |
    ForEach-Object {
      $metadataPath = Join-Path $_.FullName "metadata.json"
      $eventsPath = Join-Path $_.FullName "events.jsonl"
      $outputPath = Join-Path $_.FullName "output.wav"
      if (!(Test-Path $metadataPath) -or !(Test-Path $eventsPath) -or !(Test-Path $outputPath)) { return }

      $metadata = Get-Content -Path $metadataPath -Raw | ConvertFrom-Json
      $scenarioId = [string]$metadata.scenarioId
      if (!$scenarioId -or $seenScenarios.ContainsKey($scenarioId)) { return }
      $seenScenarios[$scenarioId] = $true

      $destDir = Join-Path $recordingsOut $_.Name
      New-Item -ItemType Directory -Force -Path $destDir | Out-Null
      Copy-Item -Path $metadataPath -Destination (Join-Path $destDir "metadata.json") -Force
      Copy-Item -Path $eventsPath -Destination (Join-Path $destDir "events.jsonl") -Force
      Copy-Item -Path $outputPath -Destination (Join-Path $destDir "output.wav") -Force

      $recordings += [ordered]@{
        id = $_.Name
        title = [string]$metadata.title
        scenarioId = $scenarioId
        category = if ($scenarioId -match "safety|hot-water") { "safety" } elseif ($scenarioId -match "step-passed") { "success" } elseif ($scenarioId -match "missing") { "recovery" } else { "deviance" }
        startedAt = [string]$metadata.startedAt
        endedAt = [string]$metadata.endedAt
        model = [string]$metadata.model
        eventCount = [int]$metadata.eventCount
        outputWav = "output.wav"
        eventsPath = "events.jsonl"
        metadataPath = "metadata.json"
        staticBaseUrl = "/demo/live-coach-recordings/$($_.Name)"
        outputUrl = "/demo/live-coach-recordings/$($_.Name)/output.wav"
        eventsUrl = "/demo/live-coach-recordings/$($_.Name)/events.jsonl"
      }
    }
}

$recordingManifest = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  mode = "static-replay"
  recordings = $recordings
  scenarios = $recordings | ForEach-Object {
    [ordered]@{
      id = $_.scenarioId
      title = $_.title
      category = $_.category
      recordingId = $_.id
      outputUrl = $_.outputUrl
    }
  }
}
Write-JsonUtf8NoBom (Join-Path $recordingsOut "manifest.json") $recordingManifest

$samples = @()
if (Test-Path $samplesManifest) {
  $manifestDir = Split-Path -Parent $samplesManifest
  $sourceMap = @{}
  Read-Jsonl (Join-Path $manifestDir "sources.jsonl") |
    ForEach-Object {
      if ($_.source_id) {
        $sourceMap[[string]$_.source_id] = $_
      }
    }

  $frameMap = @{}
  Read-Jsonl (Join-Path $manifestDir "frames.jsonl") |
    Sort-Object sample_id, frame_index, timestamp_ms |
    ForEach-Object {
      if (!$_.sample_id -or !$_.image_path) { return }
      $sampleId = [string]$_.sample_id
      if (!$frameMap.ContainsKey($sampleId)) {
        $frameMap[$sampleId] = @()
      }
      $frameMap[$sampleId] += [string]$_.image_path
    }

  $rawSamples = Read-Jsonl $samplesManifest |
    Where-Object { $_.clip_path -and (Test-Path $_.clip_path) }

  $selected = @()
  $groups = @(
    $rawSamples |
      Group-Object source_id |
      ForEach-Object { ,@($_.Group | Sort-Object clip_start_ms) }
  )
  $candidateOffsets = @(0, 8, 16, 4, 12, 20, 2, 6, 10, 14, 18, 22)
  foreach ($offset in $candidateOffsets) {
    foreach ($group in $groups) {
      if ($selected.Count -ge $ClipLimit) { break }
      $index = [Math]::Min($offset, [Math]::Max(0, $group.Count - 1))
      $candidate = $group[$index]
      if ($candidate -and !($selected | Where-Object { $_.sample_id -eq $candidate.sample_id })) {
        $selected += $candidate
      }
    }
    if ($selected.Count -ge $ClipLimit) { break }
  }
  if ($selected.Count -lt $ClipLimit) {
    foreach ($sample in ($rawSamples | Sort-Object source_id, clip_start_ms)) {
      if ($selected.Count -ge $ClipLimit) { break }
      if (!($selected | Where-Object { $_.sample_id -eq $sample.sample_id })) {
        $selected += $sample
      }
    }
  }

  foreach ($sample in $selected | Select-Object -First $ClipLimit) {
    $source = $null
    if ($sample.source_id -and $sourceMap.ContainsKey([string]$sample.source_id)) {
      $source = $sourceMap[[string]$sample.source_id]
    }

    $clipName = Split-Path -Path $sample.clip_path -Leaf
    Copy-Item -Path $sample.clip_path -Destination (Join-Path $clipsOut $clipName) -Force

    $frameUrls = @()
    $sampleFramesOut = Join-Path $framesOut ([string]$sample.sample_id)
    New-Item -ItemType Directory -Force -Path $sampleFramesOut | Out-Null
    $sampleFramePaths = @()
    if ($sample.PSObject.Properties["frame_paths"] -and $sample.frame_paths) {
      $sampleFramePaths = @($sample.frame_paths)
    } elseif ($frameMap.ContainsKey([string]$sample.sample_id)) {
      $sampleFramePaths = @($frameMap[[string]$sample.sample_id])
    }
    foreach ($framePath in $sampleFramePaths) {
      if (!$framePath -or !(Test-Path $framePath)) { continue }
      $frameName = Split-Path -Path $framePath -Leaf
      Copy-Item -Path $framePath -Destination (Join-Path $sampleFramesOut $frameName) -Force
      $frameUrls += "/demo/kitchen-frames/$($sample.sample_id)/$frameName"
    }

    $samples += [ordered]@{
      sampleId = [string]$sample.sample_id
      sourceId = [string]$sample.source_id
      title = [string](Get-JsonValue $sample $source "title" "Kitchen demo clip")
      uploader = [string](Get-JsonValue $sample $source "uploader" (Get-JsonValue $sample $source "source" ""))
      videoUrl = "/demo/kitchen-clips/$clipName"
      originalVideoUrl = [string](Get-JsonValue $sample $source "url" "")
      protocolId = [string](Get-JsonValue $sample $source "protocol_id" "kitchen-tea-v1")
      recipe = [string](Get-JsonValue $sample $source "recipe" "tea")
      stepHint = [string](Get-JsonValue $sample $source "step_hint" "")
      labelHint = [string](Get-JsonValue $sample $source "label_hint" "")
      split = "static-demo"
      clipStartSec = [double]$sample.clip_start_ms / 1000.0
      clipEndSec = [double]$sample.clip_end_ms / 1000.0
      clipDurationSec = [double]$sample.clip_duration_seconds
      targetFps = [double]$sample.target_fps
      frameCount = [int]$sample.frame_count
      frameUrls = $frameUrls
      notes = [string](Get-JsonValue $sample $source "notes" "")
    }
  }
}

$sampleManifestJson = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  mode = "static-replay"
  samples = $samples
}
Write-JsonUtf8NoBom (Join-Path $publicDemo "kitchen-samples.json") $sampleManifestJson

Write-Host "Static dashboard demo prepared:"
Write-Host "  recordings: $($recordings.Count) -> $recordingsOut"
Write-Host "  clips: $($samples.Count) -> $clipsOut"
