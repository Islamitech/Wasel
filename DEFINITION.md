# Wasel (واصل) — Definition

## Purpose
An Arabic-first (RTL) local logistics and delivery marketplace connecting residents and merchants in Hadayek al-Ahram (Giza, Egypt) with drivers of bicycles, motorcycles, tricycles, pickups, and light trucks for shopping, errands, package delivery, and moving. The platform operates on a cash-between-parties basis and processes no payment transactions directly. Revenue is generated exclusively through driver subscriptions.

## Current capabilities
- Platform foundation and system architecture established.
- User registration and authentication via phone number and OTP verification with strict privilege escalation prevention.
- Cryptographically hardened JWT access and refresh token rotation with session family breach invalidation and immediate logout revocation.
- Administration portal authentication with email, password, constant-time verification, temporary lockout, and granular role-based permissions.
- Production startup environment verification guarding against insecure placeholder secrets and unencrypted connections.
- Modular bounded-context backend architecture with region scoping (Hadayek al-Ahram / Giza).
- Progressive Web App shells for customers and drivers with Arabic typography, design tokens, and offline support.
- Single transactional database migration runner with checksum tracking, status inspection, and down migrations; unified safe production seeder.
- Canonical PostGIS spatial coordinate handling (WGS84 lat/lng invariants, PostGIS SRID 4326 axis order preservation, GiST indexing, polygon service boundary enforcement).
- Complete elimination of embedded PGlite from production runtime artifacts and dependencies.
- Transactional integrity and multi-step ACID operations via `DatabaseService.transaction(fn, { actor })` with session actor scoping and row-level locking (`SELECT ... FOR UPDATE`) preventing race conditions and double assignment.
- Strict business rule enforcement: self-assignment prevention (`SELF_ASSIGNMENT_FORBIDDEN`), active driver subscription verification, and value tier clearance at exact moment of acceptance.
- Guaranteed transactional outbox dispatch (`OutboxProcessorService`) with exponential backoff, dead-letter handling, retention cleanup, and post-commit event dispatch.
- Active BullMQ repeatable task scheduler and standalone fallback worker (`apps/api/src/worker.ts`) with `/health` endpoint and zero secret exposure.
- Periodic lifecycle expiration sweeps (`ExpiryService`) atomically transitioning expired orders, offers, and subscriptions.
- Distributed Redis idempotency interceptor (`@Idempotent()`) with tenant/user isolation, payload mismatch rejection (422), and in-flight conflict locks (409).
- Privacy and granular authorization layer eliminating IDOR across orders, offers, agreements, stops, media, and payment receipts.
- Segregated `OrderRadarView` omitting customer PII and snapping coordinates to a ~300m grid for eligible drivers prior to agreement formation.
- Private bucket storage for order voice notes and images with allowlist validation, derived extensions, per-order limits, and short-lived presigned URLs.
- Driver verification document and vehicle photo upload verification with prefix isolation, HEAD storage checks, versioned server-side metadata encryption, and admin audit logging.
- In-agreement messaging restricted to active agreement parties with configurable grace periods, length bounds, Redis rate limits, and admin audit trail.
- Ratings validation restricted to completed agreements with integer bounds (1-5) and 409 Conflict mapping on duplicate ratings.
- PostGIS spatial matching engine (`MatchingFacade.findEligibleDrivers`) bound to SQL `app.find_eligible_drivers` filtering by distance, active subscription, verification level, and vehicle class capacity.
- High-efficiency driver radar (`MatchingService.getNearbyOrders`) with single-query batch execution, `ST_DWithin` spatial indexing, true `ST_Distance` calculation, settings-controlled radius, cursor pagination, and self-order exclusion.
- Real-time Server-Sent Events (SSE) streaming with short-lived (30s) single-use ticket authentication (`POST /v1/stream/ticket`), `Last-Event-ID` missed event playback via Redis/memory ring buffers, and per-user connection concurrency limits.
- Explicit recipient routing for real-time events eliminating accidental broadcasts, with outbox `order.published` fanout to eligible drivers.
- Dual-failover OTP provider (`DualFailoverOtpProvider`) with primary WhatsApp Cloud API and automatic SMS fallback, daily phone/IP cost ceilings, and rapid SMS-pumping fraud detection.
- Driver subscription management prioritizing active subscriptions, extending renewals from current `endsAt`, and granting an automatic 30-day trial upon driver verification without duplicate grants.
- Electronic payment integration (`PaymobPaymentProvider`) with idempotent HMAC SHA512 signature verification, automatic reconciliation, and cash settlement architecture documentation (ADR-0004).
- Production web push notifications (`WebPushProvider`) with native fetch and 410/404 expired subscription cleanup, and Google Maps integration (`GoogleMapsProvider`) with reverse geocoding and routing fallbacks.

## Planned capabilities
- Multi-stop cart creation directly from interactive neighborhood map pins.
- Dynamic vehicle dispatch escalation matching cargo dimensions, weight, and monetary value.
- Real-time driver live location tracking on customer maps.

## Updated
2026-10-04 — Phase 5: Features & Live Integrations (F-01 PostGIS spatial matching & nearby radar, F-02 SSE ticket auth, ring buffer playback & recipient routing, S-17 WhatsApp/SMS dual failover OTP & anti-pumping, F-05 subscriptions, Paymob HMAC webhook & 30d trial grant, Web Push & Google Maps providers, ADR-0004 cash settlement architecture).
2026-10-04 — Phase 4: Privacy & Fine-Grained Authorization (S-08 private media & presigned URLs, S-09 verification doc encryption & prefix isolation, S-12 OrderRadarView & ~300m grid obfuscation, S-13 in-agreement messaging & rate limits, ratings completion checks, admin PII search sanitization, IDOR elimination).
2026-10-04 — Phase 3: Transactional Integrity, Outbox, Expirations & Redis Idempotency (D-03 ACID transactions & row locking, D-04 transactional outbox & BullMQ/fallback worker, D-05 business rules & self-assignment guard, D-06 expiry sweeps, S-04 Redis idempotency).
2026-10-04 — Phase 2: Database & Geo Hardening (D-01, D-02: unified migration/seed runners with checksums, PostGIS geography types and SRID 4326 axis order, polygon boundary containment, zero PGlite in production dist).
2026-10-04 — Phase 1: Critical Security Hardening in apps/api (S-01 privilege escalation prevention, S-02 database fail-fast & bootstrap-admin script, S-03/S-05 environment validation & OTP security, S-06 session family rotation & token verification, S-10/S-11/S-14 leak prevention & CSP, S-16 admin lockout, S-17 OTP provider factory).
