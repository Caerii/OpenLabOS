# 0016 — API runtime: Express today, Hono tomorrow

- Status: accepted (transitional)
- Scope: `services/api`

## Context

The coordination API today runs on Express + a custom typed-route helper
layer. Express is mature and well-understood, but the typed-route layer
is hand-rolled, slows reviews, and cannot generate an OpenAPI document
without a side-channel. We want one source of truth for routes that
also produces the typed SDK in `packages/sdk-ts`.

## Decision

Migrate `services/api` to **Hono** with `@hono/zod-openapi`. The Zod
schemas already live in `packages/protocol`; routes import them, declare
their request/response shapes, and emit an OpenAPI 3.1 document at
build time. `packages/sdk-ts` is generated from that document.

The migration is incremental:

1. Land Hono as a dependency; expose `/healthz` and `/readyz` in the
   Hono style as a smoke target.
2. Move one resource at a time, starting with `/sessions`, then
   `/protocols`, then `/artifacts`. Old Express routes coexist behind
   the same listener until each migration lands.
3. Remove Express once every route is moved and the OpenAPI document
   matches the legacy contract surface byte-for-byte (replay corpus
   gates this).

## Consequences

- Routes carry their own type definitions; the SDK is no longer
  hand-typed.
- An OpenAPI document is published with each release; third-party
  clients are free.
- During the transition, contributors learn two route styles. The
  migration tracker in `docs/runbooks/api-runtime-migration.md`
  enumerates the remaining moves so the period stays short.

## Alternatives considered

- **Stay on Express.** Loses OpenAPI codegen; type drift between server
  and SDK becomes a recurring bug class.
- **tRPC.** Excellent for TS-only stacks; OpenLabOS has Python clients
  to a degree that makes a documented HTTP surface non-negotiable.
- **Fastify with `@fastify/swagger`.** Comparable to Hono; we picked
  Hono for its lighter footprint and identical edge-runtime story.
