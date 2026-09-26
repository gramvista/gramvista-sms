# SMS inventory bank

The bank uses one server-selected upstream account. Production defaults to Kilakona in `private.sms_bank`; the local demo explicitly selects mock in its isolated database. No admin/customer endpoint can edit the provider balance or switch the bank to mock. `SMS_PROVIDER` must be explicit; non-test mock sends additionally require `LOCAL_DEMO=true`.

Available to Allocate = max(0, reported inventory - unreconciled usage - available customer balances - reserved customer balances - safety reserve). A successful snapshot must be less than five minutes old, with no newer failed sync. Otherwise allocation fails closed.

`wallet_adjust`, payment verification, campaign reservation, settlement, release and cancellation acquire one bank transaction advisory lock before row locks. Every wallet liability increase also passes a database trigger. Allocation creates a ledger entry without changing the provider snapshot. Settlement reduces wallet liabilities and records upstream consumption in the same transaction. Existing wallet liabilities count immediately when the migration is applied; migration does not manufacture inventory to cover them.

Synchronization captures a usage watermark before the network request. Only an observed balance decrease can reconcile usage up to that watermark. Unchanged balances, top-ups, out-of-order responses and concurrent sends cannot erase newer usage. This deliberately underestimates capacity when a top-up hides consumption or a balance decreases during an in-flight send. Investigation with provider evidence is required; do not reset estimates just because a sync succeeded. Aggregate provider balances cannot prove exact attribution of external/manual account activity. Keep the upstream account exclusive to Gramvista. A provider-confirmed usage ledger is needed for exact reconciliation when top-ups and outside usage overlap.

Allocations and positive administrative corrections share capacity protection. Corrections require an explicit confirmation, reason and reference. Payment verification, wallet allocation and invoice creation either all commit or all roll back. Payment requests remain pending if capacity is insufficient. Once an organization already has wallet credits, a stale provider snapshot does not reject its queued message before submission; Kilakona's authenticated response is authoritative. Provider delivery failures change delivery status only; they do not refund settled charges. Ambiguous submissions remain held with their wallet reservations intact.

Sender ownership and names are immutable. Sender review includes organization details, documents, history, request-more-information, provider pending, approval, rejection, suspension and expiry. Provider evidence is required for live approval. Direct tenant database reads cannot access provider status codes or raw provider records. Closing organizations preserves commercial records.

## Verification and rollout

Run `npm.cmd test`, `npm.cmd run build`, `npm.cmd run lint` and `npm.cmd run test:e2e` on Windows. The bank suite exercises competing 8,000/7,000 allocations and reservations against 10,000, rollback, idempotency, stale inventory, reconciliation races, immutable ownership, and privileged-operation denial. PGlite executes PostgreSQL functions but serializes client queries: these tests are not a substitute for a multiple-connection PostgreSQL contention/load test before launch.

Apply `202609160001_inventory_bank.sql` after existing migrations, then deploy matching `public-api` and `worker` functions together. Inspect existing sender provider-record ownership and provider thresholds before migration: invalid existing values cause migration to fail rather than silently alter commercial records. Sync the real balance before allowing allocations. Confirm the bank provider matches `SMS_PROVIDER`. Never set `LOCAL_DEMO=true` on the hosted backend.

This change does not deploy the frontend or send live SMS. The planned domain is **sms.gramvistaempiregroup.com**; hosting and DNS remain to be configured. Deployment still needs funded provider inventory, approved senders, confirmed provider segment/batch/charging policy, a controlled authorized live-send test, multiple-connection contention tests, production alert delivery, backup/restore checks and production email setup. Existing internal dashboards expose failed/held jobs, stuck jobs, reconciliation failures, failed syncs, inventory health and financial rejection audit entries; external alert routing is not configured.


## Resetting a customer wallet

Platform > wallets > Reset wallet removes that customer's available SMS balance with a `wallet_reset` debit. The admin reviews the exact balance, supplies a reason and unique reference, and types RESET. The server rejects reserved SMS and rejects a balance that changed after review. Repeating a successful reference returns the original reset; it never removes credits added later. Payment, order, invoice, provider inventory and existing ledger records remain intact. This is an administrative credit correction, not a cash refund. Every reset records its before/after balance, reason and actor in the ledger and audit log. Authorized maintenance resets are explicitly marked as maintenance rather than attributed to a fictitious administrator.

The server function is `reset_sms_wallet`; the admin-only endpoint is `POST /v1/platform/wallet-reset/{organization_id}`. Apply migration `202609160004_wallet_reset.sql` and deploy the matching public-api function before using the action.
