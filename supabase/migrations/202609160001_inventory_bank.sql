-- The bank is backed by one upstream account. Production defaults to Kilakona.
-- Demo/test databases explicitly select mock; there is no customer/admin HTTP mode switch.
create table private.sms_bank (
 singleton boolean primary key default true check(singleton),
 provider text not null check(provider in ('kilakona','mock')) default 'kilakona',
 reconciled_units bigint not null default 0 check(reconciled_units >= 0)
);
insert into private.sms_bank(singleton) values(true);
alter table private.sms_bank enable row level security;

create function inventory_status() returns jsonb language plpgsql security definer set search_path=public,private as $$
declare b private.sms_bank; s provider_balance_snapshots; cfg provider_cost_settings;
 usage bigint; available bigint; reserved bigint; effective bigint; pending bigint; fresh boolean;
begin
 select * into b from private.sms_bank where singleton;
 select * into s from provider_balance_snapshots where provider=b.provider and success order by checked_at desc,id desc limit 1;
 select * into cfg from provider_cost_settings where provider=b.provider;
 select coalesce(sum(message_units),0) into usage from provider_usage where provider=b.provider;
 select coalesce(sum(available_units),0),coalesce(sum(reserved_units),0) into available,reserved from sms_wallets;
 pending=greatest(0,usage-b.reconciled_units);
 effective=s.balance_sms-pending;
 fresh=s.id is not null and s.balance_sms is not null and s.checked_at>clock_timestamp()-interval '5 minutes'
 and not exists(select 1 from provider_balance_snapshots where provider=b.provider and not success and checked_at>s.checked_at);
 return jsonb_build_object('provider',b.provider,'balance',s.balance_sms,'last_sync',s.checked_at,
 'unsynced_usage',pending,'effective_inventory',effective,'available_customer_balances',available,
 'reserved_customer_balances',reserved,'liability',available+reserved,'safety_reserve',cfg.reserve_threshold,
 'available_to_allocate',case when fresh then greatest(0,effective-available-reserved-cfg.reserve_threshold) else 0 end,
 'inventory_fresh',coalesce(fresh,false),'inventory_health',case when exists(select 1 from provider_balance_snapshots where provider=b.provider and not success and checked_at>coalesce(s.checked_at,'-infinity')) then 'degraded' when not coalesce(fresh,false) then 'offline'
 when effective < cfg.critical_threshold or effective < available+reserved+cfg.reserve_threshold then 'critical'
 when effective < cfg.warning_threshold then 'low' else 'connected' end);
end $$;

-- All financial transitions share a transaction lock BEFORE taking wallet/job locks.
-- This also serializes snapshots with allocations and settlement.
create function bank_lock() returns void language sql security definer set search_path=public as $$
 select pg_advisory_xact_lock(hashtextextended('gramvista:sms-bank',0))
$$;

-- Capture usage before the network request. A balance decrease only reconciles
-- known usage; unchanged balances, top-ups, and concurrent sends never erase it.
create function inventory_sync_watermark() returns bigint language sql security definer set search_path=public,private as $$
 select coalesce(sum(message_units),0)::bigint from provider_usage where provider=(select provider from private.sms_bank where singleton)
$$;
create function record_inventory_snapshot(p_provider text,p_balance bigint,p_usage bigint,p_started timestamptz,p_raw jsonb) returns jsonb
language plpgsql security definer set search_path=public,private as $$
declare b private.sms_bank; previous provider_balance_snapshots; s provider_balance_snapshots; observed bigint;
begin
 perform bank_lock();
 select * into b from private.sms_bank where singleton for update;
 if b.provider<>p_provider then raise exception 'INVENTORY_PROVIDER_MISMATCH';end if;
 if p_balance is null or p_balance<0 or p_usage is null or p_usage<0 or p_started is null or p_started>clock_timestamp() then raise exception 'VALIDATION_FAILED';end if;
 select * into previous from provider_balance_snapshots where provider=p_provider and success order by checked_at desc,id desc limit 1;
 if previous.checked_at>=p_started then raise exception 'STALE_INVENTORY_SYNC';end if;
 observed=greatest(0,coalesce(previous.balance_sms-p_balance,0));
 update private.sms_bank set reconciled_units=reconciled_units+least(observed,greatest(0,p_usage-reconciled_units)) where singleton;
 insert into provider_balance_snapshots(provider,balance_sms,success,checked_at,raw_response_json)
 values(p_provider,p_balance,true,p_started,p_raw) returning * into s;
 return to_jsonb(s);
end $$;

