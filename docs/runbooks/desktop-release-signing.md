# Sign an OpenLabOS Desktop release

Use these steps to produce a signed desktop build for distribution.

Unsigned builds are useful for internal testing, but public installers should be signed:

- Windows signing reduces SmartScreen friction and is required for store-style distribution.
- macOS signing and notarization are required for browser-downloaded Developer ID apps.
- Linux artifacts are usually distributed with checksums and provenance rather than platform code signing.

## CI Behavior

`.github/workflows/desktop-build.yml` builds unsigned artifacts for pull requests and manual smoke runs when signing secrets are absent. Pushing a `desktop-v*` tag is the public release path: Windows signing secrets and macOS signing/notarization secrets are required, otherwise the workflow fails before publishing unsigned installers.

When signing secrets are present:

- Windows imports a base64 `.pfx` certificate into the current user certificate store before `pnpm desktop:build`.
- macOS imports a base64 `.p12` certificate into a temporary keychain and exports `APPLE_SIGNING_IDENTITY` before `pnpm desktop:build`.
- macOS notarization credentials are passed through to Tauri when present.

## Required Windows Secrets

- `WINDOWS_CERTIFICATE`: base64 encoded `.pfx`.
- `WINDOWS_CERTIFICATE_PASSWORD`: export password for the `.pfx`.
- `WINDOWS_CERTIFICATE_THUMBPRINT`: thumbprint for the imported code-signing certificate.
- `WINDOWS_TIMESTAMP_URL`: optional timestamp server. Defaults to `http://timestamp.digicert.com`.

The repo uses `desktop/scripts/sign-windows.ps1` as Tauri's Windows `signCommand`. It signs only when `WINDOWS_CERTIFICATE_THUMBPRINT` is present; otherwise it logs and leaves the artifact unsigned.

To configure Windows signing secrets from a local `.pfx`:

```powershell
pnpm desktop:configure-signing-secrets -- `
  -WindowsPfxPath C:\path\to\codesigning.pfx `
  -WindowsPfxPassword "<pfx export password>"
```

The helper computes `WINDOWS_CERTIFICATE_THUMBPRINT` from the `.pfx`, base64-encodes the certificate, and writes GitHub secrets through `gh secret set` without printing secret values.

## Required macOS Secrets

For signing:

- `APPLE_CERTIFICATE`: base64 encoded `.p12`.
- `APPLE_CERTIFICATE_PASSWORD`: export password for the `.p12`.
- `KEYCHAIN_PASSWORD`: temporary CI keychain password.

For notarization, use either Apple ID credentials:

- `APPLE_ID`
- `APPLE_PASSWORD`
- `APPLE_TEAM_ID`

Or App Store Connect API credentials:

- `APPLE_API_ISSUER`
- `APPLE_API_KEY`
- `APPLE_API_KEY_CONTENT`

To configure macOS signing and App Store Connect API notarization secrets:

```powershell
pnpm desktop:configure-signing-secrets -- `
  -AppleP12Path C:\path\to\developer-id-application.p12 `
  -AppleP12Password "<p12 export password>" `
  -KeychainPassword "<temporary CI keychain password>" `
  -AppleApiIssuer "<issuer UUID>" `
  -AppleApiKey "<key ID>" `
  -AppleApiKeyContentPath C:\path\to\AuthKey_ABC123DEFG.p8
```

## Artifact Hashes

CI runs `pnpm desktop:hash-artifacts` after bundling and uploads a platform-specific checksum file, such as `openlabos-desktop-windows-SHA256SUMS.txt`, with each platform artifact. Use it to confirm downloaded installers match the release build:

```powershell
Get-FileHash "OpenLabOS_0.1.0_x64-setup.exe" -Algorithm SHA256
```

When signing secrets are configured, CI also verifies:

- Windows Authenticode status and signing certificate thumbprint for MSI/EXE artifacts.
- macOS code signatures for the generated `.app` bundle.

## Release Checklist

1. Bump desktop package versions:
   ```powershell
   pnpm desktop:bump-version 0.2.0
   ```
2. Run locally:
   ```powershell
   pnpm desktop:prepare-runtime
   pnpm desktop:verify-runtime
   pnpm desktop:build
   pnpm desktop:smoke-built-app
   pnpm desktop:hash-artifacts
   ```
3. Confirm the built app starts `/api/health` from bundled resources.
4. Push a `desktop-v*` tag.
5. Wait for the `Desktop Build` workflow to finish and publish release assets.
6. Download the installer from the GitHub Release or workflow artifact and compare it against the matching `*-SHA256SUMS.txt`.
7. Verify installer signatures.
8. Smoke-test install on clean Windows and macOS machines.
9. Publish release notes with hashes and supported OS versions.
