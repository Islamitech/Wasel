# Supabase Staging Environment Setup Checklist

This checklist guides the secure setup of the isolated Supabase staging project for zero-trust RLS audits and automated verification.

> [!CAUTION]
> **NEVER USE PRODUCTION CREDENTIALS OR PROJECTS FOR TESTING.**
> The RLS verification suite performs positive control tests that create and drop temporary probe tables (`__wasel_positive_control_probe`). It must ONLY be run against an isolated staging project.

---

## 1. Staging Project Creation
- [ ] Create a new, isolated project on [Supabase Dashboard](https://supabase.com/dashboard).
- [ ] Confirm the project reference is:
  - **Project Ref**: `onlaqufiabrrmkzvvtyu`
  - **API URL**: `https://onlaqufiabrrmkzvvtyu.supabase.co`
- [ ] Verify that this project is strictly isolated from production data, production auth, and production storage buckets.

---

## 2. Apply Schema & Migrations via Supabase CLI
Run the following from your local environment with the Supabase CLI (do NOT paste connection strings or keys into chat or git):

```bash
# 1. Login to Supabase CLI
supabase login

# 2. Link to the staging project
supabase link --project-ref onlaqufiabrrmkzvvtyu

# 3. Push all 10 SQL migrations to the staging database
supabase db push

# 4. Verify tables exist in the `app` schema
supabase db dump --schema app --data-only --dry-run
```

---

## 3. Storage Bucket Configuration
- [ ] Verify that storage bucket `wasel-identity-private` is created and marked **Private** (public read disabled).
- [ ] Verify that storage bucket `wasel-public` is created and marked **Public** (read-only for static assets).

---

## 4. GitHub Actions CI Secrets Setup
In the GitHub repository settings (**Settings > Secrets and variables > Actions > Repository secrets**), add the following secrets:

| Secret Name | Description | Example / Allowed Format |
|---|---|---|
| `SUPABASE_URL` | The REST API endpoint URL | `https://onlaqufiabrrmkzvvtyu.supabase.co` |
| `SUPABASE_ANON_KEY` | Public client publishable key | Standard anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin service role key (bypasses RLS) | Standard service_role key |
| `STAGING_PROJECT_REF` | Explicit project reference allowlist | `onlaqufiabrrmkzvvtyu` |

> [!IMPORTANT]
> The verification suite will abort with a fail-closed fatal error if:
> 1. `STAGING_PROJECT_REF` does not match `onlaqufiabrrmkzvvtyu`.
> 2. `SUPABASE_URL` does not contain the exact string `onlaqufiabrrmkzvvtyu`.
> This guarantees that accidental execution against any other project (including production) is impossible.

---

## 5. Verification Execution
Once secrets are saved in GitHub Actions:
- The `verify-rls-staging` job in `.github/workflows/ci.yml` will automatically activate.
- To execute locally against staging (with credentials in your local private environment only):
```bash
$env:SUPABASE_URL = "https://onlaqufiabrrmkzvvtyu.supabase.co"
$env:SUPABASE_ANON_KEY = "<anon-key>"
$env:SUPABASE_SERVICE_ROLE_KEY = "<service-role-key>"
$env:STAGING_PROJECT_REF = "onlaqufiabrrmkzvvtyu"
$env:DATABASE_URL = "<postgres-direct-connection-url>"

pnpm verify:rls
```
- Verify that all 48 tables in `app` and `public` return 0 leaks, RPC functions are blocked from anonymous calls, and private storage buckets reject unauthenticated access.
