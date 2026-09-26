import { writeFileSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
const env = process.env;
if (!env.WORKER_SECRET) throw new Error("Set WORKER_SECRET in the process environment before running this script.");
if (!/^[a-f0-9]{64}$/.test(env.WORKER_SECRET ?? ""))
  throw new Error("Worker secret missing");
const sql = `do $$ declare existing uuid; begin
select id into existing from vault.secrets where name='gramvista_worker_url';
if existing is null then perform vault.create_secret('https://sscleaiwktklkuxqqndf.supabase.co/functions/v1/worker','gramvista_worker_url');else perform vault.update_secret(existing,'https://sscleaiwktklkuxqqndf.supabase.co/functions/v1/worker');end if;
select id into existing from vault.secrets where name='gramvista_worker_token';
if existing is null then perform vault.create_secret('${env.WORKER_SECRET}','gramvista_worker_token');else perform vault.update_secret(existing,'${env.WORKER_SECRET}');end if;
end $$;
insert into private.platform_admin_invitations(email) values ('gramvistagroup@gmail.com') on conflict do nothing;
select public.claim_platform_admin(id) from auth.users where lower(email)='gramvistagroup@gmail.com' and email_confirmed_at is not null;
select jobname,schedule,active from cron.job where jobname='gramvista-messaging-worker';`;
const path = ".local/configure-cloud.sql";
writeFileSync(path, sql);
try {
  const result = spawnSync(
    "cmd.exe",
    [
      "/d",
      "/s",
      "/c",
      "npx.cmd --yes supabase db query --linked --file .local/configure-cloud.sql --output json",
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    writeFileSync(
      ".local/configure-cloud-error.log",
      result.stderr + result.stdout,
    );
    throw new Error(
      "Cloud configuration failed. Private diagnostics saved locally.",
    );
  }
  console.log(
    "Worker Vault configuration and verified-email administrator bootstrap applied.",
  );
} finally {
  unlinkSync(path);
}
