# Wasel Platform — Architecture Guide

## 1. System Architecture Map

```mermaid
flowchart TD
  subgraph Frontend["Frontend Client Layer"]
    CustomerWeb["apps/customer-web (PWA)"]
    DriverWeb["apps/driver-web (PWA)"]
    AdminWeb["apps/admin-web (SPA)"]
  end

  subgraph Packages["Shared Packages"]
    SharedPkg["packages/shared (Tokens, Schemas, Events)"]
    ApiClientPkg["packages/api-client (Typed OpenAPI Client)"]
    ConfigPkg["packages/config (TS, ESLint, Prettier)"]
  end

  subgraph Backend["NestJS Modular Monolith (apps/api)"]
    APIEntry["HTTP Server (/v1, /docs)"]
    WorkerEntry["BullMQ Background Worker"]
    
    subgraph BoundedContexts["Bounded Contexts"]
      Identity["Identity & RBAC"]
      Regions["Regions (HDA Scope)"]
      Catalog["Catalog (DB-Driven)"]
      Verification["Verification"]
      Orders["Orders"]
      Matching["Matching"]
      Pricing["Pricing"]
      Agreements["Agreements"]
      Subscriptions["Subscriptions"]
      Messaging["Messaging"]
      Notifications["Notifications"]
      Ratings["Ratings"]
      AdminMod["Admin & Settings"]
      AuditMod["Audit Logging"]
      Realtime["Realtime Gateway"]
    end

    subgraph CoreInfra["Cross-Cutting & Abstractions"]
      EventBus["Domain Event Bus"]
      OutboxTable[("Transactional Outbox")]
      StorageAbst["StorageService (S3/MinIO)"]
      OtpAbst["OtpProvider (Dev/Pluggable)"]
      MapAbst["MapProvider (Dev/Pluggable)"]
      PushAbst["PushProvider (Web Push)"]
    end
  end

  subgraph Infrastructure["Local Docker Infrastructure"]
    Postgres[("PostgreSQL 16 + PostGIS")]
    Redis[("Redis 7")]
    MinIO[("MinIO Object Storage")]
    Mailpit["Mailpit"]
  end

  CustomerWeb --> ApiClientPkg
  DriverWeb --> ApiClientPkg
  AdminWeb --> ApiClientPkg
  ApiClientPkg --> APIEntry

  APIEntry --> BoundedContexts
  BoundedContexts --> CoreInfra
  CoreInfra --> Postgres
  CoreInfra --> Redis
  CoreInfra --> MinIO
  WorkerEntry --> OutboxTable
  WorkerEntry --> Redis
```

---

## 2. Event Flow Architecture (Transactional Outbox)

```mermaid
sequenceDiagram
  autonumber
  actor User
  participant API as IdentityController
  participant Service as IdentityService
  participant DB as PostgreSQL (Drizzle)
  participant Outbox as outbox table
  participant Worker as BullMQ Worker
  participant External as External Broker / Webhook

  User->>API: POST /v1/auth/otp/verify
  API->>Service: verifyOtp(phone, code)
  Service->>DB: Verify code hash & create session
  Service->>Outbox: INSERT INTO outbox (user.authenticated)
  Service-->>API: { accessToken, refreshToken, user }
  API-->>User: HTTP 200 OK

  Note over Worker,Outbox: Asynchronous Background Processing
  Worker->>Outbox: SELECT pending events
  Worker->>External: Dispatch event payload
  Worker->>Outbox: UPDATE outbox SET status = 'processed'
```

---

## 3. How to Add a New Bounded Context Module

1. **Create the module directory**:
   `apps/api/src/modules/<module-name>/`
2. **Define the public facade**:
   Create `<module-name>.facade.ts` implementing public query and command methods.
3. **Export only the facade in `index.ts`**:
   Never export internal repositories or internal services. Only export the NestJS Module, Facade, and any public DTOs.
4. **Register in `AppModule`**:
   Add `<ModuleName>Module` to the `imports` array in `apps/api/src/app.module.ts`.
5. **Verify Boundary Rules**:
   Run `pnpm lint` to ensure no internal files from the new module are imported directly by other modules.

---

## 4. How to Add a New Production Provider

Wasel abstracts all external dependencies behind strict interfaces:
- `OtpProvider`: Located at `apps/api/src/common/providers/otp/otp.provider.interface.ts`.
- `MapProvider`: Located at `apps/api/src/common/providers/map/map.provider.interface.ts`.
- `PushProvider`: Located at `apps/api/src/common/providers/push/push.provider.interface.ts`.
- `StorageService`: Located at `apps/api/src/common/storage/storage.interface.ts`.

### Example: Adding a Production WhatsApp OTP Provider
1. Create `apps/api/src/common/providers/otp/whatsapp-otp.provider.ts`:
   ```typescript
   @Injectable()
   export class WhatsAppOtpProvider implements IOtpProvider {
     readonly providerName = 'whatsapp';
     async sendOtp(options: SendOtpOptions): Promise<SendOtpResult> {
       // Call WhatsApp Cloud API or Meta Graph API
       return { success: true, messageId: 'msg_123', provider: 'whatsapp' };
     }
   }
   ```
2. Bind conditionally in `apps/api/src/modules/identity/identity.module.ts` based on `process.env.OTP_PROVIDER`:
   ```typescript
   {
     provide: OTP_PROVIDER_TOKEN,
     useClass: process.env.OTP_PROVIDER === 'whatsapp' ? WhatsAppOtpProvider : DevOtpProvider,
   }
   ```
3. Zero code changes are required in `IdentityService` or any caller!
