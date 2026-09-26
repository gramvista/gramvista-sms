import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
const project = "sscleaiwktklkuxqqndf";
const url = `https://${project}.supabase.co`;
const keyResult = spawnSync(
  "cmd.exe",
  [
    "/d",
    "/s",
    "/c",
    `npx.cmd --yes supabase projects api-keys --project-ref ${project} --reveal --output json`,
  ],
  { encoding: "utf8" },
);
assert.equal(keyResult.status, 0, "Authorized project credentials unavailable");
const keys = JSON.parse(keyResult.stdout);
const admin = createClient(
  url,
  keys.find((k) => k.name === "service_role").api_key,
  { auth: { persistSession: false } },
);
const client = createClient(url, keys.find((k) => k.name === "anon").api_key, {
  auth: { persistSession: false },
});
let user, org, token;
const report = { checks: [], cleanup: false };
function pass(name) {
  report.checks.push(name);
  console.log("PASS: " + name);
}
async function api(path, method = "GET", body) {
  const r = await fetch(url + "/functions/v1/public-api/v1/" + path, {
    method,
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json() };
}
try {
  const email = "gramvista-retail-smoke-" + randomUUID() + "@example.invalid",
    password = randomBytes(32).toString("hex");
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { purpose: "temporary retail deployment verification" },
  });
  assert.ifError(created.error);
  user = created.data.user.id;
  const login = await client.auth.signInWithPassword({ email, password });
  assert.ifError(login.error);
  token = login.data.session.access_token;
  const onboard = await admin.rpc("onboard", {
    p_user: user,
    p_name: "TEMPORARY RETAIL VERIFICATION",
    p_legal: "Temporary verification",
    p_phone: "+255712345678",
    p_email: email,
    p_type: "Test",
    p_country: "TZ",
  });
  assert.ifError(onboard.error);
  org = onboard.data.id;
  const pricing = await api("pricing");
  assert.equal(pricing.status, 200);
  assert.deepEqual(
    pricing.body.data.map((t) => [
      Number(t.min_units),
      Number(t.max_units),
      Number(t.price_per_unit),
    ]),
    [
      [1001, 29999, 22],
      [30000, 49999, 20],
      [50000, 199999, 19],
      [200000, 499999, 18],
      [500000, 1000000, 15],
    ],
  );
  pass("Hosted API publishes the five approved retail ranges");
  const body = {
    sms_units: 30000,
    reference: "retail-smoke-" + randomUUID(),
    amount: 1,
  };
  const payment = await api("retail-payments", "POST", body);
  assert.equal(payment.status, 201);
  assert.equal(Number(payment.body.amount), 600000);
  pass(
    "Hosted API calculates TSh 600,000 for 30,000 credits regardless of client amount",
  );
  const retry = await api("retail-payments", "POST", body);
  assert.equal(retry.body.id, payment.body.id);
  pass("Repeated payment submission returns the same payment");
  const invalid = await api("retail-payments", "POST", {
    sms_units: 1000,
    reference: randomUUID(),
  });
  assert.equal(invalid.body.error.code, "CUSTOM_QUOTE_REQUIRED");
  pass("Unpriced quantities require a custom quote");
  const balance = await api("balance");
  assert.equal(Number(balance.body.available_sms), 0);
  pass("Pending payment does not create credits");
  assert.equal((await api("platform/sender-records")).status, 403);
  pass("Customer cannot access provider approval records");
  const sender = await admin
    .from("sender_ids")
    .insert({
      organization_id: org,
      sender_name: "TESTREVIEW",
      legal_business_name: "Temporary verification",
      purpose: "No live submission",
      sample_message: "Temporary verification only",
    })
    .select()
    .single();
  assert.ifError(sender.error);
  const approval = await admin.rpc("update_sender_workflow", {
    p_sender: sender.data.id,
    p_status: "approved",
    p_reference: "",
    p_notes: "",
    p_evidence: "",
    p_actor: user,
    p_demo: false,
  });
  assert(approval.error?.message.includes("PROVIDER_REFERENCE_REQUIRED"));
  pass("Hosted approval function rejects missing Kilakona evidence");
} finally {
  if (org) {
    const ledger = await admin
      .from("wallet_transactions")
      .select("id")
      .eq("organization_id", org);
    assert.ifError(ledger.error);
    assert.equal(
      ledger.data.length,
      0,
      "Unexpected financial records: preserve fixture for inspection",
    );
    for (const table of [
      "sender_id_provider_records",
      "sender_ids",
      "payments",
      "notifications",
      "audit_logs",
      "organization_members",
      "sms_wallets",
    ]) {
      const r = await admin.from(table).delete().eq("organization_id", org);
      assert.ifError(r.error);
    }
    const r = await admin.from("organizations").delete().eq("id", org);
    assert.ifError(r.error);
  }
  if (user) {
    const p = await admin.from("profiles").delete().eq("id", user);
    assert.ifError(p.error);
    const r = await admin.auth.admin.deleteUser(user);
    assert.ifError(r.error);
  }
  report.cleanup = true;
  writeFileSync(
    ".local/cloud-retail-smoke-report.json",
    JSON.stringify(report, null, 2),
  );
  console.log(
    "Temporary verification data removed; no SMS sent or credits allocated.",
  );
}
