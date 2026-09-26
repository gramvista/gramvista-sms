# ClickPesa checkout integration

Hosted checkout uses server-side ClickPesa credentials. Customer browser code receives only the checkout URL. The API calculates the price from the published retail tier and creates a unique alphanumeric order reference. The webhook checks the ClickPesa HMAC when checksum signing is enabled and always queries the payment API independently; a database transaction checks the exact amount, currency, order, and unique transaction reference before crediting the wallet. Repeated notifications do not credit twice. Manual administrator verification rejects ClickPesa orders.

## Deployment sequence

1. Apply migrations `202609150011_clickpesa.sql` and `202609260001_clickpesa_and_retail_minimum.sql`, then deploy the updated `public-api` plus `clickpesa-webhook` Edge Functions.
2. Configure `CLICKPESA_CLIENT_ID` and `CLICKPESA_API_KEY` as **Edge Function secrets only**. If checksum signing is enabled for the hosted checkout application, also configure `CLICKPESA_CHECKSUM_KEY` with its matching key; the code then signs checkout requests and verifies callbacks. Never set these as `VITE_` values.
3. Set `CLICKPESA_CALLBACK_URL=https://PROJECT.supabase.co/functions/v1/clickpesa-webhook` and configure the same application-level `PAYMENT RECEIVED` webhook in ClickPesa. Configure its Return URL to the website's purchase page. The Return URL is navigation only; it never credits a wallet.
4. Verify a controlled payment: create checkout, pay the exact TZS price, receive the callback, confirm one wallet credit and one invoice. Replay the callback and verify no second credit. Test wrong amount, currency, and order reference; also test wrong signature if checksum signing is enabled. Confirm the provider transaction in the ClickPesa dashboard.
5. Keep the public Buy SMS page unpublished until the checkout and webhook are verified. ClickPesa states it has no sandbox; controlled integration checks use live transactions.

The older manual retail-payment API remains for manual workflows. The public Buy SMS screen uses ClickPesa checkout and offers a payment-status check after return; this independently queries ClickPesa and can reconcile a missed webhook. An order stays pending if checkout generation fails; it cannot be credited by the manual verification action. Do not give credits based on a browser redirect or a customer's screenshot.

Official API contracts: [checkout link](https://docs.clickpesa.com/api-reference/collection/generate-checkout-link/generate-checkout-link), [token](https://docs.clickpesa.com/api-reference/authorization/generate-token), [query payment](https://docs.clickpesa.com/api-reference/collection/querying-for-payments/querying-for-payments), [webhooks](https://docs.clickpesa.com/home/webhooks), [checksums](https://docs.clickpesa.com/home/checksum).
