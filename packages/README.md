# Packages

Reusable libraries shared across apps, services, and adapters. A package
publishes a small, stable surface; a service consumes packages but is not one.

| Package              | Purpose                                                        |
| -------------------- | -------------------------------------------------------------- |
| `protocol/`          | Canonical schema (Zod + emitted JSON Schema) — the spine.       |
| `sdk-ts/`            | TypeScript client, generated from the API's OpenAPI document.   |
| `sdk-py/`            | Python client mirroring `sdk-ts`.                               |
| `ui/`                | Shared React primitives (Tailwind, headless components).        |
| `modules/<domain>/`  | Domain modules that contribute vocabulary + prompt fragments.   |

A package may depend on other packages but **never** on a service or an app.
Generated code lives under `_generated/` and is gitignored.
