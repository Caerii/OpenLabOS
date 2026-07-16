# Flutter Edition

This edition is a scaffold for a higher-quality Android control app built with Flutter.
Flutter is not installed on this workstation yet, so this directory contains source-level
organization and UI code but not a generated Android shell.

## Intended Role

Flutter is a good candidate for the on-glasses operator UI and local control surface:

- Better UI velocity than raw Android views.
- Stronger layout quality for small display surfaces.
- Reasonable integration with native Android through platform channels.

Flutter should not own the most latency-sensitive frame path until measured. Camera capture,
MJPEG serving, frame rings, and LED control may still be better in Java/Kotlin, Rust, or Go.

## Generate Android Shell

After installing Flutter SDK:

```powershell
cd device\editions\flutter
flutter create . --platforms android --org com.openlab.labos
flutter build apk
```

## Benchmark Requirement

The Flutter app must implement the contract in `../contracts/labos_device_api.md` before it
can be compared to Java.

Current scaffold features:

- `DeviceSnapshot` model aligned with preview/recording contract fields.
- `LabosDeviceController` interface for swapping demo and platform-backed controllers.
- `PlatformLabosDeviceController` using a method channel named `com.openlab.labos/device`.
- `DemoLabosDeviceController` for UI development without glasses.
- Interactive preview and recording controls against the demo controller.
