import { createClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../../server/database.ts";
export const client = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
export const db: Database = {
  async list(table, filters = {}, options = {}) {
    let q = client.from(table).select("*");
    for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
    if (options.order)
      q = q.order(options.order, { ascending: options.asc ?? false });
    q = q.range(
      options.offset ?? 0,
      (options.offset ?? 0) + (options.limit ?? 50) - 1,
    );
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data ?? [];
  },
  async insert(table, value) {
    const { data, error } = await client
      .from(table)
      .insert(value)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },
  async update(table, filters, value) {
    let q = client.from(table).update(value);
    for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
    const { data, error } = await q.select();
    if (error) throw new Error(error.message);
    return data ?? [];
  },
  async remove(table, filters) {
    let q = client.from(table).delete();
    for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
    const { error } = await q;
    if (error) throw new Error(error.message);
  },
  async rpc(name, args) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(error.message);
    return data;
  },
};
