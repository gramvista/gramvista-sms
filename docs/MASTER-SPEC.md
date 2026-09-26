# GRAMVISTA SMS

# COMPLETE MASTER BUILD SPECIFICATION FOR CODEX

You are building a new commercial SaaS/API product owned by:

# GRAMVISTA EMPIRE GROUP LIMITED

Product name:

# GRAMVISTA SMS

Product positioning:

**Business Messaging Infrastructure**

Supporting statement:

**Send, manage and track business messaging through one reliable Gramvista platform.**

Gramvista SMS is NOT simply a page that forwards requests to an upstream SMS provider.

It must become Gramvista's own messaging product with:

* customer accounts;
* SMS balances;
* SMS packages;
* SMS wallet accounting;
* contacts;
* contact groups;
* bulk messaging;
* Sender IDs;
* campaigns;
* delivery reports;
* API keys;
* developer API;
* customer webhooks;
* SMS templates;
* scheduled messaging;
* provider balance monitoring;
* transaction history;
* commercial pricing;
* Gramvista administration;
* future multi-provider routing;
* integration with Gramvista Mteja Connect.

The first upstream SMS provider is:

# KILAKONA MESSAGING

Kilakona must remain behind Gramvista.

Customers must interact only with:

```text
Gramvista SMS
```

and future Gramvista domains such as:

```text
sms.gramvistaempire.com
api.sms.gramvistaempire.com
```

Customers must NOT:

* need Kilakona accounts;
* receive Kilakona API keys;
* know Gramvista's Kilakona API credentials;
* call Kilakona endpoints directly;
* see Kilakona provider balances;
* rely on Kilakona `shootId` values;
* depend on Kilakona response formats;
* be forced to change integrations if Gramvista later changes providers.

The central architecture is:

```text
CUSTOMERS / BUSINESSES / DEVELOPERS
                  │
                  │
                  ▼
          GRAMVISTA SMS
                  │
       ┌──────────┼───────────┐
       │          │           │
       ▼          ▼           ▼
   Dashboard    API         Wallet
       │          │           │
       └──────────┼───────────┘
                  │
                  ▼
       Gramvista Messaging Engine
                  │
                  ▼
          Provider Adapter
                  │
                  ▼
              Kilakona
                  │
                  ▼
           Mobile Networks
                  │
                  ▼
             Recipients
```

Future:

```text
                     GRAMVISTA SMS
                           │
             ┌─────────────┼─────────────┐
             ▼             ▼             ▼
         Kilakona      Provider B    Provider C
```

Gramvista's public API must remain the same regardless of provider.

---

# 1. PROJECT ROOT

Work directly inside the current project directory.

If the current folder is named:

```text
gramvista_sms
```

treat that as the project root.

Do NOT create:

```text
gramvista_sms/gramvista_sms/
```

If the directory is empty, initialize the application directly inside it.

---

# 2. TECHNOLOGY STACK

Use:

## Frontend

* React.
* TypeScript.
* Vite.
* React Router.
* TanStack Query / React Query.
* Zod.
* Lucide React.
* Modern CSS.

Do not use Bootstrap.

Avoid unnecessarily large UI libraries.

## Backend

Use:

**Supabase**

For:

* PostgreSQL;
* Authentication;
* Storage;
* Row Level Security;
* Edge Functions;
* Realtime where useful;
* migrations;
* scheduled jobs where appropriate.

## Database

Use:

**PostgreSQL**

## Server-Side Functions

Use:

**Supabase Edge Functions**

or equivalent secure server-side functions for:

* Kilakona calls;
* API-key authentication;
* SMS submission;
* delivery callbacks;
* wallet settlement;
* customer webhooks;
* provider balance synchronization;
* scheduled campaigns;
* reconciliation.

## Future Mobile

Prepare the backend for:

```text
Flutter + Dart
```

Do not build Flutter in this project yet.

---

# 3. KNOWN KILAKONA API

These Kilakona APIs are confirmed and must be implemented.

## Send Message

```text
POST
https://www.messaging.kilakona.co.tz/api/v1/vendor/message/send
```

Headers:

```text
api_key: YOUR_API_KEY
api_secret: YOUR_API_SECRET
Content-Type: application/json
```

Request:

```json
{
  "senderId": "YOUR_SENDER_ID",
  "messageType": "text",
  "message": "YOUR_MESSAGE_TEXT",
  "contacts": "RECIPIENT_PHONE_NUMBERS_SEPARATED_BY_COMMAS",
  "deliveryReportUrl": "https://your-server.com/delivery-callback"
}
```

Confirmed response:

```json
{
  "code": 200,
  "data": {
    "validContacts": 3,
    "invalidContacts": 0,
    "duplicatedContacts": 0,
    "messageSize": 45,
    "message": "YOUR_MESSAGE_TEXT",
    "shootId": "abcd1234-5678-efgh-9012-ijklmnopqrst"
  },
  "success": true,
  "message": "Message submit"
}
```

Important fields:

```text
validContacts
invalidContacts
duplicatedContacts
messageSize
shootId
```

Save the Kilakona `shootId`.

Do not expose it as the customer's main message/campaign reference.

---

# 4. KILAKONA DELIVERY REPORT

Confirmed API:

```text
GET
https://www.messaging.kilakona.co.tz/api/v1/vendor/message/deliver/{shootId}
```

Headers:

```text
api_key
api_secret
```

Confirmed response structure:

```json
{
  "code": 200,
  "data": [
    {
      "message": "This is a sample text message.",
      "mobile": "255718266302",
      "senderId": "SenderID",
      "status": "Delivered",
      "statusCode": "000",
      "explanation": "N/A",
      "messageType": "text",
      "sentAt": "07-02-2024 07:35:08"
    }
  ],
  "success": true,
  "message": "Sent messages report"
}
```

Save both:

```text
provider_status
```

and:

```text
normalized_status
```

Do not throw away Kilakona's original status.

Example:

```text
provider_status = "Delivered"
normalized_status = "delivered"
```

Known examples include:

```text
Delivered
Failed
Buffered
```

Initial Gramvista mappings:

```text
Delivered → delivered
Failed → failed
Buffered → pending
unknown values → unknown
```

Keep mapping centralized.

---

