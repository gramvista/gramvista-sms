-- RLS helpers must remain callable by policies, but not exposed as public RPCs.
create schema if not exists private;
revoke all on schema private from public,anon;
grant usage on schema private to authenticated,service_role;
alter function public.is_member(uuid) set schema private;
alter function public.is_platform_admin() set schema private;
alter function public.immutable_ledger() set search_path=public;

create table private.worker_leases(name text primary key,token uuid not null,expires_at timestamptz not null);
alter table private.worker_leases enable row level security;
create function public.claim_worker(p_token uuid) returns boolean language plpgsql security definer set search_path=public,private as $$
begin
 insert into private.worker_leases(name,token,expires_at) values('messaging',p_token,now()+interval '3 minutes') on conflict(name) do update set token=excluded.token,expires_at=excluded.expires_at where private.worker_leases.expires_at<now();
 return found;
end $$;
create function public.release_worker(p_token uuid) returns void language sql security definer set search_path=public,private as $$delete from private.worker_leases where name='messaging' and token=p_token$$;

create table private.platform_admin_invitations(email text primary key,created_at timestamptz not null default now(),claimed_at timestamptz);
alter table private.platform_admin_invitations enable row level security;
create function public.claim_platform_admin(p_user uuid) returns boolean language plpgsql security definer set search_path=public,private as $$
declare v_email text;begin
 select lower(email) into v_email from auth.users where id=p_user and email_confirmed_at is not null;
 if v_email is null or not exists(select 1 from private.platform_admin_invitations where email=v_email and claimed_at is null) then return false;end if;
 insert into public.platform_admins(user_id) values(p_user) on conflict do nothing;
 update private.platform_admin_invitations set claimed_at=coalesce(claimed_at,now()) where email=v_email;
 return true;
end $$;
revoke execute on function public.claim_worker(uuid),public.release_worker(uuid),public.claim_platform_admin(uuid) from public,anon,authenticated;
grant execute on function public.claim_worker(uuid),public.release_worker(uuid),public.claim_platform_admin(uuid) to service_role;
