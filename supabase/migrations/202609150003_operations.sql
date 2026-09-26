create function dashboard_stats(p_org uuid) returns jsonb language sql stable security definer set search_path=public as $$
select jsonb_build_object('total',count(*),'month',count(*) filter(where date_trunc('month',created_at at time zone (select timezone from organizations where id=p_org))=date_trunc('month',now() at time zone (select timezone from organizations where id=p_org))),'today',count(*) filter(where (created_at at time zone (select timezone from organizations where id=p_org))::date=(now() at time zone (select timezone from organizations where id=p_org))::date),'delivered',count(*) filter(where status='delivered'),'failed',count(*) filter(where status in ('failed','rejected','expired')),'pending',count(*) filter(where status not in ('delivered','failed','rejected','expired')),'contacts',(select count(*) from contacts where organization_id=p_org and status='active'),'approved_senders',(select count(*) from sender_ids where organization_id=p_org and status='approved'),'api_requests',(select count(*) from api_requests where organization_id=p_org),'days',(select jsonb_agg(jsonb_build_object('day',d.day,'total',(select count(*) from messages m where m.organization_id=p_org and (m.created_at at time zone o.timezone)::date=d.day::date),'delivered',(select count(*) from messages m where m.organization_id=p_org and m.status='delivered' and (m.created_at at time zone o.timezone)::date=d.day::date)) order by d.day) from organizations o cross join lateral generate_series((now() at time zone o.timezone)::date-6,(now() at time zone o.timezone)::date,interval '1 day') d(day) where o.id=p_org)) from messages where organization_id=p_org;
$$;
create function platform_stats(p_provider text) returns jsonb language sql stable security definer set search_path=public as $$
select jsonb_build_object('organizations',(select count(*) from organizations),'liability',(select coalesce(sum(available_units+reserved_units),0) from sms_wallets),'balance',(select balance_sms from provider_balance_snapshots where provider=p_provider and success order by checked_at desc limit 1),'provider',p_provider,'revenue',(select jsonb_agg(r) from(select currency,sum(amount)::text as total from payments where status='verified' group by currency)r));
$$;
create function release_job(p_job uuid,p_reason text) returns boolean language plpgsql security definer set search_path=public as $$
declare j campaign_jobs;c campaigns;w sms_wallets;v_units bigint;begin
 select * into j from campaign_jobs where id=p_job for update;
 if j.status='rejected' then return true;end if;if j.status<>'processing' then raise exception 'INVALID_JOB_STATE';end if;
 select * into c from campaigns where id=j.campaign_id for update;v_units=j.recipient_count::bigint*c.estimated_parts;
 if not c.test_mode then
 select * into w from sms_wallets where organization_id=j.organization_id for update;
 update sms_wallets set reserved_units=reserved_units-v_units,available_units=available_units+v_units,updated_at=now() where id=w.id;
 insert into wallet_transactions(organization_id,wallet_id,type,units,direction,reference_type,reference_id,description,balance_before,balance_after) values(j.organization_id,w.id,'reservation_release',v_units,'credit','job',j.id::text,p_reason,w.available_units,w.available_units+v_units);
 update wallet_reservations set released_units=released_units+v_units,status=case when released_units+settled_units+v_units=wallet_reservations.units then 'settled' else 'reserved' end where campaign_id=c.id;
 update campaigns set reserved_units=reserved_units-v_units where id=c.id;
 end if;
 update messages set status='rejected',billing_status='released' where job_id=j.id;
 update campaign_jobs set status='rejected',last_error=p_reason,completed_at=now() where id=j.id;
 update campaigns set status=case when exists(select 1 from campaign_jobs where campaign_id=c.id and status in ('queued','processing')) then 'processing' when exists(select 1 from campaign_jobs where campaign_id=c.id and status='submitted') then 'partially_completed' else 'failed' end where id=c.id;
 return true;end $$;
revoke execute on function dashboard_stats(uuid),platform_stats(text),release_job(uuid,text) from public,anon,authenticated;
grant execute on function dashboard_stats(uuid),platform_stats(text),release_job(uuid,text) to service_role;
