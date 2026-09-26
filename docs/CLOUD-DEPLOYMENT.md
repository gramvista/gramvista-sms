# Deployed service — 15 September 2026

Project: **gramvista sms** (`sscleaiwktklkuxqqndf`), PostgreSQL 17, eu-west-1.

## Deployed

- Database migrations 001–009, tenant RLS and service-only financial functions.
- Private sender-document, payment-proof and logo buckets.
- `public-api`, `worker`, and the intentionally inactive provider callback handler.
- Supabase Cron job `gramvista-messaging-worker`, every minute.
- Worker endpoint/token in Supabase Vault; server-side provider secrets configured.
- Worker leases prevent overlapping dispatch, and each invocation has a bounded work window.
- RLS helper functions moved into an unexposed `private` schema.
- Verified-email platform-administrator bootstrap for `gramvistagroup@gmail.com`.
- Localhost auth redirects/CORS and frontend public environment configuration.

API base: `https://sscleaiwktklkuxqqndf.supabase.co/functions/v1/public-api/v1`

Function dashboard: [Supabase functions](https://supabase.com/dashboard/project/sscleaiwktklkuxqqndf/functions).

## Hosted checks passed

1. Unauthenticated API requests return 401.
2. Real Supabase Auth login and organization onboarding succeed.
3. New hosted wallets start at zero available/reserved units.
4. RLS prevents cross-tenant wallet reads and direct wallet writes.
5. Scoped, hashed test keys queue messages idempotently.
6. The deployed worker submits through the mock adapter for test keys and reconciles delivered/failed outcomes.
7. Test requests consume no credits and create no financial ledger entries.
8. Another tenant cannot read the first tenant’s messages.
9. Private storage uploads and signed downloads work; cross-tenant access fails.
10. The browser signs into hosted Supabase and renders the connected dashboard.
11. Unconfigured live sends are rejected before wallet reservation.
12. Revoked API keys return 401.

Temporary users, organizations, messages, API keys and uploaded documents were removed after verification. No production credits or sample commercial prices were inserted. No live SMS or verification emails were sent automatically.

## Provider status

The supplied Kilakona credentials successfully retrieved the real upstream balance: **0 SMS** at verification time. This is an admin-only inventory value, never a customer balance.

`SMS_PROVIDER=kilakona` is configured, but `KILAKONA_BILLING_CONFIRMED=false`; the maximum batch size is deliberately unset. Live sends remain disabled until the commercial rules and request limit are confirmed and inventory is funded. Test API keys continue using the mock adapter without charges.

## Administrator access

Create an account at the connected frontend’s `/signup` using `gramvistagroup@gmail.com`. Verify ownership through Supabase Auth and sign in. The server grants platform access once, only after verified ownership; revoking the role later does not automatically recreate it. No password was chosen for the administrator and no email was sent on their behalf.

## Remaining launch setup

- Supply the public frontend domain/hosting destination; the frontend currently runs locally against the hosted backend.
- Configure production site URL, redirects and exact allowed CORS origins when that domain is known.
- Validate verification/reset email delivery and configure custom SMTP for public customer signup.
- Fund upstream SMS inventory and confirm Kilakona batch, multipart/Unicode billing and refund rules.
- Publish actual SMS packages, payment instructions and approved Sender IDs.
- Supabase’s security advisor reports no application schema warnings after hardening. The project-level leaked-password protection setting remains disabled; enable it when supported by the project plan.

Scheduling follows [Supabase’s Cron/Vault/Edge Function pattern](https://supabase.com/docs/guides/functions/schedule-functions).


## Retail and Sender ID update

Migration 010 and updated public-api/worker functions deployed. Five owner-approved retail ranges are published, including TSh 18 through 499,999 credits. Customers can order exact quantities; payment verification adds units once. Admin sender review includes a downloadable Kilakona request, private document access, submission tracking and required approval evidence. Provider transmission is manual pending Kilakona's confirmed registration channel.

Validation: 43 backend tests, 4 browser workflows, build, lint and Deno checks passed. Seven additional hosted retail checks passed; temporary data was removed with no live SMS or wallet credits. See RESELLER-OPERATIONS.md for pricing and operating instructions.
