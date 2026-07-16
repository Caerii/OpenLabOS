# Design Decisions

Numbered, append-only notes that explain *why* OpenLabOS is the way it is.
Each file pins one structural choice with the reasoning behind it; together
they read as the system's running memory.

A decision is worth recording when it:

- crosses more than one service or package boundary,
- shapes a public contract (schema, route, file format),
- locks us out of, or into, a future option, or
- would otherwise be re-litigated by a careful reader six months from now.

Routine code changes don't get a decision file; deletes need a successor file
that names what replaces them.

## Format

```markdown
# 0007 — Title in plain English

- Status: accepted | proposed | superseded by 00NN
- Date: YYYY-MM
- Scope: which planes / packages this binds

## Context
What forces are at play.

## Decision
The chosen path, in one or two paragraphs.

## Consequences
What becomes easier, what becomes harder, what is now forbidden.

## Alternatives considered
Brief — enough that a reader can audit the trade.
```

## Index

- [0001 — Monorepo tooling](0001-monorepo-tooling.md)
- [0002 — Schema as source of truth](0002-schema-source-of-truth.md)
- [0003 — Protocol versioning](0003-protocol-versioning.md)
- [0004 — Device adapter interface](0004-device-adapter-interface.md)
- [0005 — Reasoning gateway contract](0005-reasoning-gateway-contract.md)
- [0006 — Local-first by default](0006-local-first-default.md)
- [0007 — Operator surfaces](0007-operator-surfaces.md)
- [0008 — Storage tiering](0008-storage-tiering.md)
- [0009 — Local model runtimes](0009-local-model-runtimes.md)
- [0010 — Sampled frames over full video](0010-sampled-frames-over-full-video.md)
- [0011 — Closed-world protocols](0011-closed-world-protocols.md)
- [0012 — Vision-language baseline](0012-vision-language-baseline.md)
- [0013 — Adaptation training stack](0013-adaptation-training-stack.md)
- [0014 — Media storage layout](0014-media-storage-layout.md)
- [0015 — Replay-as-test](0015-replay-as-test.md)
- [0016 — API runtime](0016-api-runtime.md)
- [0017 — World-model stack selection](0017-world-model-stack-selection.md)
- [0018 — Apache-2.0 code, CC0 documentation](0018-dual-license.md)
