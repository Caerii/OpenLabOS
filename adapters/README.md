# Device Adapters

An adapter is a small package that lets one family of hardware participate in
OpenLabOS. Each adapter implements the `DeviceAdapter` contract from
`packages/protocol`:

```ts
interface DeviceAdapter {
  id: string;
  capabilities: Capability[];        // camera, imu, audio, shell, packages, …
  open(opts): Promise<DeviceSession>;
  preview(): AsyncIterable<Frame>;
  sensors(): AsyncIterable<SensorSample>;
  close(): Promise<void>;
}
```

| Adapter            | What it adapts                                            |
| ------------------ | --------------------------------------------------------- |
| `device-android/`  | Android phone / HMD via ADB or on-device HTTP API.         |
| `device-webcam/`   | Local webcam or WebRTC track for laptops and tablets.      |
| `device-ros2/`     | ROS 2 topics for robotic stations.                         |
| `device-serial/`   | USB serial / Firmata for microcontroller rigs.             |

Adding a new device family is a new adapter package, never a change to
`services/api`. Vendor-specific forks (e.g. K900-flavoured behaviour) belong
inside an adapter, not in core.
