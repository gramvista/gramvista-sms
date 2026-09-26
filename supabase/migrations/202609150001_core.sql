create table profiles (id uuid primary key references auth.users(id), full_name text, created_at timestamptz not null default now());
create table organizations (id uuid primary key default gen_random_uuid(), name text not null, legal_name text not null default '', business_type text not null default '', phone text not null default '', email text not null default '', country text not null default 'TZ', region text, address text, timezone text not null default 'Africa/Dar_es_Salaam', quiet_start int not null default 20 check(quiet_start between 0 and 23), quiet_end int not null default 8 check(quiet_end between 0 and 23), status text not null default 'active' check(status in ('active','suspended','pending','closed')), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table roles (id text primary key, name text not null);
insert into roles values ('owner','Owner'),('administrator','Administrator'),('campaign_manager','Campaign Manager'),('developer','Developer'),('viewer','Viewer');
create table permissions (id text primary key);
insert into permissions select unnest(array['messages.send','messages.read','campaigns.create','campaigns.send','campaigns.read','contacts.manage','sender_ids.request','sender_ids.read','wallet.read','transactions.read','api_keys.manage','webhooks.manage','team.manage','settings.manage']);
create table role_permissions (role_id text references roles, permission_id text references permissions, primary key(role_id,permission_id));
insert into role_permissions select r.id,p.id from roles r cross join permissions p where r.id in ('owner','administrator') or (r.id='campaign_manager' and p.id=any(array['messages.send','messages.read','campaigns.create','campaigns.send','campaigns.read','contacts.manage','sender_ids.read','wallet.read'])) or (r.id='developer' and p.id=any(array['messages.read','campaigns.read','sender_ids.read','wallet.read','api_keys.manage','webhooks.manage'])) or (r.id='viewer' and p.id=any(array['messages.read','campaigns.read','sender_ids.read','wallet.read','transactions.read']));
create table organization_members (id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations, user_id uuid not null references auth.users, role_id text not null references roles, status text not null default 'active', joined_at timestamptz default now(), unique(organization_id,user_id));
create table platform_admins(user_id uuid primary key references auth.users);
create table contacts (id uuid primary key default gen_random_uuid(),organization_id uuid not null references organizations,first_name text not null default '',last_name text not null default '',phone text not null,normalized_phone text not null check(normalized_phone ~ '^\+[1-9][0-9]{7,14}$'),email text,status text not null default 'active' check(status in ('active','invalid','suppressed','archived')),created_at timestamptz not null default now(),updated_at timestamptz default now(),unique(organization_id,normalized_phone),unique(id,organization_id));
create table contact_groups (id uuid primary key default gen_random_uuid(),organization_id uuid not null references organizations,name text not null,description text,created_at timestamptz default now(),unique(id,organization_id));
create table contact_group_members (id uuid primary key default gen_random_uuid(),organization_id uuid not null references organizations,group_id uuid not null,contact_id uuid not null,foreign key(group_id,organization_id) references contact_groups(id,organization_id),foreign key(contact_id,organization_id) references contacts(id,organization_id),unique(group_id,contact_id));
create table tags (id uuid primary key default gen_random_uuid(),organization_id uuid not null references organizations,name text not null,unique(id,organization_id));
create table contact_tags (id uuid primary key default gen_random_uuid(),organization_id uuid not null references organizations,tag_id uuid,contact_id uuid,foreign key(tag_id,organization_id) references tags(id,organization_id),foreign key(contact_id,organization_id) references contacts(id,organization_id));
create table suppression_list (id uuid primary key default gen_random_uuid(),organization_id uuid not null references organizations,phone text not null,normalized_phone text not null,reason text not null default 'manual',source text not null default 'dashboard',created_at timestamptz default now(),created_by uuid,unique(organization_id,normalized_phone));
create table sender_ids (id uuid primary key default gen_random_uuid(),organization_id uuid not null references organizations,sender_name text not null check(sender_name ~ '^[A-Za-z0-9 ]{1,11}$'),legal_business_name text not null,purpose text not null,sample_message text not null,contact_name text,contact_phone text,contact_email text,status text not null default 'submitted' check(status in ('draft','submitted','gramvista_review','provider_pending','approved','rejected','suspended','expired')),submitted_at timestamptz default now(),approved_at timestamptz,rejected_at timestamptz,rejection_reason text,created_at timestamptz default now(),updated_at timestamptz default now(),unique(organization_id,sender_name),unique(id,organization_id));
create table sender_id_documents (id uuid primary key default gen_random_uuid(),organization_id uuid not null references organizations,sender_id_id uuid not null,storage_path text not null,document_type text not null,created_at timestamptz default now(),foreign key(sender_id_id,organization_id) references sender_ids(id,organization_id));
create table sms_wallets (id uuid primary key default gen_random_uuid(),organization_id uuid not null unique references organizations,available_units bigint not null default 0 check(available_units>=0),reserved_units bigint not null default 0 check(reserved_units>=0),updated_at timestamptz default now());
create table wallet_transactions (id uuid primary key default gen_random_uuid(),organization_id uuid not null references organizations,wallet_id uuid not null references sms_wallets,type text not null,units bigint not null check(units>=0),direction text not null check(direction in ('credit','debit','neutral')),reference_type text not null,reference_id text not null,description text not null,balance_before bigint not null,balance_after bigint not null,created_at timestamptz not null default now(),created_by uuid,unique(organization_id,type,reference_id));
create table campaigns (id uuid primary key default gen_random_uuid(),organization_id uuid not null references organizations,campaign_reference text not null unique default ('gvs_cmp_'||replace(gen_random_uuid()::text,'-','')),name text not null,sender_id_id uuid not null,message text not null,message_type text default 'text',encoding text not null,estimated_parts int not null check(estimated_parts>0),status text not null default 'queued',scheduled_at timestamptz,recipient_count int not null,eligible_count int not null,invalid_count int not null default 0,duplicate_count int not null default 0,suppressed_count int not null default 0,estimated_units bigint not null,reserved_units bigint not null default 0,charged_units bigint not null default 0,test_mode boolean not null default false,created_by uuid,created_at timestamptz not null default now(),started_at timestamptz,completed_at timestamptz,foreign key(sender_id_id,organization_id) references sender_ids(id,organization_id),unique(id,organization_id));
create table wallet_reservations (id uuid primary key default gen_random_uuid(),organization_id uuid not null references organizations,wallet_id uuid not null references sms_wallets,campaign_id uuid not null unique references campaigns,units bigint not null check(units>0),settled_units bigint not null default 0,released_units bigint not null default 0,status text not null default 'reserved',created_at timestamptz default now());
create table campaign_jobs (id uuid primary key default gen_random_uuid(),organization_id uuid not null references organizations,campaign_id uuid not null,batch_number int not null,status text not null default 'queued',recipient_count int not null,attempts int not null default 0,scheduled_at timestamptz not null default now(),started_at timestamptz,completed_at timestamptz,last_error text,foreign key(campaign_id,organization_id) references campaigns(id,organization_id),unique(campaign_id,batch_number));
create table messages (id uuid primary key default gen_random_uuid(),organization_id uuid not null references organizations,message_reference text not null unique default ('gvs_msg_'||replace(gen_random_uuid()::text,'-','')),campaign_id uuid not null,job_id uuid not null references campaign_jobs,normalized_phone text not null,message_snapshot text not null,status text not null default 'queued',provider_status text,provider_status_code text,billing_status text not null default 'reserved',sent_at timestamptz,delivered_at timestamptz,failed_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz default now(),foreign key(campaign_id,organization_id) references campaigns(id,organization_id),unique(campaign_id,normalized_phone));
create view campaign_recipients with(security_invoker=true) as select * from messages;
create table providers (id uuid primary key default gen_random_uuid(),code text not null unique,name text not null,status text not null default 'healthy',active boolean not null default true,last_success_at timestamptz,last_failure_at timestamptz,created_at timestamptz default now());
insert into providers(code,name) values ('mock','Development simulator'),('kilakona','Kilakona Messaging');
create table provider_submissions (id uuid primary key default gen_random_uuid(),organization_id uuid not null references organizations,campaign_id uuid not null references campaigns,job_id uuid not null unique references campaign_jobs,provider text not null,provider_reference text not null,shoot_id text not null,request_recipient_count int not null,valid_contacts int not null,invalid_contacts int not null,duplicated_contacts int not null,message_size int,raw_response_json jsonb,submitted_at timestamptz default now(),reconciled_at timestamptz,status text default 'submitted');
create index on provider_submissions(provider_reference); create index on provider_submissions(shoot_id);
create table provider_events (id uuid primary key default gen_random_uuid(),provider text not null,provider_reference text,event_type text,raw_payload_json jsonb,received_at timestamptz default now(),processed_at timestamptz,processing_status text default 'unverified',error_message text);
create table provider_balance_snapshots (id uuid primary key default gen_random_uuid(),provider text not null,balance_sms bigint,success boolean not null,checked_at timestamptz default now(),raw_response_json jsonb);
create table provider_usage (id uuid primary key default gen_random_uuid(),provider text not null,provider_submission_id uuid unique references provider_submissions,message_units bigint not null,provider_cost numeric(20,4),currency text,created_at timestamptz default now());
create table provider_cost_settings (id uuid primary key default gen_random_uuid(),provider text unique not null,cost_per_unit numeric(20,6),currency text,warning_threshold bigint not null default 10000,critical_threshold bigint not null default 1000,reserve_threshold bigint not null default 0);
insert into provider_cost_settings(provider) values ('kilakona'),('mock');
create table message_templates (id uuid primary key default gen_random_uuid(),organization_id uuid not null references organizations,name text not null,category text not null default 'notification',message text not null,active boolean default true,created_at timestamptz default now(),updated_at timestamptz default now());
create table sms_packages (id uuid primary key default gen_random_uuid(),name text not null,description text,sms_units bigint not null check(sms_units>0),selling_price numeric(20,2) not null check(selling_price>=0),currency text not null default 'TZS',active boolean not null default true,valid_from timestamptz,valid_until timestamptz,sort_order int default 0);
create table pricing_tiers (id uuid primary key default gen_random_uuid(),name text not null,minimum_units bigint not null,maximum_units bigint,price_per_sms numeric(20,6) not null,currency text not null,customer_type text,active boolean default true);
create table payments (id uuid primary key default gen_random_uuid(),organization_id uuid not null references organizations,amount numeric(20,2) not null,currency text not null,method text not null default 'manual',reference text not null unique,status text not null default 'pending',package_id uuid references sms_packages,sms_units bigint not null check(sms_units>0),verified_at timestamptz,verified_by uuid,created_at timestamptz default now());
create table invoices (id uuid primary key default gen_random_uuid(),organization_id uuid not null references organizations,payment_id uuid unique references payments,invoice_reference text not null unique,amount numeric(20,2) not null,currency text not null,created_at timestamptz default now());
create table api_keys (id uuid primary key default gen_random_uuid(),organization_id uuid not null references organizations,name text not null,key_prefix text not null,key_hash text not null unique,environment text not null check(environment in ('test','live')),permissions text[] not null,created_by uuid not null,requests_per_minute int not null default 60,expires_at timestamptz,revoked_at timestamptz,last_used_at timestamptz,created_at timestamptz default now());
create table api_requests (id uuid primary key default gen_random_uuid(),organization_id uuid not null references organizations,api_key_id uuid references api_keys,request_id text not null,path text not null,created_at timestamptz default now());
create table idempotency_keys (id uuid primary key default gen_random_uuid(),organization_id uuid not null references organizations,key text not null,fingerprint text not null,test_mode boolean not null,response jsonb not null,created_at timestamptz default now(),unique(organization_id,key,test_mode));
create table webhook_endpoints (id uuid primary key default gen_random_uuid(),organization_id uuid not null references organizations,url text not null,events text[] not null,secret text not null,active boolean not null default true,created_at timestamptz default now());
create table webhook_deliveries (id uuid primary key default gen_random_uuid(),organization_id uuid not null references organizations,endpoint_id uuid not null references webhook_endpoints,event_key text not null,event_type text not null,payload jsonb not null,status text not null default 'pending',attempts int not null default 0,next_attempt_at timestamptz not null default now(),last_status_code int,created_at timestamptz default now(),unique(endpoint_id,event_key));
create table notifications (id uuid primary key default gen_random_uuid(),organization_id uuid not null references organizations,title text not null,body text,read_at timestamptz,created_at timestamptz not null default now());
create table audit_logs (id uuid primary key default gen_random_uuid(),organization_id uuid references organizations,actor_id uuid,action text not null,resource_id text,details jsonb,created_at timestamptz not null default now());

create function is_member(org uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from organization_members where organization_id=org and user_id=auth.uid() and status='active') $$;
create function is_platform_admin() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from platform_admins where user_id=auth.uid()) $$;
do $$ declare t text; begin
 for t in select table_name from information_schema.columns where table_schema='public' and column_name='organization_id' and table_name not in ('campaign_recipients') loop
 execute format('create index on %I(organization_id)',t);
 end loop;
 for t in select tablename from pg_tables where schemaname='public' loop
 execute format('alter table %I enable row level security',t);
 end loop;
 for t in select unnest(array['organizations','organization_members','contacts','contact_groups','contact_group_members','tags','contact_tags','suppression_list','sender_ids','sender_id_documents','sms_wallets','wallet_transactions','wallet_reservations','campaigns','campaign_jobs','messages','message_templates','payments','invoices','notifications']) loop
 execute format('create policy tenant_read on %I for select to authenticated using (is_member(%s))',t,case when t='organizations' then 'id' else 'organization_id' end);
 end loop;
