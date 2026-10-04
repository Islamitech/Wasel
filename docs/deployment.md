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
| `VITE_API_URL` | Base Origin URL of the NestJS API (without `/v1`, as the client SDK appends `/v1`) | `https://api.wasel.app` (Production) / `https://api-staging.wasel.app` (Staging) |

---

## 3. Backend API CORS & Environment Configuration

The NestJS API enforces strict Origin-header validation based on environment configuration.

In `apps/api/src/config/env.validation.ts`:
- **`APP_ENV`**: Environment name (`development`, `staging`, `production`, `test`).
- **`CORS_ORIGINS`**: Comma-separated list of allowed origins.
- **`DB_SSL`**: Enforced `true` or `require` in `production`.
- **`METRICS_TOKEN`**: Secret Bearer token protecting the `/metrics` endpoint.

### Production Example:
```env
APP_ENV=production
NODE_ENV=production
CORS_ORIGINS=https://customer.wasel.app,https://driver.wasel.app,https://admin.wasel.app
DATABASE_URL=postgresql://wasel_app:secret@db.wasel.internal:5432/wasel_prod?sslmode=require
DB_SSL=require
REDIS_URL=redis://default:secret@redis.wasel.internal:6379
METRICS_TOKEN=prod_metrics_bearer_token_super_secret_64_hex
```

### Staging Example:
```env
APP_ENV=staging
NODE_ENV=production
CORS_ORIGINS=https://customer-staging.wasel.app,https://driver-staging.wasel.app,https://admin-staging.wasel.app
DATABASE_URL=postgresql://wasel_app:secret@db-staging.wasel.internal:5432/wasel_staging?sslmode=require
DB_SSL=require
REDIS_URL=redis://default:secret@redis-staging.wasel.internal:6379
METRICS_TOKEN=staging_metrics_bearer_token_super_secret_64_hex
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

---

## 6. Containerization & Docker Compose

Wasel backend API and worker processes are packaged via a hardened multi-stage Dockerfile (`Dockerfile`) based on `node:22-alpine`:
- **Security**: Runs under an unprivileged non-root user (`wasel`, UID 10001).
- **Pruning**: Uses `pnpm deploy --prod` to include strictly necessary production dependencies.
- **Healthchecks**: Built-in `HEALTHCHECK` instructions querying `/health` on both API and worker containers.

### Building Docker Images:
```bash
# Build the API image
docker build --target api -t wasel-api:latest .

# Build the Worker image
docker build --target worker -t wasel-worker:latest .
```

### Production Docker Compose Stack:
Refer to `docker-compose.prod.example.yml` for complete service orchestration:
```bash
# Start Postgres, Redis, run pre-deployment migrations, then start API and worker
docker compose -f docker-compose.prod.example.yml up -d
```

---

## 7. Continuous Deployment Pipeline

Deployments are automated through GitHub Actions (`.github/workflows/deploy.yml`):
1. **Pre-deployment Migrations**:
   - `pnpm db:migrate` runs as an isolated pre-deployment job before container rollout.
   - Any migration failure halts the pipeline immediately, preventing corrupted deploys.
2. **Staging Environment**:
   - Automatically deployed whenever changes are merged into the `main` branch.
   - Verifies container health against staging endpoints.
3. **Production Environment**:
   - Gated behind GitHub Environment protection with required peer approvals.
   - Executes production migrations followed by zero-downtime rolling container updates.

---

## 8. Health, Readiness & Metrics Endpoints

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/health` | `GET` | Public | Liveness probe (HTTP 200 `{ status: "ok" }`). |
| `/ready` | `GET` | Public | Readiness probe (verifies Postgres connection, Redis ping, latest applied migration). |
| `/metrics` | `GET` | Bearer (`METRICS_TOKEN`) | Prometheus metrics scrape endpoint (lag, 5xx rate, OTP, pool saturation, matching p95). |

