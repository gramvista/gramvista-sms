-- Kilakona's authenticated balance already reflects all provider submissions
-- through this correction. Mark recorded usage as reconciled so it is not
-- subtracted from the current provider balance a second time.
do $$
declare
  bank private.sms_bank;
  latest provider_balance_snapshots;
  usage bigint;
begin
  perform bank_lock();
  select * into bank from private.sms_bank where singleton for update;
  -- Local demo databases use the mock provider and must remain untouched.
  if bank.provider <> 'kilakona' then
    return;
  end if;

  select * into latest
  from provider_balance_snapshots
  where provider = 'kilakona' and success
  order by checked_at desc, id desc
  limit 1
  for update;
  -- Fresh local/test databases have no live provider snapshot to correct.
  if not found then
    return;
  end if;
  if latest.balance_sms <> 232 then
    raise exception 'KILAKONA_REBASE_REQUIRES_CONFIRMED_232_BALANCE';
  end if;

  select coalesce(sum(message_units), 0)::bigint into usage
  from provider_usage
  where provider = 'kilakona';
  if bank.reconciled_units > usage then
    raise exception 'INVENTORY_RECONCILIATION_REGRESSION';
  end if;

  update private.sms_bank
  set reconciled_units = usage
  where singleton;

  insert into audit_logs(action, resource_id, details)
  values (
    'inventory.reconciliation_rebased',
    'kilakona',
    jsonb_build_object(
      'confirmed_provider_balance', latest.balance_sms,
      'previous_reconciled_units', bank.reconciled_units,
      'reconciled_units', usage,
      'reason', 'Confirmed Kilakona balance already includes recorded provider usage.'
    )
  );
end $$;