# 5. KILAKONA BALANCE

Confirmed:

```text
GET
https://www.messaging.kilakona.co.tz/api/v1/vendor/message/balance
```

Headers:

```text
api_key
api_secret
```

Response:

```json
{
  "code": 200,
  "data": {
    "totalSms": 30
  },
  "success": true,
  "message": "Balance"
}
```

This is:

# GRAMVISTA'S UPSTREAM KILAKONA BALANCE

It is NOT the customer's Gramvista SMS balance.

Never return this value from a normal customer's `/v1/balance`.

---

# 6. KILAKONA CREDENTIAL SECURITY

Kilakona credentials must only exist server-side.

Use environment variables like:

```text
KILAKONA_API_BASE_URL=https://www.messaging.kilakona.co.tz/api/v1/vendor
KILAKONA_API_KEY=
KILAKONA_API_SECRET=
```

Never use:

```text
VITE_KILAKONA_API_KEY
VITE_KILAKONA_API_SECRET
```

Do not expose provider credentials to React.

Do not store them in browser Local Storage.

---

# 7. PROVIDER ABSTRACTION

Do not spread Kilakona API calls throughout the application.

Create provider abstraction.

Suggested:

```text
src/providers/
```

or secure server equivalent:

```text
providers/
├── SmsProvider.ts
├── providerRegistry.ts
├── mock/
│   └── MockSmsProvider.ts
└── kilakona/
    ├── KilakonaProvider.ts
    ├── kilakona.types.ts
    ├── kilakona.mapper.ts
    ├── kilakona.errors.ts
    └── kilakona.status.ts
```

Conceptual interface:

```ts
export interface SmsProvider {
  sendMessage(
    input: ProviderSendInput
  ): Promise<ProviderSendResult>;

  getBalance(): Promise<ProviderBalance>;

  getDeliveryReport(
    providerReference: string
  ): Promise<ProviderDeliveryReport>;

  healthCheck?(): Promise<ProviderHealth>;
}
```

Kilakona implements this interface.

Later other providers can implement it.

---

# 8. DO NOT COUPLE PUBLIC API TO KILAKONA

Gramvista API must never have endpoints like:

```text
/kilakona/send
/kilakona/balance
```

Customer-facing endpoints must be:

```text
/v1/messages
/v1/campaigns
/v1/balance
/v1/sender-ids
```

Provider selection is internal.

---

# 9. MULTI-TENANT ARCHITECTURE

Every Gramvista customer is an organization.

Example:

```text
Gramvista SMS
│
├── ABC Company
│   ├── wallet
│   ├── sender IDs
│   ├── messages
│   ├── campaigns
│   └── API keys
│
├── XYZ School
│
└── Gramvista Mteja Connect
```

Every business record must contain:

```text
organization_id
```

Use Supabase Row Level Security.

Organization A must never access Organization B.

Do not rely only on React filtering.

---

# 10. AUTHENTICATION

Use Supabase Auth.

Support:

```text
Email
Password
Forgot Password
Email Verification
```

Do not implement custom password storage.

---

# 11. ROLES

Initial customer roles:

```text
Owner
Administrator
Campaign Manager
Developer
Viewer
```

Possible permissions:

```text
messages.send
messages.read

campaigns.create
campaigns.send
campaigns.read

contacts.manage

sender_ids.request
sender_ids.read

wallet.read

transactions.read

api_keys.manage

webhooks.manage

team.manage

settings.manage
```

Backend must enforce sensitive operations.

---

# 12. CUSTOMER DASHBOARD

Dashboard should display:

```text
SMS Balance

Reserved SMS

Messages Today

Messages This Month

Delivered

Failed

Pending

Delivery Rate

Approved Sender IDs

API Usage
```

Include:

```text
Usage over time
Recent Campaigns
Recent Transactions
Recent Delivery Issues
```

Keep dashboard professional.

Use a mostly light interface:

```text
white cards
soft gray background
dark navy sidebar
Gramvista blue buttons
```

---

# 13. CUSTOMER SMS WALLET

This is one of the most important systems.

Do not only store:

```text
balance = 10000
```

Use:

```text
sms_wallets
wallet_transactions
wallet_reservations
```

Possible `sms_wallets`:

```text
id
organization_id
available_units
reserved_units
updated_at
```

---

# 14. WALLET TRANSACTIONS

Create immutable ledger.

Fields:

```text
id
organization_id
wallet_id
type
units
direction
reference_type
reference_id
description
balance_before
balance_after
created_at
created_by
```

Transaction types:

```text
sms_purchase
campaign_debit
api_debit
manual_credit
manual_debit
refund
reservation
reservation_release
adjustment
bonus
expiration
```

Never change customer SMS balance without a ledger record.

---

# 15. WALLET RESERVATIONS

Campaign sending must reserve SMS units before upstream submission.

Example:

```text
ABC balance:
10,000
```

Campaign requires:

```text
3,000
```

Atomically:

```text
available → 7,000
reserved → 3,000
```

Prevent two campaigns overspending same balance.

Use PostgreSQL transaction/function.

---

# 16. WALLET SETTLEMENT

After Kilakona accepts a send:

```text
settle reserved SMS
```

If part of reservation is not used:

```text
release unused amount
```

Do not finalize failed-message refund logic until Kilakona billing policy is known.

Delivery status and billing status must be separate.

---

# 17. BILLING STATUS

Messages/campaign recipient records should support:

```text
billing_status
```

Values:

```text
reserved
charged
released
refunded
unknown
```

Delivery status:

```text
queued
submitted
sent
delivered
pending
failed
rejected
expired
unknown
```

Do not assume failed = refunded.

---

# 18. GRAMVISTA PROVIDER BALANCE

Create admin-only table:

```text
provider_balance_snapshots
```

Fields:

```text
id
provider
balance_sms
success
checked_at
raw_response_json
```

Sync Kilakona using confirmed balance endpoint.

Show Gramvista Admin:

```text
Kilakona Balance
Customer SMS Liability
Reserve
Available Capacity
```

Do not show Kilakona provider balance to normal customers.

---

# 19. CUSTOMER LIABILITY

Calculate total:

```text
all customer available units
+
reserved customer units
```

Compare with Kilakona balance.

Admin warning:

