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

## Planned capabilities
- Multi-stop cart creation directly from interactive neighborhood map pins.
- Dynamic vehicle dispatch escalation matching cargo dimensions, weight, and monetary value.
- Driver subscription tiers and verification document workflows.
- Real-time order dispatch and driver tracking.

## Updated
2026-10-04 — Phase 2: Database & Geo Hardening (D-01, D-02: unified migration/seed runners with checksums, PostGIS geography types and SRID 4326 axis order, polygon boundary containment, zero PGlite in production dist).
2026-10-04 — Phase 1: Critical Security Hardening in apps/api (S-01 privilege escalation prevention, S-02 database fail-fast & bootstrap-admin script, S-03/S-05 environment validation & OTP security, S-06 session family rotation & token verification, S-10/S-11/S-14 leak prevention & CSP, S-16 admin lockout, S-17 OTP provider factory).
