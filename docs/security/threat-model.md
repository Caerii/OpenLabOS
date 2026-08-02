# OpenLabOS threat model (pre-1.0)

## Assets

- Protocol-run media (frames, audio, manifests)
- Device control channels (ADB, WiFi proxy)
- Inference provider credentials
- Operator session/event logs

## Trust boundaries

| Boundary | Default posture |
|----------|-----------------|
| Loopback Compose | No user auth; loopback bind only |
| LAN / remote | Requires TLS + `OPENLABOS_API_TOKEN` |
| Object-detection service | Optional bearer token; `imageUrl` SSRF filtered |
| Cloud providers | Opt-in credentials in environment only |

## Primary threats

1. **Unauthorized API access** — mitigated by loopback default + auth middleware when `OPENLABOS_AUTH_REQUIRED=true`.
2. **SSRF via perception `imageUrl`** — blocked private/link-local targets unless allowlisted.
3. **Sensitive media leakage** — operator responsibility; retention/deletion via `/api/runs/:id` DELETE.
4. **Device misuse** — device routes disabled in `CLOUD_MODE=true` Compose profile.

## Reporting

See [SECURITY.md](../../SECURITY.md) for private vulnerability reporting.