```text
Provider capacity is below customer liabilities.
```

Use configurable reserve threshold.

---

# 20. LOW BALANCE ALERTS

Admin settings:

```text
warning threshold
critical threshold
```

Example UI:

```text
Kilakona Provider Balance
42,780 SMS

Status
Low
```

Do not send campaigns if provider capacity is critically unavailable unless configured.

---

# 21. SMS PACKAGES

Create:

```text
sms_packages
```

Fields:

```text
id
name
description
sms_units
selling_price
currency
active
valid_from
valid_until
sort_order
```

Example names:

```text
Starter
Business
Pro
Corporate
Enterprise
```

Do not hardcode final prices.

Gramvista Admin controls pricing.

---

# 22. PRICING TIERS

Support optional volume pricing.

Create:

```text
pricing_tiers
```

Fields:

```text
id
name
minimum_units
maximum_units
price_per_sms
currency
customer_type
active
```

Do not expose Kilakona cost to customer.

---

# 23. PROVIDER COST

Admin should eventually know:

```text
Kilakona cost
Gramvista selling price
Gross margin
```

Create provider pricing/cost tables or configurable cost settings.

Do not hardcode wholesale cost until agreement is known.

---

# 24. BUY SMS

Customer page:

```text
Buy SMS
```

Show available packages.

Initial v1 may support:

```text
Manual Payment Verification
```

until payment gateway selected.

Flow:

```text
Customer chooses package
↓
Payment instructions
↓
Customer submits payment reference
↓
Gramvista Admin verifies
↓
Server credits wallet
↓
Ledger transaction created
```

Do not credit SMS from frontend.

---

# 25. FUTURE PAYMENT AUTOMATION

Prepare payment adapter.

Future:

```text
M-Pesa
Airtel Money
Mixx by Yas
Bank
Payment Gateway
```

Backend should receive trusted payment callback.

Use idempotent payment references.

One payment must credit SMS exactly once.

---

# 26. ORGANIZATIONS

Create:

```text
organizations
```

Fields:

```text
id
name
legal_name
business_type
phone
email
country
region
address
status
created_at
updated_at
```

Status:

```text
active
suspended
pending
closed
```

---

# 27. ORGANIZATION MEMBERS

Create:

```text
organization_members
```

Fields:

```text
organization_id
user_id
role_id
status
joined_at
```

---

# 28. SENDER IDS

Gramvista is the customer's system of record for Sender IDs.

Create:

```text
sender_ids
```

Fields:

```text
id
organization_id
sender_name
legal_business_name
purpose
sample_message
contact_name
contact_phone
contact_email
status
provider
provider_reference
submitted_at
approved_at
rejected_at
rejection_reason
created_at
updated_at
```

Status:

```text
draft
submitted
gramvista_review
provider_pending
approved
rejected
suspended
expired
```

Only:

```text
approved
```

Sender IDs may be used for sending.

---

# 29. SENDER-ID DOCUMENTS

Use Supabase Storage private bucket.

Store:

```text
Business registration
TIN
Business licence
Authorization letter
Other required documents
```

Create:

```text
sender_id_documents
```

Do not expose documents publicly.

---

# 30. SENDER-ID PROVIDER PROCESS

The exact Kilakona Sender-ID submission API is NOT confirmed.

Therefore build provider interface but do not invent endpoint.

Support two workflows:

## Automated Future Workflow

```text
Gramvista
↓
Kilakona Sender ID API
```

## Manual Current Workflow

```text
Customer submits request
↓
Gramvista Admin reviews
↓
Gramvista staff submits through Kilakona portal/support
↓
Kilakona approves/rejects
↓
Gramvista Admin updates status
```

Customer experience remains inside Gramvista.

---

# 31. APPROVED SENDER SELECTION

During message creation, users select only from:

```text
approved Sender IDs belonging to organization
```

Do NOT allow arbitrary sender text.

---

# 32. CONTACTS

Gramvista SMS needs a lightweight contact system.

Create:

```text
contacts
```

Fields:

```text
id
organization_id
first_name
last_name
phone
normalized_phone
email
status
created_at
updated_at
```

Status:

```text
active
invalid
suppressed
archived
```

---

# 33. CONTACT GROUPS

Create:

```text
contact_groups
contact_group_members
```

Support:

```text
VIP Customers
Staff
Parents
Customers
Members
```

---

# 34. TAGS

Optional:

```text
tags
contact_tags
```

---

# 35. CSV IMPORT

Flow:

```text
Upload CSV
↓
Preview
↓
Map Columns
↓
Normalize phones
↓
Detect duplicates
↓
Validate
↓
Check suppression
↓
Import
```

Report:

```text
Valid
Invalid
Duplicates
Suppressed
Imported
```

---

# 36. PHONE NORMALIZATION

Internally normalize to E.164.

Example:

```text
+255712345678
```

Kilakona currently shows recipients like:

```text
255718266302
```

The Kilakona adapter may remove leading `+` when sending if required.

Do not make provider format Gramvista's internal storage format.

---

# 37. SUPPRESSION LIST

Create:

```text
suppression_list
```

Fields:

```text
id
organization_id
phone
normalized_phone
reason
source
created_at
created_by
```

Reasons:

```text
opt_out
complaint
invalid
do_not_contact
legal
manual
other
```

Campaigns must automatically exclude suppressed contacts.

---

# 38. SEND SMS SCREEN

Build:

```text
Sender ID
Recipients
Message
Schedule
Send
```

Recipient modes:

```text
Single
Multiple
Group
Selected Contacts
```

Before sending show:

```text
Recipients
Valid
Duplicates
Suppressed
Message characters
Estimated SMS parts
Estimated SMS units
Current balance
Balance after estimated send
```

---

# 39. MESSAGE ENCODING

Create utility for SMS segmentation.

Support estimate for:

```text
GSM-7
Unicode
Multipart SMS
```

Do not pretend exact Kilakona billing segmentation is known until their commercial rules confirm.

Label:

```text
Estimated SMS units
```

where appropriate.

---

# 40. CAMPAIGNS

Create:

```text
campaigns
```

Fields:

