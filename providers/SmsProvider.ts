export type DeliveryStatus = "delivered" | "failed" | "pending" | "unknown";
export interface ProviderSendInput {
  senderId: string;
  message: string;
  recipients: string[];
  callbackUrl: string;
}
export interface ProviderSendResult {
  reference: string;
  validContacts: number;
  invalidContacts: number;
  duplicatedContacts: number;
  messageSize: number;
  raw: unknown;
}
export interface ProviderReport {
  phone: string;
  providerStatus: string;
  status: DeliveryStatus;
  statusCode: string;
  explanation: string;
  sentAtRaw: string;
}
export interface SmsProvider {
  code: string;
  sendMessage(input: ProviderSendInput): Promise<ProviderSendResult>;
  getBalance(): Promise<{ totalSms: number; raw: unknown }>;
  getDeliveryReport(reference: string): Promise<ProviderReport[]>;
}
export class ProviderError extends Error {
  constructor(
    public code: string,
    public ambiguous = false,
  ) {
    super(code);
  }
}
