# Wasel (واصل) — Arabic-First Logistics & Delivery Platform Foundation

Wasel is an Arabic-first (RTL) logistics and delivery marketplace platform tailored for Hadayek al-Ahram (Giza, Egypt). It connects customers with local drivers across five vehicle classes (bicycle, motorcycle, tricycle, pickup, light truck) for errands, shopping, package delivery, and moving.

---

## ⚡ Quickstart (< 15 Minutes)

### 1. Prerequisites
- **Node.js**: v20 or v22+
- **pnpm**: v9 or v10+ (e.g. `npm install -g pnpm`)
- **Docker & Docker Compose** (for local PostgreSQL 16 PostGIS, Redis 7, MinIO, Mailpit)

### 2. Clone & Install
```bash
# Clone the repository
git clone <repo-url> wasel
cd wasel

# Install all monorepo dependencies
pnpm install
```

### 3. Setup Environment
```bash
cp .env.example .env
```

### 4. Boot Local Infrastructure
```bash
docker compose up -d
```
This spins up:
- **PostgreSQL 16 with PostGIS** on `localhost:5432` (`wasel_db`)
- **Redis 7** on `localhost:6379`
- **MinIO S3 Storage** on `localhost:9000` (Console: `http://localhost:9001`)
- **Mailpit SMTP** on `localhost:1025` (Web UI: `http://localhost:8025`)

### 5. Run Database Migrations & Seed Data
```bash
# Run SQL migrations & enable PostGIS
pnpm --filter @wasel/api db:migrate

# Seed base region (Hadayek al-Ahram), roles, permissions, admin user & catalog
pnpm --filter @wasel/api db:seed
```

### 6. Start Development Servers
```bash
pnpm dev
```

---

## 🌐 Application Ports & Endpoints

| Service | URL | Description | Credentials / Access |
| :--- | :--- | :--- | :--- |
| **API Server** | `http://localhost:3000/v1` | NestJS Modular Monolith API | - |
| **API Docs (OpenAPI)** | `http://localhost:3000/docs` | Interactive Swagger UI (Dev/Staging) | - |
| **Customer PWA** | `http://localhost:5173` | Customer Web App Shell | Phone login with OTP |
| **Driver PWA** | `http://localhost:5174` | Driver Web App Shell | Phone login with OTP |
| **Admin Web** | `http://localhost:5175` | Admin Management Dashboard | Bootstrap via `pnpm db:bootstrap-admin` |
| **MinIO Console** | `http://localhost:9001` | Object Storage Console | Configured via env variables |
| **Mailpit** | `http://localhost:8025` | Local Email Web Interface | - |

---

## 🏛️ Core Architecture Principles

1. **Modular Monolith**: Bounded contexts (`identity`, `regions`, `catalog`, `orders`, `matching`, `pricing`, `agreements`, `subscriptions`, `messaging`, `notifications`, `ratings`, `admin`, `realtime`) with strict public facades. No direct cross-module database queries.
2. **Transactional Outbox**: Inter-module asynchronous events are committed atomically to an `outbox` table and processed by a BullMQ background worker.
3. **Database-Driven Configuration**: No pricing, vehicle classes, or thresholds hard-coded in code. All managed in database tables (`settings`, `vehicle_types`, `service_actions`, `value_tiers`) with typed accessors and memory caching.
4. **No Direct Money Flow**: The platform does not touch transaction payments (cash settled directly between parties). Monetization operates via driver subscription plans.
5. **Provider Abstraction**: Decoupled interfaces (`OtpProvider`, `MapProvider`, `PushProvider`, `StorageService`) with working dev implementations.

---

## 🧪 Testing & Verification

```bash
# Run unit & integration test suites (Vitest)
pnpm test

# Run type checks across all workspaces
pnpm typecheck

# Run linting and enforce cross-module boundary rules
pnpm lint

# Build all monorepo artifacts
pnpm build
```

---

## 📖 Further Documentation
- [Architecture Guide & Diagrams](docs/architecture.md)
- [ADR 0001: Modular Monolith](docs/decisions/0001-modular-monolith.md)
- [ADR 0002: Transactional Outbox](docs/decisions/0002-transactional-outbox.md)
- [ADR 0003: Database-Driven Configuration](docs/decisions/0003-db-driven-configuration.md)
- [ADR 0004: No Platform Money Flow](docs/decisions/0004-no-platform-money-flow.md)
