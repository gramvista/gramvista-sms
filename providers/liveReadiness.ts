import type { Environment } from "./providerRegistry.ts";

// Activation is an operator setting, independent of unverified billing policy.
// Sender ownership/approval, wallet and stock are enforced by enqueue and worker.
export function kilakonaLiveAllowed(env: Environment) {
  if (env.KILAKONA_LIVE_ENABLED !== "true") return false;
  if (!env.KILAKONA_API_KEY || !env.KILAKONA_API_SECRET) return false;
  const batch = Number(env.KILAKONA_MAX_CONTACTS_PER_REQUEST);
  if (!Number.isInteger(batch) || batch < 1 || batch > 10000) return false;
  try {
    return (
      new URL(env.GRAMVISTA_DELIVERY_CALLBACK_URL || "").protocol === "https:"
    );
  } catch {
    return false;
  }
}
