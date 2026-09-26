-- Retail prices are Gramvista prices, independent of wholesale inventory.
create table sms_price_tiers (
 id uuid primary key default gen_random_uuid(), min_units bigint not null unique,
 max_units bigint not null, price_per_unit numeric(20,2) not null,
 currency text not null default 'TZS', active boolean not null default true,
 check(min_units > 0 and max_units >= min_units and price_per_unit > 0)
);
alter table sms_price_tiers enable row level security;
grant all on sms_price_tiers to service_role;
insert into sms_price_tiers(min_units,max_units,price_per_unit) values
 (1001,29999,22),(30000,49999,20),(50000,199999,19),
 (200000,499999,18),(500000,1000000,15);
alter table payments add column price_tier_id uuid references sms_price_tiers;
alter table payments add column retail_unit_price numeric(20,2);
create function create_retail_payment(p_org uuid,p_units bigint,p_reference text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare t sms_price_tiers;p payments;begin
 if length(trim(p_reference)) < 3 or length(p_reference)>120 then raise exception 'VALIDATION_FAILED';end if;
 perform pg_advisory_xact_lock(hashtextextended('retail:'||p_reference,0));
 select * into p from payments where reference=p_reference;
 if found then
  if p.organization_id=p_org and p.sms_units=p_units and p.price_tier_id is not null then return to_jsonb(p);end if;
  raise exception 'IDEMPOTENCY_CONFLICT';
 end if;
 select * into t from sms_price_tiers where active and p_units between min_units and max_units;
 if not found then raise exception 'CUSTOM_QUOTE_REQUIRED';end if;
 insert into payments(organization_id,amount,currency,reference,sms_units,price_tier_id,retail_unit_price)
 values(p_org,p_units*t.price_per_unit,t.currency,p_reference,p_units,t.id,t.price_per_unit) returning * into p;
 return to_jsonb(p);end $$;
revoke execute on function create_retail_payment(uuid,bigint,text) from public,anon,authenticated;
grant execute on function create_retail_payment(uuid,bigint,text) to service_role;

alter table sender_id_provider_records add column submitted_at timestamptz;
alter table sender_id_provider_records add column approval_evidence text;
alter table sender_id_provider_records add column approved_at timestamptz;
create function update_sender_workflow(p_sender uuid,p_status text,p_reference text,p_notes text,p_evidence text,p_actor uuid,p_demo boolean default false) returns jsonb
language plpgsql security definer set search_path=public as $$
declare s sender_ids;begin
 select * into s from sender_ids where id=p_sender for update;
 if not found then raise exception 'NOT_FOUND';end if;
 if p_status not in ('gramvista_review','provider_pending','approved','rejected','suspended') then raise exception 'VALIDATION_FAILED';end if;
 if not p_demo and p_status in ('provider_pending','approved') and length(trim(coalesce(p_reference,'')))<3 then raise exception 'PROVIDER_REFERENCE_REQUIRED';end if;
 if not p_demo and p_status='approved' and length(trim(coalesce(p_evidence,'')))<10 then raise exception 'PROVIDER_APPROVAL_REQUIRED';end if;
 if p_status='rejected' and length(trim(coalesce(p_notes,'')))<3 then raise exception 'REJECTION_REASON_REQUIRED';end if;
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
 insert into notifications(organization_id,title,body) values(s.organization_id,'Sender ID '||p_status,s.sender_name);
 return to_jsonb(s);end $$;
revoke execute on function update_sender_workflow(uuid,text,text,text,text,uuid,boolean) from public,anon,authenticated;
grant execute on function update_sender_workflow(uuid,text,text,text,text,uuid,boolean) to service_role;
