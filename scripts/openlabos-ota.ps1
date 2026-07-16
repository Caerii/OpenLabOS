param(
  [ValidateSet("all", "core-app", "camera", "dashboard-device", "devtools")]
  [string]$Module = "all",
  [string]$Serial = "192.168.50.122:5555",
  [string]$DashboardUrl = "http://127.0.0.1:3847",
  [string]$DeviceDir = "",
  [switch]$SkipBuild,
  [switch]$UsePrebuilt,
  [switch]$Force,
  [switch]$DirectAdb,
  [switch]$AllowSignatureReset,
  [switch]$StatusOnly,
  [switch]$NoLaunch
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
if (-not $DeviceDir) {
  $DeviceDir = Join-Path $RepoRoot "device"
}

$Modules = @(
  @{ Name = "core-app"; Package = "com.openlab.labos.core"; Apk = "core-app\build\outputs\apk\debug\core-app-debug.apk"; Prebuilt = "prebuilt\labos-debug\core-app.apk" },
  @{ Name = "camera"; Package = "com.openlab.labos.camera"; Apk = "camera\build\outputs\apk\debug\camera-debug.apk"; Prebuilt = "prebuilt\labos-debug\camera.apk" },
  @{ Name = "dashboard-device"; Package = "com.openlab.labos.dashboard"; Apk = "dashboard-device\build\outputs\apk\debug\dashboard-device-debug.apk"; Prebuilt = "prebuilt\labos-debug\dashboard-device.apk" },
  @{ Name = "devtools"; Package = "com.openlab.labos.devtools"; Apk = "devtools\build\outputs\apk\debug\devtools-debug.apk"; Prebuilt = "prebuilt\labos-debug\devtools.apk" }
)

function Write-Section([string]$text) {
  Write-Host ""
  Write-Host "== $text ==" -ForegroundColor Cyan
}

function Get-Targets {
  if ($Module -eq "all") {
    return @($Modules)
  }
  return @($Modules | Where-Object { $_.Name -eq $Module })
}

function Get-ApkPath($target) {
  $built = Join-Path $DeviceDir $target.Apk
  $prebuilt = Join-Path $DeviceDir $target.Prebuilt
  if ($UsePrebuilt -and (Test-Path $prebuilt)) {
    return $prebuilt
  }
  if (Test-Path $built) {
    return $built
  }
  if (Test-Path $prebuilt) {
    return $prebuilt
  }
  if ($UsePrebuilt) {
    return $prebuilt
  }
  return $built
}

function Invoke-Adb([string[]]$AdbArgs, [int]$TimeoutSeconds = 120) {
  $fullArgs = @()
  if ($Serial) {
    $fullArgs += @("-s", $Serial)
  }
  $fullArgs += $AdbArgs

  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = "adb"
  foreach ($arg in $fullArgs) {
    [void]$psi.ArgumentList.Add($arg)
  }
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.UseShellExecute = $false

  $process = [System.Diagnostics.Process]::Start($psi)
  if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
    try { $process.Kill() } catch {}
    throw "adb timed out: adb $($fullArgs -join ' ')"
  }

  $output = ($process.StandardOutput.ReadToEnd() + $process.StandardError.ReadToEnd()).Trim()
  if ($process.ExitCode -ne 0) {
    throw $output
  }
  return $output
}

function Invoke-Dashboard([string]$Path, [string]$Method = "GET", [object]$Body = $null) {
  $uri = "$($DashboardUrl.TrimEnd('/'))$Path"
  if ($Body -eq $null) {
    return Invoke-RestMethod -Method $Method -Uri $uri -TimeoutSec 30
  }
  return Invoke-RestMethod -Method $Method -Uri $uri -ContentType "application/json" -Body ($Body | ConvertTo-Json -Depth 8) -TimeoutSec 180
}

function Show-Status {
  try {
    $status = Invoke-Dashboard "/api/labos/status"
    Write-Host "Device owner: $($status.isDeviceOwner)  Core running: $($status.isRunning)"
    foreach ($item in $status.modules) {
      $installed = if ($item.installed) { "$($item.installedVersionName) ($($item.installedVersionCode))" } else { "not installed" }
      $built = if ($item.apkExists) { "$($item.builtVersionName) ($($item.builtVersionCode))" } else { "no APK" }
      $source = if ($item.apkSource) { $item.apkSource } else { "unknown" }
      $state = if ($item.isLatest) { "latest" } elseif ($item.needsUpdate) { "needs update" } else { "not deployable" }
      Write-Host ("{0,-16} installed={1,-18} selected={2,-18} source={3,-8} {4}" -f $item.name, $installed, $built, $source, $state)
    }
    return $status
  } catch {
    Write-Host "Dashboard status unavailable: $($_.Exception.Message)" -ForegroundColor Yellow
    return $null
  }
}

