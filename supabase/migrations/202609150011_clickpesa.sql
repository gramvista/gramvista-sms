-- ClickPesa orders are settled only after a verified provider transaction.
alter table payments add column clickpesa_payment_reference text unique;
alter table payments add column clickpesa_checkout_link text;

create function create_clickpesa_payment(p_org uuid,p_units bigint,p_reference text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare p payments; begin
 if p_reference !~ '^[A-Za-z0-9]+$' then raise exception 'VALIDATION_FAILED'; end if;
 p := jsonb_populate_record(null::payments,create_retail_payment(p_org,p_units,p_reference));
 if p.method <> 'manual' and p.method <> 'clickpesa' then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
 if p.method = 'manual' and p.status <> 'pending' then raise exception 'INVALID_PAYMENT_STATE'; end if;
 update payments set method='clickpesa' where id=p.id returning * into p;
 return to_jsonb(p);
end $$;

create function settle_clickpesa_payment(p_reference text,p_transaction text,p_amount numeric,p_currency text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare p payments; result jsonb; begin
 select * into p from payments where reference=p_reference for update;
 if not found or p.method <> 'clickpesa' then raise exception 'NOT_FOUND'; end if;
 if p_amount <> p.amount or p_currency <> p.currency or length(trim(p_transaction)) < 3
 then raise exception 'PAYMENT_MISMATCH'; end if;
 if p.status = 'verified' then
  if p.clickpesa_payment_reference <> p_transaction then raise exception 'PAYMENT_MISMATCH'; end if;
  return to_jsonb(p);
 end if;
 if p.status <> 'pending' then raise exception 'INVALID_PAYMENT_STATE'; end if;
 result := wallet_adjust(p.organization_id,p.sms_units,p.id::text,'ClickPesa payment '||p.reference,null,'sms_purchase');
 update payments set status='verified',verified_at=now(),clickpesa_payment_reference=p_transaction where id=p.id;
 insert into invoices(organization_id,payment_id,invoice_reference,amount,currency)
 values(p.organization_id,p.id,'GVS-'||upper(left(p.id::text,8)),p.amount,p.currency);
 return result;
end $$;

create or replace function verify_payment(p_id uuid,p_actor uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare p payments;result jsonb;begin
 select * into p from payments where id=p_id for update;
 if not found then raise exception 'NOT_FOUND';end if;
 if p.method='clickpesa' then raise exception 'CLICKPESA_REQUIRES_PROVIDER_CONFIRMATION';end if;
 if p.status='verified' then return to_jsonb(p);end if;
 if p.status<>'pending' then raise exception 'INVALID_PAYMENT_STATE';end if;
 result=wallet_adjust(p.organization_id,p.sms_units,p.id::text,'Verified payment '||p.reference,p_actor,'sms_purchase');
 update payments set status='verified',verified_at=now(),verified_by=p_actor where id=p.id;
 insert into invoices(organization_id,payment_id,invoice_reference,amount,currency)
 values(p.organization_id,p.id,'GVS-'||upper(left(p.id::text,8)),p.amount,p.currency);
 return result;end $$;
revoke execute on function create_clickpesa_payment(uuid,bigint,text) from public,anon,authenticated;
revoke execute on function settle_clickpesa_payment(text,text,numeric,text) from public,anon,authenticated;
grant execute on function create_clickpesa_payment(uuid,bigint,text) to service_role;
grant execute on function settle_clickpesa_payment(text,text,numeric,text) to service_role;
