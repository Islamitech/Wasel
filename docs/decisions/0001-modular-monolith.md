# ADR 0001: Modular Monolith Architecture

## Status
Accepted

## Context
Wasel is bootstrapping as a high-growth Arabic-first logistics and errands platform. Early microservices introduce massive distributed-system tax (network serialization, eventual consistency, complex deployment overhead, multi-repo friction) before product-market boundaries stabilize. Conversely, an unstructured spaghetti monolith risks becoming unmaintainable with leaky database joins across domains.

## Decision
Adopt a strict **Modular Monolith** pattern inside NestJS:
1. Each bounded context is an isolated folder under `src/modules/<domain>`.
2. Cross-module database joins or direct repository imports are strictly forbidden. Modules must communicate either:
   - Synchronously via typed Facade services exposed at `src/modules/<domain>/index.ts`.
   - Asynchronously via Domain Events using the Transactional Outbox.
3. ESLint boundary rules (`eslint-plugin-boundaries`) enforce that deep internal files cannot be imported across modules.

## Consequences
- **Positive**: Low deployment complexity (single container/binary), lightning-fast local development, transactional boundaries within a module, effortless future decomposition into independent microservices if specific domains demand disparate scaling.
- **Negative**: Requires strict discipline and lint guardrails to ensure bounded contexts are not bypassed.
