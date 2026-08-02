# Security policy

OpenLabOS is pre-1.0 research software. It is not validated for clinical,
diagnostic, safety-critical, or regulated laboratory use.

## Supported versions

There are no supported release branches yet. Security fixes are applied to the
default branch while the project is in active development.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability.

Use the repository's **Security → Report a vulnerability** flow to send a
private report. Include:

- the affected component and revision;
- reproduction steps or a minimal proof of concept;
- the expected impact;
- whether credentials, devices, or network access are required; and
- any suggested mitigation.

If private vulnerability reporting is not enabled, contact a maintainer
privately and ask for a secure reporting channel before sharing details.

## Current security boundaries

- The Docker Compose stack binds its public port to `127.0.0.1`.
- The API can require one bearer token for remote experiments. It does not
  provide user accounts, roles, or production-grade identity management.
- Device control routes may invoke ADB or forward requests to configured
  hardware when the API is run outside Compose in local-device mode.
- Cloud model providers and voice services are opt-in and require credentials.
- Protocol-run media can contain sensitive laboratory or personal information;
  operators are responsible for storage, retention, and access controls.

Do not expose the API directly to an untrusted network. For a remote
experiment, enable the API token check and put TLS, request limits, and a
reviewed reverse proxy in front of it.

## Secret handling

Never commit `.env` files, API keys, device tokens, signing keys, or captured
private media. Commit only redacted fixtures and `.env.example` templates.
