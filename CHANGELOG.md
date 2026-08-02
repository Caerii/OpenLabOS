# Changelog

OpenLabOS is pre-1.0. This file tracks product, operations, security, and
developer-workflow changes. Interfaces may change before a compatibility
policy is published.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Criterion evidence `method` / `measured_value` / `measured_unit`, canonical
  measurement units, and `measurement_recorded` session events so numeric
  claims carry provenance rather than implying instrument readings from
  vision alone.
- `buffer-prepare` example protocol rewritten as a 1× TBS SOP with volume
  and pH acceptance criteria.
- Eval reporting requirements (n, per-step metrics, CIs, false-accept
  fixtures, inter-rater agreement, producer identity).
- Docker Compose stack for the web console, API, inference service, and
  deterministic perception backend.
- Compose verification for service health, an end-to-end protocol run, and
  session persistence across an API restart.
- Filesystem-backed session persistence using the ADR 0014 layout.
- Dependency-aware `/api/readyz` and a run index at `/api/runs`.
- Event bridge between the legacy kitchen workflow and Hono session records.
- Run evidence catalog, replay corpus, frozen evaluation fixture, and
  engineering instrumentation view.
- Web unit tests, Playwright coverage, and a webcam adapter scaffold.
- Optional API token checks, server-side request forgery filtering, Dependabot,
  and secret scanning in CI.
- Apache-2.0 for code and CC0 1.0 for documentation.
- Operator and engineering experience profiles.

### Changed

- Root documentation now distinguishes working, experimental, and planned
  capabilities.
- Operator labels now distinguish step checks, saved runs, and object detection
  from the internal service names.

### Fixed

- Browser-safe preview package entrypoint.
- Missing VQA annotation defaults in saved-run evidence.
