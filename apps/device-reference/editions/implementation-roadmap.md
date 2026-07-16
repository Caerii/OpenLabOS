# Device Edition Implementation Roadmap

The goal is not to rewrite the device app four times blindly. The goal is to isolate which
runtime gives the best result for each layer of the LabOS glasses stack.

## Layer Ownership Hypothesis

| Layer | Best candidate | Reason |
| --- | --- | --- |
| Device owner, boot policy, permissions | Java/Kotlin | Android APIs are first-class and already working. |
| Camera2, MediaRecorder, LEDs | Java/Kotlin | Lowest integration risk for Mentra hardware. |
| On-glasses operator UI | Flutter | Best iteration speed and visual quality. |
| HTTP/control-plane sidecar | Go or Java/Kotlin | Go is clean for tools; Java/Kotlin avoids Android packaging friction. |
| Frame ring buffers and native transforms | Rust | Strong candidate for deterministic memory/CPU behavior. |
| Offline benchmark/diagnostic tools | Go | Fast to ship, portable, easy CLI packaging. |

## Milestones

1. Preserve the Java demo path.
2. Benchmark Java on real glasses with the same harness used for Go/Rust loopback.
3. Generate a Flutter Android shell and implement the `com.openlab.labos/device` method channel.
4. Prototype a Rust JNI library for frame ring buffers while Java still owns Camera2.
5. Prototype Go only if gomobile packaging overhead is acceptable.
6. Compare battery, CPU, frame latency, recording reliability, APK size, and implementation complexity.

## Stop Conditions

- If an edition cannot access camera/LED/device-owner APIs cleanly, it should not own the primary APK.
- If a native module saves less than 10-15 ms on real frame processing, prefer simpler Java/Kotlin.
- If Flutter increases idle power materially, use it as phone/dashboard UI rather than always-on glasses UI.

## APK Signature Migration

Android cannot OTA-update a package when the installed APK and built APK use different signing
certificates. The current deploy route reports this as `signature_mismatch`.

If the original signing key is unavailable, use `scripts/labos-signature-reset-deploy.ps1`.
It defaults to dry-run; `-Execute` performs the destructive migration by deactivating device
owner, uninstalling old-signature LabOS packages, installing the current APKs, and reactivating
device owner.
