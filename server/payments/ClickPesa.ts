const BASE = "https://api.clickpesa.com/third-parties";
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, item]) => [key, canonical(item)]));
  return value;
}
export async function clickPesaChecksum(secret: string, payload: unknown) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key,
    new TextEncoder().encode(JSON.stringify(canonical(payload)))));
  return Array.from(bytes, (n) => n.toString(16).padStart(2, "0")).join("");
}

export async function clickPesaToken(env: Record<string, string | undefined>) {
  if (!env.CLICKPESA_CLIENT_ID || !env.CLICKPESA_API_KEY)
    throw new Error("ClickPesa is not configured");
  const response = await fetch(BASE + "/generate-token", {
    method: "POST",
    headers: { "client-id": env.CLICKPESA_CLIENT_ID, "api-key": env.CLICKPESA_API_KEY },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error("ClickPesa authorization failed");
  const data = await response.json();
  if (!data.success || typeof data.token !== "string") throw new Error("ClickPesa authorization failed");
  return data.token.startsWith("Bearer ") ? data.token : "Bearer " + data.token;
}

export async function clickPesaCheckout(env: Record<string, string | undefined>, order: {
  reference: string; amount: string; email: string; name: string; phone: string;
}) {
  const token = await clickPesaToken(env);
  const payload = {
    totalPrice: order.amount, orderCurrency: "TZS", orderReference: order.reference,
    customerEmail: order.email, customerName: order.name, customerPhone: order.phone,
    description: "Gramvista SMS credits",
    ...(env.CLICKPESA_CALLBACK_URL
      ? { callbackUrl: validateCallbackUrl(env.CLICKPESA_CALLBACK_URL) }
      : {}),
  };
  const response = await fetch(BASE + "/checkout-link/generate-checkout-url", {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: JSON.stringify({
      ...payload,
      ...(env.CLICKPESA_CHECKSUM_KEY
        ? { checksum: await clickPesaChecksum(env.CLICKPESA_CHECKSUM_KEY, payload) }
        : {}),
    }),
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) {
    const providerError = await response.text();
    // This is logged only by the server-side caller. Limit its size so an
    // upstream HTML/error response cannot flood function logs.
    throw new Error(
      `ClickPesa checkout rejected (${response.status}): ${providerError.slice(0, 500)}`,
    );
  }
  const data = await response.json();
  if (typeof data.checkoutLink !== "string" || !data.checkoutLink.startsWith("https://"))
    throw new Error("ClickPesa returned an invalid checkout link");
  return data.checkoutLink as string;
}

export async function clickPesaUssdPush(env: Record<string, string | undefined>, order: {
  reference: string; amount: string; phone: string;
}) {
  if (!/^[A-Za-z0-9]{1,20}$/.test(order.reference))
    throw new Error("ClickPesa order reference must be at most 20 alphanumeric characters");
  if (!/^255\d{9}$/.test(order.phone))
    throw new Error("ClickPesa phone number is invalid");
  const token = await clickPesaToken(env);
  const payload = {
    amount: order.amount,
    currency: "TZS",
    orderReference: order.reference,
    phoneNumber: order.phone,
  };
  const response = await fetch(BASE + "/payments/initiate-ussd-push-request", {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: JSON.stringify({
      ...payload,
      ...(env.CLICKPESA_CHECKSUM_KEY
        ? { checksum: await clickPesaChecksum(env.CLICKPESA_CHECKSUM_KEY, payload) }
        : {}),
    }),
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) {
    const providerError = await response.text();
    throw new Error(
      `ClickPesa USSD Push rejected (${response.status}): ${providerError.slice(0, 500)}`,
    );
  }
  const data = await response.json();
  if (data.orderReference !== order.reference ||
      !["PROCESSING", "SUCCESS", "SETTLED"].includes(data.status))
    throw new Error("ClickPesa returned an invalid USSD Push response");
  return data as Record<string, unknown>;
}

function validateCallbackUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:")
    throw new Error("ClickPesa callback URL must use HTTPS");
  return url.toString();
}

export async function clickPesaPayments(env: Record<string, string | undefined>, reference: string) {
  if (!/^[A-Za-z0-9]+$/.test(reference)) throw new Error("Invalid order reference");
  const token = await clickPesaToken(env);
  const response = await fetch(BASE + "/payments/" + reference, {
    headers: { Authorization: token }, signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error("ClickPesa payment query failed");
  const payments = await response.json();
  if (!Array.isArray(payments)) throw new Error("Invalid ClickPesa payment response");
  return payments as Array<Record<string, unknown>>;
}
