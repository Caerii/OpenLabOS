$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$launcher = Join-Path $repoRoot "scripts\openlabos-protocol-launcher.ps1"
$powershell = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
$command = "`"$powershell`" -NoProfile -ExecutionPolicy Bypass -File `"$launcher`" `"%1`""
$key = "HKCU:\Software\Classes\openlabos"

New-Item -Path $key -Force | Out-Null
Set-Item -Path $key -Value "URL:OpenLabOS Agent Protocol"
New-ItemProperty -Path $key -Name "URL Protocol" -Value "" -PropertyType String -Force | Out-Null
New-Item -Path "$key\shell\open\command" -Force | Out-Null
Set-Item -Path "$key\shell\open\command" -Value $command

Write-Host "[OpenLabOS] Registered openlabos:// protocol handler for this Windows user."
Write-Host "[OpenLabOS] Browser launch URL: openlabos://start-agent"
Write-Host "[OpenLabOS] Command: $command"