function Build-Targets($targets) {
  if ($UsePrebuilt) {
    $missing = @($targets | Where-Object { -not (Test-Path (Join-Path $DeviceDir $_.Prebuilt)) })
    if ($missing.Count -eq 0) {
      Write-Host "Using checked-in prebuilt APKs."
      return
    }
    if ($SkipBuild) {
      throw "Prebuilt APKs are missing for: $($missing.Name -join ', ')"
    }
    Write-Host "Some prebuilt APKs are missing; building from source." -ForegroundColor Yellow
  }
  if ($SkipBuild) {
    Write-Host "Skipping build."
    return
  }

  Write-Section "Build APKs"
  Push-Location $DeviceDir
  try {
    $env:ANDROID_HOME = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:USERPROFILE "AppData\Local\Android\Sdk" }
    $env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
    $gradleTargets = @($targets | ForEach-Object { ":$($_.Name):assembleDebug" })
    Write-Host ".\gradlew.bat $($gradleTargets -join ' ')"
    & .\gradlew.bat @gradleTargets
    if ($LASTEXITCODE -ne 0) {
      throw "Gradle build failed with exit code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }
}

function Deploy-WithDashboard {
  Write-Section "Deploy Through Dashboard API"
  $result = Invoke-Dashboard "/api/labos/deploy" "POST" @{ module = $Module; force = [bool]$Force; preferPrebuilt = [bool]$UsePrebuilt }
  foreach ($item in $result.results) {
    $code = if ($item.code) { " [$($item.code)]" } else { "" }
    $color = if ($item.success) { "Green" } else { "Red" }
    Write-Host "$($item.name): success=$($item.success)$code" -ForegroundColor $color
    if ($item.output) {
      Write-Host $item.output
    }
  }

  $needsReset = @($result.results | Where-Object { $_.needsSignatureReset -eq $true -or $_.code -eq "signature_mismatch" }).Count -gt 0
  $forceIgnored = $Force -and @($result.results | Where-Object { $_.code -eq "already_latest" }).Count -gt 0
  if ($forceIgnored) {
    throw "Dashboard deploy route did not honor force reinstall; falling back to direct ADB."
  }
  if ($needsReset -and $AllowSignatureReset) {
    Write-Section "Signature Reset Migration"
    & (Join-Path $PSScriptRoot "labos-signature-reset-deploy.ps1") -Serial $Serial -DeviceDir $DeviceDir -SkipBuild -Execute
    if ($LASTEXITCODE -ne 0) {
      throw "Signature reset deploy failed with exit code $LASTEXITCODE"
    }
    return
  }
  if ($needsReset) {
    throw "Signature mismatch detected. Re-run with -AllowSignatureReset to intentionally remove/reinstall the shared-UID LabOS package set."
  }
  if (-not $result.success) {
    throw "Dashboard deploy failed."
  }
}

function Deploy-DirectAdb($targets) {
  Write-Section "Deploy Directly With ADB"
  foreach ($target in $targets) {
    $apk = Get-ApkPath $target
    if (-not (Test-Path $apk)) {
      throw "APK missing for $($target.Name): $apk"
    }
    Write-Host "$($target.Name): adb install -r $apk"
    $output = Invoke-Adb -AdbArgs @("install", "-r", "$apk")
    Write-Host $output
    if ($output -notmatch "Success") {
      if ($output -match "INSTALL_FAILED_UPDATE_INCOMPATIBLE|signatures do not match") {
        if ($AllowSignatureReset) {
          & (Join-Path $PSScriptRoot "labos-signature-reset-deploy.ps1") -Serial $Serial -DeviceDir $DeviceDir -SkipBuild -Execute
          return
        }
        throw "Signature mismatch detected. Re-run with -AllowSignatureReset to run the reset migration."
      }
      throw "Install failed for $($target.Name)."
    }
  }
}

function Launch-Core {
  if ($NoLaunch) {
    return
  }

  Write-Section "Launch Core"
  try {
    $result = Invoke-Dashboard "/api/labos/launch" "POST" @{}
    Write-Host $result.output
  } catch {
    Write-Host "Dashboard launch unavailable; using direct ADB." -ForegroundColor Yellow
    Write-Host (Invoke-Adb -AdbArgs @("shell", "am", "start-foreground-service", "-n", "com.openlab.labos.core/.LabOsService"))
  }
}

Write-Section "LabOS OTA"
Write-Host "Module: $Module"
Write-Host "Serial: $Serial"
Write-Host "Dashboard: $DashboardUrl"
Write-Host "Force reinstall: $([bool]$Force)"
Write-Host "Use prebuilt: $([bool]$UsePrebuilt)"

$targets = Get-Targets

Write-Section "Current Status"
Show-Status | Out-Null

if ($StatusOnly) {
  exit 0
}

Build-Targets $targets

if ($DirectAdb) {
  Deploy-DirectAdb $targets
} else {
  try {
    Deploy-WithDashboard
  } catch {
    Write-Host "Dashboard deploy unavailable or failed: $($_.Exception.Message)" -ForegroundColor Yellow
    Deploy-DirectAdb $targets
  }
}

Launch-Core

Write-Section "Final Status"
Show-Status | Out-Null
