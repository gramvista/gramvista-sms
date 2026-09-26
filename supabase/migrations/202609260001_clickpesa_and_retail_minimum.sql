-- Align ClickPesa with the current order lifecycle and permit retail purchases from one SMS.
update sms_price_tiers
set min_units = 1
where min_units = 1001 and max_units = 29999 and currency = 'TZS';

create or replace function create_clickpesa_payment(p_org uuid,p_units bigint,p_reference text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare p payments; result jsonb; ref text=upper(trim(p_reference)); begin
 if ref is null or ref !~ '^[A-Z0-9]+$' or length(ref)>120 then raise exception 'VALIDATION_FAILED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('payment-reference:'||ref,0));
 select * into p from payments where upper(trim(payment_reference))=ref for update;
 if found then
  if p.organization_id=p_org and p.sms_units=p_units and p.method='clickpesa' then return to_jsonb(p); end if;
  raise exception 'IDEMPOTENCY_CONFLICT';
 end if;
 result=create_sms_order(p_org,p_units,null,'clickpesa:'||ref,null);
 update payments set method='clickpesa',payment_reference=ref,payment_submitted_at=now(),status='pending'
 where id=(result->>'id')::uuid returning * into p;
 insert into order_events(organization_id,payment_id,action,description)
 values(p_org,p.id,'payment.submitted','ClickPesa checkout created: '||ref);
 return to_jsonb(p);
end $$;

create or replace function settle_clickpesa_payment(p_reference text,p_transaction text,p_amount numeric,p_currency text) returns jsonb
language plpgsql security definer set search_path=public,private as $$
declare p payments; ref text=upper(trim(p_reference)); begin
 perform bank_lock();
 select * into p from payments where upper(trim(payment_reference))=ref for update;
 if not found or p.method<>'clickpesa' then raise exception 'NOT_FOUND'; end if;
 if p_amount<>p.amount or p_currency<>p.currency or p.currency<>'TZS' or length(trim(p_transaction))<3
 then raise exception 'PAYMENT_MISMATCH'; end if;
 if p.status='verified' then
  if p.clickpesa_payment_reference<>p_transaction then raise exception 'PAYMENT_MISMATCH'; end if;
  return to_jsonb(p);
 end if;
 if p.status<>'pending' then raise exception 'INVALID_PAYMENT_STATE'; end if;
 perform wallet_adjust(p.organization_id,p.sms_units,p.id::text,'ClickPesa payment '||ref,null,'sms_purchase');
 update payments set status='verified',verified_at=now(),verified_by=null,clickpesa_payment_reference=p_transaction
 where id=p.id returning * into p;
 insert into invoices(organization_id,payment_id,invoice_reference,amount,currency)
 values(p.organization_id,p.id,'GVS-INV-'||upper(replace(p.id::text,'-','')),p.amount,p.currency);
 insert into order_events(organization_id,payment_id,action,description)
 values(p.organization_id,p.id,'order.approved','ClickPesa payment verified and '||p.sms_units||' SMS allocated.');
 insert into audit_logs(organization_id,action,resource_id,details)
 values(p.organization_id,'payment.clickpesa_verified',p.id::text,jsonb_build_object('order_reference',ref,'transaction_reference',p_transaction,'amount',p.amount,'currency',p.currency));
 insert into notifications(organization_id,title,body)
 values(p.organization_id,'Payment confirmed',p.sms_units||' SMS credits were added after ClickPesa verification.');
 return to_jsonb(p);
end $$;

create or replace function protect_clickpesa_settlement() returns trigger language plpgsql as $$
begin
 if old.method='clickpesa' and new.status='verified' and
    (new.clickpesa_payment_reference is null or new.verified_by is not null) then
  raise exception 'CLICKPESA_REQUIRES_PROVIDER_CONFIRMATION';
 end if;
 return new;
end $$;
drop trigger if exists clickpesa_settlement_only on payments;
create trigger clickpesa_settlement_only before update on payments
for each row execute function protect_clickpesa_settlement();

-- The legacy ClickPesa migration may be applied after the order-review migration
-- on an existing project. Keep the retired evidence-free entrypoint disabled.
create or replace function verify_payment(p_id uuid,p_actor uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
begin raise exception 'PAYMENT_EVIDENCE_REQUIRED'; end $$;

revoke all on function create_clickpesa_payment(uuid,bigint,text),settle_clickpesa_payment(text,text,numeric,text),protect_clickpesa_settlement() from public,anon,authenticated;
grant execute on function create_clickpesa_payment(uuid,bigint,text),settle_clickpesa_payment(text,text,numeric,text) to service_role;