```text
id
organization_id
campaign_reference
name
sender_id_id
message
message_type
encoding
estimated_parts
status
scheduled_at
recipient_count
eligible_count
valid_count
invalid_count
duplicate_count
estimated_units
reserved_units
charged_units
created_by
created_at
started_at
completed_at
```

Statuses:

```text
draft
scheduled
queued
processing
completed
partially_completed
failed
cancelled
```

---

# 41. CAMPAIGN RECIPIENTS

Create:

```text
campaign_recipients
```

Fields:

```text
id
organization_id
campaign_id
contact_id
phone
normalized_phone
message_snapshot
status
provider_status
provider_status_code
provider_explanation
billing_status
provider
provider_shoot_id
sent_at
delivered_at
failed_at
created_at
updated_at
```

---

# 42. PROVIDER SUBMISSIONS

Kilakona returns one `shootId` for a send submission.

Create:

```text
provider_submissions
```

Fields:

```text
id
organization_id
campaign_id
provider
provider_reference
shoot_id
request_recipient_count
valid_contacts
invalid_contacts
duplicated_contacts
message_size
submitted_at
status
raw_response_json
created_at
```

This becomes the link between Gramvista campaign and Kilakona.

---

# 43. BATCHING

Do not assume Kilakona accepts unlimited contacts.

Create batching architecture.

The actual batch-size limit must be configurable:

```text
KILAKONA_MAX_CONTACTS_PER_REQUEST
```

Do not invent production value.

If not configured, choose conservative development default and clearly document it.

---

# 44. SEND FLOW

Exact workflow:

```text
Customer submits campaign
↓
Authenticate
↓
Verify organization
↓
Verify Sender ID
↓
Normalize recipients
↓
Remove duplicates
↓
Remove suppression
↓
Estimate SMS usage
↓
Atomically reserve wallet
↓
Create campaign
↓
Create campaign recipients
↓
Batch recipients
↓
Send each batch server-side to Kilakona
↓
Save Kilakona shootId
↓
Save valid/invalid/duplicate counts
↓
Update campaign
↓
Wait for delivery callbacks/reconciliation
```

Never loop Kilakona calls directly in browser.

---

# 45. KILAKONA CALLBACK URL

Always send Gramvista-owned callback:

```text
https://api.sms.gramvistaempire.com/webhooks/kilakona/delivery
```

or environment-configured equivalent.

Never pass customer webhook directly to Kilakona.

Correct:

```text
Kilakona
↓
Gramvista
↓
Customer webhook
```

---

# 46. DELIVERY CALLBACK PAYLOAD

Exact Kilakona callback payload is not yet confirmed.

Do NOT invent production parser.

Create:

```text
KilakonaDeliveryWebhookAdapter
```

and a safe development placeholder.

When callback documentation becomes available, map it centrally.

The endpoint should log unknown/raw event safely for development.

---

# 47. DELIVERY REPORT RECONCILIATION

Because Kilakona provides:

```text
GET /message/deliver/{shootId}
```

implement reconciliation.

Use this even when callback works.

Workflow:

```text
send
↓
callback updates statuses
↓
later reconciliation checks unresolved messages
```

Scheduled reconciliation should only check relevant submissions.

Avoid abusive polling.

Make intervals configurable.

---

# 48. PROVIDER EVENTS

Create:

```text
provider_events
```

Fields:

```text
id
provider
provider_reference
event_type
raw_payload_json
received_at
processed_at
processing_status
error_message
```

Admin only.

---

# 49. STATUS NORMALIZATION

Create centralized:

```text
normalizeKilakonaStatus()
```

Known:

```text
Delivered → delivered
Failed → failed
Buffered → pending
```

Unknown → `unknown`.

Never scatter mappings throughout code.

---

# 50. GRAMVISTA MESSAGE IDS

Every message gets Gramvista reference.

Examples:

```text
gvs_msg_xxxxx
```

Campaign:

```text
gvs_cmp_xxxxx
```

Customer sees Gramvista references.

Kilakona `shootId` remains internal provider reference.

---

# 51. PUBLIC GRAMVISTA API

Build a clean versioned API.

Base concept:

```text
https://api.sms.gramvistaempire.com/v1/
```

Locally use development route.

---

# 52. SEND API

Customer-facing:

```text
POST /v1/messages
```

Example:

```json
{
  "sender_id": "ABCSHOP",
  "recipients": [
    "255712345678",
    "255754123456"
  ],
  "message": "Your order is ready."
}
```

Gramvista validates.

Do not accept provider credentials.

---

# 53. SEND API RESPONSE

Return Gramvista structure:

```json
{
  "success": true,
  "request_id": "req_xxxxx",
  "message_batch_id": "gvs_batch_xxxxx",
  "recipients": 2,
  "estimated_units": 2,
  "status": "queued"
}
```

Do not return raw Kilakona response.

---

# 54. MESSAGE STATUS API

```text
GET /v1/messages/{messageId}
```

Response example:

```json
{
  "id": "gvs_msg_001",
  "recipient": "255712345678",
  "sender_id": "ABCSHOP",
  "status": "delivered",
  "sent_at": "2026-09-14T15:30:00Z",
  "delivered_at": "2026-09-14T15:30:08Z"
}
```

---

# 55. CAMPAIGN API

```text
POST /v1/campaigns
GET /v1/campaigns/{id}
GET /v1/campaigns/{id}/messages
```

Return Gramvista data only.

---

# 56. BALANCE API

Create:

```text
GET /v1/balance
```

Return customer wallet:

```json
{
  "available_sms": 8430,
  "reserved_sms": 500,
  "total_sms": 8930
}
```

Do NOT call Kilakona balance directly for this response.

Customer balance comes from Gramvista database.

---

# 57. TRANSACTION API

Create:

```text
GET /v1/transactions
```

Return only customer's wallet ledger.

---

# 58. SENDER-ID API

Create:

```text
GET /v1/sender-ids
POST /v1/sender-ids
```

POST creates Gramvista request.

Do not pretend provider approved immediately.

---

# 59. API KEYS

Create:

```text
api_keys
```

Fields:

```text
id
organization_id
name
key_prefix
key_hash
environment
permissions
last_used_at
expires_at
revoked_at
created_at
```

Generate:

```text
gvs_test_...
gvs_live_...
```

Show full key only once.

Store hash.

---

# 60. API AUTHENTICATION

