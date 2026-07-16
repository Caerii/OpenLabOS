param(
  [string]$Repository = "OpenLabOS/OpenLabOS",

  [string]$WindowsPfxPath,
  [string]$WindowsPfxPassword,
  [string]$WindowsTimestampUrl = "http://timestamp.digicert.com",

  [string]$AppleP12Path,
  [string]$AppleP12Password,
  [string]$KeychainPassword,

  [string]$AppleId,
  [string]$ApplePassword,
  [string]$AppleTeamId,

  [string]$AppleApiIssuer,
  [string]$AppleApiKey,
  [string]$AppleApiKeyContentPath
)

$ErrorActionPreference = "Stop"

function Assert-Gh {
  $gh = Get-Command gh -ErrorAction SilentlyContinue
  if (-not $gh) {
    throw "GitHub CLI 'gh' was not found. Install gh and authenticate with 'gh auth login' first."
  }
}

function Set-GitHubSecret {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [Parameter(Mandatory = $true)]
    [string]$Value
  )

  $temp = New-TemporaryFile
  try {
    Set-Content -LiteralPath $temp.FullName -Value $Value -NoNewline
    gh secret set $Name --repo $Repository --body-file $temp.FullName | Out-Host
  } finally {
    Remove-Item -LiteralPath $temp.FullName -Force -ErrorAction SilentlyContinue
  }
}

function Convert-FileToBase64 {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  $resolved = Resolve-Path -LiteralPath $Path
  [Convert]::ToBase64String([IO.File]::ReadAllBytes($resolved.Path))
}

Assert-Gh

$configured = New-Object System.Collections.Generic.List[string]

if (-not [string]::IsNullOrWhiteSpace($WindowsPfxPath)) {
  if ([string]::IsNullOrWhiteSpace($WindowsPfxPassword)) {
    throw "WindowsPfxPassword is required when WindowsPfxPath is provided."
  }

  $resolvedPfx = Resolve-Path -LiteralPath $WindowsPfxPath
  $cert = [Security.Cryptography.X509Certificates.X509Certificate2]::new(
    $resolvedPfx.Path,
    $WindowsPfxPassword,
    [Security.Cryptography.X509Certificates.X509KeyStorageFlags]::Exportable
  )

  if (-not $cert.HasPrivateKey) {
    throw "The Windows PFX does not contain a private key."
  }

  $codeSigningOid = "1.3.6.1.5.5.7.3.3"
  $eku = $cert.Extensions | Where-Object { $_ -is [Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension] } | Select-Object -First 1
  if ($eku -and -not ($eku.EnhancedKeyUsages | Where-Object { $_.Value -eq $codeSigningOid })) {
    Write-Warning "The Windows certificate EKU does not list Code Signing ($codeSigningOid)."
  }

  Set-GitHubSecret -Name "WINDOWS_CERTIFICATE" -Value (Convert-FileToBase64 -Path $resolvedPfx.Path)
  Set-GitHubSecret -Name "WINDOWS_CERTIFICATE_PASSWORD" -Value $WindowsPfxPassword
  Set-GitHubSecret -Name "WINDOWS_CERTIFICATE_THUMBPRINT" -Value ($cert.Thumbprint -replace "\s", "")
  Set-GitHubSecret -Name "WINDOWS_TIMESTAMP_URL" -Value $WindowsTimestampUrl
  $configured.Add("Windows signing")
}

if (-not [string]::IsNullOrWhiteSpace($AppleP12Path)) {
  if ([string]::IsNullOrWhiteSpace($AppleP12Password)) {
    throw "AppleP12Password is required when AppleP12Path is provided."
  }
  if ([string]::IsNullOrWhiteSpace($KeychainPassword)) {
    throw "KeychainPassword is required when AppleP12Path is provided."
  }

  Set-GitHubSecret -Name "APPLE_CERTIFICATE" -Value (Convert-FileToBase64 -Path $AppleP12Path)
  Set-GitHubSecret -Name "APPLE_CERTIFICATE_PASSWORD" -Value $AppleP12Password
  Set-GitHubSecret -Name "KEYCHAIN_PASSWORD" -Value $KeychainPassword
  $configured.Add("macOS signing")
}

if (-not [string]::IsNullOrWhiteSpace($AppleId) -or -not [string]::IsNullOrWhiteSpace($ApplePassword) -or -not [string]::IsNullOrWhiteSpace($AppleTeamId)) {
  if ([string]::IsNullOrWhiteSpace($AppleId) -or [string]::IsNullOrWhiteSpace($ApplePassword) -or [string]::IsNullOrWhiteSpace($AppleTeamId)) {
    throw "AppleId, ApplePassword, and AppleTeamId must be provided together."
  }

  Set-GitHubSecret -Name "APPLE_ID" -Value $AppleId
  Set-GitHubSecret -Name "APPLE_PASSWORD" -Value $ApplePassword
  Set-GitHubSecret -Name "APPLE_TEAM_ID" -Value $AppleTeamId
  $configured.Add("macOS notarization via Apple ID")
}

if (-not [string]::IsNullOrWhiteSpace($AppleApiIssuer) -or -not [string]::IsNullOrWhiteSpace($AppleApiKey) -or -not [string]::IsNullOrWhiteSpace($AppleApiKeyContentPath)) {
  if ([string]::IsNullOrWhiteSpace($AppleApiIssuer) -or [string]::IsNullOrWhiteSpace($AppleApiKey) -or [string]::IsNullOrWhiteSpace($AppleApiKeyContentPath)) {
    throw "AppleApiIssuer, AppleApiKey, and AppleApiKeyContentPath must be provided together."
  }

  Set-GitHubSecret -Name "APPLE_API_ISSUER" -Value $AppleApiIssuer
  Set-GitHubSecret -Name "APPLE_API_KEY" -Value $AppleApiKey
  Set-GitHubSecret -Name "APPLE_API_KEY_CONTENT" -Value (Get-Content -LiteralPath (Resolve-Path -LiteralPath $AppleApiKeyContentPath).Path -Raw)
  $configured.Add("macOS notarization via App Store Connect API")
}

if ($configured.Count -eq 0) {
  throw "No signing inputs were provided. Pass WindowsPfxPath and/or AppleP12Path plus notarization credentials."
}

Write-Host "Configured: $($configured -join ', ') for $Repository."
Write-Host "Secret values were written through gh and were not printed."
