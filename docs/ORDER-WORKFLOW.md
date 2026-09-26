# SMS order and payment records

1. The customer creates an order for a quantity (starting at 1 SMS for TSh 22) or a package. The server fixes the quantity, amount and currency and generates a permanent GVS-ORD reference. The order starts as awaiting_payment; it does not create credits or assert that money was received.
2. After paying through Gramvista's verified payment channel, the customer submits the payment method and transaction reference against that order. The status becomes pending (admin review). Repeated identical submissions return the same record. References are trimmed and uppercased so letter case cannot create duplicate payments.
3. The admin opens Review order, checks the customer, amount, payment reference and actual payment receipt, enters the received amount, receipt reference and notes, and explicitly confirms the check. A claimed payment reference alone is not payment verification. The received amount and currency must exactly match the saved order; partial payments and overpayments require a separate accounting process and are not silently accepted.
4. Approval checks provider-backed capacity and atomically writes the payment review, invoice, wallet allocation, customer notification, order event and audit entry. Retrying approval cannot create another invoice or allocation. One verified receipt cannot fund two orders. Missing inventory leaves the order pending without allocating SMS.
5. Rejection stores the reason and reviewer without changing the wallet. The customer can correct the payment details and resubmit the same order; prior reviews remain in immutable history.

Customer and admin can reopen the order, see its history, invoice and exact wallet ledger entry, and download the record. Order reference, customer payment reference, verified receipt reference, invoice reference and wallet ledger ID have distinct meanings. The order is not an SMS campaign: customers send messages separately after SMS is allocated.

Existing payments keep their IDs, amounts, invoices and ledger links. Migration gives them order references and explicitly labels the retained legacy history. It does not fabricate payment evidence for past approvals. Completed financial records and order terms cannot be edited or deleted through the application.

## Deployment

Apply migrations 202609160001 (inventory bank), 202609160002 (1 SMS minimum), and 202609160003 (order review), then deploy matching public-api and worker functions. The obsolete evidence-free verify_payment RPC is deliberately disabled. Legacy quantity/package submission endpoints retain retry-safe behavior, but approval requires the new review form. Deploy the updated frontend alongside the API.

Payment instructions and live payment gateway verification remain manual; this workflow does not invent payment destinations or automatically confirm incoming money.

Deployment verified on 16 September 2026: the three migrations and matching API/worker functions are applied to the connected Supabase project. Local frontend screens and production build are updated; public frontend hosting remains pending. Hosted verification used a rolled-back transaction and left no test orders or credits.
