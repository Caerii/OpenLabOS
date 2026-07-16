# 0003 — Protocol versioning

- Status: accepted
- Scope: `packages/protocol`, `services/api`, training datasets

## Context

A `Protocol` document is the contract between an operator and the system: it
names the steps, the expected objects, and the success criteria. If the
contract changes silently, every dataset and every saved run becomes
ambiguous — was this run judged against the old criterion or the new one?

## Decision

Every `Protocol` carries a `protocol_version` field that **must** be a
semver string, validated by the schema. A `RunManifest` records the
`protocol_version` and a `protocol_hash` (SHA-256 of the canonicalised
document) at the moment the run started. Datasets are partitioned by
`protocol_id @ protocol_version`; eval reports always cite both.

Forward compatibility rules:

- **Patch bumps** (1.2.3 → 1.2.4): only fix typos, examples, prose. The
  `protocol_hash` will differ, but no consumer needs to change behaviour.
- **Minor bumps**: add new optional steps, expand `expected_objects` with
  new optional entries, add success-criterion variants that older judges
  can ignore.
- **Major bumps**: any change to step ordering, removal of objects, or
  semantics of an existing criterion. A new dataset partition begins.

`services/api` rejects a session start whose protocol version is unknown;
the registry is read-only after boot.

## Consequences

- "Which protocol produced this metric" has a one-string answer.
- Authors learn semver discipline; the schema enforces the shape but not
  the social contract.
- Old runs continue to evaluate cleanly even after the protocol moves on.

## Alternatives considered

- **Content hash only.** Loses the human-readable progression that helps
  reviewers reason about compatibility.
- **CalVer.** Optimises for release frequency but obscures intent.
