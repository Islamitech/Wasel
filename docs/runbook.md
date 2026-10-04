# Wasel Operations & Observability Runbook

This document defines operational guidelines, monitoring metrics, alerting rules, backup/PITR procedures, and incident response runbooks for the Wasel logistics platform.

---

## 1. Service Probes & Health Checks

### Liveness Probe: `GET /health`
- **Purpose**: Verifies that the HTTP server event loop is responsive.
- **Port**: `3000` (API) / `3001` (Worker)
- **Response**: `200 OK` `{"status":"ok","timestamp":"..."}`
- **Container Failure Action**: If `/health` fails 3 consecutive times, container orchestrator (Docker/K8s) restarts the container.

### Readiness Probe: `GET /ready`
- **Purpose**: Verifies upstream dependency connectivity before routing user traffic.
- **Checks**:
  1. **PostgreSQL**: `SELECT 1` connectivity test.
  2. **Redis**: `redis.ping()` response test.
  3. **Schema Migrations**: Queries `app.schema_migrations` to verify the latest migration applied to the schema.
- **Response**:
  - Healthy (`200 OK`):
    ```json
    {
      "status": "ready",
      "timestamp": "2026-10-05T00:00:00.000Z",
      "checks": {
        "database": { "status": "up" },
        "redis": { "status": "up" },
        "migrations": {
          "status": "up",
          "latestMigration": "20261004000012_driver_locations.sql",
          "appliedAt": "2026-10-04T12:00:00.000Z"
        }
      }
    }
    ```
  - Unhealthy (`503 Service Unavailable`):
    Returns error details per failing subsystem. Ingress / Load Balancer drops container from active target group until `/ready` returns 200.

---

## 2. Prometheus Metrics & Alerting Rules

Metrics are exported on `GET /metrics` and secured by Bearer token authentication (`Authorization: Bearer <METRICS_TOKEN>`).

### Exported Core Metrics

| Metric Name | Type | Description | Labels |
|---|---|---|---|
| `wasel_outbox_lag_count` | Gauge | Number of unprocessed outbox events pending dispatch | none |
| `wasel_http_requests_total` | Counter | Total HTTP requests handled | `method`, `route`, `status_code` |
| `wasel_http_5xx_total` | Counter | Total 5xx server errors | `method`, `route`, `status_code` |
| `wasel_http_request_duration_seconds` | Histogram | Latency distribution of HTTP endpoints | `method`, `route`, `status_code` |
| `wasel_otp_delivery_total` | Counter | OTP challenge attempts | `status` (success/failure), `provider` |
| `wasel_db_pool_saturation_ratio` | Gauge | Database connection pool utilization (active / max) | none |
| `wasel_db_pool_active_connections` | Gauge | Number of in-flight active queries | none |
| `wasel_db_pool_max_connections` | Gauge | Maximum configured connection pool size | none |
| `wasel_matching_duration_seconds` | Histogram | Latency distribution of spatial matching queries | `operation` (`find_eligible_drivers`, `get_nearby_orders`) |

### Recommended Alertmanager Rules (`prometheus-alerts.yml`)

```yaml
groups:
  - name: wasel_production_alerts
    rules:
      # 1. Outbox Worker Lag Alert
      - alert: WaselOutboxLagHigh
        expr: wasel_outbox_lag_count > 50
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Wasel Outbox lag is critically high (> 50 events)"
          description: "Outbox dispatcher has {{ $value }} pending events for over 5 minutes. Event delivery and realtime SSE broadcasts may be delayed."

      # 2. HTTP 5xx Error Rate Alert
      - alert: WaselHttp5xxRateHigh
        expr: (sum(rate(wasel_http_5xx_total[5m])) / sum(rate(wasel_http_requests_total[5m]))) * 100 > 1
        for: 3m
        labels:
          severity: critical
        annotations:
          summary: "HTTP 5xx error rate exceeds 1%"
          description: "Server error rate is {{ $value | printf \"%.2f\" }}% over the last 5 minutes."

      # 3. OTP Delivery Failure Alert
      - alert: WaselOtpFailureRateHigh
        expr: (sum(rate(wasel_otp_delivery_total{status="failure"}[10m])) / sum(rate(wasel_otp_delivery_total[10m]))) * 100 > 5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "OTP delivery failure rate exceeds 5%"
          description: "Failed OTP delivery rate is {{ $value | printf \"%.2f\" }}% across SMS/WhatsApp providers."

      # 4. Database Connection Pool Saturation Alert
      - alert: WaselDbPoolSaturationHigh
        expr: wasel_db_pool_saturation_ratio > 0.80
        for: 3m
        labels:
          severity: warning
        annotations:
          summary: "Postgres connection pool saturation > 80%"
          description: "Active database queries are consuming {{ $value | humanizePercentage }} of the available pool."

      # 5. Spatial Matching Duration p95 Alert
      - alert: WaselMatchingDurationP95High
        expr: histogram_quantile(0.95, sum(rate(wasel_matching_duration_seconds_bucket[5m])) by (le)) > 0.200
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Matching engine p95 latency exceeds 200ms"
          description: "Driver spatial candidate search p95 is {{ $value | humanizeDuration }}."
```