create function guard_wallet_capacity() returns trigger language plpgsql security definer set search_path=public as $$
declare delta bigint; inv jsonb;
begin
 delta=new.available_units+new.reserved_units;
 if tg_op='UPDATE' then delta=delta-old.available_units-old.reserved_units;end if;
 if delta>0 then
  perform bank_lock(); inv=inventory_status();
  if not (inv->>'inventory_fresh')::boolean then raise exception 'INVENTORY_UNAVAILABLE';end if;
  if delta>(inv->>'available_to_allocate')::bigint then raise exception 'INSUFFICIENT_PROVIDER_CAPACITY';end if;
 end if;
 return new;
end $$;
create trigger wallet_capacity before insert or update on sms_wallets for each row execute function guard_wallet_capacity();

create function immutable_sender_owner() returns trigger language plpgsql as $$
begin
 if new.organization_id<>old.organization_id then raise exception 'SENDER_OWNERSHIP_IMMUTABLE';end if;
 if new.sender_name<>old.sender_name then raise exception 'SENDER_OWNERSHIP_IMMUTABLE';end if;
 return new;
end $$;
create trigger sender_owner_immutable before update on sender_ids for each row execute function immutable_sender_owner();
alter table sender_id_provider_records add constraint sender_record_owner foreign key(sender_id_id,organization_id) references sender_ids(id,organization_id);

-- Preserve commercial records even for closed organizations.
create function preserve_organization() returns trigger language plpgsql as $$
begin raise exception 'CLOSE_ORGANIZATION_INSTEAD';end $$;
create trigger organization_preserve before delete on organizations for each row execute function preserve_organization();

alter table provider_submissions add column reconciliation_error text;
alter table provider_submissions add column reconciliation_attempts int not null default 0;

create or replace function platform_stats(p_provider text) returns jsonb language plpgsql security definer set search_path=public as $$
declare inv jsonb;begin
 inv=inventory_status();
 if inv->>'provider'<>p_provider then raise exception 'INVENTORY_PROVIDER_MISMATCH';end if;
 return inv || jsonb_build_object(
 'organizations',(select count(*) from organizations),
 'active_organizations',(select count(*) from organizations where status='active'),
 'pending_payments',(select count(*) from payments where status='pending'),
 'sender_queue',(select coalesce(jsonb_object_agg(status,n),'{}') from (select status,count(*) n from sender_ids group by status) q),
 'failed_jobs',(select count(*) from campaign_jobs where status in ('held','rejected')),
 'stuck_jobs',(select count(*) from campaign_jobs where status='processing' and started_at<now()-interval '5 minutes'),
 'failed_reconciliations',(select count(*) from provider_submissions where reconciliation_error is not null),
 'sent_today',(select count(*) from messages m join campaigns c on c.id=m.campaign_id where not c.test_mode and m.sent_at>=date_trunc('day',now())),
 'last_successful_send',(select max(submitted_at) from provider_submissions where provider=p_provider),
 'last_failed_sync',(select max(checked_at) from provider_balance_snapshots where provider=p_provider and not success),
 'revenue',(select jsonb_agg(r) from(select currency,sum(amount)::text as total from payments where status='verified' group by currency)r));
end $$;

create function wallet_usage(p_org uuid) returns bigint language sql stable security definer set search_path=public as $$
 select coalesce(sum(units),0)::bigint from wallet_transactions where organization_id=p_org and type='campaign_debit'
 and created_at>=date_trunc('month',now() at time zone (select timezone from organizations where id=p_org)) at time zone (select timezone from organizations where id=p_org)
$$;

alter function wallet_adjust(uuid,bigint,text,text,uuid,text) rename to bank_original_wallet_adjust;
alter function bank_original_wallet_adjust(uuid,bigint,text,text,uuid,text) set schema private;
revoke all on function private.bank_original_wallet_adjust(uuid,bigint,text,text,uuid,text) from public,anon,authenticated,service_role;
create function wallet_adjust(p_org uuid,p_units bigint,p_reference text,p_reason text,p_actor uuid,p_type text default 'manual_credit') returns jsonb language plpgsql security definer set search_path=public,private as $$ begin perform bank_lock(); if not exists(select 1 from organizations where id=p_org and status='active') then raise exception 'ORGANIZATION_SUSPENDED';end if; return private.bank_original_wallet_adjust(p_org,p_units,p_reference,p_reason,p_actor,p_type); end $$;
revoke all on function wallet_adjust(uuid,bigint,text,text,uuid,text) from public,anon,authenticated; grant execute on function wallet_adjust(uuid,bigint,text,text,uuid,text) to service_role;

