# Gramvista API v1

Production base: `https://sscleaiwktklkuxqqndf.supabase.co/functions/v1/public-api/v1`. Local demo base: `http://127.0.0.1:8787/api/v1`.

## Authentication

```http
Authorization: Bearer gvs_live_YOUR_KEY
```

Create keys from **API & developers**. Full keys are shown once; only SHA-256 hashes and prefixes are stored. Keys have explicit permissions, expiry and revocation. Creator membership and current role are rechecked on use. A test key always simulates delivery and consumes no customer credits.

Browser requests use a verified Supabase user JWT. `X-Organization-Id` can select only an existing membership for browser sessions. Public API keys derive organization exclusively from the key; `organization_id` in a send body is rejected.

## Send

```sh
curl -X POST https://sscleaiwktklkuxqqndf.supabase.co/functions/v1/public-api/v1/messages \
  -H "Authorization: Bearer gvs_live_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: order-12882" \
  -d '{"sender_id":"ABCSHOP","recipients":["+255712345678"],"message":"Your order is ready."}'
```

The sender must be approved and belong to your organization. Up to 10,000 input recipients per submission; larger audiences should be split into independently identified requests. Phones are deduplicated and suppression is checked server-side. Optional fields: `name`, `scheduled_at` (UTC ISO 8601). Browser sessions may set `test_mode=true`; API keys determine their own test environment.

Response:

```json
{
  "success": true,
  "message_batch_id": "gvs_cmp_...",
  "campaign_id": "uuid",
  "recipients": 1,
  "estimated_units": 1,
  "status": "queued",
  "test_mode": false,
  "request_id": "req_..."
}
```

`message_batch_id` is the stable public campaign reference. It is never a provider shoot ID. The internal Gramvista UUID is returned as `campaign_id` for dashboard actions.

## Endpoints

| Method | Path                                      | Permission         | Behavior                        |
| ------ | ----------------------------------------- | ------------------ | ------------------------------- |
| POST   | `/messages`                               | messages.send      | Validate, reserve and enqueue   |
| GET    | `/messages`                               | messages.read      | Paginated normalized messages   |
| GET    | `/messages/{gvs_msg_reference}`           | messages.read      | One organization-scoped message |
| POST   | `/campaigns`                              | campaigns.send     | Same queued send engine         |
| GET    | `/campaigns`                              | campaigns.read     | Paginated campaigns             |
| GET    | `/campaigns/{gvs_cmp_reference}`          | campaigns.read     | Campaign report                 |
| GET    | `/campaigns/{gvs_cmp_reference}/messages` | messages.read      | Paginated recipient messages    |
| GET    | `/balance`                                | wallet.read        | Customer wallet only            |
| GET    | `/transactions`                           | transactions.read  | Immutable customer ledger       |
| GET    | `/sender-ids`                             | sender_ids.read    | Organization Sender IDs         |
| POST   | `/sender-ids`                             | sender_ids.request | Manual approval request         |

Message fields include `message_reference`, `normalized_phone`, `message_snapshot`, `status`, `billing_status`, `sent_at`, `delivered_at`. Delivery and billing states are independent.

Pagination: `?page=1`, 50 records/page, `data`, `page`, `has_more`. Customer reports can also filter messages with `?campaign_id=GRAMVISTA_UUID`. UI search/status filters apply to the displayed page.

Balance:

```json
{
  "available_sms": 8430,
  "reserved_sms": 500,
  "total_sms": 8930,
  "request_id": "req_..."
}
```

## Idempotency

`Idempotency-Key` is required for sends. Keep the same payload and key when retrying; the previous response is returned without a second reservation/send. A different body with the same key returns `IDEMPOTENCY_CONFLICT` (409). Scope is organization + test/live environment. A changed business operation requires a new key. Records are retained until a documented retention policy is introduced.

## Errors and limits

```json
{
  "error": {
    "code": "INSUFFICIENT_SMS_BALANCE",
    "message": "Your SMS balance is insufficient for this request.",
    "request_id": "req_..."
  }
}
```

Errors include `UNAUTHORIZED` (401), `FORBIDDEN` (403), `VALIDATION_FAILED` (400), `SENDER_ID_NOT_APPROVED`, `INVALID_SENDER_ID`, `NO_ELIGIBLE_RECIPIENTS`, `QUIET_HOURS`, `ORGANIZATION_SUSPENDED`, `IDEMPOTENCY_CONFLICT` (409), `RATE_LIMITED` (429), and `INTERNAL_ERROR` (500). The request ID is also in `X-Request-Id`.

The initial API key limit is 60 requests/minute, enforced atomically in PostgreSQL. Back off on 429. Do not retry a send with a new key after a timeout; retry the original key. Customer errors never include raw provider payloads or secrets.
