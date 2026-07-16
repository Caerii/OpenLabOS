# scripts/

Operator and developer utilities. Each script is invoked from the repo
root.

| Script                                    | What it does                                                       |
| ----------------------------------------- | ------------------------------------------------------------------ |
| `openlabos-doctor.ps1`                    | Health check across the local install. Run after setup.            |
| `openlabos-live.ps1`                      | Starts the local stack (api + inference + web) for live use.       |
| `start-local-agent-stack.ps1`             | Starts the API, local operator, and HTTPS local-agent tunnel.       |
| `register-openlabos-protocol.ps1`         | Registers `openlabos://` to launch the local-agent stack.           |
| `install-cloudflared.ps1`                 | Installs a workspace-local Cloudflare tunnel binary.                |
| `openlabos-ota.ps1`                       | Pushes a fresh device build to a connected reference device.       |
| `openlabos-signature-reset-deploy.ps1`    | Re-signs and reinstalls the device app after a signature change.   |
| `build-device-debug.ps1`                  | Builds all Android debug APKs with the local SDK.                  |
| `flash-glasses.sh`                        | First-time bring-up of an HMD-class device (device-owner claim).   |
| `protocol-run-harness.ps1`                | Drives a scripted protocol session for demos.                      |
| `prepare-static-demo.ps1`                 | Builds a self-contained static demo bundle.                        |
| `build-device-prebuilts.ps1`              | Rebuilds `prebuilt/openlabos-debug` APK artefacts under `apps/device-reference/`. |
| `device-edition-benchmark.ps1`            | Benchmarks one device edition.                                     |
| `run-device-edition-benchmarks.ps1`       | Runs the full edition benchmark sweep.                             |
| `runpod-segmentation-sidecar.ps1`         | Boots the perception sidecar against a RunPod GPU.                 |
| `generate-runpod-key.ps1`                 | Provisions a RunPod API key for the inference service.             |
| `generate-protocol-voice-assets.ps1`      | Pre-renders TTS assets per protocol step.                          |
| `generate-gemini-live-protocol-assets.ps1`| Pre-renders Gemini live-coach assets per protocol step.            |
| `check-sidecar-smoke.py`                  | Smoke test for the perception sidecar's runtime contract.          |

PowerShell scripts target Windows; bash scripts target macOS/Linux. Any
script that touches a remote device prints what it would do with a
`-WhatIf` flag where supported.
