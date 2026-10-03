# ADR 0002: Transactional Outbox for Domain Events

## Status
Accepted

## Context
When domain state mutations occur (e.g. user registered, driver approved, order dispatched), external side-effects (notifications, metrics, search indexing) must happen reliably without dual-write race conditions. If an external message broker (Kafka/RabbitMQ) is down, state must still be committed reliably.

## Decision
Implement the **Transactional Outbox Pattern**:
1. When a domain event is published, an entry is written into the `outbox` table within the same database transaction.
2. A separate background worker (`apps/api/src/worker.ts` powered by BullMQ and interval pollers) reads pending events, executes or forwards them, and marks them `processed`.
3. If processing fails, the worker records the error and increments `retry_count`.

## Consequences
- **Positive**: Guaranteed at-least-once delivery; zero loss of domain events even during broker or worker outages; completely decouples HTTP request-response latency from background side-effects.
- **Negative**: Consumers must be idempotent since at-least-once delivery can occasionally produce duplicate deliveries under network partition recoveries.
