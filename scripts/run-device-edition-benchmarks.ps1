param(
  [ValidateSet("go", "rust", "all")]
  [string]$Edition = "all",
  [int]$DurationSeconds = 5,
  [int]$FrameIntervalMs = 250,
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$BenchmarkScript = Join-Path $RepoRoot "scripts\device-edition-benchmark.ps1"

function Invoke-BuildGo {
  $goDir = Join-Path $RepoRoot "device\editions\go"
  Push-Location $goDir
  try {
    $env:GOTELEMETRY = "off"
    New-Item -ItemType Directory -Force -Path "target" | Out-Null
    go build -o target\labos-device-go.exe .\cmd\labos-device
  } finally {
    Pop-Location
  }
}

function Invoke-BuildRust {
  $rustDir = Join-Path $RepoRoot "device\editions\rust"
  Push-Location $rustDir
  try {
    cargo build
  } finally {
    Pop-Location
  }
}

function Invoke-EditionBenchmark($name, $exe, $baseUrl, $envName = $null, $envValue = $null) {
  Write-Host ""
  Write-Host "== $name ==" -ForegroundColor Cyan
  if ($envName) {
    Set-Item -Path "env:$envName" -Value $envValue
  }
  $proc = Start-Process -FilePath $exe -WindowStyle Hidden -PassThru
  try {
    Start-Sleep -Milliseconds 800
    powershell -NoProfile -ExecutionPolicy Bypass -File $BenchmarkScript `
      -Edition $name `
      -BaseUrl $baseUrl `
      -DurationSeconds $DurationSeconds `
      -FrameIntervalMs $FrameIntervalMs
  } finally {
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    if ($envName) {
      Remove-Item -Path "env:$envName" -ErrorAction SilentlyContinue
    }
  }
}

$editions = if ($Edition -eq "all") { @("go", "rust") } else { @($Edition) }

if (-not $SkipBuild) {
  if ($editions -contains "go") { Invoke-BuildGo }
  if ($editions -contains "rust") { Invoke-BuildRust }
}

foreach ($item in $editions) {
  switch ($item) {
    "go" {
      $exe = Join-Path $RepoRoot "device\editions\go\target\labos-device-go.exe"
      Invoke-EditionBenchmark "go" $exe "http://127.0.0.1:8091" "LABOS_GO_ADDR" "127.0.0.1:8091"
    }
    "rust" {
      $exe = Join-Path $RepoRoot "device\editions\rust\target\debug\labos-device-rust.exe"
      Invoke-EditionBenchmark "rust" $exe "http://127.0.0.1:8092"
    }
  }
}

