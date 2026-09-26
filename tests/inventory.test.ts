import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { localDatabase } from "../server/pglite";
import { getProvider } from "../providers/providerRegistry";
import { makeHandler, type Identity } from "../server/service";

const pg = new PGlite();
const db = localDatabase(pg);
const a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const b = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const allocate = (
  org: string,
  units: number,
  reference: string = crypto.randomUUID(),
) =>
  db.rpc("wallet_adjust", {
    p_org: org,
    p_units: units,
    p_reference: reference,
    p_reason: "Inventory test allocation",
    p_actor: null,
    p_type: "allocation",
  });
const status = () => db.rpc("inventory_status", {});
async function snapshot(balance: number, usage?: number) {
  return db.rpc("record_inventory_snapshot", {
    p_provider: "mock",
    p_balance: balance,
    p_usage: usage ?? (await db.rpc("inventory_sync_watermark", {})),
    p_started: new Date().toISOString(),
    p_raw: { simulated: true },
  });
}
function campaign(units: number) {
  const parts = units >= 100 ? 100 : 1;
  return db.rpc("enqueue_campaign", {
    p_org: a,
    p_sender: "BRANDA",
    p_name: "Inventory test",
    p_message: "Hello",
    p_phones: Array.from(
      { length: units / parts },
      (_, i) => "+255712" + String(i).padStart(6, "0"),
    ),
    p_parts: parts,
    p_encoding: "GSM-7",
    p_key: crypto.randomUUID(),
    p_fingerprint: crypto.randomUUID(),
    p_test: false,
    p_schedule: null,
    p_actor: null,
    p_batch: 10000,
  });
}
async function settle(units: number) {
  await campaign(units);
  const job = await db.rpc("claim_job", {});
  await db.rpc("settle_job", {
    p_job: job.id,
    p_provider: "mock",
    p_reference: crypto.randomUUID(),
    p_valid: job.recipient_count,
    p_invalid: 0,
    p_duplicates: 0,
    p_size: 5,
    p_raw: {},
  });
}
beforeAll(async () => {
  await pg.exec(
    "create schema auth; create table auth.users(id uuid primary key,email text); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; create role anon; create role authenticated; create role service_role bypassrls;",
  );
  for (const file of [
    "202609150001_core",
    "202609150003_operations",
    "202609150004_outbox",
    "202609150005_team_and_low_balance",
    "202609150006_dispatch_validation",
    "202609150007_provider_accounting",
    "202609150008_cloud_operations",
    "202609150010_retail_and_sender_workflow",
    "202609150011_clickpesa",
    "202609150012_direct_sms",
    "202609160001_inventory_bank",
    "202609160002_single_sms_purchase",
    "202609160003_order_review",
    "202609160004_wallet_reset",
    "202609260001_clickpesa_and_retail_minimum",
    "202609260002_optional_quiet_hours",
  ])
    await pg.exec(await readFile(`supabase/migrations/${file}.sql`, "utf8"));
}, 30000);
beforeEach(async () => {
  // Privileged fixture reset only: production records are immutable.
  await pg.exec(
    "truncate organizations cascade; truncate provider_balance_snapshots,provider_usage; update private.sms_bank set provider='mock',reconciled_units=0; update provider_cost_settings set reserve_threshold=0,critical_threshold=0,warning_threshold=0;",
  );
  for (const org of [a, b]) {
    await db.insert("organizations", {
      id: org,
      name: org,
      quiet_start: 0,
      quiet_end: 0,
    });
    await db.insert("sms_wallets", { organization_id: org });
  }
  await db.insert("sender_ids", {
    organization_id: a,
    sender_name: "BRANDA",
    legal_business_name: "A",
    purpose: "Testing",
    sample_message: "Hello",
    status: "approved",
  });
  await db.insert("provider_balance_snapshots", {
    provider: "mock",
    balance_sms: 10000,
    success: true,
    checked_at: new Date(Date.now() - 1000).toISOString(),
  });
});
afterAll(() => pg.close());

