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
## [2026-10-04] Phase 3: Integrity, ACID Transactions, Outbox, Expirations, and Redis Idempotency (D-03, D-04, D-05, D-06, S-04)
- Change: Wrapped all multi-step writes in ACID transactions via `DatabaseService.transaction(fn, { actor })` setting local `app.actor_role` for RLS and status transition triggers with atomic post-commit event dispatch. Enforced strict row-level locking (`SELECT ... FOR UPDATE`) on order rows during offer acceptance and direct driver acceptance. Hardened transactional outbox with migration `20261004000013_integrity_outbox_transitions.sql` adding `attempts`, `next_attempt_at`, `locked_at`, and status checks; implemented `OutboxProcessorService` using `SELECT ... FOR UPDATE SKIP LOCKED`, exponential backoff, dead-letter state, and retention cleanup. Replaced dummy worker with BullMQ repeatable jobs scheduler and Postgres fallback polling worker with `/health` and zero secret logging; added ADR 0005. Implemented `ExpiryService` executing atomic sweeps for orders, offers, and subscriptions with configurable timeouts via `SettingsService`. Enforced business integrity rules (D-05) forbidding self-assignment and validating real-time subscriptions and verification tier eligibility at acceptance moment. Implemented distributed Redis idempotency interceptor (`@Idempotent()`) with 24-hour response caching, payload mismatch rejection (422), in-flight conflict guards (409), and tenant/user isolation.
- Reason: Completion of Phase 3: Integrity according to production readiness roadmap.
- Definition impact: updated DEFINITION.md section "Current capabilities"

## [2026-10-04] Phase 2: Database & Geo Hardening (D-01, D-02)
- Change: Unified migration execution into a single, transactional runner (`apps/api/src/database/migrate.ts`) applying `supabase/migrations/*.sql` with sha256 checksum tracking in `app.schema_migrations`, rollback support (`--down <name>`), and migration status (`--status`). Unified seed runner (`apps/api/src/database/seed.ts`) targeting idempotent `supabase/seed.sql` with strict production safety check rejecting dev seeds. Completely relocated PGlite to `test/embedded.ts`, eliminating all runtime PGlite references from `apps/api/dist` bundle. Implemented canonical Geo module (`apps/api/src/common/geo/index.ts`) with WGS84 point validation, PostGIS `(lng, lat)` order enforcement via `toGeography()`, `geographyPoint` customType for Drizzle, Haversine distance, and ray-casting polygon boundary checking. Added migration `20261004000012_driver_locations.sql` (table `app.driver_locations` with PostGIS GiST index), updated Drizzle schemas and services to eradicate string coordinates and fallback coordinates. Documented spatial conventions in `docs/geo.md` and updated `scripts/check-schema-drift.ts` to assert PostGIS geography column parity.
- Reason: Completion of Phase 2: Database & Geo Hardening according to production readiness roadmap.
- Definition impact: updated DEFINITION.md section "Current capabilities"

## [2026-10-04] Phase 1 Critical Security Hardening in apps/api
- Change: Enforced PublicRegistrationRole enum (customer/driver only) on OTP requests/verifications. Eliminated fallback in-code secrets; centralized token verification across HTTP guards and SSE stream with HS256, issuer, audience, and typ: access claims. Implemented atomic refresh token rotation with cryptographic session family tracking (`family_id`), revoking entire families on token reuse. Removed runtime PGlite fallback in DatabaseService (fail-fast with retry backoff). Replaced default admin seeding with standalone `bootstrap-admin.ts` script enforcing min-16 char credentials and `must_change_password`. Added Redis-backed ThrottlerStorage with IP+account lockout on admin login and OTP attempts. Hardened GlobalExceptionFilter to eliminate SQL/database error message leakage, and configured Helmet CSP.
- Reason: Completion of Phase 1: Critical Security Hardening in apps/api according to production readiness plan.
- Definition impact: updated DEFINITION.md section "Current capabilities"

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
