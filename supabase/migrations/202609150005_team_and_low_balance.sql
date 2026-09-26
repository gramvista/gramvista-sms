create table organization_invitations (id uuid primary key default gen_random_uuid(),organization_id uuid not null references organizations,email text not null,role_id text not null references roles,status text not null default 'pending',created_by uuid not null,created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '7 days',unique(organization_id,email));
alter table organization_invitations enable row level security;
create index on organization_invitations(organization_id);
grant all on organization_invitations to service_role;
create function accept_invitations(p_user uuid,p_email text) returns int language plpgsql security definer set search_path=public as $$ declare i organization_invitations;n int=0;begin
 for i in select * from organization_invitations where lower(email)=lower(p_email) and status='pending' and expires_at>now() for update loop
 insert into organization_members(organization_id,user_id,role_id) values(i.organization_id,p_user,i.role_id) on conflict(organization_id,user_id) do nothing;
 update organization_invitations set status='accepted' where id=i.id;n=n+1;end loop;return n;end $$;
create function low_balance_outbox() returns trigger language plpgsql security definer set search_path=public as $$ declare event_id text;begin
 if new.available_units>=100 or old.available_units<100 then return new;end if;
 event_id='gvs_evt_'||gen_random_uuid()::text;
 insert into notifications(organization_id,title,body) values(new.organization_id,'SMS balance low','Your available SMS balance is below 100 units.');
 insert into webhook_deliveries(organization_id,endpoint_id,event_key,event_type,payload) select new.organization_id,e.id,event_id,'balance.low',jsonb_build_object('id',event_id,'type','balance.low','created_at',now(),'data',jsonb_build_object('available_sms',new.available_units,'reserved_sms',new.reserved_units)) from webhook_endpoints e where e.organization_id=new.organization_id and e.active and 'balance.low'=any(e.events);
 return new;end $$;
create trigger wallet_low_balance after update on sms_wallets for each row execute function low_balance_outbox();
revoke execute on function accept_invitations(uuid,text),low_balance_outbox() from public,anon,authenticated;
grant execute on function accept_invitations(uuid,text),low_balance_outbox() to service_role;
