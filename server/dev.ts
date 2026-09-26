import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { localDatabase } from "./pglite.ts";
import {
  makeHandler,
  resolveKey,
  processJobs,
  reconcile,
  type Identity,
} from "./service.ts";
await mkdir(".local", { recursive: true });
const pg = new PGlite(process.env.LOCAL_DATABASE_PATH ?? ".local/database");
await pg.waitReady;
const existing = await pg.query(
  "select 1 from information_schema.tables where table_name='organizations'",
);
if (!existing.rows.length) {
  await pg.exec(
    "create schema if not exists auth;create table if not exists auth.users(id uuid primary key,email text);create or replace function auth.uid() returns uuid language sql stable as $$select null::uuid$$;do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon;create role authenticated;create role service_role bypassrls;end if;end $$;",
  );
  await pg.exec(
    await readFile("supabase/migrations/202609150001_core.sql", "utf8"),
  );
  await pg.exec(
    "insert into auth.users values ('11111111-1111-4111-8111-111111111111','demo@gramvista.test'),('22222222-2222-4222-8222-222222222222','admin@gramvista.test');insert into platform_admins values ('22222222-2222-4222-8222-222222222222');",
  );
}
const db = localDatabase(pg);
await pg.exec(
  "create table if not exists _local_migrations(name text primary key)",
);
for (const migration of [
  "202609150003_operations.sql",
  "202609150004_outbox.sql",
  "202609150005_team_and_low_balance.sql",
  "202609150006_dispatch_validation.sql",
  "202609150007_provider_accounting.sql",
  "202609150008_cloud_operations.sql",
  "202609150010_retail_and_sender_workflow.sql",
  "202609150011_clickpesa.sql",
  "202609150012_direct_sms.sql",
  "202609160001_inventory_bank.sql",
  "202609160002_single_sms_purchase.sql",
  "202609160003_order_review.sql",
  "202609160004_wallet_reset.sql",
  "202609260001_clickpesa_and_retail_minimum.sql",
  "202609260002_optional_quiet_hours.sql",
]) {
  if (
    !(
      await pg.query("select 1 from _local_migrations where name=$1", [
        migration,
      ])
    ).rows.length
  ) {
    await pg.exec(await readFile("supabase/migrations/" + migration, "utf8"));
    await pg.query("insert into _local_migrations values ($1)", [migration]);
  }
}
const env = { SMS_PROVIDER: "mock", LOCAL_DEMO: "true" };
const handler = makeHandler(
  db,
  env,
  async (req, requestId): Promise<Identity> => {
    const token = req.headers.get("Authorization")?.replace(/^Bearer /, "");
    if (token?.startsWith("gvs_"))
      return resolveKey(db, token, requestId, new URL(req.url).pathname);
    // Development server is bound to loopback and has no production credentials.
    const admin = req.headers.get("X-Demo-Role") === "platform";
    const userId = admin
      ? "22222222-2222-4222-8222-222222222222"
      : "11111111-1111-4111-8111-111111111111";
    const member = (
      await db.list("organization_members", {
        user_id: userId,
        status: "active",
      })
    )[0];
    return {
      userId,
      orgId: member?.organization_id ?? null,
      role: member?.role_id ?? "none",
      permissions: member
        ? (await db.list("role_permissions", { role_id: member.role_id })).map(
            (p) => p.permission_id,
          )
        : [],
      admin,
      test: false,
    };
  },
);
createServer(async (req, res) => {
  try {
    const host = req.headers.host;
    if (
      host !== "127.0.0.1:8787" &&
      host !== "localhost:8787" &&
      host !== "127.0.0.1:5173" &&
      host !== "localhost:5173" &&
      host !== "127.0.0.1:5175" &&
      host !== "localhost:5175"
    ) {
      res.writeHead(403);
      res.end();
      return;
    }
    const origin = req.headers.origin;
    if (
      origin &&
      !/^http:\/\/(localhost|127\.0\.0\.1):(5173|5175|8787)$/.test(origin)
    ) {
      res.writeHead(403);
      res.end();
      return;
    }
    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 1000000) {
        res.writeHead(413);
        res.end();
        return;
      }
    }
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers))
      if (v) headers.set(k, Array.isArray(v) ? v.join(",") : v);
    const response = await handler(
      new Request("http://127.0.0.1:8787" + req.url, {
        method: req.method,
        headers,
        ...(["GET", "HEAD"].includes(req.method ?? "GET") ? {} : { body: raw }),
      }),
    );
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(await response.text());
  } catch {
    res.writeHead(500);
    res.end('{"error":{"message":"Local server error"}}');
  }
}).listen(8787, "127.0.0.1", () =>
  console.log(
    "Gramvista local demo API: http://127.0.0.1:8787 — mock provider only.",
  ),
);
let running = false;
setInterval(async () => {
  if (running) return;
  running = true;
  try {
    await processJobs(db, env);
    await reconcile(db, env);
  } catch {
    console.error("Local worker paused; inspect held jobs in Platform.");
  } finally {
    running = false;
  }
}, 3000);
