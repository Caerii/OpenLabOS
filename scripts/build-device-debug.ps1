param(
  [string]$DeviceDir = "",
  [string]$GradleExe = ""
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
if (-not $DeviceDir) {
  $DeviceDir = Join-Path $RepoRoot "apps\device-reference"
}

function Resolve-GradleExe {
  if ($GradleExe) { return $GradleExe }

  $installed = Get-ChildItem (Join-Path $env:USERPROFILE ".gradle\wrapper\dists\gradle-8.7-bin") `
    -Recurse `
    -Filter "gradle.bat" `
    -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($installed) { return $installed.FullName }

  return Join-Path $DeviceDir "gradlew.bat"
}

$gradle = Resolve-GradleExe
$env:ANDROID_HOME = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:USERPROFILE "AppData\Local\Android\Sdk" }
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:GRADLE_USER_HOME = if ($env:GRADLE_USER_HOME) { $env:GRADLE_USER_HOME } else { Join-Path ([System.IO.Path]::GetTempPath()) "openlabos-gradle-home" }
$env:GRADLE_OPTS = if ($env:GRADLE_OPTS) { "$($env:GRADLE_OPTS) -Dorg.gradle.native=false" } else { "-Dorg.gradle.native=false" }

Get-ChildItem Env: |
  Where-Object {
    $_.Name -like "npm_*" -or
    $_.Name -like "pnpm_*" -or
    $_.Name -in @("CODEX_MANAGED_BY_NPM", "PNPM_PACKAGE_NAME")
  } |
  ForEach-Object { Remove-Item "Env:\$($_.Name)" -ErrorAction SilentlyContinue }

$pathName = if (Test-Path Env:\Path) { "Path" } else { "PATH" }
$envPath = (Get-Item "Env:\$pathName").Value
$cleanPath = ($envPath -split ';' | Where-Object {
  $_ -and
  $_ -ne "./node_modules/.bin" -and
  $_ -notlike "*\node_modules\.bin"
}) -join ';'
Set-Item "Env:\$pathName" $cleanPath

Push-Location $DeviceDir
try {
  $projectCacheDir = Join-Path $env:GRADLE_USER_HOME "project-cache"
  & $gradle --no-daemon --project-cache-dir $projectCacheDir assembleDebug
  if ($LASTEXITCODE -ne 0) {
    throw "Gradle build failed with exit code $LASTEXITCODE"
  }
} finally {
  Pop-Location
}
