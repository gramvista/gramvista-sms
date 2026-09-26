/** Future gateway integrations must authenticate callbacks before returning an event.
 * Wallet credit remains exclusively in verify_payment, never in a browser/adapter.
 */
export interface VerifiedPaymentEvent {
  providerReference: string;
  paymentId: string;
  amount: string;
  currency: string;
  paidAt: string;
}
export interface PaymentAdapter {
  code: string;
  verifyCallback(request: Request): Promise<VerifiedPaymentEvent>;
}
export class ManualPaymentAdapter implements PaymentAdapter {
  code = "manual";
  async verifyCallback(_request: Request): Promise<VerifiedPaymentEvent> {
    throw new Error(
      "Manual payments require authenticated platform administrator verification.",
    );
  }
}
