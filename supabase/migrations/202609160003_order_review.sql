-- Preserve existing payment/ledger identities while introducing an explicit order lifecycle.
alter table payments add column order_reference text not null default ('GVS-ORD-'||upper(replace(gen_random_uuid()::text,'-',''))) unique;
alter table payments add column order_request_key text;
alter table payments add column payment_reference text;
alter table payments add column payment_submitted_at timestamptz;
alter table payments add column review_notes text;
alter table payments add column reviewed_at timestamptz;
alter table payments add column reviewed_by uuid;
update payments set payment_reference=upper(trim(reference)),payment_submitted_at=created_at;
create unique index order_request_once on payments(organization_id,order_request_key) where order_request_key is not null;
create unique index payment_reference_once on payments(upper(trim(payment_reference))) where payment_reference is not null;

create table order_events (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references organizations,
 payment_id uuid not null references payments,action text not null,description text not null,
 actor_id uuid,created_at timestamptz not null default now()
);
create index on order_events(organization_id,payment_id,created_at);
alter table order_events enable row level security;
create policy tenant_read on order_events for select to authenticated using(private.is_member(organization_id));
grant select on order_events to authenticated;
grant select,insert on order_events to service_role;
create trigger order_events_immutable before update or delete on order_events for each row execute function immutable_ledger();
insert into order_events(organization_id,payment_id,action,description,created_at)
 select organization_id,id,'legacy_record','Existing payment record retained; original ledger and invoice identities preserved.',created_at from payments;

create table payment_reviews (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references organizations,
 payment_id uuid not null references payments,decision text not null check(decision in ('approved','rejected')),
 received_amount numeric(20,2),currency text,receipt_reference text,notes text not null,
 actor_id uuid,created_at timestamptz not null default now()
);
create unique index receipt_credited_once on payment_reviews(upper(trim(receipt_reference))) where decision='approved';
create index on payment_reviews(organization_id,payment_id);
alter table payment_reviews enable row level security;
grant select,insert on payment_reviews to service_role;
create trigger payment_reviews_immutable before update or delete on payment_reviews for each row execute function immutable_ledger();

