param(
  [string]$Serial = "192.168.50.122:5555",
  [string]$DeviceDir = "",
  [switch]$SkipBuild,
  [switch]$Execute,
  [switch]$KeepDevtools
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
if (-not $DeviceDir) {
  $DeviceDir = Join-Path $RepoRoot "device"
}

$Modules = @(
  @{ Name = "core-app"; Package = "com.openlab.labos.core"; Apk = "core-app\build\outputs\apk\debug\core-app-debug.apk" },
  @{ Name = "camera"; Package = "com.openlab.labos.camera"; Apk = "camera\build\outputs\apk\debug\camera-debug.apk" },
  @{ Name = "dashboard-device"; Package = "com.openlab.labos.dashboard"; Apk = "dashboard-device\build\outputs\apk\debug\dashboard-device-debug.apk" },
  @{ Name = "devtools"; Package = "com.openlab.labos.devtools"; Apk = "devtools\build\outputs\apk\debug\devtools-debug.apk" }
)

function Write-Section($text) {
  Write-Host ""
  Write-Host "== $text ==" -ForegroundColor Cyan
}

function Invoke-Adb([string[]]$AdbArgs, [switch]$AllowFail) {
  $fullArgs = @()
  if ($Serial) {
    $fullArgs += @("-s", $Serial)
  }
  $fullArgs += $AdbArgs
  Write-Host ("adb " + ($fullArgs -join " ")) -ForegroundColor DarkGray
  if (-not $Execute) {
    return ""
  }
  $output = & adb @fullArgs 2>&1
  $exit = $LASTEXITCODE
  $text = ($output | Out-String).Trim()
  if ($text) { Write-Host $text }
  if ($exit -ne 0 -and -not $AllowFail) {
    throw "adb failed with exit code $exit"
  }
  return $text
}

function Test-PackageInstalled([string]$package) {
  if (-not $Execute) {
    return $true
  }
  $result = Invoke-Adb -AdbArgs @("shell", "pm", "path", $package) -AllowFail
  return $result -match "package:"
}

function Assert-ApkExists($module) {
  $path = Join-Path $DeviceDir $module.Apk
  if (-not (Test-Path $path)) {
    if ($module.Name -eq "devtools") {
      Write-Host "Skipping devtools; APK not built: $path" -ForegroundColor Yellow
      return $null
    }
    throw "Missing APK for $($module.Name): $path"
  }
  return Resolve-Path $path
}

Write-Section "LabOS Signature Reset Deploy"
Write-Host "Serial: $Serial"
Write-Host "Device dir: $DeviceDir"
if (-not $Execute) {
  Write-Host "Dry run only. Re-run with -Execute to modify the glasses." -ForegroundColor Yellow
}

Write-Section "Preflight"
Invoke-Adb -AdbArgs @("devices")
Invoke-Adb -AdbArgs @("shell", "dumpsys", "device_policy") -AllowFail | Select-String "Device Owner|com.openlab.labos" | ForEach-Object { Write-Host $_ }

if (-not $SkipBuild) {
  Write-Section "Build APKs"
  Write-Host "cd $DeviceDir"
  Write-Host ".\gradlew.bat :core-app:assembleDebug :camera:assembleDebug :dashboard-device:assembleDebug :devtools:assembleDebug"
  if ($Execute) {
    Push-Location $DeviceDir
    try {
      $env:ANDROID_HOME = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:USERPROFILE "AppData\Local\Android\Sdk" }
      $env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
      .\gradlew.bat :core-app:assembleDebug :camera:assembleDebug :dashboard-device:assembleDebug :devtools:assembleDebug
    } finally {
      Pop-Location
    }
  }
}

Write-Section "APK Inputs"
$apks = @()
foreach ($module in $Modules) {
  $apk = Assert-ApkExists $module
  if ($apk) {
    $apks += @{ Module = $module; Path = "$apk" }
    Write-Host "$($module.Name): $apk"
  }
}

Write-Section "Deactivate Device Owner"
if (Test-PackageInstalled "com.openlab.labos.core") {
  Invoke-Adb -AdbArgs @(
    "shell",
    "am",
    "broadcast",
    "-a",
    "com.openlab.labos.core.ACTION_CLEAR_DEVICE_OWNER",
    "-n",
    "com.openlab.labos.core/.ipc.CommandReceiver"
  ) -AllowFail
} else {
  Write-Host "Core package is not installed; skipping owner-clear broadcast." -ForegroundColor Yellow
}
if ($Execute) {
  Start-Sleep -Seconds 2
  $policyAfterClear = Invoke-Adb -AdbArgs @("shell", "dumpsys", "device_policy") -AllowFail
  if ($policyAfterClear -match "Device Owner:\s*\r?\n\s*admin=ComponentInfo") {
    throw "Device owner is still active after clear broadcast; refusing to uninstall core."
  }
}

Write-Section "Uninstall Old-Signature Packages"
$packagesToUninstall = @($Modules)
if ($KeepDevtools) {
  $packagesToUninstall = @($packagesToUninstall | Where-Object { $_.Name -ne "devtools" })
  Write-Host "Keeping devtools installed. Only use this if devtools is signed with the same certificate as the APKs being installed." -ForegroundColor Yellow
}
foreach ($module in @($packagesToUninstall | Sort-Object { if ($_.Name -eq "core-app") { 1 } else { 0 } })) {
  Invoke-Adb -AdbArgs @("uninstall", $module.Package) -AllowFail
}

Write-Section "Install New APKs"
foreach ($entry in $apks) {
  Invoke-Adb -AdbArgs @("install", "-r", "$($entry.Path)")
}

Write-Section "Reactivate Device Owner"
Invoke-Adb -AdbArgs @("shell", "dpm", "set-device-owner", "com.openlab.labos.core/.AdminReceiver")

Write-Section "Launch Core Service"
Invoke-Adb -AdbArgs @("shell", "am", "start-foreground-service", "-n", "com.openlab.labos.core/.LabOsService") -AllowFail

Write-Section "Verify Versions"
foreach ($module in $Modules) {
  Invoke-Adb -AdbArgs @("shell", "dumpsys", "package", $module.Package) -AllowFail |
    Select-String "versionCode|versionName|signatures=" |
    ForEach-Object { Write-Host "$($module.Name): $_" }
}

Write-Section "Done"
if (-not $Execute) {
  Write-Host "No changes were made. Re-run with -Execute when ready." -ForegroundColor Yellow
}
