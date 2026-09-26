# Architecture

React calls a Gramvista-owned API. `server/service.ts` holds shared authentication-independent request handling and worker operations. Production identity comes from Supabase Auth or a hashed Gramvista API key. The API derives organization scope from the authenticated principal; a public key cannot choose a tenant in its payload.

`server/database.ts` is the storage interface. The production adapter uses Supabase’s service client only after authorization. The local adapter uses PGlite and the same PostgreSQL functions. PGlite is a loopback-only development simulator, not a second production backend or password store.

## Send lifecycle

1. Authenticate and check permission, organization status and sender ownership/approval.
2. Normalize phones, calculate GSM-7/Unicode estimates and validate quiet hours.
3. `enqueue_campaign` locks the idempotency scope, checks suppression and sender ownership again, locks the customer wallet and atomically reserves units, creates campaign/messages/jobs and records the response.
4. `claim_job` uses `FOR UPDATE SKIP LOCKED`. Scheduled jobs wait for their timestamp.
5. The worker rechecks sender approval, organization status, quiet hours, suppression and live provider readiness.
6. Provider submission returns an internal reference. `settle_job` atomically persists the provider submission, updates balances and immutable ledger, records usage and marks message submission. Database triggers create webhook events in the same transaction.
7. Reconciliation polls authenticated provider reports and updates normalized status. Delivery and billing remain separate.

Pre-submission rejection releases the affected batch reservation. A transport timeout, invalid provider response or interrupted worker after a send may mean the provider accepted the message. Such jobs retain their reservation and are held for investigation; they are not resent automatically.

## Provider boundary

Only `providers/kilakona/KilakonaProvider.ts` knows Kilakona URLs, headers and response fields. Public messages have `gvs_msg_*` references, campaigns have `gvs_cmp_*` references. Provider submissions, events, inventory and wholesale costs are admin-only.

The mock provider implements the same interface. `gvs_test_*` keys always select it, including in production configurations. Test sends have no wallet reservation. The local server always uses mock even if a developer has live secrets elsewhere.

## Scheduling and completion

Campaign `completed` currently means all batches have been accepted for submission, not all recipients have delivered. Delivery counts come from message statuses. The worker is externally scheduled. Customer webhook delivery is at least once, with stable event IDs for deduplication.

Official implementation references: [Supabase Edge Function authentication](https://supabase.com/docs/guides/functions/auth), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Vite setup](https://vite.dev/guide/).
