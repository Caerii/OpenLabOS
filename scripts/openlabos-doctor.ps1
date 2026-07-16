param(
  [switch]$Full
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot

function Write-Section([string]$Title) {
  Write-Host ""
  Write-Host "== $Title ==" -ForegroundColor Cyan
}

function Invoke-Check([string]$Name, [scriptblock]$Command) {
  Write-Host "[$Name] " -NoNewline
  try {
    & $Command
    Write-Host "ok" -ForegroundColor Green
  } catch {
    Write-Host "failed" -ForegroundColor Red
    throw
  }
}

function Invoke-Logged([string]$Name, [string]$Command, [string]$WorkingDirectory = $repoRoot) {
  Write-Host "[$Name] $Command"
  Push-Location $WorkingDirectory
  try {
    Invoke-Expression $Command
    if ($LASTEXITCODE -ne 0) {
      throw "$Name exited with code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }
}

function Invoke-LoggedWithRetry([string]$Name, [string]$Command, [int]$Attempts = 2, [string]$WorkingDirectory = $repoRoot) {
  for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
    try {
      Invoke-Logged $Name $Command $WorkingDirectory
      return
    } catch {
      if ($attempt -ge $Attempts) { throw }
      Write-Host "[$Name] retrying after transient failure..." -ForegroundColor Yellow
      Start-Sleep -Seconds 2
    }
  }
}

Write-Section "OpenLabOS Doctor"
Invoke-Check "repo-root" {
  if (-not (Test-Path (Join-Path $repoRoot "package.json"))) {
    throw "package.json not found at $repoRoot"
  }
}
Invoke-Check "node" { node --version | Out-Null }
Invoke-Check "pnpm" { pnpm --version | Out-Null }
Invoke-Check "api package" {
  if (-not (Test-Path (Join-Path $repoRoot "services\api\package.json"))) {
    throw "services/api package.json missing"
  }
}
Invoke-Check "web package" {
  if (-not (Test-Path (Join-Path $repoRoot "apps\web\package.json"))) {
    throw "apps/web package.json missing"
  }
}

Write-Section "Fast Checks"
Invoke-Logged "api typecheck" "pnpm --filter @openlabos/api typecheck"
Invoke-Logged "web typecheck" "pnpm --filter @openlabos/web typecheck"
$doctorDataDir = Join-Path $env:TEMP "openlabos-doctor-data"
$doctorPublicDir = Join-Path $env:TEMP "openlabos-doctor-public"
New-Item -ItemType Directory -Force -Path $doctorDataDir | Out-Null
New-Item -ItemType Directory -Force -Path $doctorPublicDir | Out-Null
$previousDataDir = $env:OPENLABOS_DATA_DIR
$previousPublicDir = $env:OPENLABOS_PUBLIC_DIR
try {
  $env:OPENLABOS_DATA_DIR = $doctorDataDir
  $env:OPENLABOS_PUBLIC_DIR = $doctorPublicDir
  Invoke-LoggedWithRetry "api offline tests" "pnpm --filter @openlabos/api test:offline"
} finally {
  if ($null -eq $previousDataDir) { Remove-Item Env:\OPENLABOS_DATA_DIR -ErrorAction SilentlyContinue }
  else { $env:OPENLABOS_DATA_DIR = $previousDataDir }
  if ($null -eq $previousPublicDir) { Remove-Item Env:\OPENLABOS_PUBLIC_DIR -ErrorAction SilentlyContinue }
  else { $env:OPENLABOS_PUBLIC_DIR = $previousPublicDir }
}

if ($Full) {
  Write-Section "Full Checks"
  Invoke-Logged "api build" "pnpm --filter @openlabos/api build"
  Invoke-Logged "web build" "pnpm --filter @openlabos/web build"
  Invoke-Logged "device assemble" ".\gradlew.bat assembleDebug" (Join-Path $repoRoot "apps\device-reference")
}

Write-Host ""
Write-Host "OpenLabOS doctor passed." -ForegroundColor Green
