# OpenLabOS Desktop Tauri Shell

## Decision

OpenLabOS ships a native Tauri shell while keeping the web console and local API as the primary product runtime.

The desktop app is a native orchestrator, not a second implementation of OpenLabOS.

## Why This Matters

Browser-only OpenLabOS is good for iteration, but glasses workflows need local capabilities that are brittle from a browser:

- ADB discovery, reconnect, and device selection.
- Battery, voltage, charge counter, and thermal sampling.
- Native video import from `/sdcard/LabOS/media`.
- Local file hashing, dataset export, and artifact indexing.
- Running local preview, validation, VQA, and power experiments as supervised processes.

Tauri gives OpenLabOS a small native wrapper with Rust commands for these operations while preserving the React console and API contracts.

## Boundaries

The web console owns:

- Operator UI and user workflows.
- Kitchen protocol UX.
- Saved run library.
- VQA annotation and review surfaces.
- Protocol launch and supervision views.

The API owns:

- Protocol and AI logic.
- Session manifests.
- Device adapter routing.
- Local inference/provider orchestration.
- Artifact and evidence contracts.

The desktop shell owns:

- Native packaging and updates.
- Service lifecycle for local OpenLabOS processes.
- Narrow native device commands.
- Local file/device permissions.
- OS-specific diagnostics.

## Native Command Contract

Initial Tauri commands:

- `desktop_health`: verify native shell and ADB availability.
- `labos_api_status`: check whether the local API port is reachable.
- `labos_api_start`: launch the bundled API runtime or repo-local built API.
- `labos_api_stop`: stop the API process when it was started by the desktop shell.
- `adb_devices_status`: return typed connected-device records.
- `adb_battery_status`: return typed battery level, voltage, charge counter, status, and temperature fields.
- `adb_thermal_status`: return typed thermal-zone samples and the hottest zone.
- `adb_connect`: connect to a glasses ADB endpoint.
- `adb_native_video_inventory`: list video files under approved media roots on the glasses.
- `adb_import_native_videos`: pull selected video files into the desktop app data directory and hash them.
- `adb_power_sample`: collect bounded timestamped battery and thermal samples.

Raw compatibility commands still exist for diagnostics:

- `adb_devices`
- `adb_battery`
- `adb_thermal`

Future commands should stay narrow and typed.

## Packaging Path

The production desktop runtime is generated under `desktop/src-tauri/resources`:

- `resources/openlabos-api/index.mjs`: bundled OpenLabOS API.
- `resources/client`: built OpenLabOS web console.
- `resources/node`: copied platform Node runtime.

On launch, Tauri starts the bundled API and exposes status in the operator console. It falls back to `services/api/dist/index.js` only for repo-local developer builds.

`http://127.0.0.1:3847` remains the desktop local API default unless explicitly changed.

## Build Pipeline

`pnpm desktop:prepare-runtime` performs production runtime preparation:

1. Builds the web client.
2. Bundles the API server with esbuild into a single ESM entry.
3. Copies the built web client into Tauri resources.
4. Copies the current platform Node runtime into Tauri resources.

`pnpm desktop:build` runs that preparation step before Tauri bundles installers. This must be done on each target OS because the Node runtime is platform-specific.

`pnpm desktop:verify-runtime` starts the generated API bundle with the copied Node runtime and checks `/api/health` on a throwaway local port.

`pnpm desktop:smoke-built-app` starts the built desktop executable and checks the managed API on the normal desktop port.

## CI Release Path

The desktop CI workflow builds unsigned artifacts on native runners:

- Windows runner for MSI and NSIS setup EXE.
- macOS runner for DMG/app bundle.
- Ubuntu runner for Linux bundles.

Release tags require signing and notarization secrets. Pull requests and manual smoke runs can build unsigned artifacts.

## UX Direction

The desktop app should open directly into an operator console:

- Device status.
- OpenLabOS service status.
- Battery and temperature.
- Native video import state.
- Power/thermal sample state.
- Preview/capture mode.
- Kitchen run launcher.
- Saved run import state.
- VQA batch queue state.

It should avoid a marketing landing page. The user downloaded the app to run OpenLabOS.
