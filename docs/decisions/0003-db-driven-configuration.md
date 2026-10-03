# ADR 0003: Database-Driven Configuration and Catalog

## Status
Accepted

## Context
Operating logistics in dynamic Egyptian markets like Hadayek al-Ahram requires adjusting base pricing, vehicle classes, timeouts, and cargo value thresholds on the fly without triggering continuous code deploys and server restarts.

## Decision
All operational parameters must be stored as data in the database:
1. `vehicle_types`: Vehicle specifications, capacities, weight and volume limits.
2. `service_actions`: Base fees and capabilities for shopping, parcel delivery, moving.
3. `value_tiers`: Value brackets determining vehicle class escalation policies.
4. `settings`: Generic key-value JSON table with optional region scoping (`region_id`) and audit logging of updates.
5. In-memory caching with TTL ensures sub-millisecond access times without spamming PostgreSQL.

## Consequences
- **Positive**: Operations and product teams can reconfigure platform rules, pricing formulas, and limits via the Admin portal in real-time.
- **Negative**: Requires validation of JSON payloads at the application boundary to avoid malformed configurations.