alter function enqueue_campaign(uuid,text,text,text,text[],int,text,text,text,boolean,timestamptz,uuid,int,int,int) rename to bank_original_enqueue_campaign;
alter function bank_original_enqueue_campaign(uuid,text,text,text,text[],int,text,text,text,boolean,timestamptz,uuid,int,int,int) set schema private;
revoke all on function private.bank_original_enqueue_campaign(uuid,text,text,text,text[],int,text,text,text,boolean,timestamptz,uuid,int,int,int) from public,anon,authenticated,service_role;
create function enqueue_campaign(p_org uuid,p_sender text,p_name text,p_message text,p_phones text[],p_parts int,p_encoding text,p_key text,p_fingerprint text,p_test boolean,p_schedule timestamptz,p_actor uuid,p_batch int,p_invalid int default 0,p_duplicates int default 0) returns jsonb language plpgsql security definer set search_path=public,private as $$ begin perform bank_lock();  return private.bank_original_enqueue_campaign(p_org,p_sender,p_name,p_message,p_phones,p_parts,p_encoding,p_key,p_fingerprint,p_test,p_schedule,p_actor,p_batch,p_invalid,p_duplicates); end $$;
revoke all on function enqueue_campaign(uuid,text,text,text,text[],int,text,text,text,boolean,timestamptz,uuid,int,int,int) from public,anon,authenticated; grant execute on function enqueue_campaign(uuid,text,text,text,text[],int,text,text,text,boolean,timestamptz,uuid,int,int,int) to service_role;

alter function settle_job(uuid,text,text,int,int,int,int,jsonb) rename to bank_original_settle_job;
alter function bank_original_settle_job(uuid,text,text,int,int,int,int,jsonb) set schema private;
revoke all on function private.bank_original_settle_job(uuid,text,text,int,int,int,int,jsonb) from public,anon,authenticated,service_role;
create function settle_job(p_job uuid,p_provider text,p_reference text,p_valid int,p_invalid int,p_duplicates int,p_size int,p_raw jsonb) returns jsonb language plpgsql security definer set search_path=public,private as $$ begin perform bank_lock();  return private.bank_original_settle_job(p_job,p_provider,p_reference,p_valid,p_invalid,p_duplicates,p_size,p_raw); end $$;
revoke all on function settle_job(uuid,text,text,int,int,int,int,jsonb) from public,anon,authenticated; grant execute on function settle_job(uuid,text,text,int,int,int,int,jsonb) to service_role;

alter function cancel_campaign(uuid,uuid,uuid) rename to bank_original_cancel_campaign;
alter function bank_original_cancel_campaign(uuid,uuid,uuid) set schema private;
revoke all on function private.bank_original_cancel_campaign(uuid,uuid,uuid) from public,anon,authenticated,service_role;
create function cancel_campaign(p_org uuid,p_id uuid,p_actor uuid) returns jsonb language plpgsql security definer set search_path=public,private as $$ begin perform bank_lock();  return private.bank_original_cancel_campaign(p_org,p_id,p_actor); end $$;
revoke all on function cancel_campaign(uuid,uuid,uuid) from public,anon,authenticated; grant execute on function cancel_campaign(uuid,uuid,uuid) to service_role;

alter function verify_payment(uuid,uuid) rename to bank_original_verify_payment;
alter function bank_original_verify_payment(uuid,uuid) set schema private;
revoke all on function private.bank_original_verify_payment(uuid,uuid) from public,anon,authenticated,service_role;
create function verify_payment(p_id uuid,p_actor uuid) returns jsonb language plpgsql security definer set search_path=public,private as $$
declare result jsonb; p payments;begin
 perform bank_lock();
 select * into p from payments where id=p_id for update;
 result=private.bank_original_verify_payment(p_id,p_actor);
 if p.status='pending' then insert into audit_logs(organization_id,actor_id,action,resource_id) values(p.organization_id,p_actor,'payment.verified',p_id::text);end if;
 return result;
end $$;
revoke all on function verify_payment(uuid,uuid) from public,anon,authenticated; grant execute on function verify_payment(uuid,uuid) to service_role;

alter function release_job(uuid,text) rename to bank_original_release_job;
alter function bank_original_release_job(uuid,text) set schema private;
revoke all on function private.bank_original_release_job(uuid,text) from public,anon,authenticated,service_role;
create function release_job(p_job uuid,p_reason text) returns boolean language plpgsql security definer set search_path=public,private as $$ begin perform bank_lock();  return private.bank_original_release_job(p_job,p_reason); end $$;
revoke all on function release_job(uuid,text) from public,anon,authenticated; grant execute on function release_job(uuid,text) to service_role;

alter table provider_cost_settings add constraint safe_inventory_thresholds check(reserve_threshold>=0 and critical_threshold>=0 and warning_threshold>=critical_threshold);
create function lock_inventory_settings() returns trigger language plpgsql security definer set search_path=public as $$
begin perform bank_lock();return new;end $$;
create trigger inventory_settings_lock before update on provider_cost_settings for each row execute function lock_inventory_settings();
revoke all on function inventory_status(),bank_lock(),inventory_sync_watermark(),record_inventory_snapshot(text,bigint,bigint,timestamptz,jsonb),guard_wallet_capacity(),immutable_sender_owner(),preserve_organization(),wallet_usage(uuid),lock_inventory_settings() from public,anon,authenticated;
grant execute on function inventory_status(),inventory_sync_watermark(),record_inventory_snapshot(text,bigint,bigint,timestamptz,jsonb),wallet_usage(uuid) to service_role;

