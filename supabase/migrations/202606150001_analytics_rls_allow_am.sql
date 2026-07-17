-- Align client_analytics RLS with the app's upload permission rule.
--
-- Bug (reported 2026-06-15 by a BD viewer, AM dept): AM-department users can open the
-- analytics uploader (app gate canUploadAnalytics() = isLeadershipOrAM(),
-- js/access.js) but the DB policies only allowed the original uploader or
-- leadership/admin to write. Re-uploading a report a colleague already created
-- is an upsert (unique key client_id,report_type) whose UPDATE branch was denied:
--   "new row violates row-level security policy (USING expression) for table client_analytics"
--
-- Fix: one helper mirroring isLeadershipOrAM(), used by all three write
-- policies so the DB grant matches the app exactly (leadership/admin + AM).

create or replace function app.is_analytics_uploader()
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select app.is_leadership_or_admin() or exists (
    select 1
    from app.employees e
    join app.departments d on d.id = e.department_id
    where e.auth_user_id = auth.uid()
      and e.is_active = true
      and (lower(d.name) in ('am', 'account management')
           or lower(d.name) like 'account mgmt%')
  );
$$;

grant execute on function app.is_analytics_uploader() to authenticated;

-- INSERT: must be an analytics uploader, and you insert as yourself.
drop policy if exists analytics_insert on app.client_analytics;
create policy analytics_insert on app.client_analytics
  for insert
  with check (app.is_analytics_uploader() and uploaded_by = app.current_employee_id());

-- UPDATE: any analytics uploader. Fixes the reported upsert-overwrite failure;
-- also covers insights_cache writes, which hit this same policy.
drop policy if exists analytics_update on app.client_analytics;
create policy analytics_update on app.client_analytics
  for update
  using (app.is_analytics_uploader())
  with check (app.is_analytics_uploader());

-- DELETE: any analytics uploader, consistent with upload/overwrite rights.
drop policy if exists analytics_delete on app.client_analytics;
create policy analytics_delete on app.client_analytics
  for delete
  using (app.is_analytics_uploader());
