import { z } from "zod";
import { clickPesaPayments, clickPesaUssdPush } from "./payments/ClickPesa.ts";
import type { Database, Row } from "./database.ts";
import {
  estimateSms,
  filterRecipients,
  normalizePhone,
} from "../shared/sms.ts";
import {
  getProvider,
  type Environment,
} from "../providers/providerRegistry.ts";
import { kilakonaLiveAllowed } from "../providers/liveReadiness.ts";

export interface Identity {
  userId: string;
  orgId: string | null;
  role: string;
  permissions: string[];
  admin: boolean;
  test: boolean;
  apiKeyId?: string;
}
export class ApiError extends Error {
  constructor(
    public code: string,
    public status = 400,
    public publicMessage?: string,
  ) {
    super(code);
  }
}
const errors: Record<string, string> = {
  CUSTOM_QUOTE_REQUIRED:
    "Contact Gramvista for a quote outside 1,001 to 1,000,000 SMS.",
  PROVIDER_REFERENCE_REQUIRED:
    "Record the Kilakona submission or approval reference.",
  PROVIDER_APPROVAL_REQUIRED:
    "Record Kilakona confirmation that this Sender ID is enabled on Gramvista's account.",
  REJECTION_REASON_REQUIRED: "Enter the reason for rejection.",
  UNAUTHORIZED: "Sign in or provide a valid API key.",
  FORBIDDEN: "You do not have permission for this action.",
  INSUFFICIENT_SMS_BALANCE:
    "Your SMS balance is insufficient for this request.",
  INSUFFICIENT_PROVIDER_CAPACITY:
    "Provider inventory cannot safely cover this wallet increase.",
  INVENTORY_UNAVAILABLE:
    "Provider inventory is unavailable or stale. Sync it before adding credits.",
  SENDER_ID_NOT_APPROVED: "Your Sender ID must be approved before sending.",
  INVALID_SENDER_ID: "Select a Sender ID belonging to your organization.",
  IDEMPOTENCY_CONFLICT:
    "This idempotency key was already used for a different request.",
  ORGANIZATION_SUSPENDED:
    "Sending is unavailable while your organization is suspended.",
  PROVIDER_UNAVAILABLE: "Messaging capacity is temporarily unavailable.",
  PAYMENT_AMOUNT_BELOW_MINIMUM:
    "Mobile-money payments must be at least TSh 500. Increase the number of SMS credits.",
  PAYMENT_GATEWAY_UNAVAILABLE:
    "The mobile-money payment prompt could not be sent. Check the number or try again later.",
  PAYMENT_PHONE_UNSUPPORTED:
    "This mobile-money number or network is not currently supported by ClickPesa.",
  PAYMENT_CHANNEL_UNAVAILABLE:
    "The mobile-money network is temporarily unavailable. Try another supported network or try again later.",
  LIVE_SENDING_NOT_READY:
    "Live messaging activation is still in progress. Test messages are available.",
  NO_ELIGIBLE_RECIPIENTS: "No eligible recipients remain after validation.",
  VALIDATION_FAILED: "Check the supplied fields and try again.",
  QUIET_HOURS:
    "Choose a delivery time outside your organization’s quiet hours.",
};
export async function sha256(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export function secret(prefix: string) {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return (
    prefix +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}
const uuid = z.string().uuid();
const phone = z
  .string()
  .transform((v) => normalizePhone(v))
  .refine((v) => Boolean(v), "Invalid phone");
const clean = (row: Row, fields: string[]) =>
  Object.fromEntries(fields.filter((k) => k in row).map((k) => [k, row[k]]));
const publicFields: Record<string, string[]> = {
  api_keys: [
    "id",
    "name",
    "key_prefix",
    "environment",
    "permissions",
    "expires_at",
    "revoked_at",
    "last_used_at",
    "created_at",
  ],
  webhook_endpoints: ["id", "url", "events", "active", "created_at"],
  messages: [
    "id",
    "message_reference",
    "campaign_id",
    "normalized_phone",
    "message_snapshot",
    "status",
    "billing_status",
    "sent_at",
    "delivered_at",
    "failed_at",
    "created_at",
  ],
  webhook_deliveries: [
    "id",
    "event_type",
    "status",
    "attempts",
    "last_status_code",
    "created_at",
  ],
};
export const resources: Record<
  string,
  { table: string; read: string; write?: string; schema?: z.ZodType<any> }
> = {
  contacts: {
    table: "contacts",
    read: "messages.read",
    write: "contacts.manage",
    schema: z.object({
      first_name: z.string().max(100),
      last_name: z.string().max(100).default(""),
      phone,
      email: z.union([z.email(), z.literal("")]).optional(),
    }),
  },
  groups: {
    table: "contact_groups",
    read: "messages.read",
    write: "contacts.manage",
    schema: z.object({
      name: z.string().min(1).max(100),
      description: z.string().max(500).optional(),
    }),
  },
  "group-members": {
    table: "contact_group_members",
    read: "messages.read",
    write: "contacts.manage",
    schema: z.object({ group_id: uuid, contact_id: uuid }),
  },
  suppression: {
    table: "suppression_list",
    read: "messages.read",
    write: "contacts.manage",
    schema: z.object({
      phone,
      reason: z.enum([
        "opt_out",
        "complaint",
        "invalid",
        "do_not_contact",
        "legal",
        "manual",
        "other",
      ]),
    }),
  },
  "sender-ids": {
    table: "sender_ids",
    read: "sender_ids.read",
    write: "sender_ids.request",
    schema: z.object({
      sender_name: z.string().regex(/^[A-Za-z0-9 ]{1,11}$/),
      legal_business_name: z.string().min(2),
      purpose: z.string().min(3),
      sample_message: z.string().min(3),
      contact_name: z.string().optional(),
      contact_phone: z.string().optional(),
      contact_email: z.email().optional(),
    }),
  },
  templates: {
    table: "message_templates",
    read: "messages.read",
    write: "campaigns.create",
    schema: z.object({
      name: z.string().min(1).max(100),
      category: z.enum([
        "promotion",
        "notification",
        "reminder",
        "otp",
        "transactional",
        "custom",
      ]),
      message: z.string().min(1).max(5000),
    }),
  },
  campaigns: { table: "campaigns", read: "campaigns.read" },
  messages: { table: "messages", read: "messages.read" },
  transactions: { table: "wallet_transactions", read: "transactions.read" },
  payments: { table: "payments", read: "wallet.read" },
  invoices: { table: "invoices", read: "wallet.read" },
  "api-keys": { table: "api_keys", read: "api_keys.manage" },
  webhooks: { table: "webhook_endpoints", read: "webhooks.manage" },
  "webhook-deliveries": {
    table: "webhook_deliveries",
    read: "webhooks.manage",
  },
  team: { table: "organization_members", read: "team.manage" },
  notifications: { table: "notifications", read: "messages.read" },
};
export function requirePermission(id: Identity, permission: string) {
  if (!id.orgId || !id.permissions.includes(permission))
    throw new ApiError("FORBIDDEN", 403);
}
export async function resolveKey(
  db: Database,
  token: string,
  requestId: string,
  path: string,
): Promise<Identity> {
  const key = (await db.list("api_keys", { key_hash: await sha256(token) }))[0];
  if (
    !key ||
    key.revoked_at ||
    (key.expires_at && new Date(key.expires_at) <= new Date())
  )
    throw new ApiError("UNAUTHORIZED", 401);
  const member = (
    await db.list("organization_members", {
      organization_id: key.organization_id,
      user_id: key.created_by,
      status: "active",
    })
  )[0];
  if (!member) throw new ApiError("UNAUTHORIZED", 401);
  const perms = (
    await db.list("role_permissions", { role_id: member.role_id })
  ).map((p) => p.permission_id);
  if (
    !(await db.rpc("consume_rate", {
      p_key: key.id,
      p_org: key.organization_id,
      p_request: requestId,
      p_path: path,
      p_limit: key.requests_per_minute,
    }))
  )
    throw new ApiError("RATE_LIMITED", 429);
  await db.update(
    "api_keys",
    { id: key.id },
    { last_used_at: new Date().toISOString() },
  );
  return {
    orgId: key.organization_id,
    userId: key.created_by,
    role: member.role_id,
    permissions: key.permissions.filter((p: string) => perms.includes(p)),
    admin: false,
    test: key.environment === "test",
    apiKeyId: key.id,
  };
}
export function makeHandler(
  db: Database,
  env: Environment,
  authenticate: (req: Request, requestId: string) => Promise<Identity>,
) {
  return async (req: Request): Promise<Response> => {
    const requestId = "req_" + crypto.randomUUID();
    const headers = {
      "Content-Type": "application/json",
      "X-Request-Id": requestId,
    };
    try {
      const id = await authenticate(req, requestId);
      const url = new URL(req.url);
      const path = (url.pathname.split("/v1/").at(-1) ?? "").replace(
        /^\/+|\/+$/g,
        "",
      );
      const [resource, item, action] = path.split("/");
      const method = req.method;
      const body = async () => {
        if (Number(req.headers.get("Content-Length") ?? 0) > 1000000)
          throw new ApiError("PAYLOAD_TOO_LARGE", 413);
        const raw = await req.text();
        if (raw.length > 1000000) throw new ApiError("PAYLOAD_TOO_LARGE", 413);
        return JSON.parse(raw);
      };
      const org = id.orgId;
      const scope = { organization_id: org };
      const audit = async (
        action: string,
        resourceId: string,
        details: Row = {},
      ) =>
        db.insert("audit_logs", {
          organization_id: org,
          actor_id: id.userId,
          action,
          resource_id: resourceId,
          details,
        });
      let result: any;
      if (resource === "session" && method === "GET") {
        result = {
          identity: id,
          organization: org
            ? (await db.list("organizations", { id: org }))[0]
            : null,
          demo: env.LOCAL_DEMO === "true",
        };
      } else if (resource === "onboard" && method === "POST") {
        if (id.apiKeyId || id.orgId) throw new ApiError("FORBIDDEN", 403);
        const b = z
          .object({
            name: z.string().min(2).max(100),
            legal_name: z.string().min(2),
            phone: z.string().min(5),
            email: z.email(),
            business_type: z.string().min(2),
            country: z.string().length(2),
          })
          .parse(await body());
        result = await db.rpc("onboard", {
          p_user: id.userId,
          p_name: b.name,
          p_legal: b.legal_name,
          p_phone: b.phone,
          p_email: b.email,
          p_type: b.business_type,
          p_country: b.country,
        });
      } else if (resource === "stats" && method === "GET") {
        requirePermission(id, "messages.read");
        result = await db.rpc("dashboard_stats", { p_org: org });
      } else if (resource === "sender-documents" && method === "GET") {
        requirePermission(id, "sender_ids.read");
        result = {
          data: await db.list("sender_id_documents", {
            ...scope,
            ...(url.searchParams.get("sender_id")
              ? { sender_id_id: uuid.parse(url.searchParams.get("sender_id")) }
              : {}),
          }),
        };
      } else if (resource === "sender-documents" && method === "POST") {
        requirePermission(id, "sender_ids.request");
        const b = z
          .object({
            sender_id_id: uuid,
            storage_path: z.string(),
            document_type: z.string().min(1),
          })
          .parse(await body());
        if (
          !b.storage_path.startsWith(org + "/" + b.sender_id_id + "/") ||
          !(await db.list("sender_ids", { ...scope, id: b.sender_id_id }))[0]
        )
          throw new ApiError("FORBIDDEN", 403);
        result = await db.insert("sender_id_documents", { ...scope, ...b });
      } else if (resource === "balance" && method === "GET") {
        requirePermission(id, "wallet.read");
        const w = (await db.list("sms_wallets", scope))[0];
        result = {
          available_sms: Number(w.available_units),
          reserved_sms: Number(w.reserved_units),
          total_sms: Number(w.available_units) + Number(w.reserved_units),
        };
      } else if (resource === "settings") {
        requirePermission(id, "settings.manage");
        if (method === "PATCH") {
          const b = z
            .object({
              name: z.string().min(2),
              timezone: z.string().refine((v) => {
                try {
                  new Intl.DateTimeFormat("en", { timeZone: v });
                  return true;
                } catch {
                  return false;
                }
              }),
              quiet_start: z.number().int().min(0).max(23),
              quiet_end: z.number().int().min(0).max(23),
              quiet_hours_enabled: z.boolean().optional(),
            })
            .parse(await body());
          result = (await db.update("organizations", { id: org }, b))[0];
          await audit("settings.updated", org!);
        } else if (method === "GET") {
          result = (await db.list("organizations", { id: org }))[0];
        } else throw new ApiError("METHOD_NOT_ALLOWED", 405);
      } else if (
        (resource === "messages" || resource === "campaigns") &&
        method === "POST"
      ) {
        requirePermission(
          id,
          resource === "messages" ? "messages.send" : "campaigns.send",
        );
        const b = z
          .object({
            sender_id: z.string().min(1),
            name: z.string().max(100).default("API message"),
            recipients: z.array(z.string()).min(1).max(10000),
            message: z.string().min(1).max(5000),
            scheduled_at: z.iso.datetime().nullable().optional(),
            test_mode: z.boolean().optional(),
          })
          .strict()
          .parse(await body());
        if (resource === "campaigns" && b.name.trim() === "Direct SMS")
          throw new ApiError("VALIDATION_FAILED", 400);
        const key = z
          .string()
          .min(1)
          .max(200)
          .parse(req.headers.get("Idempotency-Key"));
        if (b.test_mode && !id.test && env.LOCAL_DEMO !== "true")
          throw new ApiError("FORBIDDEN", 403);
        const test =
          id.test || (env.LOCAL_DEMO === "true" && b.test_mode === true);
        if (
          !test &&
          env.LOCAL_DEMO !== "true" &&
          (env.SMS_PROVIDER !== "kilakona" ||
            env.KILAKONA_BILLING_CONFIRMED !== "true" ||
            !kilakonaLiveAllowed(env))
        )
          throw new ApiError("LIVE_SENDING_NOT_READY", 503);
        const filtered = filterRecipients(b.recipients);
        const sms = estimateSms(b.message);
        const organization = (await db.list("organizations", { id: org }))[0];
        const hour = Number(
          new Intl.DateTimeFormat("en-GB", {
            timeZone: organization.timezone,
            hour: "2-digit",
            hourCycle: "h23",
          }).format(new Date(b.scheduled_at ?? Date.now())),
        );
        const quiet =
          organization.quiet_hours_enabled === true &&
          (organization.quiet_start === organization.quiet_end
            ? false
            : organization.quiet_start > organization.quiet_end
              ? hour >= organization.quiet_start ||
                hour < organization.quiet_end
              : hour >= organization.quiet_start &&
                hour < organization.quiet_end);
        if (quiet && !test) throw new ApiError("QUIET_HOURS");
        result = await db.rpc("enqueue_campaign", {
          p_org: org,
          p_sender: b.sender_id,
          p_name: b.name,
          p_message: b.message,
          p_phones: filtered.eligible,
          p_parts: sms.parts,
          p_encoding: sms.encoding,
          p_key: key,
          p_fingerprint: await sha256(JSON.stringify(b)),
          p_test: test,
          p_schedule: b.scheduled_at ?? null,
          p_actor: id.userId,
          p_batch:
            env.SMS_PROVIDER === "kilakona"
              ? Number(env.KILAKONA_MAX_CONTACTS_PER_REQUEST) || 100
              : 100,
          p_invalid: filtered.invalid,
          p_duplicates: filtered.duplicates,
        });
      } else if (
        resource === "campaigns" &&
        item &&
        action === "cancel" &&
        method === "POST"
      ) {
        requirePermission(id, "campaigns.send");
        result = await db.rpc("cancel_campaign", {
          p_org: org,
          p_id: uuid.parse(item),
          p_actor: id.userId,
        });
      } else if (
        resource === "campaigns" &&
        item &&
        action === "messages" &&
        method === "GET"
      ) {
        requirePermission(id, "messages.read");
        const c =
          (
            await db.list("campaigns", { ...scope, campaign_reference: item })
          )[0] ??
          (z.string().uuid().safeParse(item).success
            ? (await db.list("campaigns", { ...scope, id: item }))[0]
            : null);
        if (!c) throw new ApiError("NOT_FOUND", 404);
        result = {
          data: (
            await db.list(
              "messages",
              { ...scope, campaign_id: c.id },
              { limit: 50, offset: pageOffset(url), order: "created_at" },
            )
          ).map((r) => clean(r, publicFields.messages)),
        };
      } else if (resource === "api-keys" && method === "POST") {
        requirePermission(id, "api_keys.manage");
        if (id.apiKeyId) throw new ApiError("FORBIDDEN", 403);
        const b = z
          .object({
            name: z.string().min(1).max(100),
            environment: z.enum(["test", "live"]),
            permissions: z
              .array(
                z.enum([
                  "messages.send",
                  "messages.read",
                  "campaigns.send",
                  "campaigns.read",
                  "wallet.read",
                  "transactions.read",
                  "sender_ids.read",
                  "sender_ids.request",
                ]),
              )
              .min(1),
            expires_at: z.iso.datetime().nullable().optional(),
          })
          .parse(await body());
        if (b.permissions.some((p) => !id.permissions.includes(p)))
          throw new ApiError("FORBIDDEN", 403);
        const raw = secret("gvs_" + b.environment + "_");
        const row = await db.insert("api_keys", {
          ...scope,
          ...b,
          expires_at: b.expires_at ?? null,
          key_hash: await sha256(raw),
          key_prefix: raw.slice(0, 17),
          created_by: id.userId,
        });
        await audit("api_key.created", row.id);
        result = { ...clean(row, publicFields.api_keys), key: raw };
      } else if (resource === "api-keys" && item && method === "DELETE") {
        requirePermission(id, "api_keys.manage");
        result = await db.update(
          "api_keys",
          { ...scope, id: uuid.parse(item) },
          { revoked_at: new Date().toISOString() },
        );
        await audit("api_key.revoked", item);
        result = { success: true };
      } else if (resource === "webhooks" && method === "POST") {
        requirePermission(id, "webhooks.manage");
        const b = z
          .object({
            url: z.url(),
            events: z
              .array(
                z.enum([
                  "message.submitted",
                  "message.delivered",
                  "message.failed",
                  "campaign.completed",
                  "balance.low",
                ]),
              )
              .min(1),
          })
          .parse(await body());
        validateWebhookUrl(b.url, env);
        const raw = secret("whsec_");
        const row = await db.insert("webhook_endpoints", {
          ...scope,
          ...b,
          secret: raw,
        });
        result = { ...clean(row, publicFields.webhook_endpoints), secret: raw };
      } else if (resource === "webhooks" && item && method === "DELETE") {
        requirePermission(id, "webhooks.manage");
        await db.update(
          "webhook_endpoints",
          { ...scope, id: uuid.parse(item) },
          { active: false },
        );
        result = { success: true };
      } else if (resource === "pricing" && method === "GET") {
        requirePermission(id, "wallet.read");
        result = {
          data: await db.list(
            "sms_price_tiers",
            { active: true },
            { order: "min_units", asc: true },
          ),
        };
      } else if (resource === "orders" && item && method === "GET") {
        requirePermission(id, "wallet.read");
        const payment = (await db.list("payments", {
          id: uuid.parse(item),
          organization_id: org,
        }))[0];
        if (!payment) throw new ApiError("NOT_FOUND", 404);
        result = {
          payment,
          events: await db.list("order_events", { payment_id: payment.id }),
          reviews: await db.list("payment_reviews", { payment_id: payment.id }),
        };
      } else if (
        resource === "orders" && item && action === "payment" && method === "POST"
      ) {
        requirePermission(id, "wallet.read");
        const b = z.object({
          method: z.enum(["bank_transfer", "mobile_money", "manual"]),
          reference: z.string().trim().min(3).max(120),
        }).strict().parse(await body());
        result = await db.rpc("submit_order_payment", {
          p_org: org,
          p_id: uuid.parse(item),
          p_method: b.method,
          p_reference: b.reference,
          p_actor: id.userId,
        });
      } else if (resource === "retail-payments" && method === "POST") {
        requirePermission(id, "wallet.read");
        const b = z
          .object({
            sms_units: z.number().int().safe().positive(),
            reference: z.string().trim().min(3).max(120),
          })
          .parse(await body());
        result = await db.rpc("create_retail_payment", {
          p_org: org,
          p_units: b.sms_units,
          p_reference: b.reference,
        });
      } else if (resource === "clickpesa-payment" && item && method === "GET") {
        requirePermission(id, "wallet.read");
        if (id.apiKeyId) throw new ApiError("FORBIDDEN", 403);
        const payment = (await db.list("payments", {
          id: uuid.parse(item), organization_id: org, method: "clickpesa",
        }))[0];
        if (!payment) throw new ApiError("NOT_FOUND", 404);
        if (payment.status === "pending") {
          const reference = payment.payment_reference;
          if (typeof reference !== "string")
            throw new ApiError("PAYMENT_REFERENCE_MISSING", 500);
          const entries = await clickPesaPayments(env, reference);
          const match = entries.find((entry) =>
            entry.orderReference === reference &&
            (entry.status === "SUCCESS" || entry.status === "SETTLED") &&
            entry.clientId === env.CLICKPESA_CLIENT_ID &&
            typeof entry.paymentReference === "string" &&
            entry.collectedCurrency === payment.currency &&
            /^\d+(?:\.\d{1,2})?$/.test(String(entry.collectedAmount)) &&
            Number(entry.collectedAmount) === Number(payment.amount));
          if (match) await db.rpc("settle_clickpesa_payment", {
            p_reference: reference, p_transaction: match.paymentReference,
            p_amount: match.collectedAmount, p_currency: match.collectedCurrency,
          });
        }
        result = (await db.list("payments", { id: payment.id, organization_id: org }))[0];
      } else if (resource === "clickpesa-checkout" && method === "POST") {
        requirePermission(id, "wallet.read");
        if (id.apiKeyId || env.LOCAL_DEMO === "true") throw new ApiError("FORBIDDEN", 403);
        if (!env.CLICKPESA_CLIENT_ID || !env.CLICKPESA_API_KEY)
          throw new ApiError("PAYMENT_GATEWAY_NOT_READY", 503);
        const b = z.object({
          sms_units: z.number().int().safe().positive(),
          customer_phone: z.string().regex(/^255\d{9}$/),
        }).strict().parse(await body());
        const priceTier = (await db.list("sms_price_tiers", { active: true }))
          .find((tier) =>
            b.sms_units >= Number(tier.min_units) &&
            b.sms_units <= Number(tier.max_units));
        if (!priceTier) throw new ApiError("CUSTOM_QUOTE_REQUIRED", 400);
        if (b.sms_units * Number(priceTier.price_per_unit) < 500)
          throw new ApiError("PAYMENT_AMOUNT_BELOW_MINIMUM", 400);
        // ClickPesa mobile-money providers cap order references at 20 characters.
        const reference = "GVS" + crypto.randomUUID().replace(/-/g, "").toUpperCase().slice(0, 17);
        const payment = await db.rpc("create_clickpesa_payment", {
          p_org: org, p_units: b.sms_units, p_reference: reference,
        });
        let push: Record<string, unknown>;
        try {
          push = await clickPesaUssdPush(env, {
            reference, amount: String(payment.amount), phone: b.customer_phone,
          });
        } catch (error) {
          const providerMessage = error instanceof Error ? error.message : "unknown";
          console.error(
            "ClickPesa USSD Push initiation failed",
            providerMessage,
          );
          if (/invalid \/ unsupported phone number/i.test(providerMessage))
            throw new ApiError("PAYMENT_PHONE_UNSUPPORTED", 400);
          if (/no valid payment method|no payment collection methods|unavailable/i.test(providerMessage))
            throw new ApiError("PAYMENT_CHANNEL_UNAVAILABLE", 503);
          const providerJson = providerMessage.match(/\{[\s\S]*\}$/)?.[0];
          if (providerJson) {
            try {
              const parsed = JSON.parse(providerJson);
              if (
                typeof parsed.message === "string" &&
                parsed.message.length >= 3 &&
                parsed.message.length <= 200 &&
                /^[\p{L}\p{N}\s.,'()/_:+-]+$/u.test(parsed.message)
              ) {
                throw new ApiError(
                  "PAYMENT_PROVIDER_REJECTED",
                  502,
                  "ClickPesa: " + parsed.message,
                );
              }
            } catch (parseError) {
              if (parseError instanceof ApiError) throw parseError;
            }
          }
          throw new ApiError("PAYMENT_GATEWAY_UNAVAILABLE", 503);
        }
        result = {
          id: payment.id,
          reference,
          amount: payment.amount,
          status: push.status,
          channel: push.channel,
        };
      } else if (resource === "packages" && method === "GET") {
        requirePermission(id, "wallet.read");
        result = {
          data: (
            await db.list(
              "sms_packages",
              { active: true },
              { order: "sort_order", asc: true },
            )
          ).filter(
            (p) =>
              (!p.valid_from || new Date(p.valid_from) <= new Date()) &&
              (!p.valid_until || new Date(p.valid_until) > new Date()),
          ),
        };
      } else if (resource === "payments" && method === "POST") {
        requirePermission(id, "wallet.read");
        const b = z
          .object({ package_id: uuid, reference: z.string().min(3).max(120) })
          .parse(await body());
        const p = (
          await db.list("sms_packages", { id: b.package_id, active: true })
        )[0];
        if (
          !p ||
          (p.valid_from && new Date(p.valid_from) > new Date()) ||
          (p.valid_until && new Date(p.valid_until) < new Date())
        )
          throw new ApiError("INVALID_PACKAGE");
        result = await db.rpc("create_package_payment", {
          p_org: org,
          p_package: p.id,
          p_reference: b.reference,
          p_actor: id.userId,
        });
      } else if (resource === "team-invitations" && method === "POST") {
        requirePermission(id, "team.manage");
        const b = z
          .object({
            email: z.email().transform((v) => v.toLowerCase()),
            role_id: z.enum([
              "administrator",
              "campaign_manager",
              "developer",
              "viewer",
            ]),
          })
          .parse(await body());
        result = await db.insert("organization_invitations", {
          ...scope,
          ...b,
          created_by: id.userId,
        });
        await audit("team.invited", result.id);
        result = {
          id: result.id,
          email: b.email,
          status: "pending",
          expires_at: result.expires_at,
        };
      } else if (resource === "team-invitations" && method === "GET") {
        requirePermission(id, "team.manage");
        result = { data: await db.list("organization_invitations", scope) };
      } else if (resource === "team" && item && method === "PATCH") {
        requirePermission(id, "team.manage");
        const b = z
          .object({
            role_id: z.enum([
              "administrator",
              "campaign_manager",
              "developer",
              "viewer",
            ]),
            status: z.enum(["active", "inactive"]),
          })
          .parse(await body());
        const m = (
          await db.list("organization_members", {
            ...scope,
            id: uuid.parse(item),
          })
        )[0];
        if (!m || m.role_id === "owner" || m.user_id === id.userId)
          throw new ApiError("FORBIDDEN", 403);
        result = await db.update(
          "organization_members",
          { ...scope, id: item },
          b,
        );
        await audit("team.updated", item, b);
      } else if (resource === "platform") {
        if (!id.admin || id.apiKeyId) throw new ApiError("FORBIDDEN", 403);
        if (method === "GET" && item === "stats") {
          result = await db.rpc("platform_stats", {
            p_provider: env.SMS_PROVIDER ?? "mock",
          });
        } else if (method === "GET" && item === "sender-detail") {
          const sender = (
            await db.list("sender_ids", { id: uuid.parse(action) })
          )[0];
          if (!sender) throw new ApiError("NOT_FOUND", 404);
          result = {
            sender,
            record:
              (
                await db.list("sender_id_provider_records", {
                  sender_id_id: sender.id,
                })
              )[0] ?? null,
            documents: await db.list("sender_id_documents", {
              sender_id_id: sender.id,
            }),
          };
        } else if (method === "GET" && item === "order-detail" && action) {
          const payment = (await db.list("payments", { id: uuid.parse(action) }))[0];
          if (!payment) throw new ApiError("NOT_FOUND", 404);
          result = {
            payment,
            organization: (await db.list("organizations", {
              id: payment.organization_id,
            }))[0],
            events: await db.list("order_events", { payment_id: payment.id }),
            reviews: await db.list("payment_reviews", { payment_id: payment.id }),
            invoice: (await db.list("invoices", { payment_id: payment.id }))[0] ?? null,
            inventory: await db.rpc("inventory_status", {}),
          };
        } else if (method === "GET") {
          const allowed: Record<string, string> = {
            organizations: "organizations",
            wallets: "sms_wallets",
            senders: "sender_ids",
            documents: "sender_id_documents",
            "sender-records": "sender_id_provider_records",
            pricing: "sms_price_tiers",
            payments: "payments",
            packages: "sms_packages",
            snapshots: "provider_balance_snapshots",
            audit: "audit_logs",
            submissions: "provider_submissions",
            jobs: "campaign_jobs",
            costs: "provider_cost_settings",
            usage: "provider_usage",
          };
          if (!allowed[item]) throw new ApiError("NOT_FOUND", 404);
          result = {
            data: await db.list(
              allowed[item],
              {},
              {
                limit: 50,
                offset: pageOffset(url),
                order: item === "snapshots" ? "checked_at" : undefined,
              },
            ),
          };
        } else if (item === "credit" && method === "POST") {
          const b = z
            .object({
              organization_id: uuid,
              units: z
                .number()
                .int()
                .safe()
                .refine((v) => v !== 0),
              reference: z.string().min(3),
              reason: z.string().min(3),
            })
            .parse(await body());
          result = await db.rpc("wallet_adjust", {
            p_org: b.organization_id,
            p_units: b.units,
            p_reference: b.reference,
            p_reason: b.reason,
            p_actor: id.userId,
            p_type: b.units > 0 ? "manual_credit" : "manual_debit",
          });
        } else if (item === "correction" && method === "POST") {
          const b = z.object({
            organization_id: uuid,
            units: z.number().int().safe().refine((v) => v !== 0),
            reference: z.string().trim().min(3).max(120),
            reason: z.string().trim().min(3).max(2000),
            confirmed: z.literal(true),
          }).strict().parse(await body());
          try {
            result = await db.rpc("wallet_adjust", {
              p_org: b.organization_id,
              p_units: b.units,
              p_reference: b.reference,
              p_reason: b.reason,
              p_actor: id.userId,
              p_type: b.units > 0 ? "manual_credit" : "manual_debit",
            });
          } catch (error) {
            await db.insert("audit_logs", {
              organization_id: b.organization_id,
              actor_id: id.userId,
              action: "financial_operation.rejected",
              resource_id: b.reference,
              details: { units: b.units, reason: b.reason },
            });
            throw error;
          }
        } else if (item === "wallet-reset" && action && method === "POST") {
          const b = z.object({
            expected_available: z.number().int().safe().positive(),
            reference: z.string().trim().min(3).max(120),
            reason: z.string().trim().min(10).max(2000),
            confirmation: z.literal("RESET"),
          }).strict().parse(await body());
          result = await db.rpc("reset_sms_wallet", {
            p_org: uuid.parse(action),
            p_expected_available: b.expected_available,
            p_reference: b.reference,
            p_reason: b.reason,
            p_confirmed: true,
            p_actor: id.userId,
          });
        } else if (item === "payments" && action && method === "POST") {
          const payment = (await db.list("payments", { id: uuid.parse(action) }))[0];
          if (!payment) throw new ApiError("NOT_FOUND", 404);
          if (payment.method === "clickpesa")
            throw new ApiError("CLICKPESA_REQUIRES_PROVIDER_CONFIRMATION", 409);
          const b = z.object({
            decision: z.enum(["approved", "rejected"]),
            received_amount: z.union([z.string(), z.number()]).optional(),
            currency: z.string().length(3).optional(),
            receipt_reference: z.string().trim().min(3).max(120).optional(),
            notes: z.string().trim().min(3).max(2000),
            confirmed: z.boolean().optional(),
          }).strict().parse(await body());
          result = await db.rpc("review_order", {
            p_id: payment.id,
            p_decision: b.decision,
            p_received: b.decision === "approved" ? Number(b.received_amount) : null,
            p_currency: b.decision === "approved" ? b.currency : null,
            p_receipt: b.decision === "approved" ? b.receipt_reference : null,
            p_notes: b.notes,
            p_confirmed: b.decision === "approved" ? b.confirmed === true : false,
            p_actor: id.userId,
          });
        } else if (item === "senders" && action && method === "PATCH") {
          const b = z
            .object({
              status: z.enum([
                "gramvista_review",
                "provider_pending",
                "approved",
                "rejected",
                "suspended",
              ]),
              provider_reference: z.string().max(500).optional(),
              notes: z.string().max(4000).optional(),
              approval_evidence: z.string().max(4000).optional(),
              rejection_reason: z.string().max(4000).optional(),
            })
            .parse(await body());
          result = await db.rpc("update_sender_workflow", {
            p_sender: uuid.parse(action),
            p_status: b.status,
            p_reference: b.provider_reference ?? "",
            p_notes: b.notes ?? b.rejection_reason ?? "",
            p_evidence: b.approval_evidence ?? "",
            p_actor: id.userId,
            p_demo: env.LOCAL_DEMO === "true",
          });
        } else if (item === "organizations" && action && method === "PATCH") {
          const b = z
            .object({
              status: z.enum(["active", "suspended", "pending", "closed"]),
            })
            .parse(await body());
          result = await db.update(
            "organizations",
            { id: uuid.parse(action) },
            b,
          );
          await db.insert("audit_logs", {
            organization_id: action,
            actor_id: id.userId,
            action: "organization." + b.status,
            resource_id: action,
          });
        } else if (item === "packages" && method === "POST") {
          const b = z
            .object({
              name: z.string().min(1),
              description: z.string().optional(),
              sms_units: z.number().int().positive().safe(),
              selling_price: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/),
              currency: z.string().length(3),
            })
            .parse(await body());
          result = await db.insert("sms_packages", b);
          await audit("pricing.created", result.id);
        } else if (item === "packages" && action && method === "PATCH") {
          const b = z
            .object({
              name: z.string().min(1).optional(),
              selling_price: z
                .string()
                .regex(/^\d{1,12}(\.\d{1,2})?$/)
                .optional(),
              active: z.boolean().optional(),
              sms_units: z.number().int().positive().safe().optional(),
            })
            .parse(await body());
          result = await db.update(
            "sms_packages",
            { id: uuid.parse(action) },
            b,
          );
          await audit("pricing.updated", action, b);
        } else if (item === "costs" && action && method === "PATCH") {
          const b = z
            .object({
              cost_per_unit: z
                .string()
                .regex(/^\d{1,12}(\.\d{1,6})?$/)
                .nullable(),
              currency: z.string().length(3).nullable(),
              warning_threshold: z.number().int().nonnegative().safe(),
              critical_threshold: z.number().int().nonnegative().safe(),
              reserve_threshold: z.number().int().nonnegative().safe(),
            })
            .refine((v) => v.warning_threshold >= v.critical_threshold)
            .parse(await body());
          result = await db.update(
            "provider_cost_settings",
            { id: uuid.parse(action) },
            b,
          );
          await audit("provider_cost.updated", action, b);
        } else if (item === "sync-balance" && method === "POST") {
          result = await syncBalance(db, env);
        } else if (item === "process" && method === "POST") {
          result = await processJobs(db, env);
        } else if (item === "reconcile" && method === "POST") {
          result = await reconcile(db, env);
        } else throw new ApiError("NOT_FOUND", 404);
      } else if (resources[resource]) {
        const r = resources[resource];
        if (method === "GET") {
          requirePermission(id, r.read);
          const filters: Row = { ...scope };
          if (resource === "campaigns" && !item) filters.kind = "campaign";
          if (item) {
            if (resource === "messages") filters.message_reference = item;
            else if (resource === "campaigns")
              filters.campaign_reference = item;
            else filters.id = uuid.parse(item);
          }
          if (resource === "messages" && url.searchParams.has("campaign_id"))
            filters.campaign_id = uuid.parse(
              url.searchParams.get("campaign_id"),
            );
          const rows = await db.list(r.table, filters, {
            limit: 50,
            offset: pageOffset(url),
            order: ["contact_group_members", "organization_members"].includes(
              r.table,
            )
              ? undefined
              : "created_at",
          });
          const safe = rows.map((row) =>
            publicFields[r.table] ? clean(row, publicFields[r.table]) : row,
          );
          if (item && !safe.length) throw new ApiError("NOT_FOUND", 404);
          result = item
            ? safe[0]
            : {
                data: safe,
                page: Number(url.searchParams.get("page") ?? 1),
                has_more: rows.length === 50,
              };
        } else if (
          method === "PATCH" &&
          r.write &&
          r.schema &&
          item &&
          ["contacts", "groups", "templates"].includes(resource)
        ) {
          requirePermission(id, r.write);
          const b = r.schema.parse(await body());
          if (b.phone) b.normalized_phone = b.phone;
          result = (
            await db.update(r.table, { ...scope, id: uuid.parse(item) }, b)
          )[0];
          if (!result) throw new ApiError("NOT_FOUND", 404);
        } else if (method === "POST" && r.write && r.schema) {
          requirePermission(id, r.write);
          const b = r.schema.parse(await body());
          if (b.phone) {
            b.normalized_phone = b.phone;
          }
          if (resource === "group-members") {
            for (const [table, key] of [
              ["contacts", "contact_id"],
              ["contact_groups", "group_id"],
            ])
              if (!(await db.list(table, { ...scope, id: b[key] }))[0])
                throw new ApiError("FORBIDDEN", 403);
          }
          result = await db.insert(r.table, { ...scope, ...b });
        } else if (
          method === "DELETE" &&
          r.write &&
          item &&
          [
            "contacts",
            "groups",
            "group-members",
            "templates",
            "suppression",
          ].includes(resource)
        ) {
          requirePermission(id, r.write);
          if (resource === "contacts") {
            await db.update(
              "contacts",
              { ...scope, id: uuid.parse(item) },
              { status: "archived" },
            );
          } else await db.remove(r.table, { ...scope, id: uuid.parse(item) });
          result = { success: true };
        } else throw new ApiError("METHOD_NOT_ALLOWED", 405);
      } else throw new ApiError("NOT_FOUND", 404);
      return new Response(
        JSON.stringify({ ...result, request_id: requestId }),
        { status: method === "POST" ? 201 : 200, headers },
      );
    } catch (e) {
      let code = "INTERNAL_ERROR";
      let status = 500;
      if (e instanceof ApiError) {
        code = e.code;
        status = e.status;
      } else if (e instanceof z.ZodError || e instanceof SyntaxError) {
        code = "VALIDATION_FAILED";
        status = 400;
      } else if (e instanceof Error) {
        const known = [
          "CUSTOM_QUOTE_REQUIRED",
          "PROVIDER_REFERENCE_REQUIRED",
          "PROVIDER_APPROVAL_REQUIRED",
          "REJECTION_REASON_REQUIRED",
          "VALIDATION_FAILED",
          "INSUFFICIENT_SMS_BALANCE",
          "INSUFFICIENT_PROVIDER_CAPACITY",
          "INVENTORY_UNAVAILABLE",
          "INVALID_SENDER_ID",
          "SENDER_ID_NOT_APPROVED",
          "IDEMPOTENCY_CONFLICT",
          "ORGANIZATION_SUSPENDED",
          "NO_ELIGIBLE_RECIPIENTS",
          "CAMPAIGN_ALREADY_STARTED",
          "INVALID_PAYMENT_STATE",
          "NOT_FOUND",
          "ALREADY_ONBOARDED",
        ];
        const found = known.find((k) => e.message.includes(k));
        if (found) {
          code = found;
          status = found === "IDEMPOTENCY_CONFLICT" ? 409 : 400;
        } else if (e.message.includes("duplicate key")) {
          code = "ALREADY_EXISTS";
          status = 409;
        }
      }
      return new Response(
        JSON.stringify({
          error: {
            code,
            message:
              e instanceof ApiError && e.publicMessage
                ? e.publicMessage
                : errors[code] ?? code.toLowerCase().replaceAll("_", " "),
            request_id: requestId,
          },
        }),
        { status, headers },
      );
    }
  };
}
function pageOffset(url: URL) {
  const page = Number(url.searchParams.get("page") ?? 1);
  return (
    (Number.isInteger(page) && page > 0 && page < 100000 ? page - 1 : 0) * 50
  );
}
export function validateWebhookUrl(value: string, env: Environment) {
  const u = new URL(value);
  const allowed = (env.WEBHOOK_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    (u.port && u.port !== "443") ||
    !allowed.includes(u.hostname) ||
    /^(localhost|.*\.local|\[.*\]|[\d.]+)$/.test(u.hostname)
  )
    throw new ApiError("WEBHOOK_HOST_NOT_ALLOWED");
}
export async function syncBalance(db: Database, env: Environment) {
  const p = getProvider(env);
  try {
    const b = await p.getBalance();
    return await db.insert("provider_balance_snapshots", {
      provider: p.code,
      balance_sms: b.totalSms,
      success: true,
      raw_response_json: b.raw,
    });
  } catch {
    await db.insert("provider_balance_snapshots", {
      provider: p.code,
      success: false,
    });
    throw new ApiError("PROVIDER_UNAVAILABLE", 503);
  }
}

export async function reconcileClickPesaPayments(
  db: Database,
  env: Environment,
  deadline = Number.POSITIVE_INFINITY,
) {
  if (!env.CLICKPESA_CLIENT_ID || !env.CLICKPESA_API_KEY)
    return { payments_reconciled: 0 };
  const pending = await db.list(
    "payments",
    { method: "clickpesa", status: "pending" },
    { order: "created_at", asc: true, limit: 20 },
  );
  let reconciled = 0;
  for (const payment of pending) {
    if (Date.now() > deadline) break;
    const reference = payment.payment_reference;
    if (typeof reference !== "string") continue;
    try {
      const entries = await clickPesaPayments(env, reference);
      const match = entries.find((entry) =>
        entry.orderReference === reference &&
        (entry.status === "SUCCESS" || entry.status === "SETTLED") &&
        entry.clientId === env.CLICKPESA_CLIENT_ID &&
        typeof entry.paymentReference === "string" &&
        entry.collectedCurrency === payment.currency &&
        /^\d+(?:\.\d{1,2})?$/.test(String(entry.collectedAmount)) &&
        Number(entry.collectedAmount) === Number(payment.amount));
      if (!match) continue;
      await db.rpc("settle_clickpesa_payment", {
        p_reference: reference,
        p_transaction: match.paymentReference,
        p_amount: match.collectedAmount,
        p_currency: match.collectedCurrency,
      });
      reconciled++;
    } catch (error) {
      console.error(
        "ClickPesa payment reconciliation failed",
        reference,
        error instanceof Error ? error.message : "unknown",
      );
    }
  }
  return { payments_reconciled: reconciled };
}
export async function enqueueEvent(
  db: Database,
  org: string,
  event: string,
  key: string,
  payload: Row,
) {
  const endpoints = await db.list("webhook_endpoints", {
    organization_id: org,
    active: true,
  });
  for (const e of endpoints.filter((e) => e.events.includes(event))) {
    if (
      (
        await db.list("webhook_deliveries", {
          endpoint_id: e.id,
          event_key: key,
        })
      )[0]
    )
      continue;
    try {
      await db.insert("webhook_deliveries", {
        organization_id: org,
        endpoint_id: e.id,
        event_key: key,
        event_type: event,
        payload: {
          id: key,
          type: event,
          created_at: new Date().toISOString(),
          data: payload,
        },
      });
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("duplicate key"))
        throw error;
    }
  }
}
export async function processJobs(
  db: Database,
  env: Environment,
  deadline = Number.POSITIVE_INFINITY,
  leaseAlreadyHeld = false,
) {
  const token = crypto.randomUUID();
  if (!leaseAlreadyHeld && !(await db.rpc("claim_worker", { p_token: token })))
    return { processed: 0 };
  try {
    return await processJobsUnlocked(db, env, deadline);
  } finally {
    if (!leaseAlreadyHeld) await db.rpc("release_worker", { p_token: token });
  }
}
async function processJobsUnlocked(
  db: Database,
  env: Environment,
  deadline: number,
) {
  await db.rpc("hold_stale_jobs", {});
  let processed = 0;
  for (let i = 0; i < 5; i++) {
    if (Date.now() > deadline) break;
    const job = await db.rpc("claim_job", {});
    if (!job) break;
    const campaign = (await db.list("campaigns", { id: job.campaign_id }))[0];
    let submissionStarted = false;
    try {
      const invalid = await db.rpc("validate_job", { p_job: job.id });
      if (invalid) throw new ApiError(invalid);
      const provider = getProvider(env, campaign.test_mode);
      const sender = (
        await db.list("sender_ids", { id: campaign.sender_id_id })
      )[0];
      if (sender.status !== "approved")
        throw new ApiError("SENDER_ID_NOT_APPROVED");
      if (provider.code === "kilakona") {
        if (
          env.KILAKONA_BILLING_CONFIRMED !== "true" ||
          !kilakonaLiveAllowed(env)
        )
          throw new ApiError("PROVIDER_CONFIGURATION_REQUIRED");
        // Customer wallet credit authorizes a send attempt. Inventory snapshots
        // remain an administrative warning and allocation guard, but a stale
        // snapshot must not reject an already-funded customer's queued message.
        // Kilakona's authenticated response remains authoritative at submission.
      }
      const messages = await db.list(
        "messages",
        { job_id: job.id },
        { limit: 10000 },
      );
      const suppressed = await db.list(
        "suppression_list",
        { organization_id: job.organization_id },
        { limit: 10000 },
      );
      if (
        messages.some((m) =>
          suppressed.some((s) => s.normalized_phone === m.normalized_phone),
        )
      )
        throw new ApiError("RECIPIENT_SUPPRESSED_AFTER_QUEUE");
      const organization = (
        await db.list("organizations", { id: job.organization_id })
      )[0];
      if (organization.status !== "active")
        throw new ApiError("ORGANIZATION_SUSPENDED");
      const hour = Number(
        new Intl.DateTimeFormat("en-GB", {
          timeZone: organization.timezone,
          hour: "2-digit",
          hourCycle: "h23",
        }).format(new Date()),
      );
      const quiet =
        organization.quiet_hours_enabled === true &&
        (organization.quiet_start === organization.quiet_end
          ? false
          : organization.quiet_start > organization.quiet_end
            ? hour >= organization.quiet_start || hour < organization.quiet_end
            : hour >= organization.quiet_start && hour < organization.quiet_end);
      if (quiet && !campaign.test_mode) throw new ApiError("QUIET_HOURS");
      submissionStarted = true;
      const result = await provider.sendMessage({
        senderId: sender.sender_name,
        message: campaign.message,
        recipients: messages.map((m) => m.normalized_phone),
        callbackUrl:
          env.GRAMVISTA_DELIVERY_CALLBACK_URL ??
          "https://api.sms.gramvistaempire.com/webhooks/kilakona/delivery",
      });
      await db.rpc("settle_job", {
        p_job: job.id,
        p_provider: provider.code,
        p_reference: result.reference,
        p_valid: result.validContacts,
        p_invalid: result.invalidContacts,
        p_duplicates: result.duplicatedContacts,
        p_size: result.messageSize,
        p_raw: result.raw,
      });
      for (const m of messages)
        await enqueueEvent(
          db,
          job.organization_id,
          "message.submitted",
          m.message_reference + ":submitted",
          {
            id: m.message_reference,
            status: "submitted",
            test_mode: campaign.test_mode,
          },
        );
      processed++;
    } catch (e) {
      const code =
        e instanceof ApiError ? e.code : "PROVIDER_SUBMISSION_UNCERTAIN";
      if (!submissionStarted) {
        await db.rpc("release_job", { p_job: job.id, p_reason: code });
      } else {
        const current = (await db.list("campaign_jobs", { id: job.id }))[0];
        if (current.status !== "submitted") {
          await db.update(
            "campaign_jobs",
            { id: job.id },
            { status: "held", last_error: code },
          );
          await db.update(
            "campaigns",
            { id: job.campaign_id },
            { status: "partially_completed" },
          );
        }
      }
    }
  }
  return { processed };
}
export async function reconcile(
  db: Database,
  env: Environment,
  deadline = Number.POSITIVE_INFINITY,
) {
  let updated = 0;
  const submissions = await db.list(
    "provider_submissions",
    { status: "submitted" },
    { limit: 50, order: "submitted_at", asc: true },
  );
  for (const sub of submissions) {
    if (Date.now() > deadline) break;
    if (
      sub.reconciled_at &&
      new Date(sub.reconciled_at).getTime() > Date.now() - 60000
    )
      continue;
    const messages = await db.list(
      "messages",
      { job_id: sub.job_id },
      { limit: 10000 },
    );
    const reports =
      sub.provider === "mock"
        ? messages.map((m) => ({
            phone: m.normalized_phone,
            status: m.normalized_phone.endsWith("000") ? "failed" : "delivered",
            providerStatus: m.normalized_phone.endsWith("000")
              ? "Failed"
              : "Delivered",
            statusCode: m.normalized_phone.endsWith("000")
              ? "MOCK_FAIL"
              : "000",
            explanation: "Simulated delivery",
          }))
        : await getProvider({
            ...env,
            SMS_PROVIDER: sub.provider,
          }).getDeliveryReport(sub.provider_reference);
    for (const report of reports) {
      const m = messages.find((m) => m.normalized_phone === report.phone);
      if (
        !m ||
        ["delivered", "failed", "rejected", "expired"].includes(m.status)
      )
        continue;
      await db.update(
        "messages",
        { id: m.id },
        {
          status: report.status,
          provider_status: report.providerStatus,
          provider_status_code: report.statusCode,
          updated_at: new Date().toISOString(),
          ...(report.status === "delivered"
            ? { delivered_at: new Date().toISOString() }
            : report.status === "failed"
              ? { failed_at: new Date().toISOString() }
              : {}),
        },
      );
      if (["delivered", "failed"].includes(report.status))
        await enqueueEvent(
          db,
          sub.organization_id,
          "message." + report.status,
          m.message_reference + ":" + report.status,
          {
            id: m.message_reference,
            status: report.status,
            recipient: m.normalized_phone,
          },
        );
      updated++;
    }
    const latest = await db.list(
      "messages",
      { job_id: sub.job_id },
      { limit: 10000 },
    );
    await db.update(
      "provider_submissions",
      { id: sub.id },
      {
        reconciled_at: new Date().toISOString(),
        status: latest.every((m) =>
          ["delivered", "failed", "rejected", "expired"].includes(m.status),
        )
          ? "reconciled"
          : "submitted",
      },
    );
    const campaign = (await db.list("campaigns", { id: sub.campaign_id }))[0];
    if (campaign.status === "completed")
      await enqueueEvent(
        db,
        sub.organization_id,
        "campaign.completed",
        campaign.campaign_reference + ":completed",
        { id: campaign.campaign_reference, status: "completed" },
      );
  }
  return { updated };
}
export async function deliverWebhooks(
  db: Database,
  env: Environment,
  deadline = Number.POSITIVE_INFINITY,
) {
  let delivered = 0;
  for (let i = 0; i < 20; i++) {
    if (Date.now() > deadline) break;
    const row = await db.rpc("claim_webhook", {});
    if (!row) break;
    const e = (
      await db.list("webhook_endpoints", { id: row.endpoint_id, active: true })
    )[0];
    if (!e) {
      await db.update(
        "webhook_deliveries",
        { id: row.id },
        { status: "disabled" },
      );
      continue;
    }
    let status = 0;
    try {
      validateWebhookUrl(e.url, env);
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const body = JSON.stringify(row.payload);
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(e.secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const signature = Array.from(
        new Uint8Array(
          await crypto.subtle.sign(
            "HMAC",
            key,
            new TextEncoder().encode(timestamp + "." + body),
          ),
        ),
      )
        .map((v) => v.toString(16).padStart(2, "0"))
        .join("");
      const res = await fetch(e.url, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(10000),
        headers: {
          "Content-Type": "application/json",
          "X-Gramvista-Signature": `t=${timestamp},v1=${signature}`,
          "X-Gramvista-Event-Id": row.event_key,
        },
        body,
      });
      status = res.status;
    } catch {
      /* Record sanitized outcome only. */
    }
    const success = status >= 200 && status < 300;
    await db.update(
      "webhook_deliveries",
      { id: row.id },
      {
        status: success
          ? "delivered"
          : row.attempts >= 5
            ? "exhausted"
            : "pending",
        attempts: row.attempts + 1,
        last_status_code: status,
        next_attempt_at: new Date(
          Date.now() + Math.min(3600000, 30000 * 2 ** row.attempts),
        ).toISOString(),
      },
    );
    if (success) delivered++;
  }
  return { delivered };
}
