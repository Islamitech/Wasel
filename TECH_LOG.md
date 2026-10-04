# Wasel — Technical Log

Newest entry on top. Maximum 10 full entries. When adding an 11th, move the oldest into archive.md as one compressed line.
This file is independent from DEFINITION.md — most entries here should NOT touch the definition.

Entry format:
```
## [YYYY-MM-DD] <short entry title>
- Change: <what was done, technically>
- Reason: <why>
- Definition impact: <none | updated DEFINITION.md section "X">
```

<!-- Entries below this line -->
## [2026-10-04] Complete Relational Data Model & PostGIS Matching Engine on Supabase
- Change: Implemented 10 ordered SQL migrations under dedicated schema `app` with 100% RLS default-deny and complete PostgREST public isolation. Built data-driven state machine (`app.status_transitions`), customer-point explicit visit accounting (`app.count_billable_visits`), dynamic pricing formulas (`app.calculate_min_fare`, `app.calculate_final_fare`), PostGIS spatial driver matching (`app.find_eligible_drivers` <50ms on 50 drivers), locked agreement snapshot immutability trigger, partitioned tracking points, production seed (`supabase/seed.sql`), dev seed with 50 synthetic Hadayek al-Ahram captains (`supabase/seed.dev.sql`), automated RLS verification script (`scripts/verify-rls.ts`), SQL and Vitest test suites, Drizzle schema reflection, and architecture documentation (`docs/data-model.md`).
- Reason: Complete database architecture and spatial dispatch implementation for Wasel platform.
- Definition impact: none

## [2026-10-04] Verification and Boundary Enforcement
- Change: Configured and verified `eslint-plugin-boundaries` v7.2.0 with TypeScript resolver to strictly enforce modular facade boundaries (deep imports from other modules disallowed; only public `index.ts` permitted). Verified complete Turborepo pipeline: `pnpm build` (6/6 packages built including PWA service workers), `pnpm lint` (0 errors across monorepo), `pnpm typecheck` (8/8 tasks passing with strict TypeScript), and `pnpm test` (100% passing across shared and API integration tests).
- Reason: Acceptance criteria compliance for production-grade monorepo foundation.
- Definition impact: none

## [2026-10-04] Foundation Bootstrap: Monorepo, Modular Monolith API, and PWA Shells
- Change: Bootstrapped pnpm Turborepo monorepo with NestJS modular monolith API (`apps/api`), three React/Vite web apps (`apps/customer-web`, `apps/driver-web`, `apps/admin-web`), shared packages (`packages/shared`, `packages/api-client`, `packages/config`), Docker Compose infrastructure, Drizzle ORM migrations/seeds, transactional outbox, BullMQ, and end-to-end identity/RBAC.
- Reason: Core architecture foundation according to platform architectural specification.
- Definition impact: Initialized DEFINITION.md sections "Purpose" and "Current capabilities".
