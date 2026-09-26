import type {
  SmsProvider,
  ProviderSendInput,
  ProviderReport,
} from "../SmsProvider.ts";
export class MockSmsProvider implements SmsProvider {
  code = "mock";
  async sendMessage(input: ProviderSendInput) {
    return {
      reference: "mock_" + crypto.randomUUID(),
      validContacts: input.recipients.length,
      invalidContacts: 0,
      duplicatedContacts: 0,
      messageSize: input.message.length,
      raw: { simulated: true },
    };
  }
  async getBalance() {
    return { totalSms: 1000000, raw: { simulated: true } };
  }
  async getDeliveryReport(_reference: string): Promise<ProviderReport[]> {
    return [];
  }
}
