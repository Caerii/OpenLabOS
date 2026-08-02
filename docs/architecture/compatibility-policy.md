# API and protocol compatibility policy (pre-1.0)

## Protocol schemas

- `protocol_version` uses semver (`MAJOR.MINOR.PATCH`).
- **Patch** changes are backward compatible (clarifications, optional fields).
- **Minor** changes may add optional steps/objects; old manifests remain readable.
- **Major** changes require a new protocol document and migration tooling.

## HTTP API

- Coordination routes under `/api/sessions`, `/api/judgments`, `/api/runs` are
  considered unstable until OpenLabOS 1.0.
- Breaking changes must update `packages/sdk-ts/openapi.json` and replay tests.

## Manifests

- `manifest_version` is currently literal `1`.
- Run manifests include `protocol_hash` for forward-compat checks.

## Release gates

See [roadmap.md](roadmap.md) gate #3.
