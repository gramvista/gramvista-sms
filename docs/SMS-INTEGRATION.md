# Gramvista Mteja Connect

Mteja Connect is a normal Gramvista organization/client. It never receives Kilakona credentials.

1. Create its organization and request an approved Sender ID.
2. Purchase Gramvista credits.
3. Create a restricted API key with `messages.send`, `messages.read`, `wallet.read`, and `sender_ids.read`.
4. Check `GET /v1/balance` and `GET /v1/sender-ids`.
5. Send via `POST /v1/messages`. Use your immutable Mteja event/order ID as the idempotency key.
6. Store Gramvista campaign/message references and subscribe to signed delivery events.
7. Deduplicate webhook events and reconcile using Gramvista message GET endpoints.

Test with `gvs_test_*` before switching to a live key. A provider migration remains an internal Gramvista change; Mteja’s API contract stays the same.

The same API boundary supports a future Flutter/Dart client. No Flutter project is included here.
