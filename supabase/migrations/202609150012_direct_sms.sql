-- Direct SMS uses the existing transactional reservation and delivery pipeline,
-- but is kept out of the customer Campaigns list.
alter table campaigns add column kind text generated always as
 (case when name = 'Direct SMS' then 'direct' else 'campaign' end) stored;
create index campaigns_organization_kind_created_idx
 on campaigns(organization_id,kind,created_at desc);
