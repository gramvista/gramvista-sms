# Deployment

The current project is deployed as `sscleaiwktklkuxqqndf`. See [the deployment report](docs/CLOUD-DEPLOYMENT.md) for verified capabilities and remaining launch settings. The instructions below also support a fresh environment.

## 1. Supabase

Create a Supabase project in the desired region. Install the Supabase CLI and authenticate in your own terminal. Use a separate staging project first.

```sh
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase functions deploy public-api
supabase functions deploy worker
supabase functions deploy kilakona-delivery-webhook
```

Migrations create schema, RLS, storage buckets, wallet procedures, team invitations and the transactional webhook outbox. No administrator or credits are seeded. After creating and verifying your own account, bootstrap the first administrator using trusted SQL:

```sql
insert into public.platform_admins(user_id) values ('YOUR_VERIFIED_AUTH_USER_UUID');
```

Do not grant customer memberships in this table. Platform administration is separate from organization Owner/Administrator roles.

## 2. Server secrets

Set these as Supabase Edge Function secrets. Keep secrets out of Vite builds, shell history, source control and frontend hosting variables.

| Setting                                   | Purpose                                                  |
| ----------------------------------------- | -------------------------------------------------------- |
| `SMS_PROVIDER=mock`                       | Keep staging simulated initially                         |
| `WORKER_SECRET`                           | A cryptographically random worker-only bearer token      |
| `APP_ALLOWED_ORIGINS`                     | Comma-separated exact frontend origins                   |
| `WEBHOOK_ALLOWED_HOSTS`                   | Approved, publicly routable customer webhook domains     |
| `GRAMVISTA_DELIVERY_CALLBACK_URL`         | Gramvista-owned HTTPS callback endpoint                  |
| `KILAKONA_API_KEY`, `KILAKONA_API_SECRET` | Server-only live credentials                             |
| `KILAKONA_API_BASE_URL`                   | `https://www.messaging.kilakona.co.tz/api/v1/vendor`     |
| `KILAKONA_MAX_CONTACTS_PER_REQUEST`       | Confirmed contractual request limit                      |
| `KILAKONA_BILLING_CONFIRMED=true`         | Enable only after verifying estimator/charging agreement |
| `CLICKPESA_CLIENT_ID`, `CLICKPESA_API_KEY` | Server-only hosted-checkout credentials                  |
| `CLICKPESA_CHECKSUM_KEY`                  | Signs checkout payloads and verifies callbacks            |
| `CLICKPESA_CALLBACK_URL`                  | Public HTTPS `clickpesa-webhook` Edge Function URL         |

Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Production API handlers validate Supabase sessions with `auth.getUser`, require verified email, and check membership and permissions before using the service client. `verify_jwt=false` permits Gramvista API keys and worker tokens; it does **not** make handlers unauthenticated.

Register only reviewed webhook hosts with stable public DNS. Enforce outbound network restrictions against private, link-local and metadata networks at the egress layer. The application blocks literal IPs, localhost, non-HTTPS URLs, credentials in URLs, nonstandard ports and redirects; DNS rebinding protection requires trusted host administration/egress policy.

## 3. Schedule workers

Migration `202609150009_scheduled_worker.sql` creates the Supabase Cron + pg_net schedule. Configure its `gramvista_worker_url` and `gramvista_worker_token` Vault entries; this has been completed for the current project. The worker endpoint is:

```text
https://PROJECT.supabase.co/functions/v1/worker
Authorization: Bearer WORKER_SECRET
```

Store the token in Supabase Vault or your scheduler’s secret store. A single worker invocation syncs inventory, processes up to five batches, reconciles up to 50 submissions, and delivers up to 20 webhooks within a 90-second work window. A three-minute database lease prevents overlapping dispatch. Tune invocation frequency for Edge runtime limits and confirmed provider rate limits. Expand upstream inventory accounting beyond the conservative snapshot check before high-volume live traffic.

Scheduled campaigns use database timestamps; the browser need not remain open. Stale processing jobs are marked held after five minutes and never automatically resent. Investigate held jobs with Kilakona before deciding whether to settle or release credits. There is intentionally no blind “retry held batch” button.

## 4. Frontend

Configure public build variables:

```dotenv
VITE_SUPABASE_URL=https://PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_OR_PUBLISHABLE_KEY
VITE_API_BASE_URL=https://PROJECT.supabase.co/functions/v1/public-api
```

```sh
npm ci
npm run build
```

Deploy `dist/` to any static host. Rewrite client navigation routes to `index.html`. Configure Supabase Auth Site URL, allowed redirect URLs and email delivery for your production domain. Password reset redirects to `/reset-password`.

For the branded API domain, proxy `https://api.sms.gramvistaempire.com/v1/*` to `/functions/v1/public-api/v1/*`. Preserve Authorization, Idempotency-Key and request body. Apply HTTPS, a 1 MB body limit, request rate limits and security headers at the gateway. Do not proxy the local demo server.

## 5. Staging acceptance

- Verify email signup, login, password reset and invitation acceptance with real Supabase Auth.
- Confirm private storage uploads and signed retrieval for the correct organization only.
- Run database security tests against staging and test concurrent reservations with separate PostgreSQL connections.
- Verify cron execution, webhook receiver signatures, backoff and recovery after interrupted workers.
- Configure actual package prices, payment instructions, provider thresholds and costs with Gramvista staff.
- Confirm all unresolved provider details in [KILAKONA.md](docs/KILAKONA.md).
- Perform an explicitly authorized live send to a controlled recipient, then compare provider inventory, wallet ledger and reports. Automated tests never do this.
- Establish backups, retention, alerting and restore drills before onboarding paying customers.