create function create_sms_order(p_org uuid,p_units bigint,p_package uuid,p_key text,p_actor uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare p payments;t sms_price_tiers;pkg sms_packages;begin
 if p_key is null or length(trim(p_key))<3 then raise exception 'VALIDATION_FAILED';end if;
 perform pg_advisory_xact_lock(hashtextextended('order:'||p_org::text||p_key,0));
 select * into p from payments where organization_id=p_org and order_request_key=p_key;
 if found then
  if p.package_id is not distinct from p_package and (p_package is not null or p.sms_units=p_units) then return to_jsonb(p);end if;
  raise exception 'IDEMPOTENCY_CONFLICT';
 end if;
 if not exists(select 1 from organizations where id=p_org and status='active') then raise exception 'ORGANIZATION_SUSPENDED';end if;
 if p_package is null then
  select * into t from sms_price_tiers where active and p_units between min_units and max_units;
  if not found then raise exception 'CUSTOM_QUOTE_REQUIRED';end if;
  insert into payments(organization_id,reference,status,sms_units,amount,currency,price_tier_id,retail_unit_price,order_request_key)
  values(p_org,'order:'||gen_random_uuid()::text,'awaiting_payment',p_units,p_units*t.price_per_unit,t.currency,t.id,t.price_per_unit,p_key) returning * into p;
 else
  select * into pkg from sms_packages where id=p_package and active and (valid_from is null or valid_from<=now()) and (valid_until is null or valid_until>now());
  if not found then raise exception 'INVALID_PACKAGE';end if;
  insert into payments(organization_id,reference,status,sms_units,amount,currency,package_id,retail_unit_price,order_request_key)
  values(p_org,'order:'||gen_random_uuid()::text,'awaiting_payment',pkg.sms_units,pkg.selling_price,pkg.currency,pkg.id,pkg.selling_price/pkg.sms_units,p_key) returning * into p;
 end if;
 insert into order_events(organization_id,payment_id,action,description,actor_id) values(p_org,p.id,'order.created','Order created; payment has not been confirmed.',p_actor);
 return to_jsonb(p);
end $$;

create function submit_order_payment(p_org uuid,p_id uuid,p_method text,p_reference text,p_actor uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare p payments; ref text=upper(trim(p_reference));begin
 if ref is null or length(ref)<3 or length(ref)>120 or p_method not in ('bank_transfer','mobile_money','manual') then raise exception 'VALIDATION_FAILED';end if;
 perform pg_advisory_xact_lock(hashtextextended('payment-reference:'||ref,0));
 select * into p from payments where id=p_id and organization_id=p_org for update;
 if not found then raise exception 'NOT_FOUND';end if;
 if p.status in ('pending','verified') and p.payment_reference=ref and p.method=p_method then return to_jsonb(p);end if;
 if p.status not in ('awaiting_payment','rejected') then raise exception 'INVALID_PAYMENT_STATE';end if;
 if exists(select 1 from payments where id<>p.id and upper(trim(payment_reference))=ref) then raise exception 'PAYMENT_REFERENCE_USED';end if;
 update payments set payment_reference=ref,method=p_method,status='pending',payment_submitted_at=now(),review_notes=null where id=p.id returning * into p;
 insert into order_events(organization_id,payment_id,action,description,actor_id) values(p_org,p.id,'payment.submitted','Payment details submitted for review: '||ref,p_actor);
 return to_jsonb(p);
end $$;

create function review_order(p_id uuid,p_decision text,p_received numeric,p_currency text,p_receipt text,p_notes text,p_confirmed boolean,p_actor uuid) returns jsonb
language plpgsql security definer set search_path=public,private as $$
declare p payments;r payment_reviews;result jsonb;receipt text=upper(trim(p_receipt));begin
 perform bank_lock();
 select * into p from payments where id=p_id for update;
 if not found then raise exception 'NOT_FOUND';end if;
 if p_decision not in ('approved','rejected') or p_notes is null or length(trim(p_notes))<3 then raise exception 'VALIDATION_FAILED';end if;
 if p_decision='approved' then
  if p_confirmed is distinct from true or p_received is null or p_received<>p.amount or p_currency is distinct from p.currency or receipt is null or length(receipt)<3 then raise exception 'PAYMENT_EVIDENCE_REQUIRED';end if;
  if p.status='verified' then
   select * into r from payment_reviews where payment_id=p.id and decision='approved';
   if found and r.receipt_reference=receipt and r.received_amount=p_received then return to_jsonb(p);end if;
   raise exception 'IDEMPOTENCY_CONFLICT';
  end if;
 elsif p.status='rejected' and p.review_notes=p_notes then return to_jsonb(p);
 end if;
 if p.status<>'pending' or p.payment_reference is null then raise exception 'INVALID_PAYMENT_STATE';end if;
 if p_decision='approved' then
  if exists(select 1 from payment_reviews where decision='approved' and receipt_reference=receipt) then raise exception 'PAYMENT_REFERENCE_USED';end if;
  -- Older verified records also reserve their receipt references.
  if exists(select 1 from payments where id<>p.id and status='verified' and upper(trim(payment_reference))=receipt) then raise exception 'PAYMENT_REFERENCE_USED';end if;
  result=wallet_adjust(p.organization_id,p.sms_units,p.id::text,'SMS allocation for '||p.order_reference||' / payment '||p.payment_reference,p_actor,'sms_purchase');
  update payments set status='verified',verified_at=now(),verified_by=p_actor where id=p.id;
  insert into invoices(organization_id,payment_id,invoice_reference,amount,currency)
  values(p.organization_id,p.id,'GVS-INV-'||upper(replace(p.id::text,'-','')),p.amount,p.currency);
 else
  update payments set status='rejected' where id=p.id;
 end if;
 update payments set review_notes=p_notes,reviewed_at=now(),reviewed_by=p_actor where id=p.id returning * into p;
 insert into payment_reviews(organization_id,payment_id,decision,received_amount,currency,receipt_reference,notes,actor_id)
 values(p.organization_id,p.id,p_decision,case when p_decision='approved' then p_received end,p.currency,case when p_decision='approved' then receipt end,p_notes,p_actor);
 insert into order_events(organization_id,payment_id,action,description,actor_id)
 values(p.organization_id,p.id,'order.'||p_decision,case when p_decision='approved' then 'Payment verified and '||p.sms_units||' SMS allocated. ' else 'Payment rejected: ' end||p_notes,p_actor);
 insert into audit_logs(organization_id,actor_id,action,resource_id,details) values(p.organization_id,p_actor,'payment.'||p_decision,p.id::text,jsonb_build_object('order_reference',p.order_reference,'amount',p.amount,'currency',p.currency,'sms_units',p.sms_units,'notes',p_notes));
 insert into notifications(organization_id,title,body) values(p.organization_id,'Order '||p_decision,p.order_reference||': '||p_notes);
 return to_jsonb(p);
end $$;

-- Retire the evidence-free approval entrypoint, including direct service-role RPC calls.
create or replace function verify_payment(p_id uuid,p_actor uuid) returns jsonb language plpgsql security definer set search_path=public as $$
begin raise exception 'PAYMENT_EVIDENCE_REQUIRED';end $$;

-- Legacy submission routes share the same normalization, retry and record rules.
create or replace function create_retail_payment(p_org uuid,p_units bigint,p_reference text) returns jsonb language plpgsql security definer set search_path=public as $$
declare p payments; result jsonb;ref text=upper(trim(p_reference));begin
 if ref is null or length(ref)<3 or length(ref)>120 then raise exception 'VALIDATION_FAILED';end if;
 perform pg_advisory_xact_lock(hashtextextended('payment-reference:'||ref,0));
 select * into p from payments where upper(trim(payment_reference))=ref;
 if found then
  if p.organization_id=p_org and p.sms_units=p_units and p.price_tier_id is not null then return to_jsonb(p);end if;
  raise exception 'IDEMPOTENCY_CONFLICT';
 end if;
 result=create_sms_order(p_org,p_units,null,'legacy:'||ref,null);
 return submit_order_payment(p_org,(result->>'id')::uuid,'manual',ref,null);
end $$;

create function create_package_payment(p_org uuid,p_package uuid,p_reference text,p_actor uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;begin
 result=create_sms_order(p_org,null,p_package,'legacy-package:'||upper(trim(p_reference)),p_actor);
 return submit_order_payment(p_org,(result->>'id')::uuid,'manual',p_reference,p_actor);
end $$;

create function preserve_order_terms() returns trigger language plpgsql as $$
begin
 if tg_op='DELETE' then raise exception 'ORDER_RECORD_IMMUTABLE';end if;
 if new.organization_id<>old.organization_id or new.sms_units<>old.sms_units or new.amount<>old.amount or new.currency<>old.currency or new.order_reference<>old.order_reference or new.reference<>old.reference or new.package_id is distinct from old.package_id or new.price_tier_id is distinct from old.price_tier_id or new.retail_unit_price is distinct from old.retail_unit_price then raise exception 'ORDER_RECORD_IMMUTABLE';end if;
 if old.status='verified' and to_jsonb(new)-array['review_notes','reviewed_at','reviewed_by'] <> to_jsonb(old)-array['review_notes','reviewed_at','reviewed_by'] then raise exception 'ORDER_RECORD_IMMUTABLE';end if;
 return new;
end $$;
create trigger order_terms_immutable before update or delete on payments for each row execute function preserve_order_terms();
create trigger invoice_immutable before update or delete on invoices for each row execute function immutable_ledger();
revoke all on function create_sms_order(uuid,bigint,uuid,text,uuid),submit_order_payment(uuid,uuid,text,text,uuid),review_order(uuid,text,numeric,text,text,text,boolean,uuid),create_package_payment(uuid,uuid,text,uuid),preserve_order_terms() from public,anon,authenticated;
grant execute on function create_sms_order(uuid,bigint,uuid,text,uuid),submit_order_payment(uuid,uuid,text,text,uuid),review_order(uuid,text,numeric,text,text,text,boolean,uuid),create_package_payment(uuid,uuid,text,uuid) to service_role;

create or replace function private.bank_original_wallet_adjust(p_org uuid,p_units bigint,p_reference text,p_reason text,p_actor uuid,p_type text default 'manual_credit') returns jsonb language plpgsql security definer set search_path=public as $$
declare w sms_wallets; tx wallet_transactions; begin
 if p_units=0 or length(trim(p_reason))<3 or length(trim(p_reference))<3 then raise exception 'VALIDATION_FAILED'; end if;
 select * into w from sms_wallets where organization_id=p_org for update;
 if not found then raise exception 'NOT_FOUND';end if;
 select * into tx from wallet_transactions where organization_id=p_org and type=p_type and reference_id=p_reference;
 if found then if tx.units<>abs(p_units) or tx.direction<>(case when p_units>0 then 'credit' else 'debit' end) then raise exception 'IDEMPOTENCY_CONFLICT';end if;return to_jsonb(tx);end if;
 if w.available_units+p_units<0 then raise exception 'INSUFFICIENT_SMS_BALANCE';end if;
 update sms_wallets set available_units=available_units+p_units,updated_at=now() where id=w.id;
 insert into wallet_transactions(organization_id,wallet_id,type,units,direction,reference_type,reference_id,description,balance_before,balance_after,created_by) values(p_org,w.id,p_type,abs(p_units),case when p_units>0 then 'credit' else 'debit' end,case when p_type='sms_purchase' then 'payment' else 'adjustment' end,p_reference,p_reason,w.available_units,w.available_units+p_units,p_actor) returning * into tx;
 insert into audit_logs(organization_id,actor_id,action,resource_id,details) values(p_org,p_actor,p_type,tx.id::text,jsonb_build_object('reason',p_reason,'units',p_units));
 insert into notifications(organization_id,title,body) values(p_org,'SMS wallet updated',p_reason);
 return to_jsonb(tx);end $$;
