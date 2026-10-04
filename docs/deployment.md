# Wasel Deployment Guide

This document describes the production and staging deployment architecture for the Wasel platform.

---

## 1. Architecture Overview

Wasel follows an intermediary logistics architecture with strict zero-trust network boundaries:

```
[Customer PWA]  \
[Driver PWA]    --> [Vercel CDN / Edge] --> [NestJS API] --> [Supabase PostgreSQL + PostGIS]
[Admin Web]     /                                     \--> [Redis Cache / BullMQ]
```

- **Frontend PWAs**: Deployed to Vercel as static Single Page Applications (SPAs) with Service Worker precaching.
- **Backend API**: Deployed as a containerized NestJS modular monolith.
- **Database**: Managed PostgreSQL 15/16 + PostGIS on Supabase (used as managed Postgres only; clients NEVER connect directly to Supabase).
- **Cache / Queues**: Managed Redis (BullMQ outbox processor & rate limiting).

---

## 2. Frontend Web Apps on Vercel

Each frontend application contains a dedicated `vercel.json` configuring framework detection, build filters, SPA routing rewrites, and security headers:

- **`apps/customer-web/vercel.json`**
- **`apps/driver-web/vercel.json`**
- **`apps/admin-web/vercel.json`**

### Vercel Project Settings

For each application deployed on Vercel:

| Setting | Customer Web | Driver Web | Admin Web |
|---|---|---|---|
| **Root Directory** | `apps/customer-web` | `apps/driver-web` | `apps/admin-web` |
| **Framework Preset** | Vite | Vite | Vite |
| **Build Command** | `pnpm --filter @wasel/customer-web build` | `pnpm --filter @wasel/driver-web build` | `pnpm --filter @wasel/admin-web build` |
| **Output Directory**| `dist` | `dist` | `dist` |
| **Install Command** | `pnpm install` | `pnpm install` | `pnpm install` |

### Frontend Environment Variables

| Variable | Description | Example |
|---|---|---|
| `VITE_API_URL` | Base URL of the NestJS API | `https://api.wasel.app/v1` |

---

## 3. Backend API CORS Configuration

The NestJS API enforces strict Origin-header validation based on environment configuration.

In `apps/api/src/config/env.validation.ts`:
- **`CORS_ORIGINS`**: Comma-separated list of allowed origins.

### Production Example:
```env
CORS_ORIGINS=https://customer.wasel.app,https://driver.wasel.app,https://admin.wasel.app
```

### Staging Example:
```env
CORS_ORIGINS=https://customer-staging.vercel.app,https://driver-staging.vercel.app,https://admin-staging.vercel.app
```

The API rejects any cross-origin requests from origins not explicitly included in `CORS_ORIGINS`.

---

## 4. Zero-Trust Database & Security Principles

1. **Clients Never Talk to Supabase Directly**:
   - Clients only communicate with the NestJS API via `/v1/*` endpoints.
   - All Supabase tables have Row Level Security (RLS) enabled with default-deny policies (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`).
2. **Anonymous Key Restricted**:
   - The Supabase anon publishable key cannot read, insert, update, or delete any table in the `app` or `public` schema.
   - Verified continuously via `scripts/verify-rls.ts`.
3. **Dedicated Service Secrets**:
   - The NestJS API connects to PostgreSQL using the direct connection string (`DATABASE_URL`).
   - The Supabase service-role key is never exposed to frontend clients.

---

## 5. Database Migrations & Reference Seeding

Database migrations are managed via a single source of truth under `supabase/migrations/*.sql` executed by the unified runner:

```bash
# Apply pending migrations
pnpm db:migrate

# Check status of applied migrations and checksums
pnpm db:migrate --status

# Rollback a specific migration
pnpm db:migrate --down 20261004000012_driver_locations.sql

# Seed production reference data (idempotent, 0 users, 0 passwords)
pnpm db:seed
```

> [!CAUTION]
> Development seed (`pnpm db:seed --dev`) contains synthetic test accounts and is strictly rejected if `APP_ENV=production`.
