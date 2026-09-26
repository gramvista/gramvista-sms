import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { localDatabase } from "../server/pglite";
import {
  makeHandler,
  resolveKey,
  processJobs,
  reconcile,
  sha256,
  validateWebhookUrl,
  type Identity,
} from "../server/service";
import { estimateSms, normalizePhone, filterRecipients } from "../shared/sms";
import { KilakonaProvider } from "../providers/kilakona/KilakonaProvider";
import { normalizeKilakonaStatus } from "../providers/kilakona/kilakona.status";
import { getProvider } from "../providers/providerRegistry";
const pg = new PGlite();
const db = localDatabase(pg);
const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";
let orgA: string;
let orgB: string;
let identity: Identity;
let handler: ReturnType<typeof makeHandler>;
const perms = [
  "messages.send",
  "messages.read",
  "campaigns.send",
  "campaigns.read",
  "wallet.read",
  "transactions.read",
  "contacts.manage",
  "sender_ids.read",
  "sender_ids.request",
  "api_keys.manage",
  "webhooks.manage",
  "team.manage",
  "settings.manage",
];
async function request(path: string, method = "GET", body?: any, key?: string) {
  const res = await handler(
    new Request("http://test/v1/" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    }),
  );
  return { status: res.status, body: await res.json() };
}
function enqueueArgs(
  org = orgA,
  key = crypto.randomUUID(),
  phone = "+255712345678",
  test = false,
) {
  return {
    p_org: org,
    p_sender: org === orgA ? "BRANDA" : "BRANDB",
    p_name: "Test campaign",
    p_message: "Hello world",
    p_phones: [phone],
    p_parts: 1,
    p_encoding: "GSM-7",
    p_key: key,
    p_fingerprint: "fingerprint",
    p_test: test,
    p_schedule: null,
    p_actor: org === orgA ? userA : userB,
    p_batch: 100,
  };
}
beforeAll(async () => {
  await pg.exec(
    "create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;create role anon;create role authenticated;create role service_role bypassrls;",
  );
  await pg.exec(
    await readFile("supabase/migrations/202609150001_core.sql", "utf8"),
  );
  await pg.exec(
    await readFile("supabase/migrations/202609150003_operations.sql", "utf8"),
  );
  await pg.exec(
    `insert into auth.users values ('${userA}','a@test.com'),('${userB}','b@test.com')`,
  );
  await pg.exec(
    await readFile("supabase/migrations/202609150004_outbox.sql", "utf8"),
  );
  await pg.exec(
    await readFile(
      "supabase/migrations/202609150005_team_and_low_balance.sql",
      "utf8",
    ),
  );
  await pg.exec(
    await readFile(
      "supabase/migrations/202609150006_dispatch_validation.sql",
      "utf8",
    ),
  );
  await pg.exec(
    await readFile(
      "supabase/migrations/202609150007_provider_accounting.sql",
      "utf8",
    ),
  );
  await pg.exec(
    await readFile(
      "supabase/migrations/202609150008_cloud_operations.sql",
      "utf8",
    ),
  );
  await pg.exec(
    await readFile(
      "supabase/migrations/202609150010_retail_and_sender_workflow.sql",
      "utf8",
    ),
  );
  await pg.exec(
    await readFile("supabase/migrations/202609150012_direct_sms.sql", "utf8"),
  );
  for (const user of [userA, userB]) {
    const o = await db.rpc("onboard", {
      p_user: user,
      p_name: user === userA ? "A business" : "B business",
      p_legal: "Legal business",
      p_phone: "+255712345678",
      p_email: "business@test.com",
      p_type: "Retail",
      p_country: "TZ",
    });
    if (user === userA) orgA = o.id;
    else orgB = o.id;
    await db.update(
      "organizations",
      { id: o.id },
      { quiet_start: 0, quiet_end: 0 },
    );
    await db.insert("sender_ids", {
      organization_id: o.id,
      sender_name: user === userA ? "BRANDA" : "BRANDB",
      legal_business_name: "Legal",
      purpose: "Tests",
      sample_message: "Test",
      status: "approved",
    });
  }
  identity = {
    userId: userA,
    orgId: orgA,
    role: "owner",
    permissions: perms,
    admin: false,
    test: false,
  };
  handler = makeHandler(
    db,
    { SMS_PROVIDER: "mock", LOCAL_DEMO: "true" },
    async () => identity,
  );
}, 30000);
afterAll(async () => {
  await pg.close();
});
describe("message normalization and estimates", () => {
  it("normalizes Tanzanian local and international phones", () => {
    expect(normalizePhone("0712 345 678")).toBe("+255712345678");
    expect(normalizePhone("255712345678")).toBe("+255712345678");
    expect(normalizePhone("abc")).toBeNull();
  });
  it("accounts for GSM extension characters and multipart boundaries", () => {
    expect(estimateSms("A".repeat(160)).parts).toBe(1);
    expect(estimateSms("A".repeat(161)).parts).toBe(2);
    expect(estimateSms("^".repeat(81)).parts).toBe(2);
  });
  it("counts UTF-16 units for Unicode and emoji", () => {
    expect(estimateSms("你".repeat(71))).toMatchObject({
      encoding: "Unicode",
      parts: 2,
    });
    expect(estimateSms("😀".repeat(36)).parts).toBe(2);
  });
  it("filters invalid, duplicate and suppressed recipients", () => {
    expect(
      filterRecipients(
        ["0712345678", "+255712345678", "bad", "0754123456"],
        ["+255754123456"],
      ),
    ).toMatchObject({
      eligible: ["+255712345678"],
      duplicates: 1,
      invalid: 1,
      suppressed: 1,
    });
  });
});
describe("provider contract", () => {
  it("maps only confirmed delivery statuses", () => {
    expect(
      ["Delivered", "Failed", "Buffered", "NewStatus"].map(
        normalizeKilakonaStatus,
      ),
    ).toEqual(["delivered", "failed", "pending", "unknown"]);
  });
  it("maps send, balance and delivery responses without leaking headers", async () => {
    const http = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          code: 200,
          success: true,
          data: {
            shootId: "provider-internal-123",
            validContacts: 1,
            invalidContacts: 0,
            duplicatedContacts: 0,
            messageSize: 11,
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ code: 200, success: true, data: { totalSms: 30 } }),
      )
      .mockResolvedValueOnce(
        Response.json({
          code: 200,
          success: true,
          data: [
            {
              mobile: "255712345678",
              status: "Delivered",
              statusCode: "000",
              explanation: "N/A",
              sentAt: "07-02-2024 07:35:08",
            },
          ],
        }),
      );
    const p = new KilakonaProvider(
      {
        baseUrl: "https://provider.test",
        key: "secret-key",
        secret: "secret-secret",
      },
      http,
    );
    expect(
      (
        await p.sendMessage({
          senderId: "BRAND",
          message: "Hello world",
          recipients: ["+255712345678"],
          callbackUrl: "https://gramvista.test/callback",
        })
      ).reference,
    ).toBe("provider-internal-123");
    expect(JSON.parse(http.mock.calls[0][1].body).contacts).toBe(
      "255712345678",
    );
    expect((await p.getBalance()).totalSms).toBe(30);
    expect((await p.getDeliveryReport("ref"))[0]).toMatchObject({
      phone: "+255712345678",
      status: "delivered",
      providerStatus: "Delivered",
    });
  });
  it("treats transport failure on submission as ambiguous and never retries", async () => {
    const http = vi.fn().mockRejectedValue(new Error("timeout"));
    const p = new KilakonaProvider(
      { baseUrl: "https://provider.test", key: "x", secret: "y" },
      http,
    );
    await expect(
      p.sendMessage({
        senderId: "A",
        message: "Hello",
        recipients: ["+255712345678"],
        callbackUrl: "https://example.com",
      }),
    ).rejects.toMatchObject({ ambiguous: true });
    expect(http).toHaveBeenCalledTimes(1);
  });
  it("test mode always selects mock even if live provider is configured", () => {
    expect(getProvider({ SMS_PROVIDER: "kilakona" }, true).code).toBe("mock");
  });
});
describe("database accounting and tenant security", () => {
  it("starts new organizations at zero credits", async () => {
    expect(
      (await db.list("sms_wallets", { organization_id: orgA }))[0]
        .available_units,
    ).toBe(0);
  });
  it("atomically credits once for a repeated adjustment reference", async () => {
    const args = {
      p_org: orgA,
      p_units: 10,
      p_reference: "purchase-001",
      p_reason: "Verified credit",
      p_actor: userA,
    };
    await Promise.all([
      db.rpc("wallet_adjust", args),
      db.rpc("wallet_adjust", args),
    ]);
    expect(
      (await db.list("sms_wallets", { organization_id: orgA }))[0]
        .available_units,
    ).toBe(10);
    expect(
      (await db.list("wallet_transactions", { organization_id: orgA })).length,
    ).toBe(1);
  });
  it("rejects changed amount with a reused adjustment reference", async () => {
    await expect(
      db.rpc("wallet_adjust", {
        p_org: orgA,
        p_units: 11,
        p_reference: "purchase-001",
        p_reason: "Verified credit",
        p_actor: userA,
      }),
    ).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  });
  it("ledger is immutable even through service database access", async () => {
    await expect(
      pg.query(
        "update wallet_transactions set units=999 where organization_id=$1",
        [orgA],
      ),
    ).rejects.toThrow("immutable");
  });
  it("rejects a Sender ID owned by another tenant", async () => {
    await expect(
      db.rpc("enqueue_campaign", { ...enqueueArgs(), p_sender: "BRANDB" }),
    ).rejects.toThrow("INVALID_SENDER_ID");
  });
  it("requires Sender ID approval", async () => {
    await db.insert("sender_ids", {
      organization_id: orgA,
      sender_name: "PENDING",
      legal_business_name: "Legal",
      purpose: "Tests",
      sample_message: "Tests",
    });
    await expect(
      db.rpc("enqueue_campaign", { ...enqueueArgs(), p_sender: "PENDING" }),
    ).rejects.toThrow("SENDER_ID_NOT_APPROVED");
  });
  it("suppression is applied again inside the database", async () => {
    await db.insert("suppression_list", {
      organization_id: orgA,
      phone: "+255712345699",
      normalized_phone: "+255712345699",
      reason: "opt_out",
    });
    await expect(
      db.rpc(
        "enqueue_campaign",
        enqueueArgs(orgA, crypto.randomUUID(), "+255712345699"),
      ),
    ).rejects.toThrow("NO_ELIGIBLE_RECIPIENTS");
  });
  it("does not duplicate campaign reservations for repeated idempotency key", async () => {
    const args = enqueueArgs();
    const [a, b] = await Promise.all([
      db.rpc("enqueue_campaign", args),
      db.rpc("enqueue_campaign", args),
    ]);
    expect(a.campaign_id).toBe(b.campaign_id);
    expect(
      (await db.list("sms_wallets", { organization_id: orgA }))[0],
    ).toMatchObject({ available_units: 9, reserved_units: 1 });
    await expect(
      db.rpc("enqueue_campaign", { ...args, p_fingerprint: "changed" }),
    ).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  });
  it("prevents concurrent campaigns from overspending a wallet", async () => {
    const results = await Promise.allSettled([
      db.rpc("enqueue_campaign", { ...enqueueArgs(), p_parts: 6 }),
      db.rpc("enqueue_campaign", { ...enqueueArgs(), p_parts: 6 }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (await db.list("sms_wallets", { organization_id: orgA }))[0],
    ).toMatchObject({ available_units: 3, reserved_units: 7 });
  });
  it("settles mock sends and reconciles delivery without exposing shoot IDs", async () => {
    await processJobs(db, { SMS_PROVIDER: "mock", LOCAL_DEMO: "true" });
    await reconcile(db, { SMS_PROVIDER: "mock", LOCAL_DEMO: "true" });
    expect(
      (await db.list("sms_wallets", { organization_id: orgA }))[0]
        .reserved_units,
    ).toBe(0);
    expect(
      (await db.list("provider_submissions", { organization_id: orgA })).length,
    ).toBe(2);
    const res = await request("messages");
    expect(res.status).toBe(200);
    expect(res.body.data.every((m: any) => m.status === "delivered")).toBe(
      true,
    );
    expect(JSON.stringify(res.body)).not.toContain("shoot");
  });
  it("test campaigns do not consume customer wallet units", async () => {
    const before = (await db.list("sms_wallets", { organization_id: orgA }))[0];
    await db.rpc(
      "enqueue_campaign",
      enqueueArgs(orgA, crypto.randomUUID(), "+255712345000", true),
    );
    await processJobs(db, { SMS_PROVIDER: "mock", LOCAL_DEMO: "true" });
    await reconcile(db, { SMS_PROVIDER: "mock", LOCAL_DEMO: "true" });
    const after = (await db.list("sms_wallets", { organization_id: orgA }))[0];
    expect(after.available_units).toBe(before.available_units);
    expect(after.reserved_units).toBe(before.reserved_units);
    const failed = (await db.list("messages", { organization_id: orgA })).find(
      (m) => m.status === "failed",
    );
    expect(failed?.billing_status).toBe("released");
  });
  it("cancellation releases reserved credits exactly once", async () => {
    const c = await db.rpc("enqueue_campaign", {
      ...enqueueArgs(),
      p_schedule: new Date(Date.now() + 86400000).toISOString(),
    });
    await db.rpc("cancel_campaign", {
      p_org: orgA,
      p_id: c.campaign_id,
      p_actor: userA,
    });
    await db.rpc("cancel_campaign", {
      p_org: orgA,
      p_id: c.campaign_id,
      p_actor: userA,
    });
    expect(
      (await db.list("sms_wallets", { organization_id: orgA }))[0],
    ).toMatchObject({ available_units: 3, reserved_units: 0 });
  });
  it("payment verification credits exactly once", async () => {
    const p = await db.insert("payments", {
      organization_id: orgA,
      amount: "100.00",
      currency: "TZS",
      reference: "trusted-001",
      sms_units: 5,
    });
    await Promise.all([
      db.rpc("verify_payment", { p_id: p.id, p_actor: userA }),
      db.rpc("verify_payment", { p_id: p.id, p_actor: userA }),
    ]);
    expect(
      (await db.list("sms_wallets", { organization_id: orgA }))[0]
        .available_units,
    ).toBe(8);
    expect(await db.list("invoices", { payment_id: p.id })).toHaveLength(1);
  });
  it("RLS isolates tenant rows and denies financial writes and provider reads", async () => {
    await pg.exec("set role authenticated");
    try {
      await pg.query("select set_config('request.jwt.claim.sub',$1,false)", [
        userB,
      ]);
      expect((await pg.query("select * from sms_wallets")).rows).toHaveLength(
        1,
      );
      expect((await pg.query("select * from campaigns")).rows).toHaveLength(0);
      await expect(
        pg.query("select * from provider_submissions"),
      ).rejects.toThrow("permission denied");
      await expect(pg.query("select * from api_keys")).rejects.toThrow(
        "permission denied",
      );
      await expect(
        pg.query("update sms_wallets set available_units=1000"),
      ).rejects.toThrow("permission denied");
      await expect(
        pg.query("select wallet_adjust($1,10,$2,$3,$4)", [
          orgB,
          "fake-ref",
          "Fake credit",
          userB,
        ]),
      ).rejects.toThrow("permission denied");
    } finally {
      await pg.exec("reset role");
    }
  });
});
describe("public API authorization", () => {
  it("balance returns the customer wallet", async () => {
    await db.insert("provider_balance_snapshots", {
      provider: "mock",
      balance_sms: 999999,
      success: true,
    });
    const res = await request("balance");
    expect(res.body.available_sms).toBe(8);
    expect(res.body.total_sms).toBe(8);
  });
  it("rejects client-selected organization IDs in a send", async () => {
    expect(
      (
        await request(
          "messages",
          "POST",
          {
            organization_id: orgB,
            sender_id: "BRANDA",
            recipients: ["+255712345678"],
            message: "Hello",
          },
          "org-spoof",
        )
      ).status,
    ).toBe(400);
  });
  it("checks backend permissions and separate platform admin authorization", async () => {
    const old = identity;
    identity = { ...identity, role: "viewer", permissions: ["messages.read"] };
    expect((await request("messages", "POST", {})).status).toBe(403);
    expect((await request("platform/organizations")).status).toBe(403);
    identity = old;
  });
  it("hashes API keys, scopes them to their organization, supports revoke and expiry", async () => {
    const res = await request("api-keys", "POST", {
      name: "Integration",
      environment: "test",
      permissions: ["messages.read", "wallet.read"],
    });
    expect(res.status).toBe(201);
    const key = res.body.key;
    const stored = (await db.list("api_keys", { id: res.body.id }))[0];
    expect(stored.key_hash).toBe(await sha256(key));
    expect(stored.key_hash).not.toBe(key);
    const principal = await resolveKey(db, key, "req_test", "/v1/balance");
    expect(principal.orgId).toBe(orgA);
    expect(principal.test).toBe(true);
    expect(JSON.stringify((await request("api-keys")).body)).not.toContain(key);
    await request("api-keys/" + res.body.id, "DELETE");
    await expect(
      resolveKey(db, key, "req_again", "/v1/balance"),
    ).rejects.toThrow("UNAUTHORIZED");
  });
  it("rejects expired keys and rate limits valid keys", async () => {
    const raw = "gvs_test_expired";
    await db.insert("api_keys", {
      organization_id: orgA,
      name: "Expired",
      environment: "test",
      key_prefix: "gvs_test_",
      key_hash: await sha256(raw),
      permissions: ["wallet.read"],
      created_by: userA,
      expires_at: "2020-01-01T00:00:00Z",
    });
    await expect(resolveKey(db, raw, "req_exp", "balance")).rejects.toThrow(
      "UNAUTHORIZED",
    );
    const res = await request("api-keys", "POST", {
      name: "Limited",
      environment: "test",
      permissions: ["wallet.read"],
    });
    await db.update(
      "api_keys",
      { id: res.body.id },
      { requests_per_minute: 1 },
    );
    await resolveKey(db, res.body.key, "req_1", "balance");
    await expect(
      resolveKey(db, res.body.key, "req_2", "balance"),
    ).rejects.toThrow("RATE_LIMITED");
  });
  it("denies private, HTTP and non-allowlisted webhook destinations", () => {
    for (const url of [
      "http://example.com",
      "https://127.0.0.1",
      "https://localhost",
      "https://untrusted.com",
    ])
      expect(() =>
        validateWebhookUrl(url, { WEBHOOK_ALLOWED_HOSTS: "example.com" }),
      ).toThrow();
    expect(() =>
      validateWebhookUrl("https://example.com/hook", {
        WEBHOOK_ALLOWED_HOSTS: "example.com",
      }),
    ).not.toThrow();
  });
  it("produces database-backed aggregate statistics", async () => {
    const stats = await request("stats");
    expect(stats.status).toBe(200);
    expect(stats.body.total).toBeGreaterThan(0);
    expect(stats.body.days).toHaveLength(7);
  });
});

describe("recovery, invitations and hosted routing", () => {
  it("leases scheduled dispatch to one worker at a time", async () => {
    const a = crypto.randomUUID();
    const b = crypto.randomUUID();
    expect(await db.rpc("claim_worker", { p_token: a })).toBe(true);
    expect(await db.rpc("claim_worker", { p_token: b })).toBe(false);
    await db.rpc("release_worker", { p_token: b });
    expect(await db.rpc("claim_worker", { p_token: b })).toBe(false);
    await db.rpc("release_worker", { p_token: a });
    expect(await db.rpc("claim_worker", { p_token: b })).toBe(true);
    await db.rpc("release_worker", { p_token: b });
  });
  it("grants bootstrap administration only after verified email and only once", async () => {
    await pg.exec(
      "alter table auth.users add column email_confirmed_at timestamptz",
    );
    await pg.query(
      "insert into private.platform_admin_invitations(email) values ('a@test.com')",
    );
    expect(await db.rpc("claim_platform_admin", { p_user: userA })).toBe(false);
    await pg.query(
      "update auth.users set email_confirmed_at=now() where id=$1",
      [userA],
    );
    expect(await db.rpc("claim_platform_admin", { p_user: userA })).toBe(true);
    await db.remove("platform_admins", { user_id: userA });
    expect(await db.rpc("claim_platform_admin", { p_user: userA })).toBe(false);
  });
  it("routes the Supabase hosted API path correctly", async () => {
    const res = await handler(
      new Request(
        "https://project.supabase.co/functions/v1/public-api/v1/balance",
      ),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).available_sms).toBeGreaterThanOrEqual(0);
  });
  it("prevents a service API reader from accessing another tenant message", async () => {
    const message = (await db.list("messages", { organization_id: orgA }))[0];
    const old = identity;
    identity = { ...identity, userId: userB, orgId: orgB };
    try {
      expect(
        (await request("messages/" + message.message_reference)).status,
      ).toBe(404);
    } finally {
      identity = old;
    }
  });
  it("enforces composite tenant foreign keys for group membership", async () => {
    const group = await db.insert("contact_groups", {
      organization_id: orgA,
      name: "Tenant A group",
    });
    const contact = await db.insert("contacts", {
      organization_id: orgB,
      first_name: "B",
      phone: "+255712345666",
      normalized_phone: "+255712345666",
    });
    await expect(
      db.insert("contact_group_members", {
        organization_id: orgA,
        group_id: group.id,
        contact_id: contact.id,
      }),
    ).rejects.toThrow("foreign key");
  });
  it("records delivery and webhook event atomically, without duplicate events on replay", async () => {
    await db.insert("webhook_endpoints", {
      organization_id: orgA,
      url: "https://example.com/hook",
      events: ["message.submitted", "message.delivered", "campaign.completed"],
      secret: "server-only-secret",
    });
    const c = await db.rpc(
      "enqueue_campaign",
      enqueueArgs(orgA, crypto.randomUUID(), "+255712346789", true),
    );
    await processJobs(db, { SMS_PROVIDER: "mock", LOCAL_DEMO: "true" });
    await reconcile(db, { SMS_PROVIDER: "mock", LOCAL_DEMO: "true" });
    await reconcile(db, { SMS_PROVIDER: "mock", LOCAL_DEMO: "true" });
    const m = (await db.list("messages", { campaign_id: c.campaign_id }))[0];
    const events = await db.list("webhook_deliveries", {
      organization_id: orgA,
    });
    expect(
      events.filter((e) => e.event_key === m.message_reference + ":delivered"),
    ).toHaveLength(1);
    expect(
      events.filter((e) => e.event_key === m.message_reference + ":submitted"),
    ).toHaveLength(1);
  });
  it("releases a reservation when sender approval is revoked before dispatch", async () => {
    const before = (await db.list("sms_wallets", { organization_id: orgA }))[0]
      .available_units;
    const c = await db.rpc("enqueue_campaign", enqueueArgs());
    await db.update(
      "sender_ids",
      { organization_id: orgA, sender_name: "BRANDA" },
      { status: "suspended" },
    );
    await processJobs(db, { SMS_PROVIDER: "mock", LOCAL_DEMO: "true" });
    await db.update(
      "sender_ids",
      { organization_id: orgA, sender_name: "BRANDA" },
      { status: "approved" },
    );
    expect(
      (await db.list("sms_wallets", { organization_id: orgA }))[0],
    ).toMatchObject({ available_units: before, reserved_units: 0 });
    expect(
      (await db.list("campaign_jobs", { campaign_id: c.campaign_id }))[0]
        .status,
    ).toBe("rejected");
  });
  it("holds interrupted processing jobs and retains credits without resending", async () => {
    const c = await db.rpc("enqueue_campaign", enqueueArgs());
    const j = await db.rpc("claim_job", {});
    expect(j.campaign_id).toBe(c.campaign_id);
    await db.update(
      "campaign_jobs",
      { id: j.id },
      { started_at: new Date(Date.now() - 600000).toISOString() },
    );
    await processJobs(db, { SMS_PROVIDER: "mock", LOCAL_DEMO: "true" });
    expect((await db.list("campaign_jobs", { id: j.id }))[0].status).toBe(
      "held",
    );
    expect(
      (await db.list("sms_wallets", { organization_id: orgA }))[0]
        .reserved_units,
    ).toBe(1);
  });
  it("does not refund a charged message because its delivery failed", async () => {
    const before = (await db.list("sms_wallets", { organization_id: orgA }))[0]
      .available_units;
    const c = await db.rpc(
      "enqueue_campaign",
      enqueueArgs(orgA, crypto.randomUUID(), "+255754321000"),
    );
    await processJobs(db, { SMS_PROVIDER: "mock", LOCAL_DEMO: "true" });
    await reconcile(db, { SMS_PROVIDER: "mock", LOCAL_DEMO: "true" });
    expect(
      (await db.list("messages", { campaign_id: c.campaign_id }))[0],
    ).toMatchObject({ status: "failed", billing_status: "charged" });
    expect(
      (await db.list("sms_wallets", { organization_id: orgA }))[0]
        .available_units,
    ).toBe(before - 1);
  });
  it("records invitations without accepting the wrong email", async () => {
    const response = await request("team-invitations", "POST", {
      email: "teammate@example.com",
      role_id: "viewer",
    });
    expect(response.status).toBe(201);
    expect(
      await db.rpc("accept_invitations", {
        p_user: userB,
        p_email: "different@example.com",
      }),
    ).toBe(0);
    expect(
      (await db.list("organization_invitations", { id: response.body.id }))[0]
        .status,
    ).toBe("pending");
  });
});

describe("Gramvista retail pricing and provider approval", () => {
  it("prices every tier boundary on the server and rejects unpriced quantities", async () => {
    const cases = [
      [1001, 22],
      [29999, 22],
      [30000, 20],
      [49999, 20],
      [50000, 19],
      [199999, 19],
      [200000, 18],
      [499000, 18],
      [499999, 18],
      [500000, 15],
      [1000000, 15],
    ];
    for (const [units, rate] of cases) {
      const result = await db.rpc("create_retail_payment", {
        p_org: orgA,
        p_units: units,
        p_reference: "retail-" + crypto.randomUUID(),
      });
      expect(Number(result.amount)).toBe(units * rate);
      expect(Number(result.retail_unit_price)).toBe(rate);
    }
    for (const units of [0, 1000, 1000001])
      await expect(
        db.rpc("create_retail_payment", {
          p_org: orgA,
          p_units: units,
          p_reference: crypto.randomUUID(),
        }),
      ).rejects.toThrow("CUSTOM_QUOTE_REQUIRED");
  });
  it("retries one purchase without duplicate credits and isolates payment references", async () => {
    const before = Number(
      (await db.list("sms_wallets", { organization_id: orgA }))[0]
        .available_units,
    );
    const args = {
      p_org: orgA,
      p_units: 1001,
      p_reference: "retail-" + crypto.randomUUID(),
    };
    const p = await db.rpc("create_retail_payment", args);
    expect((await db.rpc("create_retail_payment", args)).id).toBe(p.id);
    expect(
      Number(
        (await db.list("sms_wallets", { organization_id: orgA }))[0]
          .available_units,
      ),
    ).toBe(before);
    await expect(
      db.rpc("create_retail_payment", { ...args, p_org: orgB }),
    ).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    await expect(
      db.rpc("create_retail_payment", { ...args, p_units: 30000 }),
    ).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    await db.rpc("verify_payment", { p_id: p.id, p_actor: userB });
    await db.rpc("verify_payment", { p_id: p.id, p_actor: userB });
    expect(
      Number(
        (await db.list("sms_wallets", { organization_id: orgA }))[0]
          .available_units,
      ),
    ).toBe(before + 1001);
    expect(await db.list("invoices", { payment_id: p.id })).toHaveLength(1);
  });
  it("requires recorded Kilakona evidence before approving a sender", async () => {
    const sender = await db.insert("sender_ids", {
      organization_id: orgA,
      sender_name: "REVIEW",
      legal_business_name: "Review Business",
      purpose: "Updates",
      sample_message: "Your order is ready",
    });
    const args = {
      p_sender: sender.id,
      p_status: "approved",
      p_reference: "",
      p_notes: "",
      p_evidence: "",
      p_actor: userB,
      p_demo: false,
    };
    await expect(db.rpc("update_sender_workflow", args)).rejects.toThrow(
      "PROVIDER_REFERENCE_REQUIRED",
    );
    await expect(
      db.rpc("update_sender_workflow", { ...args, p_reference: "KILA-123" }),
    ).rejects.toThrow("PROVIDER_APPROVAL_REQUIRED");
    expect((await db.list("sender_ids", { id: sender.id }))[0].status).toBe(
      "submitted",
    );
    await db.rpc("update_sender_workflow", {
      ...args,
      p_status: "provider_pending",
      p_reference: "KILA-123",
    });
    expect(
      (
        await db.list("sender_id_provider_records", { sender_id_id: sender.id })
      )[0].submitted_at,
    ).toBeTruthy();
    await db.rpc("update_sender_workflow", {
      ...args,
      p_reference: "KILA-123",
      p_evidence: "Test fixture: provider confirmed account activation.",
    });
    expect((await db.list("sender_ids", { id: sender.id }))[0].status).toBe(
      "approved",
    );
  });
  it("blocks customer access to provider records and rejects unpriced purchases via API", async () => {
    const previous = identity;
    identity = {
      userId: userA,
      orgId: orgA,
      role: "owner",
      permissions: perms,
      admin: false,
      test: false,
    };
    try {
      expect((await request("platform/sender-records")).status).toBe(403);
      expect(
        (
          await request("retail-payments", "POST", {
            sms_units: 1000,
            reference: crypto.randomUUID(),
          })
        ).body.error.code,
      ).toBe("CUSTOM_QUOTE_REQUIRED");
      const r = await request("retail-payments", "POST", {
        sms_units: 30000,
        reference: crypto.randomUUID(),
        amount: 1,
      });
      expect(Number(r.body.amount)).toBe(600000);
    } finally {
      identity = previous;
    }
  });
});
