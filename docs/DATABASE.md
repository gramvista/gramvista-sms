# Database and accounting

## Tenant data

Organizations own contacts, groups, suppression records, sender requests, campaigns, messages, wallets, payments, API keys, webhooks, notifications and memberships. Composite foreign keys prevent a contact/group or sender/campaign relationship from crossing organizations.

All application tables have RLS enabled. Tenant direct reads are limited to safe tables with membership policies. No authenticated browser role can modify wallets, ledger, memberships, sender approval, API secrets, or provider records. Sensitive operations are service-only functions behind API authorization.

`campaign_recipients` is a security-invoker view of `messages`; these represent the same per-recipient records rather than two competing sources of truth.

## Wallet invariants

- Available and reserved units cannot be negative.
- `wallet_adjust` locks the wallet and deduplicates `(organization, type, reference)`.
- `enqueue_campaign` reserves before creating durable work. Reservation and idempotency result commit together.
- `settle_job` settles a job once and releases unused units. Partial upstream acceptance with no recipient identity produces `billing_status=unknown` on recipient records while the aggregate wallet is settled using the accepted count.
- `cancel_campaign` releases only work which has not started.
- `verify_payment` locks payment and creates wallet credit plus invoice atomically.
- Ledger updates/deletes are blocked by a trigger, including privileged accidental updates.

For a 10-unit balance and a 3-unit campaign:

| Operation  | Available | Reserved | Ledger                    |
| ---------- | --------: | -------: | ------------------------- |
| Before     |        10 |        0 | Prior credit              |
| Reserve    |         7 |        3 | reservation, debit 3      |
| Accept all |         7 |        0 | campaign_debit, neutral 3 |

Settlement is “neutral” against **available** balance because reservation already reduced it. If only 2 units were accepted, an additional reservation release credits 1 unit to available.

Delivery failure never automatically changes billing. Provider charging/refund policy is not inferred.

## Operational records

`provider_submissions` stores shoot IDs, counts and raw successful responses. `provider_events` is reserved for verified callback integration. `provider_balance_snapshots` tracks inventory separately from tenant wallets. `provider_usage` leaves monetary cost null until the agreement is configured.

`webhook_deliveries` is a transactional outbox created by message/campaign status triggers. Webhook claims have a lease; retries reuse the event ID. `campaign_jobs` has no automatic retry for ambiguous sends.

Money uses PostgreSQL numeric and string transport; SMS units use integers. Timestamps are UTC. Dashboard dates use the organization timezone. Queries paginate 50 records; production indexes cover organization scope, status, creation time, phone and provider references.
