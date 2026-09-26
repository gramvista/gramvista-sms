# Implementation status and roadmap

## Implemented

Organization onboarding; zero-balance wallets; platform credits/debits; manual payment verification; sender requests/approval; contacts; mapped CSV import; groups; suppression; templates; campaign review, scheduling and cancellation; mock sending; real provider adapter; internal shoot ID persistence; delivery-report reconciliation; customer wallet/API; hashed keys and rate limiting; transactional webhook events; admin inventory/liability views; responsive UI.

Supabase Auth, private storage policies, authenticated Edge API, worker, SQL migrations and minute-by-minute Cron are deployed to `sscleaiwktklkuxqqndf`. Hosted verification passed for real sign-in, onboarding, zero-credit wallets, RLS, private documents, test-key sending, reconciliation and key revocation. Temporary verification records were removed. See [CLOUD-DEPLOYMENT.md](CLOUD-DEPLOYMENT.md).

## Current operating limits

- Campaign input is capped at 10,000 recipients. Contacts/groups pickers currently show the first 50 records; large audiences can use normalized phone lists or the API. CSV import handles up to 10,000 rows and uses per-contact writes with success/failure reporting.
- Public lists paginate at 50 records. UI filters and CSV exports apply to the displayed page.
- Team invitations are recorded and accepted when the matching verified email authenticates. Invitation email dispatch is not configured; share the application signup URL with the invitee.
- Payment methods are manual. Actual bank/mobile-money instructions and commercial prices must be supplied by Gramvista; no payment gateway or invented payment destination is embedded.
- Provider cost/pricing tables exist. Full revenue/margin dashboards, advanced provider routing, exact failed-refund rules and automated wholesale inventory reservation are future work.
- Sender ID provider approval remains a manual operations workflow. Callback parsing/authentication stays inactive until documented.
- Unknown provider submission results require support investigation. An automated recovery console must not guess whether a timed-out send succeeded.
- Quiet hours apply to all non-test sends. A future transactional-message policy can add a separately authorized exemption.
- Webhook domains require a server allowlist. Production requires outbound private-network restrictions.
- Cloud deployment is complete. No live SMS or external emails have been sent by the build process.

## Before commercial launch

Publish the frontend on a public host/domain, verify production email delivery/SMTP, fund the currently empty Kilakona balance, publish commercial packages/payment instructions, confirm Kilakona limits/billing/callback requirements, run a controlled live send, load-test concurrent PostgreSQL clients, configure observability/backups/retention, and verify customer webhook delivery with a real receiver.

## V1.1

Automated payments behind a payment adapter; provider-supported Sender ID automation; group pagination and large contact selection; richer delivery reports; self-service invoice documents; webhook replay console and per-tenant low-balance thresholds; provider cost/margin reporting.

## V2

Multiple providers and smart routing; inbound SMS; OTP/Verify API; Flutter application; reseller accounts. Preserve the Gramvista API boundary throughout.
