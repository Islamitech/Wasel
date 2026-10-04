# Wasel Platform — Security Architecture & Threat Model

## 1. Authentication & Token Management Strategy

### In-Memory Token Handling & Single-Use Refresh Rotation vs. HttpOnly Cookies

Wasel serves multiple client platforms:
- **Customer Web (PWA)** deployed across distinct CDN / Web domains.
- **Driver Web (PWA & TWA/Capacitor)** operating on mobile browsers and native webview wrappers with offline background sync.
- **Admin Console (SPA)** deployed on dedicated administrative subdomains.

#### Architectural Trade-offs:
1. **HttpOnly Cookie Limitations across Cross-Origin & Native Environments**:
   - In cross-origin deployments (e.g. `customer.wasel.com` connecting to `api.wasel.com`), strict Third-Party Cookie restrictions in Safari (ITP) and modern mobile browsers can silently drop authentication cookies.
   - PWAs installed to home screen (standalone mode) and Capacitor/Cordova webview bridges often run in partitioned cookie storage contexts, causing unpredictable session drops when switching background/foreground.
2. **Cryptographic Single-Use Refresh Token Rotation**:
   - Wasel implements single-use refresh token rotation backed by PostgreSQL and Redis.
   - When a refresh token is exchanged, the previous refresh token is immediately revoked in the database session registry (`app.sessions`).
   - If an expired or already-consumed refresh token is re-submitted, the system treats it as token compromise and terminates all active sessions associated with the user family.
3. **Short-Lived Access Tokens**:
   - Access tokens (JWT) have a strict 15-minute lifespan (`JWT_EXPIRES_IN=15m`).
   - Access tokens are kept in application memory / secure client storage and re-requested transparently via the refresh endpoint before expiry.

---

## 2. Zero Front-End Backdoors Policy (F-04)

All web applications (`customer-web`, `driver-web`, `admin-web`) are strictly hardened against bypass mechanisms:
- **No Mock Tokens**: Strings such as `token_cust_`, `token_driver_`, `token_admin_`, `refresh_cust_`, `refresh_driver_`, `refresh_admin_` are prohibited from production client builds.
- **No Mock Storage**: Local mock keys (`wasel_registered_customers`, `wasel_registered_captains`) have been purged.
- **No Pre-filled / Hardcoded Credentials**: Admin credentials (`admin@wasel.com`, `Aa132456`, `admin-master`) and demo bypass handlers (`handleEnterDemo`, `كابتن تجريبي`, `وضع التجربة`) are eliminated.
- **Automated Verification**: `tests/no-backdoors.spec.ts` executes in CI across all frontend applications, inspecting the compiled `dist/` bundles before deployment.

---

## 3. Offline Resilience & Action Idempotency

Drivers operate in variable network conditions across Hadayek El Ahram:
- Every action enqueued to the driver offline queue is assigned a unique `Idempotency-Key` (UUIDv4).
- Upon network restoration, requests are replayed with the original key.
- **Terminal Error Handling (409 Conflict / 422 Unprocessable)**:
  - If a replayed action fails with 409 (e.g. another driver was awarded the order) or 422 (e.g. invalid state transition), the action is routed directly to a `'dead'` status.
  - The driver UI dispatches `wasel:offline-action-rejected` to notify the driver immediately, preventing infinite retry storms and queue blocking.

---

## 4. Content Security Policy (CSP) & HTTP Headers (O-03)

Every web application serves strict security headers via `vercel.json`:
- `Content-Security-Policy`:
  - Restricts `script-src` and `style-src` to trusted origins with `'unsafe-inline'` strictly scoped to stylesheet styling needs.
  - Restricts `connect-src` strictly to `'self'`, the production API gateway, and MapLibre tile services.
  - Denies framing via `frame-ancestors 'none'`.
- `X-Frame-Options: DENY`: Prevents clickjacking attacks.
- `X-Content-Type-Options: nosniff`: Prevents MIME-sniffing exploits.
- `Referrer-Policy: strict-origin-when-cross-origin`: Minimizes PII leakage in referrers.
- `Permissions-Policy`: Restricts browser hardware access (`camera=(self)`, `microphone=(self)`, `geolocation=(self)`).

---

## 5. Administrative Authorization & Privacy Masking (F-03)

- **Role Segregation**:
  - `admin`: Full system control (pricing rules, escalation matrices, settings, verification approvals, dispute resolution).
  - `support`: Restricted read-only view with scoped dispute resolution and verification review. Mutation of system settings and pricing rules is blocked both at the API level (via `AdminGuard` / `RolesGuard`) and masked in the UI.
- **PII Data Masking**:
  - User search endpoints return masked phone numbers and anonymized identifiers.
  - Verification documents are accessed only via short-lived presigned URLs generated on demand with comprehensive audit logging (`app.audit_logs`).