end $$;
create policy own_profile on profiles for select to authenticated using(id=auth.uid());
create policy packages_read on sms_packages for select to authenticated using(active);
create policy roles_read on roles for select to authenticated using(true);
create policy permissions_read on permissions for select to authenticated using(true);
create policy role_permissions_read on role_permissions for select to authenticated using(true);
create index on messages(campaign_id,status); create index on messages(normalized_phone); create index on messages(organization_id,created_at desc); create index on campaigns(organization_id,created_at desc); create index on campaign_jobs(status,scheduled_at); create index on webhook_deliveries(status,next_attempt_at); create index on api_requests(api_key_id,created_at);

create function immutable_ledger() returns trigger language plpgsql as $$ begin raise exception 'Ledger records are immutable'; end $$;
create trigger wallet_ledger_immutable before update or delete on wallet_transactions for each row execute function immutable_ledger();

create function onboard(p_user uuid,p_name text,p_legal text,p_phone text,p_email text,p_type text,p_country text) returns jsonb language plpgsql security definer set search_path=public as $$
declare o organizations; begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if exists(select 1 from organization_members where user_id=p_user) then raise exception 'ALREADY_ONBOARDED'; end if;
 insert into organizations(name,legal_name,phone,email,business_type,country) values(p_name,p_legal,p_phone,p_email,p_type,p_country) returning * into o;
 insert into organization_members(organization_id,user_id,role_id) values(o.id,p_user,'owner');
 insert into sms_wallets(organization_id) values(o.id);
 insert into profiles(id,full_name) values(p_user,p_name) on conflict do nothing;
 return to_jsonb(o); end $$;

