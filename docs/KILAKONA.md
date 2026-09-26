# Kilakona integration

Only the three endpoints supplied in the master specification are implemented. The balance endpoint was validated with live credentials on the deployed Supabase project and returned 0 SMS. Live sending and delivery-report contracts still require provider confirmation and a controlled delivery test.

Base URL: `https://www.messaging.kilakona.co.tz/api/v1/vendor`

Headers: `api_key`, `api_secret`, `Content-Type: application/json`.

## Send

`POST /message/send`

```json
{
  "senderId": "YOUR_SENDER_ID",
  "messageType": "text",
  "message": "YOUR_MESSAGE_TEXT",
  "contacts": "255712345678,255754123456",
  "deliveryReportUrl": "https://YOUR_GRAMVISTA_HOST/webhooks/kilakona/delivery"
}
```

Successful envelope: `code: 200`, `success: true`. Data contains `validContacts`, `invalidContacts`, `duplicatedContacts`, `messageSize`, `message`, `shootId`. The adapter stores the reference internally, preserving Gramvista identifiers for customer use.

## Delivery report

`GET /message/deliver/{shootId}`

Data is an array with `message`, `mobile`, `senderId`, `status`, `statusCode`, `explanation`, `messageType`, `sentAt`.

| Provider status | Gramvista status |
| --------------- | ---------------- |
| Delivered       | delivered        |
| Failed          | failed           |
| Buffered        | pending          |
| Any other value | unknown          |

The original status and status code are retained. `sentAt` is preserved by the adapter as raw provider text; its timezone is not inferred. Gramvista timestamps reflect submission/observation times. Terminal delivery states do not regress on a later pending report.

## Inventory

`GET /message/balance` returns `data.totalSms`. Store an admin-only snapshot; never return this value from customer `/v1/balance`.

## Unresolved contract items

- Sender ID registration API and approval callbacks.
- Delivery callback exact payload and authentication/signature mechanism.
- Provider rate limits and maximum contacts per request.
- Failed delivery charging and refund policy.
- Unicode and multipart billing, including partial acceptance per-recipient attribution.
- Provider timestamp timezone.
- Inbound SMS and provider top-up API.

No endpoints or callback parsers are invented for these items. Sender IDs use a manual Gramvista review → provider portal/support submission → recorded approval workflow. The callback endpoint returns 501 and performs no delivery or billing mutations; authenticated report reconciliation is the source of delivery updates.

Development batching defaults to 100 recipients. This is not a claimed provider limit. Live workers require an explicitly configured limit, Gramvista callback URL and `KILAKONA_BILLING_CONFIRMED=true`. Billing confirmation means the agreed charging model matches the estimator and accepted-contact settlement used here; adapt the billing code first if it does not.

The cloud smoke test validates live balance access; it does not send live SMS. Cloud maintenance scripts require WORKER_SECRET in the process environment. `RUN_LIVE_KILAKONA_TESTS=false` is reserved for an explicitly authorized future integration test. No live recipient or provider credential is included in source.
