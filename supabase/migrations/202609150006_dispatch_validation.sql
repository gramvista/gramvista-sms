create function validate_job(p_job uuid) returns text language sql stable security definer set search_path=public as $$
select case
 when o.status<>'active' then 'ORGANIZATION_SUSPENDED'
 when s.status<>'approved' then 'SENDER_ID_NOT_APPROVED'
 when exists(select 1 from messages m join suppression_list x on x.organization_id=m.organization_id and x.normalized_phone=m.normalized_phone where m.job_id=j.id) then 'RECIPIENT_SUPPRESSED_AFTER_QUEUE'
 when exists(select 1 from messages m join contacts x on x.organization_id=m.organization_id and x.normalized_phone=m.normalized_phone where m.job_id=j.id and x.status<>'active') then 'RECIPIENT_INACTIVE_AFTER_QUEUE'
 else null end
from campaign_jobs j join campaigns c on c.id=j.campaign_id join organizations o on o.id=j.organization_id join sender_ids s on s.id=c.sender_id_id where j.id=p_job;
$$;
revoke execute on function validate_job(uuid) from public,anon,authenticated;
grant execute on function validate_job(uuid) to service_role;
