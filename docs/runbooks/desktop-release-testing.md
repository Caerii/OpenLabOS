# Desktop Release Testing

Use this checklist before sharing an OpenLabOS desktop build outside the development machine.

## Local Build Smoke

From the repository root:

```powershell
pnpm desktop:prepare-runtime
pnpm desktop:verify-runtime
pnpm desktop:build
pnpm desktop:smoke-built-app
pnpm desktop:hash-artifacts
```

What each check proves:

- `desktop:verify-runtime`: the generated API bundle, copied Node runtime, and web client are present and `/api/health` responds.
- `desktop:build`: Tauri can package the app for the current OS.
- `desktop:smoke-built-app`: the built desktop executable starts and exposes the local API on `127.0.0.1:3847`.
- `desktop:hash-artifacts`: release artifacts have a reproducible SHA-256 manifest.

## Clean Machine Smoke

Install the generated artifact on a machine that has not built the repo.

Check:

- App opens directly to the OpenLabOS operator surface.
- Desktop runtime card shows the local API as running.
- Desktop runtime card shows ADB availability.
- If no ADB device is already online, desktop auto-connect attempts the configured target before falling back to the local bench default.
- With glasses connected over ADB, the card shows a device serial, battery summary, and hottest thermal zone.
- Power sample action records timestamped samples without freezing the UI.
- Operator pages can call the local API without manually setting backend URL.
- Quitting and reopening the app restarts the managed local API.

## Device Smoke

With glasses connected:

```powershell
adb devices -l
adb shell dumpsys battery
adb shell "for z in /sys/class/thermal/thermal_zone*; do if [ -f \"$z/temp\" ]; then printf \"%s,\" \"$(basename $z)\"; cat \"$z/type\" 2>/dev/null | tr -d \"\n\"; printf \",\"; cat \"$z/temp\" 2>/dev/null; fi; done"
```

The desktop UI should agree with these command outputs at the summary level.

## Native Video Import Smoke

With a recording present on the glasses under one of the approved roots:

- `/sdcard/LabOS`
- `/sdcard/Movies`
- `/sdcard/DCIM`
- `/sdcard/Download`

Check:

- Native inventory only lists video extensions: `.mp4`, `.mov`, `.mkv`, `.webm`.
- Import stores files under the desktop app data directory when no destination is provided.
- Imported files include byte size and SHA-256.
- Unsupported paths such as `/data/local/tmp/*.mp4` are rejected.

## Release Evidence

Record:

- Matching `*-SHA256SUMS.txt`
- CI run URL
- GitHub Release URL for `desktop-v*` tags
- Signing verification status
- OS version and architecture
- Whether ADB and glasses were present
- `/api/health` response mode
- Any install warnings from Windows SmartScreen or macOS Gatekeeper
