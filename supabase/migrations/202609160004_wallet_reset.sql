-- Reset available customer credits through the ledger; never delete commercial records.
create function reset_sms_wallet(p_org uuid,p_expected_available bigint,p_reference text,p_reason text,p_confirmed boolean,p_actor uuid) returns jsonb
language plpgsql security definer set search_path=public,private as $$
declare w sms_wallets;tx wallet_transactions;begin
 if p_confirmed is distinct from true or p_expected_available is null or p_expected_available<=0 or p_reference is null or length(trim(p_reference))<3 or length(p_reference)>120 or p_reason is null or length(trim(p_reason))<10 or length(p_reason)>2000 then raise exception 'VALIDATION_FAILED';end if;
 if p_actor is not null and not exists(select 1 from platform_admins where user_id=p_actor) then raise exception 'FORBIDDEN';end if;
 perform bank_lock();
 select * into w from sms_wallets where organization_id=p_org for update;
 if not found then raise exception 'NOT_FOUND';end if;
 select * into tx from wallet_transactions where organization_id=p_org and type='wallet_reset' and reference_id=p_reference;
 if found then
  if tx.units<>p_expected_available or tx.description<>p_reason then raise exception 'IDEMPOTENCY_CONFLICT';end if;
  return to_jsonb(tx);
 end if;
 if w.reserved_units<>0 then raise exception 'WALLET_HAS_RESERVATIONS';end if;
 if w.available_units<>p_expected_available then raise exception 'WALLET_BALANCE_CHANGED';end if;
 update sms_wallets set available_units=0,updated_at=now() where id=w.id;
 insert into wallet_transactions(organization_id,wallet_id,type,units,direction,reference_type,reference_id,description,balance_before,balance_after,created_by)
 values(p_org,w.id,'wallet_reset',w.available_units,'debit','administrative_reset',p_reference,p_reason,w.available_units,0,p_actor) returning * into tx;
 insert into audit_logs(organization_id,actor_id,action,resource_id,details)
 values(p_org,p_actor,'wallet.reset',tx.id::text,jsonb_build_object('reference',p_reference,'reason',p_reason,'available_before',w.available_units,'available_after',0,'reserved_units',w.reserved_units,'source',case when p_actor is null then 'authorized_maintenance' else 'platform_admin' end));
 insert into notifications(organization_id,title,body) values(p_org,'SMS wallet reset',w.available_units||' available SMS removed by administrative correction. '||p_reason);
 return to_jsonb(tx);
end $$;
revoke all on function reset_sms_wallet(uuid,bigint,text,text,boolean,uuid) from public,anon,authenticated;
grant execute on function reset_sms_wallet(uuid,bigint,text,text,boolean,uuid) to service_role;
