# ADR 0005: Active BullMQ Distributed Scheduler with PostgreSQL Transactional Outbox

## Status
Accepted

## Context
ADR-0002 decided on the Transactional Outbox pattern for publishing domain events to ensure zero dual-write vulnerabilities. However, the background worker implementation initially contained a BullMQ worker listening on `outbox-queue` without an active producer, relying solely on an ad-hoc local `setInterval` fallback loop. Furthermore, periodic lifecycle expirations (stale orders, expired driver offers, elapsed subscriptions) require reliable, distributed execution across multi-instance deployments without concurrent duplicate sweeps.

## Decision
1. **Active BullMQ Producer & Scheduler**:
   - The background worker process (`apps/api/src/worker.ts`) initializes a BullMQ scheduler queue (`wasel-scheduled-tasks`) with deterministic repeatable jobs:
     - `outbox-dispatch`: Triggers the outbox processor every 5 seconds.
     - `order-expiry`: Sweeps orders past `expires_at` every 60 seconds (`published/matching/offers_received -> expired`).
     - `offer-expiry`: Sweeps driver offers past `expires_at` every 30 seconds (`pending -> expired`).
     - `subscription-expiry`: Sweeps driver subscriptions past `expires_at` every 5 minutes (`active -> expired`).
     - `outbox-cleanup`: Purges processed outbox events older than the configured retention period (default 7 days) once daily.
2. **ACID PostgreSQL Locking for Execution**:
   - Even when scheduled via BullMQ, all database operations use `SELECT ... FOR UPDATE SKIP LOCKED` and atomic `UPDATE ... WHERE ... RETURNING` inside PostgreSQL transactions. This ensures absolute safety even if multiple workers execute tasks concurrently.
3. **Resilient Local Polling Fallback**:
   - If Redis is unavailable or unconfigured in constrained environments, the worker falls back gracefully to local interval sweeps, ensuring high availability.
4. **Worker Operability**:
   - Full `await` on module initialization before processing jobs.
   - Built-in HTTP health check endpoint (`/health`) on port `WORKER_PORT` (default 3001).
   - Graceful shutdown handling `SIGTERM` and `SIGINT` cleanly draining queues and database pools.
   - Strict log redaction preventing secret leakage.

## Consequences
- **Positive**: Eliminates empty queue listeners; provides distributed job scheduling with BullMQ; prevents race conditions; enables independent monitoring and retry policies per task.
- **Negative**: Adds dependency on Redis for distributed scheduling; requires graceful fallback to interval polling when Redis is unreachable.
