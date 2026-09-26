import { MockSmsProvider } from "./mock/MockSmsProvider.ts";
import { KilakonaProvider } from "./kilakona/KilakonaProvider.ts";
export type Environment = Record<string, string | undefined>;
export function getProvider(env: Environment, test = false) {
  if (test) return new MockSmsProvider();
  if (!env.SMS_PROVIDER)
    throw new Error("SMS_PROVIDER must be configured explicitly");
  if (env.SMS_PROVIDER === "mock") {
    if (env.LOCAL_DEMO !== "true")
      throw new Error("Mock provider requires LOCAL_DEMO=true");
    return new MockSmsProvider();
  }
  if (env.SMS_PROVIDER !== "kilakona") throw new Error("Unsupported provider");
  if (!env.KILAKONA_API_KEY || !env.KILAKONA_API_SECRET)
    throw new Error("Provider credentials are not configured");
  return new KilakonaProvider({
    baseUrl:
      env.KILAKONA_API_BASE_URL ||
      "https://www.messaging.kilakona.co.tz/api/v1/vendor",
    key: env.KILAKONA_API_KEY,
    secret: env.KILAKONA_API_SECRET,
  });
}
