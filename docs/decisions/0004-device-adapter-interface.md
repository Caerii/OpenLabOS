# 0004 — Device adapter interface

- Status: accepted
- Scope: `services/api`, `adapters/*`, `apps/device-reference`

## Context

Lab rigs vary wildly: a phone in a holder, head-worn glasses, a mounted
USB camera, a ROS 2 station, a serial-attached fixture. If the API speaks
any one of these wire protocols directly, every other one has to be
shoehorned in, and the API ages into a vendor-specific service.

## Decision

Devices are polymorphic behind a small, stable interface implemented by an
adapter package per family.

```ts
interface DeviceAdapter {
  id: string;
  capabilities: Capability[];          // camera, imu, audio, shell, packages, …
  open(opts): Promise<DeviceSession>;
  preview(): AsyncIterable<Frame>;
  sensors(): AsyncIterable<SensorSample>;
  close(): Promise<void>;
}
```

`services/api` discovers adapters by id, never imports a vendor SDK, and
never speaks a wire protocol. Each adapter package owns its own dependency
on transport, tooling, and codecs. New device families are new packages
under `adapters/`, never edits to `services/api`.

## Consequences

- A laptop, a phone, and a robotic arm join the system through the same
  shape; the rest of the stack treats them identically.
- The API surface stays small and provider-neutral.
- Cross-platform telemetry — battery, thermals, network — becomes the
  adapter's responsibility, surfaced as `Capability`-tagged signals.

## Alternatives considered

- **gRPC contract per device class.** Heavier wire format than we need at
  this stage; we may layer it in later for high-rate sensor streams.
- **One Express route per device family.** What we left behind. The route
  surface inflates as the device list grows; refactors stall.
