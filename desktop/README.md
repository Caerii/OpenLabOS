# OpenLabOS Desktop

Native desktop shell for OpenLabOS on Windows, macOS, and Linux.

The desktop app packages the OpenLabOS web console with a bundled local API runtime and a narrow native bridge for device diagnostics. It is the preferred operator surface when working with real glasses, local ADB, native video artifacts, or release-smoke validation.

## Development

```powershell
pnpm desktop:dev
```

The Tauri dev app starts `apps/web` and loads `http://localhost:5174`.

## Runtime Bundle

```powershell
pnpm desktop:prepare-runtime
pnpm desktop:verify-runtime
```

The runtime bundle is generated under `desktop/src-tauri/resources`:

- `resources/openlabos-api/index.mjs`: bundled OpenLabOS API server.
- `resources/client`: copied OpenLabOS web build.
- `resources/node`: copied Node runtime used to launch the bundled API.

On launch, Rust prefers the bundled runtime. If it is unavailable, it falls back to a repo-local `services/api/dist/index.js` and then system `node`.

## Build

```powershell
pnpm desktop:build
pnpm desktop:smoke-built-app
pnpm desktop:hash-artifacts
```

Public release tags should fail closed unless real signing and notarization secrets are configured.
