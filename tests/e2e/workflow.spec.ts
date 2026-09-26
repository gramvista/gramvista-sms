import { test, expect } from "@playwright/test";
test.beforeAll(async ({ request }) => {
  await expect
    .poll(
      async () => {
        try {
          return (await request.get("/api/v1/session")).status();
        } catch {
          return 0;
        }
      },
      { timeout: 60000 },
    )
    .toBe(200);
});
test("organization → credit → approved sender → contact → campaign → delivery", async ({
  page,
  request,
}) => {
  await page.goto("/");
  if (
    await page
      .getByRole("heading", { name: "Your business, on Gramvista." })
      .isVisible()
  ) {
    await page
      .getByLabel("Business name", { exact: true })
      .fill("Acacia Trading");
    await page
      .getByLabel("Legal name", { exact: true })
      .fill("Acacia Trading Limited");
    await page.getByLabel("Business email").fill("hello@acacia.test");
    await page.getByLabel("Phone", { exact: true }).fill("+255712345678");
    await page.getByRole("button", { name: "Create workspace" }).click();
  }
  await expect(
    page.getByRole("heading", { name: /Welcome back/ }),
  ).toBeVisible();
  const session = await (await request.get("/api/v1/session")).json();
  const org = session.organization.id;
  await request.patch("/api/v1/settings", {
    data: {
      name: "Acacia Trading",
      timezone: "Africa/Dar_es_Salaam",
      quiet_start: 0,
      quiet_end: 0,
    },
  });
  await page.goto("/platform");
  await page
    .getByRole("button", { name: "Adjust wallet", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Organization", exact: true })
    .selectOption(org);
  await page.getByLabel("SMS units", { exact: true }).fill("1000");
  await page
    .getByLabel("Payment / adjustment reference")
    .fill("e2e-" + Date.now());
  await page
    .getByLabel("Reason and notes")
    .fill("Development workflow test credit");
  await page.getByRole("button", { name: "Record wallet adjustment" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  const brand = "A" + Date.now().toString().slice(-9);
  await page.goto("/sender-ids");
  await page
    .getByRole("button", { name: "Request Sender ID", exact: true })
    .click();
  await page.getByLabel("Sender name").fill(brand);
  await page.getByLabel("Legal business name").fill("Acacia Trading Limited");
  await page
    .getByLabel("Messaging purpose")
    .fill("Customer order notifications");
  await page.getByLabel("Sample message").fill("Your order is ready.");
  await page.getByLabel("Contact name", { exact: true }).fill("Acacia Team");
  await page.getByLabel("Contact phone").fill("+255712345678");
  await page.getByLabel("Contact email").fill("hello@acacia.test");
  await page.getByRole("button", { name: "Save Sender ID request" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect((await request.post("/api/v1/platform/sync-balance", {
    headers: { "X-Demo-Role": "platform" },
  })).ok()).toBe(true);
  await page.goto("/platform");
  await page.getByRole("button", { name: "senders", exact: true }).click();
  await page
    .getByRole("row")
    .filter({ hasText: brand })
    .getByRole("button", { name: "Review / submit to Kilakona" })
    .click();
  await page
    .getByRole("combobox", { name: "Approval status", exact: true })
    .selectOption("approved");
  await page
    .getByLabel("Kilakona ticket / submission / approval reference")
    .fill("DEMO-APPROVAL");
  await page
    .getByLabel("Kilakona approval evidence")
    .fill("Simulated approval for isolated demo testing only.");
  await page.getByRole("button", { name: "Save review", exact: true }).click();
  await expect(page.getByText("Operation completed.")).toBeVisible();
  await page.goto("/contacts");
  await page.getByRole("button", { name: "Add contact", exact: true }).click();
  await page.getByLabel("First name").fill("Amina");
  await page.getByLabel("Last name").fill("Customer");
  await page
    .getByLabel("Phone number")
    .fill("+2557" + Date.now().toString().slice(-8));
  await page.getByLabel("Email", { exact: true }).fill("amina@example.test");
  await page.getByRole("button", { name: "Save contact", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Amina", exact: true }).first(),
  ).toBeVisible();
  await page.goto("/campaigns/new");
  await page
    .getByLabel("Campaign name", { exact: true })
    .fill("Customer order update");
  await page
    .getByRole("combobox", { name: "Sender ID", exact: true })
    .selectOption(brand);
  await page
    .getByRole("textbox", { name: /^Recipients/ })
    .fill("+255712345678\n0712345678\nbad-number\n+255754123456");
  await page
    .getByLabel("Message", { exact: true })
    .fill(
      "Hello from Acacia Trading. Your order is ready for collection. Thank you for shopping with us!",
    );
  await expect(page.getByText("2 eligible", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Review campaign" }).click();
  await page.getByRole("button", { name: "Confirm & send" }).click();
  await expect(
    page.getByRole("heading", { name: "Campaigns", exact: true }),
  ).toBeVisible();
  await expect
    .poll(
      async () => {
        const data = await (await request.get("/api/v1/messages")).json();
        return data.data.filter((m: any) => m.status === "delivered").length;
      },
      { timeout: 20000 },
    )
    .toBeGreaterThanOrEqual(2);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Welcome back/ }),
  ).toBeVisible();
  await page.screenshot({
    path: ".local/dashboard-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: /Welcome back/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(
    page.getByRole("link", { name: "Send SMS", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Contacts", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your contacts" }),
  ).toBeVisible();
  await page.screenshot({ path: ".local/contacts-mobile.png", fullPage: true });
});
test("packages, manual verification and all customer pages", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const pkg = await (
    await request.post("/api/v1/platform/packages", {
      headers: { "X-Demo-Role": "platform" },
      data: {
        name: "Demo package " + Date.now(),
        description: "Local test pricing only",
        sms_units: 100,
        selling_price: "1000.00",
        currency: "TZS",
      },
    })
  ).json();
  expect(pkg.id).toBeTruthy();
  await page.goto("/buy");
  await page.getByRole("button", { name: "Choose package" }).last().click();
  const reference = "payment-" + Date.now();
  await page
    .getByRole("dialog")
    .getByLabel("Payment reference", { exact: true })
    .fill(reference);
  await page.getByRole("button", { name: "Submit for verification" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.goto("/platform");
  await page.getByRole("button", { name: "payments", exact: true }).click();
  await page
    .getByRole("row")
    .filter({ hasText: reference })
    .getByRole("button", { name: "Review payment" })
    .click();
  const review = page.getByRole("dialog");
  await review.getByLabel(/Amount received/).fill("1000.00");
  await review.getByLabel("Verified receipt reference").fill(reference);
  await review.getByLabel(/I checked/).check();
  await review.getByLabel("Review notes / rejection reason").fill("E2E verified receipt");
  await review.getByRole("button", { name: "Confirm approval and allocation" }).click();
  await expect(review.getByText("Payment verified.")).toBeVisible();
  for (const route of [
    "campaigns",
    "contacts",
    "groups",
    "sender-ids",
    "messages",
    "reports",
    "wallet",
    "buy",
    "transactions",
    "templates",
    "developers",
    "webhooks",
    "team",
    "settings",
    "suppression",
  ]) {
    await page.goto("/" + route);
    await expect(page.locator("main h1")).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});
test("test API key sends without spending credits and revocation blocks reuse", async ({
  request,
}) => {
  const keyResponse = await request.post("/api/v1/api-keys", {
    data: {
      name: "E2E developer integration",
      environment: "test",
      permissions: [
        "messages.send",
        "messages.read",
        "wallet.read",
        "sender_ids.read",
      ],
    },
  });
  expect(keyResponse.status()).toBe(201);
  const key = await keyResponse.json();
  const headers = { Authorization: "Bearer " + key.key };
  const balance = await (
    await request.get("/api/v1/balance", { headers })
  ).json();
  const senders = await (
    await request.get("/api/v1/sender-ids", { headers })
  ).json();
  const sender = senders.data.find((s: any) => s.status === "approved");
  const idempotency = "key-e2e-" + Date.now();
  const payload = {
    sender_id: sender.sender_name,
    recipients: ["+255712345678"],
    message: "Gramvista API integration test.",
  };
  const send = await request.post("/api/v1/messages", {
    headers: { ...headers, "Idempotency-Key": idempotency },
    data: payload,
  });
  expect(send.status()).toBe(201);
  const result = await send.json();
  expect(result.test_mode).toBe(true);
  const retry = await (
    await request.post("/api/v1/messages", {
      headers: { ...headers, "Idempotency-Key": idempotency },
      data: payload,
    })
  ).json();
  expect(retry.message_batch_id).toBe(result.message_batch_id);
  const after = await (
    await request.get("/api/v1/balance", { headers })
  ).json();
  expect(after.available_sms).toBe(balance.available_sms);
  expect((await request.delete("/api/v1/api-keys/" + key.id)).ok()).toBe(true);
  expect((await request.get("/api/v1/balance", { headers })).status()).toBe(
    401,
  );
});

test("retail quantity pricing and verified wallet top-up", async ({
  page,
  request,
}) => {
  const before = await (await request.get("/api/v1/balance")).json();
  await page.goto("/buy");
  await page.getByLabel("Number of SMS credits").fill("30000");
  await expect(
    page.getByText("Total: TSh 600,000", { exact: true }),
  ).toBeVisible();
  const reference = "retail-browser-" + Date.now();
  const created = await request.post("/api/v1/retail-payments", {
    data: { sms_units: 30000, reference },
  });
  expect(created.status()).toBe(201);
  const pending = await (await request.get("/api/v1/balance")).json();
  expect(pending.available_sms).toBe(before.available_sms);
  expect((await request.post("/api/v1/platform/sync-balance", {
    headers: { "X-Demo-Role": "platform" },
  })).ok()).toBe(true);
  await page.goto("/platform");
  await page.getByRole("button", { name: "payments", exact: true }).click();
  await page
    .getByRole("row")
    .filter({ hasText: reference })
    .getByRole("button", { name: "Review payment" })
    .click();
  const review = page.getByRole("dialog");
  await review.getByLabel(/Amount received/).fill("600000");
  await review.getByLabel("Verified receipt reference").fill(reference);
  await review.getByLabel(/I checked/).check();
  await review.getByLabel("Review notes / rejection reason").fill("E2E verified receipt");
  await review.getByRole("button", { name: "Confirm approval and allocation" }).click();
  await expect(review.getByText("Payment verified.")).toBeVisible();
  const after = await (await request.get("/api/v1/balance")).json();
  expect(Number(after.available_sms)).toBe(
    Number(before.available_sms) + 30000,
  );
  await page.goto("/buy");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: ".local/retail-mobile.png", fullPage: true });
});
