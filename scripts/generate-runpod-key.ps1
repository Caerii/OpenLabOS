$ErrorActionPreference = "Stop"

$target = Join-Path $env:USERPROFILE ".ssh\runpod_openlabos_ed25519"
$targetDir = Split-Path -Parent $target
$publicKey = "$target.pub"
$comment = "runpod-openlabos-2026-05-27"

if (-not (Test-Path -LiteralPath $targetDir)) {
  New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
}

if ((Test-Path -LiteralPath $target) -or (Test-Path -LiteralPath $publicKey)) {
  throw "Key already exists at $target"
}

& ssh-keygen -t ed25519 -C $comment -f $target -N ""

if (-not (Test-Path -LiteralPath $publicKey)) {
  throw "Public key was not created at $publicKey"
}

Get-Content -LiteralPath $publicKey