Use:

```text
Authorization: Bearer gvs_live_...
```

API key resolves organization server-side.

Never allow customers to send:

```text
organization_id
```

to choose tenant.

Authentication determines organization.

---

# 61. TEST MODE

`gvs_test_` must never call Kilakona.

Simulate:

```text
queued
delivered
failed
```

clearly mark:

```text
test_mode: true
```

No credits should be consumed unless configured as simulated accounting.

---

# 62. IDEMPOTENCY

Support:

```text
Idempotency-Key
```

for send requests.

If same customer retries same key:

return previous result.

Do not duplicate SMS.

Create:

```text
idempotency_keys
```

or equivalent.

---

# 63. REQUEST IDS

Generate:

```text
req_xxxxx
```

for every API request.

Use in:

```text
logs
responses
support
```

---

# 64. API ERRORS

Use consistent format:

```json
{
  "error": {
    "code": "INSUFFICIENT_SMS_BALANCE",
    "message": "Your SMS balance is insufficient for this request.",
    "request_id": "req_xxxxx"
  }
}
```

Codes:

```text
UNAUTHORIZED
FORBIDDEN
INVALID_PHONE
INVALID_MESSAGE
INVALID_SENDER_ID
SENDER_ID_NOT_APPROVED
INSUFFICIENT_SMS_BALANCE
RATE_LIMITED
PROVIDER_UNAVAILABLE
VALIDATION_FAILED
INTERNAL_ERROR
```

---

# 65. CUSTOMER WEBHOOKS

Allow developers to register:

```text
https://customer.com/webhooks/gramvista
```

Create:

```text
webhook_endpoints
webhook_deliveries
```

Events:

```text
message.submitted
message.delivered
message.failed
campaign.completed
balance.low
```

Future:

```text
message.received
```

---

# 66. WEBHOOK SECURITY

Each customer webhook gets secret.

Sign using HMAC.

Header concept:

```text
X-Gramvista-Signature
```

Retry failed webhooks with backoff.

Do not retry indefinitely.

---

# 67. CUSTOMER DELIVERY FLOW

```text
Kilakona report
↓
Gramvista receives/reconciles
↓
Normalize
↓
Update Gramvista message
↓
Update customer dashboard
↓
Send customer webhook
```

This is central.

---

# 68. MTEJA CONNECT INTEGRATION

Mteja Connect uses Gramvista SMS like another client.

It must never receive Kilakona credentials.

Flow:

```text
Mteja Connect
↓
Gramvista SMS API
↓
Kilakona
```

Mteja can use:

```text
GET /v1/balance
GET /v1/sender-ids
POST /v1/messages
GET /v1/messages/:id
```

Delivery:

```text
Kilakona
↓
Gramvista SMS
↓
Mteja Connect webhook
```

---

# 69. MESSAGE TEMPLATES

Create:

```text
message_templates
```

Fields:

```text
id
organization_id
name
category
message
active
created_at
updated_at
```

Categories:

```text
promotion
notification
reminder
otp
transactional
custom
```

---

# 70. PERSONALIZATION

Support safe variables eventually:

```text
{{first_name}}
{{business_name}}
```

Do not execute arbitrary code.

---

# 71. SCHEDULED MESSAGES

Campaign:

```text
Send Now
Schedule
```

Use server-side scheduler.

Browser must not remain open.

---

# 72. QUIET HOURS

Create messaging policy settings.

Allow business to define suitable messaging hours.

Do not silently send marketing overnight.

---

# 73. CAMPAIGN WIZARD

Use:

```text
1. Campaign
2. Audience
3. Message
4. Sender ID
5. Schedule
6. Review
7. Confirm
```

Review:

```text
Total contacts
Eligible
Duplicates
Invalid
Suppressed
Estimated units
Balance
Estimated remaining balance
```

---

# 74. CONTACT MANAGEMENT UI

Pages:

```text
Contacts
Groups
Imports
Suppression
```

Keep it simple.

Do not duplicate Mteja Connect's CRM features.

---

# 75. CUSTOMER REPORTING

Campaign page:

```text
Recipients
Delivered
Failed
Pending
Invalid
Duplicates
Delivery Rate
```

Table:

```text
Phone
Sender ID
Status
Status Code
Explanation
Sent At
```

The UI may show normalized status primarily.

Provider explanation can appear in support/details.

---

# 76. KILAKONA REPORT MAPPING

Confirmed Kilakona fields:

```text
message
mobile
senderId
status
statusCode
explanation
messageType
sentAt
```

Map into internal fields.

Keep raw report optionally.

---

# 77. KILAKONA BALANCE SYNC

Create Edge Function:

```text
sync-kilakona-balance
```

Call confirmed endpoint.

Save snapshot.

Run:

```text
manual admin refresh
+
scheduled refresh
```

Do not over-poll.

---

# 78. PROVIDER HEALTH

Create:

```text
providers
```

Fields:

```text
id
code
name
status
active
last_success_at
last_failure_at
created_at
```

Kilakona initial provider.

Statuses:

```text
healthy
degraded
offline
maintenance
```

---

# 79. RETRIES

Retry provider requests only for transient errors.

Use exponential backoff.

Do not repeatedly retry:

```text
invalid sender
invalid contacts
authentication failure
```

without intervention.

---

# 80. PROVIDER LOGS

Admin-only.

Do not expose provider secrets.

Mask headers.

---

# 81. GRAMVISTA PLATFORM ADMIN

Create separate admin experience.

Possible route:

```text
/platform
```

Only Gramvista platform admins.

Do not mix with customer role.

---

# 82. PLATFORM ADMIN DASHBOARD

Show:

```text
Total Organizations
Active Customers
Messages Today
Messages This Month
Customer SMS Liability
Kilakona Balance
Reserve Capacity
Revenue
Estimated Provider Cost
Gross Margin
Failed Campaigns
Pending Sender IDs
```

Do not invent financial numbers.

Use database.

---

# 83. ORGANIZATION MANAGEMENT

Admin:

```text
Organizations
Wallet
Transactions
Sender IDs
Usage
API Keys metadata
Campaigns
Status
```

Do not expose full secret keys.

---

# 84. MANUAL SMS CREDIT

Gramvista Admin may credit wallet.

