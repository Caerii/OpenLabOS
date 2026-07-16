# Java Edition

This is the current production LabOS device implementation.

## Source Map

| Module | Role |
| --- | --- |
| `device/core-sdk` | Shared AIDL, constants, and satellite app client helpers. |
| `device/core-app` | Device owner, boot handling, MCU/BLE, LEDs, settings, and policy control. |
| `device/camera` | Camera2 capture, preview server, still capture, and native video recording. |
| `device/dashboard-device` | On-device HTTP dashboard/proxy endpoints. |
| `device/devtools` | Device diagnostics and development utilities. |

## Build

```powershell
cd device
.\gradlew.bat :core-app:assembleDebug :camera:assembleDebug :dashboard-device:assembleDebug
```

## Benchmark

From the repo root with the dashboard server running:

```powershell
.\scripts\device-edition-benchmark.ps1 -Edition java -BaseUrl http://127.0.0.1:3847 -DurationSeconds 15
```

## Notes

- Do not move these modules before the live demo path is stable; deploy and dashboard routes
  currently depend on the existing APK output paths.
- Current APK updates require matching the installed signing key. If the key is unavailable,
  reinstalling the new APKs requires a device-owner migration.

