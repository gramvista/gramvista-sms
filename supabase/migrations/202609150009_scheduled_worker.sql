create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Endpoint and authorization live in Vault, never in cron command text.
create function private.dispatch_messaging_worker() returns bigint language plpgsql security definer set search_path=public,private as $$
declare endpoint text;token text;request_id bigint;begin
 select decrypted_secret into endpoint from vault.decrypted_secrets where name='gramvista_worker_url';
 select decrypted_secret into token from vault.decrypted_secrets where name='gramvista_worker_token';
 if endpoint is null or token is null then return null;end if;
 select net.http_post(url:=endpoint,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),body:='{}'::jsonb,timeout_milliseconds:=120000) into request_id;
 return request_id;
end $$;
revoke execute on function private.dispatch_messaging_worker() from public,anon,authenticated;
select cron.schedule('gramvista-messaging-worker','* * * * *','select private.dispatch_messaging_worker();');
