# Security model

## Enforced boundaries

- Customer sessions use Supabase Auth; no custom password database.
- Production API requests validate the session with `auth.getUser` and require verified email.
- Customer API keys are random 256-bit secrets stored as SHA-256 hashes, with tenant scope, permissions, expiry, rate limiting and revocation.
- Role permission checks happen server-side. An API key cannot exceed the creator’s current role permissions or survive inactive membership.
- Platform admins are stored separately from customer organization roles.
- Tenant tables use RLS. Composite foreign keys prevent cross-tenant relationship injection.
- Provider submissions, credentials, balances, costs, audit records and webhook secrets are not tenant-readable.
- Wallet changes require PostgreSQL functions that lock wallets and record immutable ledger entries.
- Payment verification and send idempotency are atomic.
- Documents use private buckets, scoped paths, MIME/size limits and signed retrieval.
- Provider errors are sanitized; credentials and Authorization headers are not logged.
- Live test sends are never automatic. Test keys cannot choose Kilakona.
- CORS only allows configured exact frontend origins. Local demo only accepts loopback hosts/origins and has no live credential path.

## Production checks still requiring an environment

The Supabase backend is now deployed and hosted Auth, RLS, storage, test-message processing and key revocation have been exercised successfully. Kilakona credentials were validated with a read-only balance request. Production email delivery, public frontend hosting, customer webhook receivers and live SMS delivery still require launch setup. See [CLOUD-DEPLOYMENT.md](CLOUD-DEPLOYMENT.md) for the exact deployed state.

Use gateway body/rate limits and restrict worker access. The handler enforces a 1 MB application payload cap, but the gateway must enforce an ingress limit before the body is buffered. API request logs need a retention job. Configure provider limits, inventory monitoring and commercial accounting policy before live traffic.

Outgoing webhook domains must be reviewed and public. Application URL checks do not replace private-network egress blocking against DNS rebinding. Use a controlled relay if the deployment cannot enforce outbound policy.

Ambiguous provider submissions remain held, preserving reserved credits. Never manually requeue them without provider evidence. No automatic failed-delivery refund is implemented.

The local development administrator switch is not authentication. Never deploy `server/dev.ts` or expose port 8787 to a network.