describe("SMS bank invariants", () => {
  it("allows only one of simultaneous 8,000 and 7,000 allocations against 10,000", async () => {
    const results = await Promise.allSettled([
      allocate(a, 8000),
      allocate(b, 7000),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: expect.objectContaining({
        message: expect.stringContaining("INSUFFICIENT_PROVIDER_CAPACITY"),
      }),
    });
    expect(await status()).toMatchObject({
      balance: 10000,
      liability: 8000,
      available_to_allocate: 2000,
    });
  });
  it("allows only one of simultaneous 8,000 and 7,000 campaign reservations against 10,000", async () => {
    await allocate(a, 10000);
    const results = await Promise.allSettled([campaign(8000), campaign(7000)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (await db.list("sms_wallets", { organization_id: a }))[0],
    ).toMatchObject({ available_units: 2000, reserved_units: 8000 });
    expect(await db.list("campaigns")).toHaveLength(1);
  });
  it("leaves provider inventory unchanged on allocation and applies the safety reserve", async () => {
    await db.update(
      "provider_cost_settings",
      { provider: "mock" },
      { reserve_threshold: 2000 },
    );
    await allocate(a, 1000);
    expect(await status()).toMatchObject({
      balance: 10000,
      liability: 1000,
      safety_reserve: 2000,
      available_to_allocate: 7000,
    });
    await expect(allocate(b, 7001)).rejects.toThrow(
      "INSUFFICIENT_PROVIDER_CAPACITY",
    );
  });
  it("counts settled usage until the provider reports a decrease", async () => {
    await allocate(a, 10000);
    await settle(1000);
    expect(await status()).toMatchObject({
      balance: 10000,
      liability: 9000,
      unsynced_usage: 1000,
      effective_inventory: 9000,
      available_to_allocate: 0,
    });
    await snapshot(10000);
    expect((await status()).unsynced_usage).toBe(1000);
    await snapshot(9000);
    expect(await status()).toMatchObject({
      balance: 9000,
      liability: 9000,
      unsynced_usage: 0,
      available_to_allocate: 0,
    });
    expect(await db.rpc("wallet_usage", { p_org: a })).toBe(1000);
  });
  it("does not erase concurrent usage or clear estimates on top-up", async () => {
    await allocate(a, 2000);
    const watermark = await db.rpc("inventory_sync_watermark", {});
    await settle(1000);
    await snapshot(9000, watermark);
    expect((await status()).unsynced_usage).toBe(1000);
    await snapshot(20000);
    expect((await status()).unsynced_usage).toBe(1000);
  });
  it("rolls back payment approval, invoice and allocation together when capacity is insufficient", async () => {
    const payment = await db.insert("payments", {
      organization_id: a,
      amount: 220000,
      currency: "TZS",
      reference: "payment",
      payment_reference: "PAYMENT",
      sms_units: 11000,
    });
    await expect(
      db.rpc("review_order", {
        p_id: payment.id,
        p_actor: null,
        p_decision: "approved",
        p_received: 220000,
        p_currency: "TZS",
        p_receipt: "receipt",
        p_notes: "Verified actual receipt",
        p_confirmed: true,
      }),
    ).rejects.toThrow("INSUFFICIENT_PROVIDER_CAPACITY");
    expect((await db.list("payments"))[0].status).toBe("pending");
    expect(await db.list("invoices")).toHaveLength(0);
    expect(await db.list("wallet_transactions")).toHaveLength(0);
  });
  it("retries an allocation once even when bank capacity is now exhausted", async () => {
    const first = await allocate(a, 10000, "same-reference");
    expect((await allocate(a, 10000, "same-reference")).id).toBe(first.id);
    expect(await db.list("wallet_transactions")).toHaveLength(1);
    await expect(allocate(a, 9999, "same-reference")).rejects.toThrow(
      "IDEMPOTENCY_CONFLICT",
    );
  });
  it("rejects direct wallet increases that would bypass the capacity guard", async () => {
    await expect(
      db.update(
        "sms_wallets",
        { organization_id: a },
        { available_units: 10001 },
      ),
    ).rejects.toThrow("INSUFFICIENT_PROVIDER_CAPACITY");
  });
  it("fails closed on stale or failed inventory sync", async () => {
    await pg.exec("truncate provider_balance_snapshots");
    await db.insert("provider_balance_snapshots", {
      provider: "mock",
      balance_sms: 10000,
      success: true,
      checked_at: new Date(Date.now() - 600000).toISOString(),
    });
    expect((await status()).available_to_allocate).toBe(0);
    await expect(allocate(a, 1)).rejects.toThrow("INVENTORY_UNAVAILABLE");
    await snapshot(10000);
    await db.insert("provider_balance_snapshots", {
      provider: "mock",
      success: false,
    });
    expect((await status()).inventory_health).toBe("degraded");
    await expect(allocate(a, 1)).rejects.toThrow("INVENTORY_UNAVAILABLE");
  });
  it("requires correction confirmation and caps positive corrections", async () => {
    const identity: Identity = {
      userId: a,
      orgId: a,
      role: "owner",
      permissions: [],
      admin: true,
      test: false,
    };
    const handler = makeHandler(
      db,
      { SMS_PROVIDER: "mock", LOCAL_DEMO: "true" },
      async () => identity,
    );
    const post = (body: object) =>
      handler(
        new Request("http://test/v1/platform/correction", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
    const body = {
      organization_id: a,
      units: 10001,
      reason: "Billing correction",
      reference: "correction",
    };
    expect((await post(body)).status).toBe(400);
    expect(
      (await (await post({ ...body, confirmed: true })).json()).error.code,
    ).toBe("INSUFFICIENT_PROVIDER_CAPACITY");
    expect((await db.list("audit_logs"))[0].action).toBe(
      "financial_operation.rejected",
    );
  });
  it("permanently binds sender ownership and preserves closed organization records", async () => {
    const sender = (await db.list("sender_ids"))[0];
    await expect(
      db.update("sender_ids", { id: sender.id }, { organization_id: b }),
    ).rejects.toThrow("SENDER_OWNERSHIP_IMMUTABLE");
    await expect(
      db.update("sender_ids", { id: sender.id }, { sender_name: "NEWBRAND" }),
    ).rejects.toThrow("SENDER_OWNERSHIP_IMMUTABLE");
    await expect(db.remove("organizations", { id: b })).rejects.toThrow(
      "CLOSE_ORGANIZATION_INSTEAD",
    );
  });
  it("supports requesting information and tenant-scoped resubmission without transferring ownership", async () => {
    const sender = (await db.list("sender_ids"))[0];
    await db.rpc("update_sender_workflow", {
      p_sender: sender.id,
      p_status: "draft",
      p_reference: "",
      p_notes: "Upload business registration",
      p_evidence: "",
      p_actor: null,
      p_demo: true,
    });
    const details = {
      sender_name: "ATTEMPTED",
      legal_business_name: "A Company",
      purpose: "Customer orders",
      sample_message: "Your order is ready",
    };
    await expect(
      db.rpc("resubmit_sender", {
        p_org: b,
        p_sender: sender.id,
        p_details: details,
        p_actor: null,
      }),
    ).rejects.toThrow("NOT_FOUND");
    const result = await db.rpc("resubmit_sender", {
      p_org: a,
      p_sender: sender.id,
      p_details: details,
      p_actor: null,
    });
    expect(result).toMatchObject({
      status: "submitted",
      sender_name: "BRANDA",
      organization_id: a,
    });
    expect(
      await db.list("audit_logs", { resource_id: sender.id }),
    ).toHaveLength(2);
  });
  it("enforces RLS across every tenant-readable organization-owned table", async () => {
    await pg.exec(
      `insert into auth.users(id) values ('${b}') on conflict do nothing; insert into organization_members(organization_id,user_id,role_id) values ('${b}','${b}','owner');`,
    );
    await allocate(a, 1000);
    await campaign(100);
    const tables = (
      await pg.query<{ table_name: string }>(
        "select c.table_name from information_schema.columns c join pg_class t on t.relname=c.table_name join pg_namespace n on n.oid=t.relnamespace where c.table_schema='public' and c.column_name='organization_id' and n.nspname='public' and t.relkind='r'",
      )
    ).rows;
    await pg.exec("set role authenticated");
    try {
      await pg.query("select set_config('request.jwt.claim.sub',$1,false)", [
        b,
      ]);
      for (const { table_name } of tables) {
        const access = (
          await pg.query<{ allowed: boolean }>(
            "select has_column_privilege(current_user,$1,'organization_id','SELECT') as allowed",
            [table_name],
          )
        ).rows[0].allowed;
        if (access) {
          const rows = (
            await pg.query<{ organization_id: string }>(
              `select organization_id from "${table_name}"`,
            )
          ).rows;
          expect(
            rows.every((row) => row.organization_id === b),
            table_name,
          ).toBe(true);
        } else {
          await expect(
            pg.query(`select organization_id from "${table_name}"`),
          ).rejects.toThrow("permission denied");
        }
      }
      expect(
        (await pg.query("select organization_id from sms_wallets")).rows,
      ).toHaveLength(1);
    } finally {
      await pg.exec("reset role");
    }
  });
  it("keeps order creation, payment submission, approval, invoice and ledger linked exactly once", async () => {
    const args = {
      p_org: a,
      p_units: 1,
      p_package: null,
      p_key: "one-credit-order",
      p_actor: null,
    };
    const order = await db.rpc("create_sms_order", args);
    expect(order).toMatchObject({ status: "awaiting_payment", sms_units: 1 });
    expect(Number(order.amount)).toBe(22);
    expect((await db.rpc("create_sms_order", args)).id).toBe(order.id);
    expect(await db.list("wallet_transactions")).toHaveLength(0);
    const paymentArgs = {
      p_org: a,
      p_id: order.id,
      p_method: "mobile_money",
      p_reference: " bank123 ",
      p_actor: null,
    };
    await db.rpc("submit_order_payment", paymentArgs);
    await db.rpc("submit_order_payment", paymentArgs);
    expect(
      await db.list("order_events", { payment_id: order.id }),
    ).toHaveLength(2);
    const approval = {
      p_id: order.id,
      p_actor: null,
      p_decision: "approved",
      p_received: 22,
      p_currency: "TZS",
      p_receipt: "bank123",
      p_notes: "Matched customer transfer receipt",
      p_confirmed: true,
    };
    await expect(
      db.rpc("review_order", { ...approval, p_received: 21 }),
    ).rejects.toThrow("PAYMENT_EVIDENCE_REQUIRED");
    await expect(
      db.rpc("review_order", { ...approval, p_confirmed: false }),
    ).rejects.toThrow("PAYMENT_EVIDENCE_REQUIRED");
    await Promise.all([
      db.rpc("review_order", approval),
      db.rpc("review_order", approval),
    ]);
    expect((await db.list("payments", { id: order.id }))[0].status).toBe(
      "verified",
    );
    expect(await db.list("invoices", { payment_id: order.id })).toHaveLength(1);
    const ledger = await db.list("wallet_transactions", {
      reference_id: order.id,
    });
    expect(ledger).toHaveLength(1);
    expect(ledger[0].reference_type).toBe("payment");
    expect(ledger[0].description).toContain(order.order_reference);
    expect(
      await db.list("payment_reviews", { payment_id: order.id }),
    ).toHaveLength(1);
    expect(
      await db.list("order_events", { payment_id: order.id }),
    ).toHaveLength(3);
    expect(
      (await db.list("sms_wallets", { organization_id: a }))[0].available_units,
    ).toBe(1);
    await expect(
      db.rpc("verify_payment", { p_id: order.id, p_actor: null }),
    ).rejects.toThrow("PAYMENT_EVIDENCE_REQUIRED");
    await expect(
      db.update("payments", { id: order.id }, { amount: 1 }),
    ).rejects.toThrow("ORDER_RECORD_IMMUTABLE");
  });
  it("prices retail boundaries from one SMS and settles ClickPesa exactly once", async () => {
    const cases = [
      [1, 22],
      [10, 220],
      [1000, 22000],
      [1001, 22022],
      [29999, 659978],
      [30000, 600000],
    ];
    for (const [units, amount] of cases) {
      const order = await db.rpc("create_clickpesa_payment", {
        p_org: a,
        p_units: units,
        p_reference: `GVS${units}`,
      });
      expect(Number(order.amount)).toBe(amount);
    }

    const payment = (await db.list("payments", {
      organization_id: a,
      payment_reference: "GVS1",
    }))[0];
    const settle = {
      p_reference: "GVS1",
      p_transaction: "CP-TRANSACTION-1",
      p_amount: 22,
      p_currency: "TZS",
    };
    await expect(
      db.rpc("settle_clickpesa_payment", { ...settle, p_amount: 21 }),
    ).rejects.toThrow("PAYMENT_MISMATCH");
    await expect(
      db.rpc("settle_clickpesa_payment", { ...settle, p_currency: "USD" }),
    ).rejects.toThrow("PAYMENT_MISMATCH");
    await expect(
      db.rpc("settle_clickpesa_payment", { ...settle, p_reference: "WRONG" }),
    ).rejects.toThrow("NOT_FOUND");
    await expect(
      db.rpc("review_order", {
        p_id: payment.id,
        p_decision: "approved",
        p_received: 22,
        p_currency: "TZS",
        p_receipt: "MANUAL-ATTEMPT",
        p_notes: "Must not approve ClickPesa manually",
        p_confirmed: true,
        p_actor: null,
      }),
    ).rejects.toThrow("CLICKPESA_REQUIRES_PROVIDER_CONFIRMATION");
    await db.rpc("settle_clickpesa_payment", settle);
    await db.rpc("settle_clickpesa_payment", settle);
    expect((await db.list("payments", { id: payment.id }))[0]).toMatchObject({
      status: "verified",
      clickpesa_payment_reference: "CP-TRANSACTION-1",
    });
    expect(await db.list("invoices", { payment_id: payment.id })).toHaveLength(1);
    expect(
      await db.list("wallet_transactions", { reference_id: payment.id }),
    ).toHaveLength(1);
  });
  it("rejects duplicate payment references across tenants and preserves rejection/resubmission history", async () => {
    const first = await db.rpc("create_sms_order", {
      p_org: a,
      p_units: 1,
      p_package: null,
      p_key: "first",
      p_actor: null,
    });
    const second = await db.rpc("create_sms_order", {
      p_org: b,
      p_units: 1,
      p_package: null,
      p_key: "second",
      p_actor: null,
    });
    await db.rpc("submit_order_payment", {
      p_org: a,
      p_id: first.id,
      p_method: "manual",
      p_reference: "receipt-123",
      p_actor: null,
    });
    await expect(
      db.rpc("submit_order_payment", {
        p_org: b,
        p_id: second.id,
        p_method: "manual",
        p_reference: " RECEIPT-123 ",
        p_actor: null,
      }),
    ).rejects.toThrow("PAYMENT_REFERENCE_USED");
    await expect(
      db.rpc("submit_order_payment", {
        p_org: b,
        p_id: first.id,
        p_method: "manual",
        p_reference: "other",
        p_actor: null,
      }),
    ).rejects.toThrow("NOT_FOUND");
    await db.rpc("review_order", {
      p_id: first.id,
      p_decision: "rejected",
      p_received: null,
      p_currency: null,
      p_receipt: null,
      p_notes: "Receipt not found; correct the reference",
      p_confirmed: false,
      p_actor: null,
    });
    expect(await db.list("invoices")).toHaveLength(0);
    expect(await db.list("wallet_transactions")).toHaveLength(0);
    await db.rpc("submit_order_payment", {
      p_org: a,
      p_id: first.id,
      p_method: "bank_transfer",
      p_reference: "corrected-123",
      p_actor: null,
    });
    expect((await db.list("payments", { id: first.id }))[0].status).toBe(
      "pending",
    );
    expect(
      await db.list("order_events", { payment_id: first.id }),
    ).toHaveLength(4);
    expect(
      (await db.list("payment_reviews", { payment_id: first.id }))[0].notes,
    ).toContain("Receipt not found");
  });
  it("prevents reusing one verified receipt for two different orders", async () => {
    const review = {
      p_decision: "approved",
      p_received: 22,
      p_currency: "TZS",
      p_receipt: "actual-receipt",
      p_notes: "Verified receipt",
      p_confirmed: true,
      p_actor: null,
    };
    const first = await db.rpc("create_retail_payment", {
      p_org: a,
      p_units: 1,
      p_reference: "claimed-first",
    });
    const second = await db.rpc("create_retail_payment", {
      p_org: b,
      p_units: 1,
      p_reference: "claimed-second",
    });
    await db.rpc("review_order", { ...review, p_id: first.id });
    await expect(
      db.rpc("review_order", { ...review, p_id: second.id }),
    ).rejects.toThrow("PAYMENT_REFERENCE_USED");
    expect((await db.list("payments", { id: second.id }))[0].status).toBe(
      "pending",
    );
  });
  it("makes legacy package payment retries idempotent", async () => {
    const pkg = await db.insert("sms_packages", {
      name: "One credit",
      sms_units: 1,
      selling_price: 22,
      currency: "TZS",
    });
    const args = {
      p_org: a,
      p_package: pkg.id,
      p_reference: "package-receipt",
      p_actor: null,
    };
    const one = await db.rpc("create_package_payment", args);
    expect((await db.rpc("create_package_payment", args)).id).toBe(one.id);
    expect(await db.list("payments", { organization_id: a })).toHaveLength(1);
  });
  it("resets credits through the ledger while preserving paid orders, invoices and provider stock", async () => {
    const order = await db.rpc("create_retail_payment", {
      p_org: a,
      p_units: 9988,
      p_reference: "reset-order-payment",
    });
    await db.rpc("review_order", {
      p_id: order.id,
      p_decision: "approved",
      p_received: order.amount,
      p_currency: order.currency,
      p_receipt: "reset-order-payment",
      p_notes: "Receipt checked for fixture",
      p_confirmed: true,
      p_actor: null,
    });
    const before = await status();
    const args = {
      p_org: a,
      p_expected_available: 9988,
      p_reference: "owner-reset",
      p_reason: "Owner authorized a fresh start",
      p_confirmed: true,
      p_actor: null,
    };
    const reset = await db.rpc("reset_sms_wallet", args);
    expect(reset).toMatchObject({
      type: "wallet_reset",
      direction: "debit",
      units: 9988,
      balance_before: 9988,
      balance_after: 0,
    });
    expect((await status()).balance).toBe(before.balance);
    expect((await status()).available_to_allocate).toBe(10000);
    expect((await db.list("payments", { id: order.id }))[0].status).toBe(
      "verified",
    );
    expect(await db.list("invoices", { payment_id: order.id })).toHaveLength(1);
    expect(
      await db.list("wallet_transactions", { organization_id: a }),
    ).toHaveLength(2);
    expect(
      (await db.list("audit_logs", { action: "wallet.reset" }))[0].details
        .available_before,
    ).toBe(9988);
    await allocate(a, 1);
    expect((await db.rpc("reset_sms_wallet", args)).id).toBe(reset.id);
    expect(
      (await db.list("sms_wallets", { organization_id: a }))[0].available_units,
    ).toBe(1);
  });
  it("requires reset confirmation and rejects a stale balance or reserved campaigns", async () => {
    await allocate(a, 100);
    const args = {
      p_org: a,
      p_expected_available: 100,
      p_reference: "guarded-reset",
      p_reason: "Owner authorized a reset",
      p_confirmed: true,
      p_actor: null,
    };
    await expect(
      db.rpc("reset_sms_wallet", { ...args, p_confirmed: false }),
    ).rejects.toThrow("VALIDATION_FAILED");
    await expect(
      db.rpc("reset_sms_wallet", { ...args, p_expected_available: 99 }),
    ).rejects.toThrow("WALLET_BALANCE_CHANGED");
    await campaign(100);
    await expect(db.rpc("reset_sms_wallet", args)).rejects.toThrow(
      "WALLET_HAS_RESERVATIONS",
    );
    expect(
      (await db.list("sms_wallets", { organization_id: a }))[0],
    ).toMatchObject({ available_units: 0, reserved_units: 100 });
    expect(
      await db.list("wallet_transactions", { type: "wallet_reset" }),
    ).toHaveLength(0);
  });
  it("allows reset only through confirmed platform administration and records the administrator", async () => {
    await pg.exec(
      `insert into auth.users(id) values ('${a}') on conflict do nothing;insert into platform_admins values ('${a}') on conflict do nothing;`,
    );
    await allocate(a, 10);
    const identity: Identity = {
      userId: a,
      orgId: a,
      role: "owner",
      permissions: [],
      admin: false,
      test: false,
    };
    const handler = makeHandler(
      db,
      { SMS_PROVIDER: "mock", LOCAL_DEMO: "true" },
      async () => identity,
    );
    const body = {
      expected_available: 10,
      reference: "api-reset",
      reason: "Owner confirmed wallet reset",
    };
    const post = (value: object) =>
      handler(
        new Request("http://test/v1/platform/wallet-reset/" + a, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(value),
        }),
      );
    expect((await post({ ...body, confirmation: "RESET" })).status).toBe(403);
    identity.admin = true;
    expect((await post(body)).status).toBe(400);
    const response = await post({ ...body, confirmation: "RESET" });
    expect(response.status).toBe(201);
    expect((await response.json()).created_by).toBe(a);
  });
  it("rejects production mock fallback and missing provider configuration", () => {
    expect(() => getProvider({})).toThrow("explicitly");
    expect(() => getProvider({ SMS_PROVIDER: "mock" })).toThrow("LOCAL_DEMO");
    expect(getProvider({}, true).code).toBe("mock");
  });
  it("denies raw provider fields and financial RPCs to tenant database roles", async () => {
    await pg.exec("set role authenticated");
    try {
      await expect(
        pg.query("select provider_status from messages"),
      ).rejects.toThrow("permission denied");
      await expect(pg.query("select inventory_status()")).rejects.toThrow(
        "permission denied",
      );
      await expect(
        pg.query("select * from provider_balance_snapshots"),
      ).rejects.toThrow("permission denied");
      await expect(
        pg.query(
          "select private.bank_original_wallet_adjust($1,100,'ref','reason',null)",
          [a],
        ),
      ).rejects.toThrow("permission denied");
    } finally {
      await pg.exec("reset role");
    }
  });
});