Require:

```text
units
reason
payment reference
notes
```

Create ledger transaction.

Audit action.

---

# 85. AUDIT LOGS

Create:

```text
audit_logs
```

Track:

```text
manual wallet credit
manual debit
sender ID status change
organization suspension
API key revoked
pricing changed
campaign cancelled
```

---

# 86. BILLING / PAYMENTS

Create:

```text
payments
```

Fields:

```text
id
organization_id
amount
currency
method
reference
status
package_id
sms_units
verified_at
verified_by
created_at
```

Status:

```text
pending
verified
failed
cancelled
refunded
```

---

# 87. INVOICES

Create future-ready:

```text
invoices
```

Initial basic support.

---

# 88. CUSTOMER ACCOUNT STATUS

If suspended:

Block:

```text
sending
new campaigns
new API sends
```

Allow:

```text
login
view transaction history
support
```

depending policy.

---

# 89. RATE LIMITING

Apply to public API.

Rate limits may differ by plan.

Do not tie directly to Kilakona rate limits.

Gramvista controls its customer API.

---

# 90. LARGE CAMPAIGNS

Do not process massive campaigns in HTTP request lifecycle.

Create jobs/batches.

Use Edge Functions/scheduled queue-compatible processing.

---

# 91. CAMPAIGN JOB TABLE

Create:

```text
campaign_jobs
```

Fields:

```text
id
campaign_id
batch_number
status
recipient_count
attempts
provider_submission_id
scheduled_at
started_at
completed_at
last_error
```

---

# 92. NO MESSAGE DUPLICATION

Ensure batch retries are idempotent.

---

# 93. PROVIDER CALLBACK SECURITY

Exact Kilakona callback authentication is not yet documented.

Do not pretend it exists.

Implement:

```text
allowed validation placeholder
rate limiting
logging
reconciliation via GET endpoint
```

When documentation arrives, update parser/security centrally.

---

# 94. UNKNOWN KILAKONA DETAILS

These must remain configurable or documented as TODO, not guessed:

```text
delivery callback exact payload
callback authentication/signature
maximum contacts per send request
rate limits
billing rules for failed messages
multipart billing
Unicode billing
Sender-ID submission API
inbound SMS
provider top-up API
```

Do not invent production values.

---

# 95. PUBLIC DEVELOPER DOCUMENTATION

Create internal docs foundation:

```text
docs/API.md
docs/WEBHOOKS.md
docs/SMS-INTEGRATION.md
```

Later can become:

```text
docs.sms.gramvistaempire.com
```

---

# 96. API DOCUMENTATION

Document:

```text
Authentication
Send Message
Get Message
Campaigns
Balance
Transactions
Sender IDs
Webhooks
Errors
Idempotency
Test Mode
```

---

# 97. API EXAMPLE

Example:

```bash
curl -X POST \
  https://api.sms.gramvistaempire.com/v1/messages \
  -H "Authorization: Bearer gvs_live_xxxxx" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: order-12882" \
  -d '{
    "sender_id":"ABCSHOP",
    "recipients":["255712345678"],
    "message":"Your order is ready."
  }'
```

Do not include Kilakona credentials.

---

# 98. TEST API

`gvs_test_*` simulates response.

Good for developers.

---

# 99. UI DESIGN

Gramvista SMS should look professional and commercial.

Primary colors:

```text
Gramvista Navy
Blue
Cyan
White
Soft Gray
```

Use mostly light dashboard surfaces.

Sidebar:

```text
dark navy
```

Cards:

```text
white
```

Primary action:

```text
Gramvista blue
```

Status colors:

```text
Delivered → green
Pending → amber/blue
Failed → red
```

Use status text/icons too, not only color.

---

# 100. APPLICATION NAVIGATION

Customer sidebar:

```text
Dashboard

Send SMS

Campaigns

Contacts

Groups

Sender IDs

Message History

Delivery Reports

SMS Wallet

Buy SMS

Transactions

Templates

API & Developers

Webhooks

Team

Settings
```

Do not make sidebar unnecessarily crowded.

Group developer items.

---

# 101. MOBILE RESPONSIVE

Web app should work well on mobile before Flutter app.

Responsive sidebar.

Mobile cards.

Responsive tables.

No horizontal overflow unless necessary.

---

# 102. LOGIN

Brand:

```text
Gramvista SMS
Business Messaging Infrastructure
```

Fields:

```text
Email
Password
```

Links:

```text
Forgot Password
Create Account
```

---

# 103. ONBOARDING

New account:

```text
Business Name
Legal Name
Country
Phone
Email
Business Type
```

Create:

```text
organization
owner membership
SMS wallet with 0 balance
```

Do not give fake SMS credits unless explicit trial policy configured.

---

# 104. CUSTOMER FIRST EXPERIENCE

After onboarding:

Dashboard should guide:

```text
1. Request Sender ID
2. Buy SMS
3. Add Contacts
4. Send First Campaign
5. Generate API Key
```

Do not overwhelm.

---

# 105. EMPTY STATES

Examples:

Sender IDs:

```text
You don't have an approved Sender ID yet.

Request one to start sending branded messages.
```

Wallet:

```text
Your SMS balance is currently 0.

Buy SMS credits to begin sending.
```

Campaigns:

```text
No campaigns yet.
```

---

# 106. SEARCH

Global search may support:

```text
contacts
campaigns
messages
transactions
```

Not mandatory first release.

---

# 107. NOTIFICATIONS

Create:

```text
Sender ID approved
Sender ID rejected
SMS purchase credited
Campaign completed
Provider balance low — admin
API key created
```

---

# 108. SUPABASE STORAGE

Private buckets for:

```text
sender ID documents
payment proof if manual
organization logos
```

Use signed URLs.

---

# 109. RLS

Enable RLS on tenant tables.

Users may only access organizations they belong to.

Platform admins use separate authorization.

---

# 110. DATABASE INDEXES

Index:

```text
organization_id
campaign_id
normalized_phone
status
created_at
provider_shoot_id
provider_reference
```

---

# 111. PAGINATION

Server-side pagination.

Do not load millions of messages into browser.

---

# 112. MONEY

Use numeric/decimal or smallest currency units.

Never floating JS for financial calculations.

---

