# Gramvista SMS: full launch map

This inventory describes the source in this package and the deployment report dated 15 September 2026. It does not claim the current hosted project has been rechecked. Keep API credentials out of this document and browser environment variables.

## How the accounts connect

| Account / system | Purpose | Code location | Current evidence and remaining input |
| --- | --- | --- | --- |
| Website hosting and domain | Serves the React frontend | `dist/`, `VITE_*` build variables | No public frontend domain or hosting destination recorded. Client routes need an index.html fallback and HTTPS. |
| Supabase project | Auth, PostgreSQL, private storage, Edge Functions, cron | `supabase/` | Existing project ref in `docs/CLOUD-DEPLOYMENT.md`; migrations 001–010 and functions were reported deployed. Confirm actual current state. Apply migrations 011 and 012 after backup. |
| Gramvista platform admin | Reviews customers, Sender IDs, manual payments, wallets and upstream capacity | `/platform`, `platform_admins` | Verified bootstrap invitation for `gramvistagroup@gmail.com` was recorded. An actual Supabase Auth account must be created and verified with that email; it is separate from the ClickPesa merchant account. Confirm access instead of creating a duplicate admin. |
| Customer account | Verified email sign-up and company workspace | `/signup`, `/onboarding` | Available in code. Email confirmation delivery and production redirects are not verified. New wallets start at zero. |
| ClickPesa merchant application | Hosted checkout and payment confirmation | `server/payments/ClickPesa.ts`, `clickpesa-webhook` | Integration code exists; this application is **not connected merely by running SQL**. Authorized merchant operator must complete the server-side credential and application webhook configuration. No real payment confirmed here. |
| Kilakona merchant account | Wholesale SMS delivery and balance | `providers/kilakona/`, `worker` | Balance query worked in the historical report; balance was zero then. Live send still blocked pending funded inventory, batch limit, Sender ID approval and confirmed billing rules. |

## What a customer sees

1. `/signup`: email and password; confirmation email verifies the Supabase Auth user. `/login` and password reset are separate flows.
2. First sign-in opens `/onboarding`: business name, legal name, email, phone, country and type create an organization, owner membership and zero-balance wallet. No platform administrator approves this step today.
3. Dashboard shows onboarding tasks. Customer requests a Sender ID, can import contacts, and can buy SMS credits. Sender approval is a manual platform/admin and provider process.
4. `/send`: direct SMS with sender, number(s), message, estimate and review. No campaign name or scheduling form. It posts to `/messages`; the delivery engine uses an internal batch for reservations, provider submission and audit. Direct sends appear in message history, not the Campaigns list.
5. `/campaigns`: named campaign creation opens `/campaigns/new`, with audience, name and optional scheduling. Campaigns and direct sends share the same wallet, suppression, quiet hours and worker rules.
6. `/buy`: published retail tiers generate a ClickPesa checkout URL. The provider-confirmed amount is required for credit; the return URL alone never credits. Customers can check their last order status after returning. Legacy manual packages are still displayed if an administrator has published them.
7. Message history and reports show queue and delivery status; delivery uses provider polling because the Kilakona delivery callback is intentionally inactive pending a documented authentication contract.

## What a platform administrator sees

1. A verified user with an existing platform admin invitation can enter `/platform`. The platform role is distinct from being an owner of a customer organization.
2. Organizations, Sender IDs, payment records, wallets, pricing, provider snapshots, jobs and audit records are available by tab. Sender approval needs documented evidence from the provider.
3. ClickPesa payment records appear with method `clickpesa`; they are credited by verified provider status and cannot be manually approved. Manual payment records retain the “Verify & credit” action.
4. Provider inventory is separate from customer wallet credits. The capacity card compares both; it is an operational snapshot and does not reserve Kilakona capacity atomically.

## Deployment and acceptance, in dependency order

| Step | Work | Pass condition |
| --- | --- | --- |
| 1 | Confirm ownership and access for the existing Supabase project, website host/domain, admin email, ClickPesa application and Kilakona account. | Authorized operators can see each respective service; no credentials are shared in a public document. |
| 2 | Back up the existing database and inspect applied migrations. | A restorable backup exists and current migration state is known. |
| 3 | Apply missing migrations 001–012 in order, usually only 011 and 012 on the historically deployed project. | Payments have ClickPesa settlement controls and campaigns have the direct/campaign classification. |
| 4 | Deploy `public-api`, `worker`, `kilakona-delivery-webhook`, and `clickpesa-webhook` from this exact source. | Functions start successfully and the unauthenticated API remains protected. |
| 5 | Set backend secrets and worker schedule: `WORKER_SECRET`, `APP_ALLOWED_ORIGINS`, ClickPesa server credentials, Kilakona server credentials and provider settings. | Functions load secrets; no secret appears in frontend output. ClickPesa setup belongs to the authorized merchant account holder. |
| 6 | Set website build values `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_BASE_URL`; configure HTTPS domain and SPA fallback. | Domain loads and `/login`, `/signup`, `/send`, `/campaigns/new` load directly. |
| 7 | Set Supabase Auth Site URL and redirect allowlist for the final domain, including `/reset-password`; confirm email delivery. | Signup verification, sign-in and reset work on the hosted domain. |
| 8 | Confirm platform administrator access on the existing verified account. | `/platform` opens for the intended admin and is denied to customers. |
| 9 | Verify customer onboarding and tenancy with two separate businesses. | Each gets its own zero-balance wallet; neither sees the other's messages or private documents. |
| 10 | Verify direct SMS and named campaign in test mode. | Direct send appears in message history, only the named send appears in Campaigns, and test sends debit no credits. |
| 11 | Have the authorized ClickPesa merchant operator complete application payment notification configuration and verify a controlled payment. | One matching transaction creates exactly one wallet credit and invoice; repeat status checks do not duplicate it. |
| 12 | Verify provider inventory and approved Sender ID; settle Kilakona batch, Unicode/multipart and failed-delivery charging rules before enabling live sending. | A controlled real send is reconciled with wallet, inventory and delivery report. |
| 13 | Configure monitoring for failed worker runs, pending payments, held jobs, provider balance and webhooks; establish backup and support ownership. | Someone can detect and resolve an exception promptly. |
| 14 | Open customer acquisition after the flows above pass. | Public site, billing and SMS functions match what is advertised. |

## Known gaps and decisions

- **Public domain/host missing from the archive.** Production redirect, CORS and frontend API settings cannot be finalized without the actual domain.
- **ClickPesa live configuration and real transaction unverified.** SQL creates wallet and payment controls; it does not connect a merchant account. A merchant operator must handle the account-side setup. No card or mobile-money payment was charged in this work.
- **Kilakona live sending remains disabled.** Historical inventory was zero. Confirm the current balance and commercial contract; no live send was performed here.
- **Sender IDs are manually submitted/approved.** Customers can request them, but there is no verified upstream registration API.
- **First 50 contacts/groups are shown in the composer.** Larger audiences should use pasted phone numbers until contact selection gains search and pagination.
- **Legacy manual package checkout is still visible if packages are published.** Decide whether to keep that separate manual purchase path or consolidate packages into ClickPesa before public launch.
- **Refunds/chargebacks need an operator process.** Automatic SMS-credit reversal after a ClickPesa refund has not been built; avoid claiming it is automatic.
- **Production build was type-checked and linted locally.** Full build/browser tests and database migration execution still need confirmation in an environment with its native dependencies.
