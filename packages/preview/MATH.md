# Preview pipeline mathematics

See `@openlabos/preview/math` (`pipeline-model.ts`) for exported helpers.

## Latency decomposition

Treat stages as random variables \(L_i \geq 0\):

\[
L_{\text{e2e}} \approx \sum_i L_i = L_{\text{capture→encode}} + L_{\text{encode→publish}} + L_{\text{publish→client}} + L_{\text{decode→display}}
\]

Empirical tuning minimizes \(L_{\text{e2e}}\) subject to quality constraint \(Q \geq Q_{\min}\).

## Quality proxy

Operational quality score (megapixel×fps):

\[
Q = \frac{W \times H \times F}{10^6}
\]

Pareto-efficient configs satisfy: no other config has both lower latency and higher \(Q\).

## Rate–distortion intuition

- **MJPEG**: independent frames → \(R \propto Q_{\text{jpeg}} \times WHF\) (no temporal coding).
- **H.264**: motion compensation + transform → same \(Q\) at lower \(R\), but adds encoder delay \(L_{\text{encode}}\).
- **Hardware surface-in H.264**: \(L_{\text{capture→encode}} \to 0\) (sensor feeds encoder directly).

## Representational hierarchy (typical device latency order)

1. Hardware H.264 (Camera2 → MediaCodec surface)
2. libjpeg-turbo NEON (NV21 → DCT on CPU, ~2× software JPEG)
3. Software JPEG (`YuvImage`)
4. MJPEG multipart framing overhead (~120 B/frame)

## Transport framing

| Transport | Overhead model |
|-----------|----------------|
| MJPEG HTTP | ~120 B + 0.2% payload |
| H.264 Annex-B | ~4 B + 0.1% payload |
| WebRTC SRTP | ~48 B + 1.2% payload (lower HoL blocking) |

## Energy model

On-device power decomposition (`energy-model.ts`):

\[
P_{\text{total}} \approx P_{\text{idle}} + P_{\text{sensor}}(WHF) + P_{\text{encode}}(\text{mode}, WHF, Q, R) + P_{\text{network}}(\text{bytes/s}) + P_{\text{cpuMisc}} + P_{\text{thermal}}
\]

| Subsystem | Physics proxy |
|-----------|----------------|
| Sensor/ISP | linear in megapixel×fps |
| Software JPEG | MP×fps × (Q/100) |
| Hardware H.264 | fixed VENC block + Mbps entropy term |
| WiFi | idle radio + KB/s airtime |
| Thermal | penalty above reference CPU temp |

Energy per frame: \(E_f = P_{\text{total}} / F\) (mJ). Efficiency: \(\eta_E = Q / P_{\text{total}}\).

Calibrate coefficients from charge-counter discharge:

\[
P_{\text{measured}} = \frac{|\Delta\text{µAh}| / 1000}{t_{\text{hours}}} \times V_{\text{mV}} / 1000 \quad [\text{mW}]
\]

## Tools

- `pnpm preview:pareto` — 7-point baseline sweep (includes modeled energy)
- `pnpm preview:pareto:deep` — 26-point lattice (bitrate × GOP × resolution)
- `pnpm preview:energy` — charge-counter / sysfs calibration sweep; writes per-profile `*.jsonl` time series
- `pnpm preview:trace` — standalone 1–2s synchronized trace (power + pipeline stages + Wi‑Fi)
- `GET /api/preview/trace` — per-stage p50/p95 + energy breakdown

### Battery granularity (Mentra / MTK-class)

| Signal | Resolution | Use |
|--------|------------|-----|
| `dumpsys battery level` / sysfs `capacity` | Integer % (often 1%; voice/TTS may round to 10%) | UI / coarse alerts |
| `charge_counter` / `charge_full` (µAh) | Sub-percent SOC (`×100/ charge_full`) | Coulomb slope mW, calibration |
| `current_now` + `voltage_now` | ~1 Hz instantaneous | Fast temporal power proxy |

### Thermal gradient

\[
\frac{dT_\text{CPU}}{dt} \approx \frac{P_\text{dissipated} - P_\text{cooling}}{C_\text{thermal}}
\]

Empirical sweep (`pnpm preview:thermal`) measures °C/min ramp vs fps, bitrate, resolution mitigations.
Target: keep CPU below 75°C — last deep run hit **79.3°C** on `lowLatency` 720p30.
