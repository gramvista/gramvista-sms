insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
('sender-documents','sender-documents',false,10485760,array['application/pdf','image/jpeg','image/png']),
('payment-proofs','payment-proofs',false,10485760,array['application/pdf','image/jpeg','image/png']),
('organization-logos','organization-logos',false,2097152,array['image/jpeg','image/png']) on conflict do nothing;
create policy private_document_read on storage.objects for select to authenticated using (bucket_id in ('sender-documents','payment-proofs','organization-logos') and (public.is_member((storage.foldername(name))[1]::uuid) or public.is_platform_admin()));
create policy private_document_upload on storage.objects for insert to authenticated with check (bucket_id in ('sender-documents','payment-proofs','organization-logos') and exists(select 1 from public.organization_members m join public.role_permissions rp on rp.role_id=m.role_id where m.organization_id=(storage.foldername(name))[1]::uuid and m.user_id=auth.uid() and m.status='active' and rp.permission_id=case bucket_id when 'sender-documents' then 'sender_ids.request' else 'settings.manage' end));
