import { z } from "zod";
import {
  ProviderError,
  type SmsProvider,
  type ProviderSendInput,
} from "../SmsProvider.ts";
import { normalizeKilakonaStatus } from "./kilakona.status.ts";
import { normalizePhone } from "../../shared/sms.ts";
const envelope = z.object({
  success: z.literal(true),
  code: z.literal(200),
  data: z.unknown(),
});
export class KilakonaProvider implements SmsProvider {
  code = "kilakona";
  constructor(
    private config: { baseUrl: string; key: string; secret: string },
    private http: typeof fetch = fetch,
  ) {}
  private async request(path: string, body?: unknown) {
    try {
      const response = await this.http(this.config.baseUrl + path, {
        method: body ? "POST" : "GET",
        headers: {
          api_key: this.config.key,
          api_secret: this.config.secret,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok)
        throw new ProviderError("PROVIDER_ERROR", Boolean(body));
      const parsed = envelope.safeParse(await response.json());
      if (!parsed.success)
        throw new ProviderError("PROVIDER_ERROR", Boolean(body));
      return parsed.data.data;
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError("PROVIDER_UNAVAILABLE", Boolean(body));
    }
  }
  async sendMessage(input: ProviderSendInput) {
    const raw = await this.request("/message/send", {
      senderId: input.senderId,
      messageType: "text",
      message: input.message,
      contacts: input.recipients.map((p) => p.replace(/^\+/, "")).join(","),
      deliveryReportUrl: input.callbackUrl,
    });
    const result = z
      .object({
        shootId: z.string().min(1),
        validContacts: z.number().int().nonnegative(),
        invalidContacts: z.number().int().nonnegative(),
        duplicatedContacts: z.number().int().nonnegative(),
        messageSize: z.number().nonnegative(),
      })
      .safeParse(raw);
    if (!result.success) throw new ProviderError("PROVIDER_ERROR", true);
    return { reference: result.data.shootId, ...result.data, raw };
  }
  async getBalance() {
    const raw = await this.request("/message/balance");
    const result = z
      .object({ totalSms: z.number().int().nonnegative() })
      .parse(raw);
    return { ...result, raw };
  }
  async getDeliveryReport(reference: string) {
    const raw = await this.request(
      "/message/deliver/" + encodeURIComponent(reference),
    );
    const reports = z
      .array(
        z.object({
          mobile: z.string(),
          status: z.string(),
          statusCode: z.string(),
          explanation: z.string(),
          sentAt: z.string(),
        }),
      )
      .parse(raw);
    return reports.map((r) => ({
      phone: normalizePhone(r.mobile) ?? r.mobile,
      providerStatus: r.status,
      status: normalizeKilakonaStatus(r.status),
      statusCode: r.statusCode,
      explanation: r.explanation,
      sentAtRaw: r.sentAt,
    }));
  }
}
