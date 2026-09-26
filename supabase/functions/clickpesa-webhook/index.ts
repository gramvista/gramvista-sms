import { db } from "../_shared/database.ts";
import { clickPesaChecksum, clickPesaPayments } from "../../../server/payments/ClickPesa.ts";

function sameHex(a: string, b: string) {
  if (!/^[a-f0-9]{64}$/i.test(a) || !/^[a-f0-9]{64}$/i.test(b)) return false;
  let difference = 0;
  for (let i = 0; i < 64; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  const secret = Deno.env.get("CLICKPESA_CHECKSUM_KEY");
  try {
    const raw = await request.text();
    if (raw.length > 100000) return new Response(null, { status: 413 });
    const event = JSON.parse(raw);
    const received = event?.checksum;
    if (secret) {
      if (typeof received !== "string") return new Response(null, { status: 401 });
      const unsigned = { ...event };
      delete unsigned.checksum;
      delete unsigned.checksumMethod;
      const expected = await clickPesaChecksum(secret, unsigned);
      if (!sameHex(received, expected)) return new Response(null, { status: 401 });
    }
    if (event.event !== "PAYMENT RECEIVED" || event.data?.status !== "SUCCESS")
      return Response.json({ accepted: true });
    const reference = event.data.orderReference;
    // Accept current 20-character USSD references and earlier hosted-checkout
    // references so pending legacy payments can still settle safely.
    if (typeof reference !== "string" || !/^GVS(?:[A-F0-9]{17}|[A-F0-9]{32})$/.test(reference))
      return new Response(null, { status: 400 });
    const order = (await db.list("payments", {
      payment_reference: reference,
      method: "clickpesa",
    }))[0];
    if (!order) return new Response(null, { status: 404 });
    if (order.status === "verified" && order.clickpesa_payment_reference === event.data.paymentReference)
      return Response.json({ accepted: true });
    if (order.status !== "pending") return new Response(null, { status: 409 });
    // Query ClickPesa independently: never credit a wallet from callback fields alone.
    const payments = await clickPesaPayments(Deno.env.toObject(), reference);
    const match = payments.find((p) =>
      p.orderReference === reference &&
      (p.status === "SUCCESS" || p.status === "SETTLED") &&
      p.clientId === Deno.env.get("CLICKPESA_CLIENT_ID") &&
      p.paymentReference === event.data.paymentReference &&
      p.collectedCurrency === order.currency &&
      /^\d+(?:\.\d{1,2})?$/.test(String(p.collectedAmount)) &&
      Number(p.collectedAmount) === Number(order.amount));
    if (!match || typeof match.paymentReference !== "string" ||
        typeof match.collectedCurrency !== "string" ||
        !/^\d+(?:\.\d{1,2})?$/.test(String(match.collectedAmount)))
      return new Response(null, { status: 409 });
    await db.rpc("settle_clickpesa_payment", {
      p_reference: reference, p_transaction: match.paymentReference,
      p_amount: match.collectedAmount, p_currency: match.collectedCurrency,
    });
    return Response.json({ accepted: true });
  } catch (error) {
    console.error("ClickPesa webhook processing failed", error instanceof Error ? error.message : "unknown");
    return new Response(null, { status: 500 });
  }
});
