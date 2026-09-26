import { createClient } from "@supabase/supabase-js";
export const supabase =
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
    ? createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_ANON_KEY,
      )
    : null;
export const apiBase = import.meta.env.VITE_API_BASE_URL || "/api";
export async function api(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    key?: string;
    platform?: boolean;
  } = {},
) {
  const token = (await supabase?.auth.getSession())?.data.session?.access_token;
  const response = await fetch(apiBase + "/v1/" + path, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(!supabase && options.platform ? { "X-Demo-Role": "platform" } : {}),
      ...(options.key ? { "Idempotency-Key": options.key } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? "Request failed");
  return data;
}