create function wallet_adjust(p_org uuid,p_units bigint,p_reference text,p_reason text,p_actor uuid,p_type text default 'manual_credit') returns jsonb language plpgsql security definer set search_path=public as $$
declare w sms_wallets; tx wallet_transactions; begin
 if p_units=0 or length(trim(p_reason))<3 or length(trim(p_reference))<3 then raise exception 'VALIDATION_FAILED'; end if;
 select * into w from sms_wallets where organization_id=p_org for update;
 if not found then raise exception 'NOT_FOUND';end if;
 select * into tx from wallet_transactions where organization_id=p_org and type=p_type and reference_id=p_reference;
 if found then if tx.units<>abs(p_units) or tx.direction<>(case when p_units>0 then 'credit' else 'debit' end) then raise exception 'IDEMPOTENCY_CONFLICT';end if;return to_jsonb(tx);end if;
 if w.available_units+p_units<0 then raise exception 'INSUFFICIENT_SMS_BALANCE';end if;
 update sms_wallets set available_units=available_units+p_units,updated_at=now() where id=w.id;
 insert into wallet_transactions(organization_id,wallet_id,type,units,direction,reference_type,reference_id,description,balance_before,balance_after,created_by) values(p_org,w.id,p_type,abs(p_units),case when p_units>0 then 'credit' else 'debit' end,'adjustment',p_reference,p_reason,w.available_units,w.available_units+p_units,p_actor) returning * into tx;
 insert into audit_logs(organization_id,actor_id,action,resource_id,details) values(p_org,p_actor,p_type,tx.id::text,jsonb_build_object('reason',p_reason,'units',p_units));
 insert into notifications(organization_id,title,body) values(p_org,'SMS wallet updated',p_reason);
 return to_jsonb(tx);end $$;

