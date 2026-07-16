# libjpeg-turbo NDK scaffold

Build `labos_turbojpeg` against libjpeg-turbo for ARM64 NEON encode.

Until built, `TurboJpegEncoder.encodeNv21()` returns null and `CameraCapture` falls back to `YuvImage`.

Target: shift MJPEG pareto frontier from ~74ms (720p15 software) toward ~50ms at same Q.