-- Direct tenant reads must not bypass API redaction of provider fields.
drop view campaign_recipients;
create view campaign_recipients with(security_invoker=true) as
 select id,organization_id,message_reference,campaign_id,job_id,normalized_phone,message_snapshot,status,billing_status,sent_at,delivered_at,failed_at,created_at,updated_at from messages;
revoke select on messages from authenticated;
grant select(id,organization_id,message_reference,campaign_id,job_id,normalized_phone,message_snapshot,status,billing_status,sent_at,delivered_at,failed_at,created_at,updated_at) on messages to authenticated;
grant select on campaign_recipients to authenticated,service_role;
create trigger provider_snapshot_immutable before update or delete on provider_balance_snapshots for each row execute function immutable_ledger();
create trigger provider_usage_immutable before update or delete on provider_usage for each row execute function immutable_ledger();

create or replace function update_sender_workflow(p_sender uuid,p_status text,p_reference text,p_notes text,p_evidence text,p_actor uuid,p_demo boolean default false) returns jsonb
language plpgsql security definer set search_path=public as $$
declare s sender_ids;begin
 select * into s from sender_ids where id=p_sender for update;
 if not found then raise exception 'NOT_FOUND';end if;
 if p_status not in ('draft','gramvista_review','provider_pending','approved','rejected','suspended','expired') then raise exception 'VALIDATION_FAILED';end if;
 if not p_demo and p_status in ('provider_pending','approved') and length(trim(coalesce(p_reference,'')))<3 then raise exception 'PROVIDER_REFERENCE_REQUIRED';end if;
 if not p_demo and p_status='approved' and length(trim(coalesce(p_evidence,'')))<10 then raise exception 'PROVIDER_APPROVAL_REQUIRED';end if;
 if p_status in ('rejected','draft') and length(trim(coalesce(p_notes,'')))<3 then raise exception 'REJECTION_REASON_REQUIRED';end if;
 insert into sender_id_provider_records(organization_id,sender_id_id,provider_reference,notes,submitted_at,approval_evidence,approved_at)
 values(s.organization_id,s.id,nullif(p_reference,''),nullif(p_notes,''),case when p_status='provider_pending' then now() end,nullif(p_evidence,''),case when p_status='approved' then now() end)
 on conflict(sender_id_id) do update set
 provider_reference=coalesce(excluded.provider_reference,sender_id_provider_records.provider_reference),
 notes=coalesce(excluded.notes,sender_id_provider_records.notes),
 submitted_at=coalesce(excluded.submitted_at,sender_id_provider_records.submitted_at),
 approval_evidence=coalesce(excluded.approval_evidence,sender_id_provider_records.approval_evidence),
 approved_at=coalesce(excluded.approved_at,sender_id_provider_records.approved_at),updated_at=now();
 update sender_ids set status=p_status,updated_at=now(),
 approved_at=case when p_status='approved' then now() else approved_at end,
 rejected_at=case when p_status='rejected' then now() else rejected_at end,
 rejection_reason=case when p_status='rejected' then p_notes else null end where id=s.id returning * into s;
 insert into audit_logs(organization_id,actor_id,action,resource_id) values(s.organization_id,p_actor,'sender_id.'||p_status,s.id::text);
 insert into notifications(organization_id,title,body) values(s.organization_id,'Sender ID '||p_status,s.sender_name||case when p_status in ('draft','rejected') then ': '||p_notes else '' end);
 return to_jsonb(s);end $$;

create function resubmit_sender(p_org uuid,p_sender uuid,p_details jsonb,p_actor uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare s sender_ids;begin
 select * into s from sender_ids where id=p_sender and organization_id=p_org for update;
 if not found then raise exception 'NOT_FOUND';end if;
 if s.status<>'draft' then raise exception 'INVALID_SENDER_STATE';end if;
 update sender_ids set legal_business_name=p_details->>'legal_business_name',purpose=p_details->>'purpose',sample_message=p_details->>'sample_message',
 contact_name=p_details->>'contact_name',contact_phone=p_details->>'contact_phone',contact_email=p_details->>'contact_email',
 status='submitted',submitted_at=now(),updated_at=now() where id=s.id returning * into s;
 insert into audit_logs(organization_id,actor_id,action,resource_id) values(p_org,p_actor,'sender_id.resubmitted',s.id::text);
 return to_jsonb(s);
end $$;
revoke execute on function resubmit_sender(uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function resubmit_sender(uuid,uuid,jsonb,uuid) to service_role;