create function enqueue_campaign(p_org uuid,p_sender text,p_name text,p_message text,p_phones text[],p_parts int,p_encoding text,p_key text,p_fingerprint text,p_test boolean,p_schedule timestamptz,p_actor uuid,p_batch int,p_invalid int default 0,p_duplicates int default 0) returns jsonb language plpgsql security definer set search_path=public as $$
declare w sms_wallets; s sender_ids; c campaigns; j uuid; phones text[]; n int; i int; cnt int; old idempotency_keys; result jsonb; units bigint; begin
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||p_key||p_test::text,0));
 select * into old from idempotency_keys where organization_id=p_org and key=p_key and test_mode=p_test;
 if found then if old.fingerprint<>p_fingerprint then raise exception 'IDEMPOTENCY_CONFLICT';end if;return old.response;end if;
 if not exists(select 1 from organizations where id=p_org and status='active') then raise exception 'ORGANIZATION_SUSPENDED';end if;
 select * into s from sender_ids where organization_id=p_org and sender_name=p_sender for share;
 if not found then raise exception 'INVALID_SENDER_ID';end if;
 if s.status<>'approved' then raise exception 'SENDER_ID_NOT_APPROVED';end if;
 if p_parts<1 or p_parts>100 or p_batch<1 or p_batch>10000 or length(p_message)=0 or cardinality(p_phones)>10000 then raise exception 'VALIDATION_FAILED';end if;
 if exists(select 1 from unnest(p_phones) phone where phone !~ '^\+[1-9][0-9]{7,14}$') then raise exception 'INVALID_PHONE';end if;
 select array_agg(distinct candidate.phone order by candidate.phone) into phones from unnest(p_phones) candidate(phone) where not exists(select 1 from suppression_list where organization_id=p_org and normalized_phone=candidate.phone) and not exists(select 1 from contacts where organization_id=p_org and normalized_phone=candidate.phone and status in ('suppressed','archived','invalid'));
 n=coalesce(cardinality(phones),0); if n=0 then raise exception 'NO_ELIGIBLE_RECIPIENTS';end if;units=n::bigint*p_parts;
 select * into w from sms_wallets where organization_id=p_org for update;
 if not p_test and w.available_units<units then raise exception 'INSUFFICIENT_SMS_BALANCE';end if;
 insert into campaigns(organization_id,name,sender_id_id,message,encoding,estimated_parts,status,scheduled_at,recipient_count,eligible_count,invalid_count,duplicate_count,suppressed_count,estimated_units,reserved_units,test_mode,created_by) values(p_org,p_name,s.id,p_message,p_encoding,p_parts,case when p_schedule>now() then 'scheduled' else 'queued' end,p_schedule,cardinality(p_phones)+p_invalid+p_duplicates,n,p_invalid,p_duplicates,cardinality(p_phones)-n,units,case when p_test then 0 else units end,p_test,p_actor) returning * into c;
 if not p_test then
 update sms_wallets set available_units=available_units-units,reserved_units=reserved_units+units,updated_at=now() where id=w.id;
 insert into wallet_reservations(organization_id,wallet_id,campaign_id,units) values(p_org,w.id,c.id,units);
 insert into wallet_transactions(organization_id,wallet_id,type,units,direction,reference_type,reference_id,description,balance_before,balance_after,created_by) values(p_org,w.id,'reservation',units,'debit','campaign',c.id::text,'Reserved for '||p_name,w.available_units,w.available_units-units,p_actor);
 end if;
 i=1;while i<=n loop
 cnt=least(p_batch,n-i+1);
 insert into campaign_jobs(organization_id,campaign_id,batch_number,recipient_count,scheduled_at) values(p_org,c.id,(i-1)/p_batch+1,cnt,coalesce(p_schedule,now())) returning id into j;
 insert into messages(organization_id,campaign_id,job_id,normalized_phone,message_snapshot,billing_status) select p_org,c.id,j,phone,p_message,case when p_test then 'released' else 'reserved' end from unnest(phones[i:i+cnt-1]) phone;
 i=i+cnt;end loop;
 result=jsonb_build_object('success',true,'message_batch_id',c.campaign_reference,'campaign_id',c.id,'recipients',n,'estimated_units',units,'status',c.status,'test_mode',p_test);
 insert into idempotency_keys(organization_id,key,fingerprint,test_mode,response) values(p_org,p_key,p_fingerprint,p_test,result);
 return result;end $$;

