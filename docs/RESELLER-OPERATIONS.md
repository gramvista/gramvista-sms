# Gramvista retail SMS operations

Gramvista owns the customer website, accounts, retail prices, wallets, invoices and support. Kilakona supplies shared wholesale SMS inventory and performs delivery. Customers use Gramvista credentials and never receive the upstream API credentials.

## Published retail prices

| Credits purchased | TSh per credit |
| --- | ---: |
| 1,001 to 29,999 | 22 |
| 30,000 to 49,999 | 20 |
| 50,000 to 199,999 | 19 |
| 200,000 to 499,999 | 18 |
| 500,000 to 1,000,000 | 15 |

The range rate applies to the whole order, not progressively to separate portions. Quantities outside these ranges require a custom quote. The owner confirmed the 499,999 upper boundary. Prices are calculated on the server and saved on each payment request; changing later prices does not rewrite existing orders. No tax or payment fee has been added without instructions.

One credit is one SMS segment to one recipient, not necessarily an entire long message. Unicode and multipart text can require multiple credits. The composer displays the estimate. Provider charging still needs confirmation before live sending is enabled.

## Funding customer wallets

1. Gramvista buys wholesale inventory through its Kilakona account, using Kilakona's confirmed payment channel.
2. In Platform, select Sync provider balance. This updates the inventory snapshot; it does not create customer credits.
3. A customer chooses a quantity on Buy SMS, obtains verified payment instructions from Gramvista, pays Gramvista and submits the payment reference.
4. In Platform > payments, match the customer, amount, reference and units against actual received funds. Select Verify & credit only after receipt is confirmed.
5. The transaction adds exactly the purchased units, writes the ledger and creates an invoice. Retrying verification does not credit twice.
6. During sending, Gramvista reserves customer units, submits to Kilakona and settles according to the accepted-contact billing model. There is no transfer into an individual Kilakona account for every customer.

Example: buy 100,000 wholesale units, then sell 30,000 credits for TSh 600,000. Verification adds 30,000 to that customer's wallet. Kilakona inventory remains unchanged until delivery consumes it. The capacity display compares wholesale inventory with the combined available and reserved customer balances. Check it before allocating more credits; it is an operational snapshot, not an automatic inventory allocation lock. Adjust wallet is for audited corrections, not ordinary purchase verification.

Wholesale price is separate from the retail price. Profit cannot be calculated until Kilakona cost, charging rules and applicable costs are confirmed.

## Sender ID submission

Platform > senders > Review / submit to Kilakona provides a request document, customer documents and the Kilakona portal link. Download the request and submit it through the confirmed Kilakona registration channel. Downloading/opening the portal is not transmission. Record the returned reference as provider_pending. After Kilakona confirms activation on Gramvista's account, record the reference and approval evidence and mark approved. Status, provider record, customer notification and audit entry are written together.

A Sender ID approved elsewhere is not automatically enabled on this Kilakona account. Ask Kilakona whether the existing approval and business authorization can be reused. No public Kilakona rule or registration API was verified in this implementation. Automatic submission is pending a confirmed API or designated submission address and document requirements. No request has been sent to Kilakona by this build.

Official portal checked: https://messaging.kilakona.co.tz/

## Remaining launch inputs

- Kilakona registration channel, reuse policy and document requirements.
- Funded inventory, confirmed maximum batch size and charging rules.
- Gramvista bank/mobile-money payment instructions; no checkout processor is connected.
- Public frontend domain/hosting and production signup email delivery.
