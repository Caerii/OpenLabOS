# Apps

End-user surfaces. An app is something an operator opens.

- **`web/`** — React + Vite + TypeScript single-page application. The default
  surface for desktop, tablet, and laptop usage. Talks to `services/api` over
  HTTP and to `services/voice` (when present) over WebRTC.
- **`device-reference/`** — Reference Android device-owner application. A
  generic implementation of the `DeviceAdapter` contract for HMD-class
  hardware. Vendor-specific forks live under `adapters/device-<vendor>/`.

Apps depend on `packages/sdk-ts` for typed access to the API, on
`packages/ui` for shared React primitives, and on `packages/protocol` for
shared types. They never import a service directly.