# 113. TIMESTAMPS

Store UTC.

Display organization timezone.

---

# 114. CUSTOMER API KEY SECURITY

Hash API keys.

Show full key once.

Support revoke.

Support expiry.

Support permissions.

---

# 115. PROVIDER SECRET SECURITY

Provider secrets stored only in server environment.

Never database-readable by tenant users.

---

# 116. LOGGING

Do not log:

```text
api_secret
raw customer API keys
passwords
access tokens
```

Mask phone numbers in some internal logs where appropriate.

---

# 117. ERROR HANDLING

Use professional customer messages.

Do not show raw Kilakona errors directly.

Map provider errors into Gramvista errors.

Admin/support may access provider details.

---

# 118. KILAKONA PROVIDER ERROR MAPPER

Create centralized mapper.

Unknown errors:

```text
PROVIDER_ERROR
```

with internal details only.

---

# 119. BUILD STRUCTURE

Suggested:

```text
gramvista_sms/
│
├── public/
│
├── src/
│   ├── app/
│   ├── components/
│   ├── features/
│   │   ├── auth/
│   │   ├── dashboard/
│   │   ├── organizations/
│   │   ├── wallet/
│   │   ├── contacts/
│   │   ├── sender-ids/
│   │   ├── messages/
│   │   ├── campaigns/
│   │   ├── templates/
│   │   ├── delivery/
│   │   ├── transactions/
│   │   ├── api-keys/
│   │   ├── webhooks/
│   │   ├── billing/
│   │   ├── teams/
│   │   └── settings/
│   │
│   ├── lib/
│   ├── hooks/
│   ├── types/
│   ├── utils/
│   ├── styles/
│   └── main.tsx
│
├── supabase/
│   ├── migrations/
│   ├── functions/
│   │   ├── send-message/
│   │   ├── send-campaign/
│   │   ├── kilakona-delivery-webhook/
│   │   ├── reconcile-delivery/
│   │   ├── sync-provider-balance/
│   │   ├── public-api/
│   │   └── customer-webhooks/
│   └── seed.sql
│
├── providers/
│   ├── SmsProvider.ts
│   ├── kilakona/
│   └── mock/
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DATABASE.md
│   ├── API.md
│   ├── KILAKONA.md
│   ├── WEBHOOKS.md
│   ├── SECURITY.md
│   └── ROADMAP.md
│
├── tests/
│
├── .env.example
├── README.md
├── DEPLOYMENT.md
├── package.json
└── vite.config.ts
```

Adapt if necessary.

---

# 120. DATABASE TABLES

At minimum create:

```text
profiles
organizations
organization_members

roles
permissions
role_permissions

contacts
contact_groups
contact_group_members
tags
contact_tags
suppression_list

sender_ids
sender_id_documents

campaigns
campaign_recipients
campaign_jobs

messages
provider_submissions
provider_events

message_templates

sms_wallets
wallet_transactions
wallet_reservations

sms_packages
pricing_tiers

payments
invoices

api_keys
api_requests

webhook_endpoints
webhook_deliveries

providers
provider_balance_snapshots
provider_usage

notifications
audit_logs
```

---

# 121. PROVIDER USAGE

Create:

```text
provider_usage
```

Fields:

```text
provider
provider_submission_id
message_units
provider_cost
currency
created_at
```

Provider cost may remain null until commercial cost configured.

---

# 122. REVENUE REPORTING

Admin eventually:

```text
Customer Revenue
Provider Cost
Gross Margin
```

Do not invent values.

---

# 123. TESTS

Test:

```text
tenant isolation
wallet reservation
double-spend prevention
wallet ledger
API key tenant scoping
Sender ID ownership
Sender ID approval requirement
Kilakona response mapping
balance parsing
delivery status normalization
idempotency
campaign recipient filtering
suppression
API authentication
```

---

# 124. E2E

If practical:

```text
signup
organization creation
admin wallet credit
sender request
sender approval
contact import
campaign send in mock mode
delivery update
API balance request
```

---

# 125. REAL KILAKONA INTEGRATION TEST

Do not send live messages automatically during tests.

Create integration test flag:

```text
RUN_LIVE_KILAKONA_TESTS=false
```

Live tests only manually.

---

# 126. MOCK PROVIDER

Before real credentials:

```text
SMS_PROVIDER=mock
```

Mock should behave similarly to real interface.

---

# 127. REAL PROVIDER

When credentials configured:

```text
SMS_PROVIDER=kilakona
```

---

# 128. ENVIRONMENT EXAMPLE

Create:

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=

SUPABASE_SERVICE_ROLE_KEY=

SMS_PROVIDER=mock

KILAKONA_API_BASE_URL=https://www.messaging.kilakona.co.tz/api/v1/vendor
KILAKONA_API_KEY=
KILAKONA_API_SECRET=
KILAKONA_MAX_CONTACTS_PER_REQUEST=

