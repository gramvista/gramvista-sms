import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clickPesaCheckout,
  clickPesaPayments,
  clickPesaToken,
  clickPesaUssdPush,
} from "../server/payments/ClickPesa";

afterEach(() => vi.unstubAllGlobals());

describe("ClickPesa adapter", () => {
  it("authenticates and creates a server-priced hosted checkout", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ success: true, token: "Bearer token" }))
      .mockResolvedValueOnce(Response.json({ success: true, token: "Bearer token" }))
      .mockResolvedValueOnce(Response.json({ checkoutLink: "https://checkout.clickpesa.com/order" }));
    vi.stubGlobal("fetch", fetchMock);
    const env = {
      CLICKPESA_CLIENT_ID: "client",
      CLICKPESA_API_KEY: "key",
      CLICKPESA_CHECKSUM_KEY: "checksum-secret",
      CLICKPESA_CALLBACK_URL: "https://example.com/functions/v1/clickpesa-webhook",
    };
    expect(await clickPesaToken(env)).toBe("Bearer token");
    const link = await clickPesaCheckout(env, {
      reference: "GVSABC123",
      amount: "22",
      email: "buyer@example.com",
      name: "Buyer",
      phone: "255712345678",
    });
    expect(link).toBe("https://checkout.clickpesa.com/order");
    const request = fetchMock.mock.calls[2];
    const payload = JSON.parse(request[1].body);
    expect(payload).toMatchObject({
      totalPrice: "22",
      orderCurrency: "TZS",
      orderReference: "GVSABC123",
      callbackUrl: "https://example.com/functions/v1/clickpesa-webhook",
    });
    expect(payload.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(request)).not.toContain("CLICKPESA_API_KEY");
  });

  it("initiates a checksummed USSD Push with a provider-safe reference", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ success: true, token: "token" }))
      .mockResolvedValueOnce(Response.json({
        id: "payment-1", status: "PROCESSING", channel: "M-PESA",
        orderReference: "GVS12345678901234567",
      }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await clickPesaUssdPush({
      CLICKPESA_CLIENT_ID: "client",
      CLICKPESA_API_KEY: "key",
      CLICKPESA_CHECKSUM_KEY: "checksum-secret",
    }, {
      reference: "GVS12345678901234567",
      amount: "18",
      phone: "255712345678",
    });
    expect(result.status).toBe("PROCESSING");
    const [url, request] = fetchMock.mock.calls[1];
    expect(url).toContain("/payments/initiate-ussd-push-request");
    expect(JSON.parse(request.body)).toMatchObject({
      amount: "18", currency: "TZS", phoneNumber: "255712345678",
      orderReference: "GVS12345678901234567",
    });
    expect(JSON.parse(request.body).checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects USSD Push references longer than the provider limit", async () => {
    await expect(clickPesaUssdPush({
      CLICKPESA_CLIENT_ID: "client", CLICKPESA_API_KEY: "key",
    }, {
      reference: "GVS123456789012345678", amount: "18", phone: "255712345678",
    })).rejects.toThrow("at most 20");
  });

  it("accepts a pending USSD Push as successfully initiated", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ success: true, token: "token" }))
      .mockResolvedValueOnce(Response.json({
        id: "payment-2", status: "PENDING",
        orderReference: "GVS12345678901234567",
      }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await clickPesaUssdPush({
      CLICKPESA_CLIENT_ID: "client", CLICKPESA_API_KEY: "key",
    }, {
      reference: "GVS12345678901234567", amount: "506", phone: "255712345678",
    });
    expect(result.status).toBe("PENDING");
  });

  it("queries only an alphanumeric order reference", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ success: true, token: "token" }))
      .mockResolvedValueOnce(Response.json([{ orderReference: "GVS1" }]));
    vi.stubGlobal("fetch", fetchMock);
    const env = { CLICKPESA_CLIENT_ID: "client", CLICKPESA_API_KEY: "key" };
    expect(await clickPesaPayments(env, "GVS1")).toHaveLength(1);
    await expect(clickPesaPayments(env, "order:uuid")).rejects.toThrow(
      "Invalid order reference",
    );
  });
});
