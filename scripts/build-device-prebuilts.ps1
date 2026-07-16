param(
  [string]$DeviceDir = "",
  [string]$OutputDir = "",
  [string]$GradleExe = "",
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
if (-not $DeviceDir) {
  $DeviceDir = Join-Path $RepoRoot "apps\device-reference"
}
if (-not $OutputDir) {
  $OutputDir = Join-Path $DeviceDir "prebuilt\openlabos-debug"
}

$Modules = @(
  @{ Name = "core-app"; Package = "com.openlab.labos.core"; Apk = "core-app\build\outputs\apk\debug\core-app-debug.apk"; Prebuilt = "core-app.apk" },
  @{ Name = "camera"; Package = "com.openlab.labos.camera"; Apk = "camera\build\outputs\apk\debug\camera-debug.apk"; Prebuilt = "camera.apk" },
  @{ Name = "dashboard-device"; Package = "com.openlab.labos.dashboard"; Apk = "dashboard-device\build\outputs\apk\debug\dashboard-device-debug.apk"; Prebuilt = "dashboard-device.apk" },
  @{ Name = "devtools"; Package = "com.openlab.labos.devtools"; Apk = "devtools\build\outputs\apk\debug\devtools-debug.apk"; Prebuilt = "devtools.apk" }
)

function Write-Section([string]$text) {
  Write-Host ""
  Write-Host "== $text ==" -ForegroundColor Cyan
}

function Get-GitCommit {
  try {
    $commit = (& git -C $RepoRoot rev-parse HEAD 2>$null).Trim()
    if ($LASTEXITCODE -eq 0 -and $commit) {
      return $commit
    }
  } catch {}
  return $null
}

if (-not $SkipBuild) {
  Write-Section "Build Android Debug APKs"
  & (Join-Path $RepoRoot "scripts\build-device-debug.ps1") -DeviceDir $DeviceDir -GradleExe $GradleExe
}

Write-Section "Copy Prebuilt APKs"
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$manifestModules = @()
foreach ($module in $Modules) {
  $source = Join-Path $DeviceDir $module.Apk
  if (-not (Test-Path $source)) {
    throw "Missing built APK for $($module.Name): $source"
  }
  $dest = Join-Path $OutputDir $module.Prebuilt
  Copy-Item -LiteralPath $source -Destination $dest -Force
  $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $dest).Hash.ToLowerInvariant()
  $file = Get-Item -LiteralPath $dest
  $relativeApk = (Resolve-Path $dest).Path.Substring((Resolve-Path $DeviceDir).Path.Length + 1).Replace("\", "/")
  $relativeSource = (Resolve-Path $source).Path.Substring((Resolve-Path $DeviceDir).Path.Length + 1).Replace("\", "/")
  $manifestModules += [ordered]@{
    name = $module.Name
    package = $module.Package
    apk = $relativeApk
    sourceApk = $relativeSource
    sha256 = $hash
    bytes = $file.Length
  }
  Write-Host "$($module.Name): $relativeApk ($($file.Length) bytes, sha256 $($hash.Substring(0, 12))...)"
}

$manifest = [ordered]@{
  schemaVersion = 1
  artifactSet = "openlabos-debug"
  variant = "debug"
  createdAt = (Get-Date).ToUniversalTime().ToString("o")
  sourceGitCommit = Get-GitCommit
  modules = $manifestModules
}

$manifestPath = Join-Path $OutputDir "manifest.json"
$manifest | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 -LiteralPath $manifestPath
Write-Host "Manifest: $manifestPath"