---

## 3. Sentry Error Tracking & PII Redaction

Sentry is integrated across the backend API (`@sentry/node`) and frontend PWAs.

### Privacy & PII Redaction Guarantees:
All error breadcrumbs, request bodies, query strings, and exception contexts are recursively sanitized before transmission to Sentry servers:
- **Egyptian Phone Numbers**: Regex `/(?:\+?20|0)?1[0125]\d{8}/g` is redacted to `[REDACTED_PHONE]`.
- **National IDs (الرقم القومي)**: 14-digit Egyptian National IDs matching `/[23]\d{13}/g` are redacted to `[REDACTED_NATIONAL_ID]`.
- **Sensitive Credential Keys**: Any object key matching `password`, `pin`, `secret`, `token`, `otp`, `nationalid`, `national_id` has its value replaced with `[REDACTED]`.
- **Authorization Headers**: Bearer tokens are redacted prior to payload dispatch.

---

## 4. Structured Logging & Pino

- **Log Level**: Controlled dynamically via `LOG_LEVEL` environment variable (`trace`, `debug`, `info`, `warn`, `error`). Defaults to `info` in production.
- **Redaction**: Pino `redact` is configured to suppress:
  `["req.headers.authorization", "req.headers.cookie", "req.body.password", "req.body.otp", "req.body.pin", "req.body.nationalId", "*.password", "*.token", "*.secret"]`.

---

## 5. Database Backup, PITR & Disaster Recovery

### Automated Backups & WAL Archiving (Point-in-Time Recovery - PITR)
1. **Continuous WAL Archiving**:
   - Write-Ahead Logs (WAL) are streamed continuously to redundant S3/GCS bucket storage.
   - Allows point-in-time recovery to any second within the retention window (default 30 days).
2. **Daily Base Backups**:
   - Full binary base backups (`pg_basebackup`) take place daily at `01:00 UTC`.

### Periodic Restore Drill Runbook (Quarterly Procedure)
Execute the following verification drill in an isolated staging environment:

1. **Provision Staging PostGIS Instance**:
   ```bash
   docker run -d --name restore-drill-db -e POSTGRES_PASSWORD=drill_secret postgis/postgis:16-3.4-alpine
   ```
2. **Download Target Base Backup and WAL Archives**:
   ```bash
   aws s3 cp s3://wasel-backups/basebackups/base-latest.tar.gz ./base.tar.gz
   tar -xzf ./base.tar.gz -C /var/lib/postgresql/data
   ```
3. **Configure Recovery Target**:
   In `postgresql.conf`:
   ```conf
   restore_command = 'aws s3 cp s3://wasel-backups/wal/%f %p'
   recovery_target_time = '2026-10-04 12:00:00 UTC'
   ```
4. **Start Recovery & Verify Data Consistency**:
   - Verify all tables in schema `app` exist.
   - Run row count and checksum checks:
     ```sql
     SELECT count(*) FROM app.orders;
     SELECT count(*) FROM app.users;
     SELECT name, applied_at FROM app.schema_migrations ORDER BY id DESC LIMIT 5;
     ```
5. **Document Verification**:
   Record recovery time objective (RTO) and recovery point objective (RPO) in ops log.

---

## 6. Migration Rollback Procedure

All migrations follow two-way naming parity:
- Up: `supabase/migrations/<YYYYMMDDHHMMSS>_<name>.sql`
- Checksums & history: `app.schema_migrations` table

### Rolling Back a Faulty Migration:
```bash
# 1. Inspect applied migrations and check current head
pnpm db:migrate --status

# 2. Revert the specific migration by filename
pnpm db:migrate --down 20261004000012_driver_locations.sql

# 3. Confirm database readiness probe returns 200 OK
curl -i http://localhost:3000/ready
```

---

## 7. Incident Response Playbooks

### Scenario A: Outbox Lag Spikes (> 50 events)
1. Check BullMQ worker process logs:
   ```bash
   docker logs --tail 200 wasel-worker
   ```
2. Check Redis connection and memory:
   ```bash
   redis-cli info memory
   redis-cli ping
   ```
3. If dead-letter events accumulated, inspect dead outbox records:
   ```sql
   SELECT id, event_name, attempts, last_error FROM app.outbox WHERE status = 'dead' ORDER BY created_at DESC LIMIT 10;
   ```
4. Re-queue transient dead events after resolving external provider outage:
   ```sql
   UPDATE app.outbox SET status = 'pending', attempts = 0, next_attempt_at = now() WHERE status = 'dead';
   ```

### Scenario B: Database Pool Saturation (> 80%)
1. Inspect currently executing queries:
   ```sql
   SELECT pid, now() - query_start AS duration, query, state
   FROM pg_stat_activity
   WHERE state != 'idle' AND query NOT LIKE '%pg_stat_activity%'
   ORDER BY duration DESC LIMIT 10;
   ```
2. Cancel rogue long-running queries:
   ```sql
   SELECT pg_cancel_backend(<pid>);
   ```
3. Scale connection pool via `DB_POOL_MAX` if legitimate sustained high traffic is observed.
