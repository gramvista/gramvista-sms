# Customer webhooks

Register an HTTPS endpoint in **Webhooks** after its domain is approved in `WEBHOOK_ALLOWED_HOSTS`. Select `message.submitted`, `message.delivered`, `message.failed`, `campaign.completed` and/or `balance.low`. Save the secret shown once.

Events are inserted into `webhook_deliveries` by PostgreSQL triggers in the same transaction as message/campaign/wallet state changes. Workers use leased claims. Delivery is **at least once**: deduplicate by event ID.

```json
{
  "id": "gvs_msg_...:delivered",
  "type": "message.delivered",
  "created_at": "2026-09-15T10:00:00Z",
  "data": {
    "id": "gvs_msg_...",
    "recipient": "+255712345678",
    "status": "delivered",
    "test_mode": false
  }
}
```

## Signature

```text
X-Gramvista-Signature: t=UNIX_SECONDS,v1=HEX_HMAC_SHA256
X-Gramvista-Event-Id: STABLE_EVENT_ID
```

Compute HMAC-SHA256 with your endpoint secret over the exact bytes of `timestamp + '.' + raw_request_body`. Compare signatures in constant time. Reject timestamps outside a five-minute window; store and deduplicate event IDs. Parse JSON only after checking the raw-body signature.

Return a 2xx response quickly and process asynchronously. Failed deliveries retry after 30s, 60s, 120s, 240s, 480s; six total attempts. Exhausted deliveries remain inspectable. Redirects are refused. HTTP calls time out after 10 seconds. Requests never contain Kilakona credentials or raw provider references.

Webhook secrets must remain retrievable for HMAC signing, so they are stored in the server-only endpoint table. This differs from customer API keys, which are hashed. Tenant direct reads of webhook secrets are denied; the API returns endpoint metadata only.

Campaign completion currently means all batches were submitted. The low-wallet event triggers when available units cross below 100; make that tenant-configurable before offering custom thresholds.

## Provider callback

The Kilakona callback endpoint is intentionally inactive (501) until the actual payload and authentication contract are confirmed. It does not trust inbound delivery claims. Use authenticated Kilakona delivery-report reconciliation in the meantime.
