# apps/device-reference

The reference Android implementation of OpenLabOS's `DeviceAdapter`
contract. It runs as a **device owner** on
[Mentra Live](https://mentra.glass) smart glasses (and other K900-family
HMD hardware), exposing camera, IMU, audio, shell, and package management
to the rest of the stack over a small on-device HTTP API.

This module is one adapter, not the system. Other hardware families plug
in through their own packages under `adapters/`.

## Target hardware

The primary target is **Mentra Live**, an open hardware platform built on
the **K900** SoC family. Mentra publishes the upstream
[`asg_client`](https://github.com/Mentra-Community) reference
implementation; this app starts from the same hardware idioms (MCU
framing, BLE control, camera service) and wraps them in the OpenLabOS
adapter contract.

Other devices in the K900 family work with no code changes; non-K900
devices need their own adapter.

## Module split

| Module               | Purpose                                                           |
| -------------------- | ----------------------------------------------------------------- |
| `core-app/`          | Device owner application — MCU connection, audio, sensors, LEDs.  |
| `core-sdk/`          | Library exposed to the other modules and to third-party apps.     |
| `camera/`            | Camera capture pipeline + on-device MJPEG preview server.         |
| `dashboard-device/`  | On-device HTTP API consumed by the OpenLabOS adapter package.     |
| `devtools/`          | Diagnostics overlay, log explorer, runtime toggles.               |
| `editions/`          | Per-target tuning (FOV, capture profile, MCU dialect).            |
| `migration-helper/`  | One-shot helper that handles first-claim of device-owner status.  |

## What "device owner" means here

Device-owner status is the highest Android management privilege below
root. Once granted (via `dpm set-device-owner` after a factory reset), the
app can install and uninstall APKs silently, manage permissions, freeze
stock applications, and persist across reboots without user prompts. This
is what makes Mentra Live usable as an unattended scientific instrument.

Claiming device-owner displaces the stock `com.mentra.asg_client`
launcher. The `migration-helper` module documents both the takeover and
the restore path; consult its README before flashing a fresh device.

## Build

```bash
cd apps/device-reference
./gradlew assembleDebug
```

Requires JDK 17. Output APKs land under `<module>/build/outputs/apk/debug/`
and are surfaced to the rest of the monorepo through the `prebuilt/` cache
when `pnpm device:prebuild` runs at the repo root.

## Local properties

`local.properties` is not checked in (it points at developer-specific
absolute paths). Copy `local.properties.example` to `local.properties` and
edit:

```
sdk.dir=/path/to/Android/Sdk
```

## Connecting

Mentra Live supports **ADB over WiFi only** (no USB ADB). The USB-C
Infinity Cable provides charging and a separate camera path.

Connect the glasses to your WiFi (the easiest path is the MentraOS phone
app). With the glasses on the same network as your workstation, the
flash-glasses script in `scripts/flash-glasses.sh` walks the rest of the
bring-up.

## The DeviceAdapter contract this app implements

The adapter package under `adapters/device-android/` consumes the device's
HTTP API on port 8080 and surfaces it to `services/api` as a generic
`DeviceAdapter`. The HTTP shape is documented in the dashboard-device
module README.

A second device family — a webcam, a ROS 2 station, a serial fixture —
implements the same interface in its own adapter package and is
indistinguishable to the rest of the stack.

## Hardware protocols

The MCU on Mentra Live (and other K900-family hardware) speaks a binary
framing format the codebase calls *the K900 protocol*. The implementation
lives in `core-app/src/main/java/os/openlab/labos/core/ble/`. Hardware
that speaks a different protocol gets its own protocol class alongside.

## Restoring stock Mentra

If you need to revert to the stock `asg_client` experience:

```bash
adb shell pm enable com.mentra.asg_client
adb shell am start -n com.mentra.asg_client/.MainActivity
```

The `migration-helper` module documents the supporting steps (signature
reset, permission cleanup) for a clean revert.
