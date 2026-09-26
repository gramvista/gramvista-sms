# Gramvista SMS

For the account connections, customer/admin walkthrough and current launch gaps, see [Launch readiness](docs/LAUNCH-READINESS.md).

**Business Messaging Infrastructure** · GRAMVISTA EMPIRE GROUP LIMITED

Send, manage and track business messaging through one reliable Gramvista platform.

## Connected Supabase service

The backend is deployed to project **sscleaiwktklkuxqqndf**. The local frontend uses real Supabase Auth, PostgreSQL, private storage and deployed Edge Functions. Scheduled processing runs in Supabase Cron, independently of this computer.

Platform-admin access is reserved for **gramvistagroup@gmail.com** after that address is verified through Supabase Auth. Register at `/signup`, verify your email, then sign in. Admin permissions are never granted from browser input.

The supplied Kilakona credentials passed the authenticated balance check. The observed upstream balance was **0 SMS**. Live sends are blocked until inventory is funded and the batch limit and charging agreement are confirmed. `gvs_test_*` sends work without spending credits. No live SMS were sent during validation.

## Run the connected frontend

Requires Node.js 22.12+ (validated with Node 24).

```sh
npm install
npm run dev
```

Open **http://127.0.0.1:5173**. On Windows with restricted PowerShell scripts, use `npm.cmd`.

Public Supabase configuration is stored in ignored `.env.local`. Provider credentials and the worker token are in Supabase secrets/Vault. No local simulator starts with `npm run dev`.

## Optional offline demo

Run `npm run dev:demo` and open **http://127.0.0.1:5175**. The separate demo server binds to loopback, persists a PostgreSQL-compatible PGlite database under `.local/database`, and always uses the mock provider. Its development administrator switch never applies to the connected frontend. Never publish the demo server.

1. Create an organization. Its wallet starts at **0 SMS**.
2. Request a Sender ID in the customer workspace.
3. Open **Platform admin**. Credit the wallet using a unique reference and approve the Sender ID.
4. Add contacts, groups or import a CSV.
5. Compose a campaign. The review shows invalid, duplicate and suppressed recipients and estimated SMS units.
6. Send. The server reserves credits, processes batches, records the provider reference, settles the wallet, and reconciles mock delivery.
7. Check campaign reports, message history, and transactions. Mock recipients ending in `000` fail delivery; failed delivery does not trigger a refund.
8. Create a test API key and call the local API. Test keys consume no wallet credits.

Local demo data created during browser validation is clearly labeled and lives only in `.local/`. There are no production sample credits, commercial prices or wholesale cost assumptions.

## Included

- React, TypeScript, Vite, React Router, TanStack Query, Zod and Lucide UI; responsive customer and separate platform workspaces.
- Supabase email/password signup, email verification, password reset and organization onboarding.
- Tenant RLS, role permissions, server-side authorization, organization suspension.
- Atomic wallet reservations and settlements, immutable ledger, idempotent manual credits and payment verification.
- Sender ID review workflow and private Supabase document storage.
- Contacts, CSV mapping/validation/import, groups, suppression, templates and scheduled campaigns.
- Durable campaign batches, conservative handling of ambiguous provider submissions, normalized delivery reconciliation.
- Provider abstraction with mock and real Kilakona adapters.
- Customer public API, hashed scoped keys, expiry/revocation, rate limits and request IDs.
- Transactional webhook outbox, HMAC signatures and bounded retries.
- Admin packages, payment verification, wallet controls, provider snapshots, liability statistics and audit records.

## Architecture

```text
Customer browser / Mteja Connect / API client
                  ↓
            Gramvista API
                  ↓
    PostgreSQL validation + wallet reservation
                  ↓
          Durable campaign jobs
                  ↓
    Secure provider adapter → Kilakona
                  ↓
    Report reconciliation → normalized messages
                  ↓
        Dashboard + signed webhooks
```

**Customer balance** is the organization’s Gramvista wallet. **Provider balance** is Gramvista’s upstream inventory and is available only to platform administrators. Kilakona credentials and raw provider references never cross the customer API boundary.

## Production

See [DEPLOYMENT.md](DEPLOYMENT.md) and [the deployed service report](docs/CLOUD-DEPLOYMENT.md). The database, private buckets, public API, worker and cron are deployed. The browser frontend still needs a public static host/domain. Live messaging remains gated on inventory and confirmed batch/billing rules.

The source specification is retained in [docs/MASTER-SPEC.md](docs/MASTER-SPEC.md). [docs/ROADMAP.md](docs/ROADMAP.md) distinguishes working features, configuration dependencies and deferred capabilities. Do not treat the local demo as a production deployment.

## Validation

```sh
npm run build
npm run lint
npm test
npx playwright install chromium
# E2E starts the isolated demo on port 5175.
npm run test:e2e
npx deno check --config supabase/functions/deno.json supabase/functions/public-api/index.ts supabase/functions/worker/index.ts
```

Tests execute the actual PostgreSQL functions in an isolated PGlite database, including RLS role changes. Parallel calls are serialized by PGlite; production multi-connection locking still warrants a hosted PostgreSQL load test. Browser tests run the organization → credit → Sender ID approval → campaign → mock delivery workflow and verify mobile overflow.

## Documentation

[Architecture](docs/ARCHITECTURE.md) · [Database](docs/DATABASE.md) · [API](docs/API.md) · [Kilakona](docs/KILAKONA.md) · [Webhooks](docs/WEBHOOKS.md) · [Security](docs/SECURITY.md) · [Mteja integration](docs/SMS-INTEGRATION.md) · [Roadmap](docs/ROADMAP.md)
