create function message_outbox() returns trigger language plpgsql security definer set search_path=public as $$
declare event_name text;begin
 if new.status=old.status or new.status not in ('submitted','delivered','failed') then return new;end if;
 event_name='message.'||new.status;
 insert into webhook_deliveries(organization_id,endpoint_id,event_key,event_type,payload)
 select new.organization_id,e.id,new.message_reference||':'||new.status,event_name,jsonb_build_object('id',new.message_reference||':'||new.status,'type',event_name,'created_at',now(),'data',jsonb_build_object('id',new.message_reference,'recipient',new.normalized_phone,'status',new.status,'test_mode',(select test_mode from campaigns where id=new.campaign_id))) from webhook_endpoints e where e.organization_id=new.organization_id and e.active and event_name=any(e.events) on conflict(endpoint_id,event_key) do nothing;
 return new;end $$;
create trigger message_delivery_outbox after update of status on messages for each row execute function message_outbox();
create function campaign_outbox() returns trigger language plpgsql security definer set search_path=public as $$ begin
 if new.status=old.status or new.status<>'completed' then return new;end if;
 insert into webhook_deliveries(organization_id,endpoint_id,event_key,event_type,payload) select new.organization_id,e.id,new.campaign_reference||':completed','campaign.completed',jsonb_build_object('id',new.campaign_reference||':completed','type','campaign.completed','created_at',now(),'data',jsonb_build_object('id',new.campaign_reference,'status','completed','test_mode',new.test_mode)) from webhook_endpoints e where e.organization_id=new.organization_id and e.active and 'campaign.completed'=any(e.events) on conflict(endpoint_id,event_key) do nothing;
 insert into notifications(organization_id,title,body) values(new.organization_id,'Campaign submission completed',new.name);
 return new;end $$;
create trigger campaign_completion_outbox after update of status on campaigns for each row execute function campaign_outbox();
create function claim_webhook() returns jsonb language plpgsql security definer set search_path=public as $$ declare d webhook_deliveries;begin
 select * into d from webhook_deliveries where (status='pending' or (status='processing' and next_attempt_at<now()-interval '2 minutes')) and next_attempt_at<=now() order by next_attempt_at for update skip locked limit 1;
 if not found then return null;end if;update webhook_deliveries set status='processing',next_attempt_at=now() where id=d.id;return to_jsonb(d);end $$;
create function hold_stale_jobs() returns int language plpgsql security definer set search_path=public as $$ declare n int;begin
 with held as(update campaign_jobs set status='held',last_error='WORKER_INTERRUPTED_SUBMISSION_UNCERTAIN' where status='processing' and started_at<now()-interval '5 minutes' returning campaign_id) update campaigns set status='partially_completed' where id in(select campaign_id from held);get diagnostics n=row_count;return n;end $$;
revoke execute on function message_outbox(),campaign_outbox(),claim_webhook(),hold_stale_jobs() from public,anon,authenticated;
grant execute on function message_outbox(),campaign_outbox(),claim_webhook(),hold_stale_jobs() to service_role;
