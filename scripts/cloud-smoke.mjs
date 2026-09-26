import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const url = "https://sscleaiwktklkuxqqndf.supabase.co";
const base = url + "/functions/v1/public-api/v1/";
const keyResult = spawnSync(
  "cmd.exe",
  [
    "/d",
    "/s",
    "/c",
    "npx.cmd --yes supabase projects api-keys --project-ref sscleaiwktklkuxqqndf --reveal --output json",
  ],
  { encoding: "utf8" },
);
assert.equal(
  keyResult.status,
  0,
  "Cannot retrieve authorized project credentials",
);
const keys = JSON.parse(keyResult.stdout);
const serviceKey = keys.find((k) => k.name === "service_role")?.api_key;
const anonKey = keys.find((k) => k.name === "anon")?.api_key;
assert(serviceKey && anonKey, "Project keys unavailable");
const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const env = process.env;
if (!env.WORKER_SECRET) throw new Error("Set WORKER_SECRET in the process environment before running this script.");
const users = [];
const orgs = [];
const objects = [];
let browser;
const report = { project: "sscleaiwktklkuxqqndf", checks: [], cleanup: false };
function check(name) {
  report.checks.push(name);
  console.log("PASS: " + name);
}
async function api(path, token, method = "GET", body, idem) {
  const res = await fetch(base + path, {
    method,
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      ...(idem ? { "Idempotency-Key": idem } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  return { ...json, httpStatus: res.status };
}
async function fixture() {
  const email = "gramvista-smoke-" + randomUUID() + "@example.invalid";
  const password = randomBytes(32).toString("hex");
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { purpose: "temporary deployment verification" },
  });
  assert.ifError(error);
  users.push(data.user.id);
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signed = await client.auth.signInWithPassword({ email, password });
  assert.ifError(signed.error);
  const token = signed.data.session.access_token;
  const org = await api("onboard", token, "POST", {
    name: "Temporary deployment verification",
    legal_name: "Temporary deployment verification",
    phone: "+255700000123",
    email,
    business_type: "Deployment test",
    country: "TZ",
  });
  assert.equal(org.httpStatus, 201, org.error?.message);
  orgs.push(org.id);
  writeFileSync(
    ".local/cloud-smoke-fixtures.json",
    JSON.stringify({ users, orgs, objects }),
  );
  return { email, password, client, token, org: org.id };
}
try {
  const noAuth = await fetch(base + "balance");
  assert.equal(noAuth.status, 401);
  check("Unauthenticated API access is rejected");
  const a = await fixture();
  const b = await fixture();
  check("Real Supabase Auth sign-in and organization onboarding");
  const balance = await api("balance", a.token);
  assert.equal(balance.available_sms, 0);
  assert.equal(balance.reserved_sms, 0);
  check("New hosted wallet has zero SMS credits");
  const own = await a.client.from("sms_wallets").select("organization_id");
  assert.ifError(own.error);
  assert.equal(own.data.length, 1);
  assert.equal(own.data[0].organization_id, a.org);
  const other = await b.client
    .from("sms_wallets")
    .select("organization_id")
    .eq("organization_id", a.org);
  assert.ifError(other.error);
  assert.equal(other.data.length, 0);
  const denied = await a.client
    .from("sms_wallets")
    .update({ available_units: 1000 })
    .eq("organization_id", a.org);
  assert(denied.error);
  check("Hosted RLS tenant isolation and direct wallet-write denial");
  const sender = await api("sender-ids", a.token, "POST", {
    sender_name: "GVSCHECK",
    legal_business_name: "Temporary deployment verification",
    purpose: "Simulated deployment validation",
    sample_message: "Test only",
  });
  assert.equal(sender.httpStatus, 201, sender.error?.message);
  const approved = await admin
    .from("sender_ids")
    .update({ status: "approved" })
    .eq("id", sender.id)
    .eq("organization_id", a.org);
  assert.ifError(approved.error);
  const key = await api("api-keys", a.token, "POST", {
    name: "Temporary deployment verification",
    environment: "test",
    permissions: [
      "messages.send",
      "messages.read",
      "campaigns.read",
      "wallet.read",
      "sender_ids.read",
    ],
  });
  assert.equal(key.httpStatus, 201, key.error?.message);
  const payload = {
    sender_id: "GVSCHECK",
    message: "Simulated Gramvista cloud verification.",
    recipients: ["+255700000123", "+255700000000"],
  };
  const idem = randomUUID();
  const sent = await api("messages", key.key, "POST", payload, idem);
  assert.equal(sent.httpStatus, 201, sent.error?.message);
  assert.equal(sent.test_mode, true);
  const retried = await api("messages", key.key, "POST", payload, idem);
  assert.equal(retried.message_batch_id, sent.message_batch_id);
  check("Hashed test API key and idempotent hosted send");
  const worker = await fetch(url + "/functions/v1/worker", {
    method: "POST",
    headers: { Authorization: "Bearer " + env.WORKER_SECRET },
    signal: AbortSignal.timeout(120000),
  });
  const worked = await worker.json();
  assert.equal(worker.status, 200, worked.error);
  report.balance_synced = worked.balance_synced;
  let messages;
  for (let i = 0; i < 12; i++) {
    messages = await api(
      "campaigns/" + sent.message_batch_id + "/messages",
      key.key,
    );
    if (
      messages.data?.length === 2 &&
      messages.data.every((m) => ["delivered", "failed"].includes(m.status))
    )
      break;
    await new Promise((r) => setTimeout(r, 5000));
  }
  assert.equal(messages.data?.length, 2);
  assert(messages.data.some((m) => m.status === "delivered"));
  assert(messages.data.some((m) => m.status === "failed"));
  check("Hosted worker processes test jobs and reconciles delivery");
  assert.equal((await api("balance", key.key)).available_sms, 0);
  const ledger = await admin
    .from("wallet_transactions")
    .select("id")
    .in("organization_id", orgs);
  assert.ifError(ledger.error);
  assert.equal(ledger.data.length, 0);
  check(
    "Verification consumed no credits and created no financial ledger entries",
  );
  const leaked = await api(
    "messages/" + messages.data[0].message_reference,
    b.token,
  );
  assert.equal(leaked.httpStatus, 404);
  check("Cross-tenant message API access is rejected");
  const storagePath = a.org + "/" + sender.id + "/" + randomUUID() + ".pdf";
  const upload = await a.client.storage
    .from("sender-documents")
    .upload(
      storagePath,
      new Blob(["%PDF-1.4\n% Temporary verification document\n%%EOF"], {
        type: "application/pdf",
      }),
    );
  assert.ifError(upload.error);
  objects.push(storagePath);
  const metadata = await api("sender-documents", a.token, "POST", {
    sender_id_id: sender.id,
    storage_path: storagePath,
    document_type: "test_document",
  });
  assert.equal(metadata.httpStatus, 201, metadata.error?.message);
  const signed = await a.client.storage
    .from("sender-documents")
    .createSignedUrl(storagePath, 60);
  assert.ifError(signed.error);
  assert.equal((await fetch(signed.data.signedUrl)).status, 200);
  const forbidden = await b.client.storage
    .from("sender-documents")
    .createSignedUrl(storagePath, 60);
  assert(forbidden.error);
  check("Private document upload, signed download and cross-tenant denial");
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.goto("http://127.0.0.1:5173/login");
  await page.getByLabel("Email address").fill(a.email);
  await page.getByLabel("Password", { exact: true }).fill(a.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page
    .getByRole("heading", { name: /Welcome back/ })
    .waitFor({ timeout: 30000 });
  await page.screenshot({ path: ".local/cloud-dashboard.png", fullPage: true });
  assert.equal(pageErrors.length, 0, pageErrors.join("; "));
  check(
    "Browser signs in against hosted Supabase and renders the real dashboard",
  );
  const live = await api("messages", a.token, "POST", payload, randomUUID());
  assert.equal(live.httpStatus, 503);
  assert.equal(live.error.code, "LIVE_SENDING_NOT_READY");
  check(
    "Live sends remain blocked until billing and batch limits are confirmed",
  );
  const revoke = await api("api-keys/" + key.id, a.token, "DELETE");
  assert.equal(revoke.httpStatus, 200);
  assert.equal((await api("balance", key.key)).httpStatus, 401);
  check("Hosted API key revocation is enforced");
  const snapshots = await admin
    .from("provider_balance_snapshots")
    .select("provider,balance_sms,success,checked_at")
    .eq("provider", "kilakona")
    .order("checked_at", { ascending: false })
    .limit(1);
  report.provider_snapshot = snapshots.data?.[0] ?? null;
  console.log(
    "Provider balance check: " +
      (report.provider_snapshot?.success ? "successful" : "not yet successful"),
  );
} finally {
  await browser?.close();
  if (objects.length) {
    const removed = await admin.storage
      .from("sender-documents")
      .remove(objects);
    assert.ifError(removed.error);
  }
  if (orgs.length) {
    const ledger = await admin
      .from("wallet_transactions")
      .select("id")
      .in("organization_id", orgs);
    assert.ifError(ledger.error);
    assert.equal(
      ledger.data.length,
      0,
      "Unexpected ledger rows: retain fixtures for investigation",
    );
    const subs = await admin
      .from("provider_submissions")
      .select("id")
      .in("organization_id", orgs);
    assert.ifError(subs.error);
    if (subs.data.length) {
      const removed = await admin
        .from("provider_usage")
        .delete()
        .in(
          "provider_submission_id",
          subs.data.map((s) => s.id),
        );
      assert.ifError(removed.error);
    }
    for (const table of [
      "api_requests",
      "api_keys",
      "webhook_deliveries",
      "webhook_endpoints",
      "provider_submissions",
      "messages",
      "wallet_reservations",
      "campaign_jobs",
      "idempotency_keys",
      "campaigns",
      "sender_id_documents",
      "sender_id_provider_records",
      "sender_ids",
      "contact_group_members",
      "contact_tags",
      "contacts",
      "contact_groups",
      "suppression_list",
      "message_templates",
      "invoices",
      "payments",
      "notifications",
      "audit_logs",
      "organization_invitations",
      "organization_members",
      "sms_wallets",
    ]) {
      const removed = await admin
        .from(table)
        .delete()
        .in("organization_id", orgs);
      assert.ifError(removed.error);
    }
    const removed = await admin.from("organizations").delete().in("id", orgs);
    assert.ifError(removed.error);
  }
  for (const id of users) {
    const profile = await admin.from("profiles").delete().eq("id", id);
    assert.ifError(profile.error);
    const deleted = await admin.auth.admin.deleteUser(id);
    assert.ifError(deleted.error);
  }
  report.cleanup = true;
  writeFileSync(
    ".local/cloud-smoke-report.json",
    JSON.stringify(report, null, 2),
  );
  console.log("Temporary verification users, data and documents removed.");
}
