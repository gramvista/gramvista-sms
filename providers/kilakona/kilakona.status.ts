import type { DeliveryStatus } from "../SmsProvider.ts";
export function normalizeKilakonaStatus(status: string): DeliveryStatus {
  return (
    (
      {
        Delivered: "delivered",
        Failed: "failed",
        Buffered: "pending",
      } as Record<string, DeliveryStatus>
    )[status] ?? "unknown"
  );
}