create function claim_job() returns jsonb language plpgsql security definer set search_path=public as $$ declare j campaign_jobs;begin
 select q.* into j from campaign_jobs q join campaigns c on c.id=q.campaign_id join organizations o on o.id=q.organization_id where q.status='queued' and q.scheduled_at<=now() and o.status='active' and c.status not in ('cancelled','failed') order by q.scheduled_at for update of q skip locked limit 1;
 if not found then return null;end if;
 update campaign_jobs set status='processing',attempts=attempts+1,started_at=now() where id=j.id;
 update campaigns set status='processing',started_at=coalesce(started_at,now()) where id=j.campaign_id;
 return to_jsonb(j);end $$;

create function settle_job(p_job uuid,p_provider text,p_reference text,p_valid int,p_invalid int,p_duplicates int,p_size int,p_raw jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare j campaign_jobs;c campaigns;w sms_wallets;charged bigint;release bigint;sub uuid;begin
 select * into j from campaign_jobs where id=p_job for update;
 if j.status='submitted' then return jsonb_build_object('success',true);end if;
 if j.status<>'processing' then raise exception 'INVALID_JOB_STATE';end if;
 select * into c from campaigns where id=j.campaign_id for update;
 if p_valid<0 or p_valid>j.recipient_count then raise exception 'INVALID_PROVIDER_COUNTS';end if;
 insert into provider_submissions(organization_id,campaign_id,job_id,provider,provider_reference,shoot_id,request_recipient_count,valid_contacts,invalid_contacts,duplicated_contacts,message_size,raw_response_json) values(j.organization_id,j.campaign_id,j.id,p_provider,p_reference,p_reference,j.recipient_count,p_valid,p_invalid,p_duplicates,p_size,p_raw) returning id into sub;
 charged=p_valid::bigint*c.estimated_parts;release=(j.recipient_count-p_valid)::bigint*c.estimated_parts;
 if not c.test_mode then
 select * into w from sms_wallets where organization_id=j.organization_id for update;
 update sms_wallets set reserved_units=reserved_units-charged-release,available_units=available_units+release,updated_at=now() where id=w.id;
 insert into wallet_transactions(organization_id,wallet_id,type,units,direction,reference_type,reference_id,description,balance_before,balance_after) values(j.organization_id,w.id,'campaign_debit',charged,'neutral','job',j.id::text,'Settled reserved SMS units',w.available_units,w.available_units);
 if release>0 then insert into wallet_transactions(organization_id,wallet_id,type,units,direction,reference_type,reference_id,description,balance_before,balance_after) values(j.organization_id,w.id,'reservation_release',release,'credit','job',j.id::text,'Released unaccepted units',w.available_units,w.available_units+release);end if;
 update wallet_reservations set settled_units=settled_units+charged,released_units=released_units+release,status=case when settled_units+released_units+charged+release=units then 'settled' else 'reserved' end where campaign_id=c.id;
 update campaigns set reserved_units=reserved_units-charged-release,charged_units=charged_units+charged where id=c.id;
 end if;
 update messages set status='submitted',billing_status=case when c.test_mode then 'released' when p_valid=j.recipient_count then 'charged' else 'unknown' end,sent_at=now(),updated_at=now() where job_id=j.id;
 update campaign_jobs set status='submitted',completed_at=now() where id=j.id;
 insert into provider_usage(provider,provider_submission_id,message_units) values(p_provider,sub,case when c.test_mode then 0 else charged end);
 if not exists(select 1 from campaign_jobs where campaign_id=c.id and status<>'submitted') then update campaigns set status='completed',completed_at=now() where id=c.id;end if;
 return jsonb_build_object('success',true);end $$;

create function cancel_campaign(p_org uuid,p_id uuid,p_actor uuid) returns jsonb language plpgsql security definer set search_path=public as $$ declare c campaigns;w sms_wallets;begin
 select * into c from campaigns where id=p_id and organization_id=p_org for update;
 if not found then raise exception 'NOT_FOUND';end if;
 if c.status='cancelled' then return to_jsonb(c);end if;
 if c.status not in ('scheduled','queued') or exists(select 1 from campaign_jobs where campaign_id=c.id and status<>'queued') then raise exception 'CAMPAIGN_ALREADY_STARTED';end if;
 if not c.test_mode then
 select * into w from sms_wallets where organization_id=p_org for update;
 update sms_wallets set available_units=available_units+c.reserved_units,reserved_units=reserved_units-c.reserved_units where id=w.id;
 insert into wallet_transactions(organization_id,wallet_id,type,units,direction,reference_type,reference_id,description,balance_before,balance_after,created_by) values(p_org,w.id,'reservation_release',c.reserved_units,'credit','campaign',c.id::text,'Campaign cancelled',w.available_units,w.available_units+c.reserved_units,p_actor);
 update wallet_reservations set status='released',released_units=units where campaign_id=c.id;
 end if;
 update campaign_jobs set status='cancelled' where campaign_id=c.id;
 update messages set status='rejected',billing_status='released' where campaign_id=c.id;
 update campaigns set status='cancelled',reserved_units=0 where id=c.id;
 insert into audit_logs(organization_id,actor_id,action,resource_id) values(p_org,p_actor,'campaign.cancelled',c.id::text);
 return jsonb_build_object('success',true);end $$;

create function verify_payment(p_id uuid,p_actor uuid) returns jsonb language plpgsql security definer set search_path=public as $$ declare p payments;result jsonb;begin
 select * into p from payments where id=p_id for update;if not found then raise exception 'NOT_FOUND';end if;
 if p.status='verified' then return to_jsonb(p);end if;if p.status<>'pending' then raise exception 'INVALID_PAYMENT_STATE';end if;
 result=wallet_adjust(p.organization_id,p.sms_units,p.id::text,'Verified payment '||p.reference,p_actor,'sms_purchase');
 update payments set status='verified',verified_at=now(),verified_by=p_actor where id=p.id;
 insert into invoices(organization_id,payment_id,invoice_reference,amount,currency) values(p.organization_id,p.id,'GVS-'||upper(left(p.id::text,8)),p.amount,p.currency);
 return result;end $$;

create function consume_rate(p_key uuid,p_org uuid,p_request text,p_path text,p_limit int) returns boolean language plpgsql security definer set search_path=public as $$ begin
 perform pg_advisory_xact_lock(hashtextextended(p_key::text,0));
 if (select count(*) from api_requests where api_key_id=p_key and created_at>now()-interval '1 minute')>=p_limit then return false;end if;
 insert into api_requests(organization_id,api_key_id,request_id,path) values(p_org,p_key,p_request,p_path);return true;end $$;

-- All mutations pass through authenticated, permission-checked server handlers.
revoke all on all tables in schema public from anon,authenticated;
grant select on profiles,organizations,organization_members,roles,permissions,role_permissions,contacts,contact_groups,contact_group_members,tags,contact_tags,suppression_list,sender_ids,sender_id_documents,campaigns,campaign_jobs,messages,campaign_recipients,sms_wallets,wallet_transactions,wallet_reservations,message_templates,sms_packages,payments,invoices,notifications to authenticated;
revoke execute on all functions in schema public from public,anon,authenticated;
grant execute on function is_member(uuid),is_platform_admin() to authenticated;
grant all on all tables in schema public to service_role;
grant execute on all functions in schema public to service_role;