GRAMVISTA_PUBLIC_API_BASE_URL=
GRAMVISTA_DELIVERY_CALLBACK_URL=
```

Never put provider secret in Vite variables.

---

# 129. README

Explain:

```text
What Gramvista SMS is
Architecture
Kilakona integration
Customer vs provider balance
Wallet architecture
Sender-ID workflow
Public API
Delivery reporting
How Mteja Connect integrates
Development
Deployment
```

---

# 130. KILAKONA DOCUMENT

Create:

```text
docs/KILAKONA.md
```

Document confirmed endpoints exactly.

Explicitly list unresolved items:

```text
Sender-ID registration API
callback payload
callback authentication
rate limits
max contacts/request
billing/refund rules
Unicode/multipart charging
inbound SMS
```

Do not guess.

---

# 131. ROADMAP

V1:

```text
Accounts
Wallets
Manual SMS credit
Sender-ID requests
Contacts
Groups
Campaigns
Kilakona send
Kilakona balance
Delivery reports
Public API
API keys
Webhooks
Admin
```

V1.1:

```text
Automated payments
Automated Sender-ID API if available
Advanced reports
```

V2:

```text
Multiple providers
Smart routing
Inbound SMS
OTP/Verify API
Flutter app
Reseller accounts
```

---

# 132. HOSTING

Keep provider-neutral.

Do not create Vercel-specific backend dependency.

Frontend can deploy to:

```text
shared hosting where appropriate
static hosting
Cloudflare Pages
Netlify
Vercel
VPS
```

Supabase hosts backend services.

---

# 133. GRAMVISTA API MUST BE THE PRODUCT BOUNDARY

This principle is critical.

Customer:

```text
uses Gramvista API
```

Gramvista:

```text
uses Kilakona API
```

Never collapse the two.

---

# 134. CUSTOMER BALANCE PRINCIPLE

Customer:

```text
GET /v1/balance
```

returns:

```text
Gramvista customer wallet
```

NOT:

```text
Kilakona totalSms
```

---

# 135. PROVIDER BALANCE PRINCIPLE

Kilakona:

```text
GET /vendor/message/balance
```

is:

```text
Gramvista upstream inventory
```

Admin only.

---

# 136. SEND PRINCIPLE

The user's SMS:

```text
Customer
↓
Gramvista validation
↓
Gramvista wallet reservation
↓
Kilakona
```

Never:

```text
Customer
↓
Kilakona
```

---

# 137. REPORT PRINCIPLE

```text
Kilakona
↓
Gramvista
↓
Customer
```

Customer receives Gramvista-normalized reporting.

---

# 138. SENDER-ID PRINCIPLE

```text
Customer requests in Gramvista
↓
Gramvista stores request
↓
Kilakona/operator approval
↓
Gramvista records approval
↓
Customer uses approved ID
```

---

# 139. PURCHASE PRINCIPLE

```text
Customer pays Gramvista
↓
Gramvista credits customer wallet
```

Do not create Kilakona subaccount for every customer unless future reseller API/business agreement specifically requires it.

---

# 140. PROVIDER INVENTORY PRINCIPLE

Gramvista buys/maintains upstream SMS inventory.

Customers receive internal allocations.

Example:

```text
Kilakona pool:
500,000

ABC:
10,000

XYZ:
20,000

Mteja:
50,000
```

---

# 141. FINAL CUSTOMER EXPERIENCE

A customer should be able to:

1. Create a Gramvista SMS account.
2. Verify account.
3. Request a Sender ID.
4. Upload business documents.
5. See Sender-ID approval status.
6. Buy SMS.
7. See personal SMS balance.
8. Add contacts.
9. Import contacts.
10. Create groups.
11. Compose an SMS.
12. Create campaign.
13. Select approved Sender ID.
14. See recipient validation.
15. See SMS unit estimate.
16. Send campaign.
17. See delivery reports.
18. See failed/pending recipients.
19. See wallet deductions.
20. View transaction history.
21. Generate API key.
22. Send through Gramvista API.
23. Check balance through Gramvista API.
24. Retrieve message reports.
25. Register delivery webhook.
26. Integrate systems such as Mteja Connect.

---

# 142. FINAL GRAMVISTA ADMIN EXPERIENCE

Admin should be able to:

1. View organizations.
2. View platform message volume.
3. View customer wallet liability.
4. View Kilakona provider balance.
5. See reserve/capacity.
6. Credit/debit wallets.
7. Verify payments.
8. Manage SMS packages.
9. Manage pricing.
10. Process Sender-ID requests.
11. Record Kilakona approvals.
12. Suspend organizations.
13. Monitor campaigns.
14. Inspect failed messages.
15. Reconcile delivery reports.
16. Monitor provider status.
17. See provider usage.
18. Inspect audit logs.
19. Manage platform configuration.

---

# 143. FINAL SECURITY REVIEW

Before completion verify:

```text
Kilakona API secret not in frontend
Supabase service-role key not in frontend
API keys stored hashed
RLS enabled
customer balance isolated
customer messages isolated
Sender IDs isolated
provider balance admin only
provider shootId not primary public identifier
wallet operations atomic
no double payment credit
no duplicate API sending
```

---

# 144. BUILD PROCESS

Implement in this sequence:

```text
1. Project foundation
2. Supabase setup
3. Database migrations
4. Authentication
5. Organizations/RLS
6. App layout
7. Wallet
8. Admin credit
9. Sender IDs
10. Contacts/groups
11. Campaigns
12. Mock provider
13. Kilakona provider adapter
14. Send endpoint
15. Save shootId
16. Delivery report reconciliation
17. Provider balance sync
18. Customer reports
19. API keys
20. Public API
21. Customer webhooks
22. Packages/payments
23. Platform admin
24. Analytics
25. Tests
26. Documentation
27. Production build
```

---

# 145. DO NOT STOP AT SCAFFOLDING

Do not only create:

```text
components
routes
empty pages
```

Core workflows must work.

At minimum demonstrate:

```text
signup
organization
wallet
manual credit
Sender ID
approved Sender ID
contacts
campaign
mock sending
real Kilakona adapter
shootId storage
Kilakona balance
delivery report GET
campaign reporting
public API balance
public API send
```

If live Kilakona credentials are absent, real adapter code should exist but mock mode must remain usable.

---

# 146. BUILD VALIDATION

Run:

```bash
npm install
npm run build
```

If lint configured:

```bash
npm run lint
```

If tests:

```bash
npm run test
```

Fix TypeScript/build failures.

Do not finish with a broken project.

---

# 147. FINAL PRODUCT PHILOSOPHY

Gramvista SMS should feel like a real messaging company.

Customers should think:

```text
I buy SMS from Gramvista.

I request my Sender ID from Gramvista.

I send SMS through Gramvista.

I receive delivery reports from Gramvista.

I use Gramvista's API.

I contact Gramvista for support.
```

They should not need to think about Kilakona.

Kilakona is the upstream infrastructure partner.

Gramvista is the product.

---

# 148. MOST IMPORTANT FINAL RULE

Preserve the separation:

```text
GRAMVISTA CUSTOMER
        ↓
GRAMVISTA SMS
        ↓
KILAKONA
        ↓
MOBILE NETWORK
```

and on the return path:

```text
MOBILE NETWORK
        ↓
KILAKONA DELIVERY DATA
        ↓
GRAMVISTA NORMALIZATION
        ↓
GRAMVISTA DATABASE
        ↓
CUSTOMER DASHBOARD / API / WEBHOOK
```

This architecture must remain intact throughout the implementation.

Begin building the project now.
