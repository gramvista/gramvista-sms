import { describe, expect, it } from "vitest";
import { kilakonaLiveAllowed } from "../providers/liveReadiness";
const env = {
  KILAKONA_LIVE_ENABLED: "true",
  KILAKONA_API_KEY: "test-key",
  KILAKONA_API_SECRET: "test-secret",
  KILAKONA_MAX_CONTACTS_PER_REQUEST: "1",
  GRAMVISTA_DELIVERY_CALLBACK_URL: "https://example.com/callback",
};
describe("live messaging activation", () => {
  it("enables normal live sending without pilot restrictions or billing assertions", () => {
    expect(
      kilakonaLiveAllowed({
        ...env,
        KILAKONA_BILLING_CONFIRMED: "false",
        KILAKONA_LIVE_PILOT_EXPIRES_AT: "2020-01-01T00:00:00Z",
      }),
    ).toBe(true);
  });
  it("requires explicit activation even if billing is confirmed", () => {
    expect(
      kilakonaLiveAllowed({
        ...env,
        KILAKONA_LIVE_ENABLED: "false",
        KILAKONA_BILLING_CONFIRMED: "true",
      }),
    ).toBe(false);
  });
  it("requires credentials, valid batching and HTTPS callback", () => {
    for (const change of [
      { KILAKONA_API_KEY: "" },
      { KILAKONA_API_SECRET: "" },
      { KILAKONA_MAX_CONTACTS_PER_REQUEST: "0" },
      { KILAKONA_MAX_CONTACTS_PER_REQUEST: "1.5" },
      { KILAKONA_MAX_CONTACTS_PER_REQUEST: "10001" },
      { GRAMVISTA_DELIVERY_CALLBACK_URL: "http://example.com" },
      { GRAMVISTA_DELIVERY_CALLBACK_URL: "" },
    ])
      expect(kilakonaLiveAllowed({ ...env, ...change })).toBe(false);
  });
});
