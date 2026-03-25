-- Feature request screenshot/image attachments.
-- Storage bucket for files + JSONB columns on both tables.

-- 1. Storage bucket
insert into storage.buckets (id, name, public)
values ('feature-attachments', 'feature-attachments', false)
on conflict (id) do nothing;

-- 2. Storage policies — all authenticated users can upload and read;
--    uploaders + leadership can delete.
create policy fa_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'feature-attachments' and auth.role() = 'authenticated');

create policy fa_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'feature-attachments' and auth.role() = 'authenticated');

create policy fa_storage_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'feature-attachments'
    and (
      (storage.foldername(name))[1] = (select id::text from app.employees where auth_user_id = auth.uid())
      or app.is_leadership_or_admin()
    )
  );

-- 3. JSONB columns — array of {path, name, size}
alter table app.feature_requests
  add column if not exists attachments jsonb default '[]'::jsonb;

alter table app.feature_request_replies
  add column if not exists attachments jsonb default '[]'::jsonb;
