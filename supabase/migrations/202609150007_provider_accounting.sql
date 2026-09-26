create function record_provider_cost() returns trigger language plpgsql security definer set search_path=public as $$
declare cost provider_cost_settings;begin
 select * into cost from provider_cost_settings where provider=new.provider;
 if found and cost.cost_per_unit is not null and cost.currency is not null then new.provider_cost=new.message_units*cost.cost_per_unit;new.currency=cost.currency;end if;
 return new;end $$;
create trigger provider_usage_cost before insert on provider_usage for each row execute function record_provider_cost();
create table sender_id_provider_records(id uuid primary key default gen_random_uuid(),organization_id uuid not null references organizations,sender_id_id uuid not null unique references sender_ids,provider text not null default 'kilakona',provider_reference text,notes text,updated_at timestamptz not null default now());
alter table sender_id_provider_records enable row level security;
create index on sender_id_provider_records(organization_id);
grant all on sender_id_provider_records to service_role;
revoke execute on function record_provider_cost() from public,anon,authenticated;
grant execute on function record_provider_cost() to service_role;
