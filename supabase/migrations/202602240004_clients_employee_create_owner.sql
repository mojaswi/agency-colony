-- Allow authenticated employees to create/update clients and projects they own.
-- Delete remains leadership/admin-only.

-- ---------- Clients ----------
drop policy if exists clients_manage_leadership on app.clients;
drop policy if exists clients_insert_own_or_leadership on app.clients;
drop policy if exists clients_update_own_or_leadership on app.clients;
drop policy if exists clients_delete_leadership_only on app.clients;

create policy clients_insert_own_or_leadership
on app.clients
for insert
to authenticated
with check (
  app.is_leadership_or_admin()
  or account_owner_employee_id = app.current_employee_id()
);

create policy clients_update_own_or_leadership
on app.clients
for update
to authenticated
using (
  app.is_leadership_or_admin()
  or account_owner_employee_id = app.current_employee_id()
)
with check (
  app.is_leadership_or_admin()
  or account_owner_employee_id = app.current_employee_id()
);

create policy clients_delete_leadership_only
on app.clients
for delete
to authenticated
using (app.is_leadership_or_admin());

-- ---------- Projects ----------
drop policy if exists projects_manage_leadership on app.projects;
drop policy if exists projects_insert_own_or_leadership on app.projects;
drop policy if exists projects_update_own_or_leadership on app.projects;
drop policy if exists projects_delete_leadership_only on app.projects;

create policy projects_insert_own_or_leadership
on app.projects
for insert
to authenticated
with check (
  app.is_leadership_or_admin()
  or (
    owner_employee_id = app.current_employee_id()
    and exists (
      select 1
      from app.clients c
      where c.id = client_id
        and c.account_owner_employee_id = app.current_employee_id()
    )
  )
);

create policy projects_update_own_or_leadership
on app.projects
for update
to authenticated
using (
  app.is_leadership_or_admin()
  or owner_employee_id = app.current_employee_id()
)
with check (
  app.is_leadership_or_admin()
  or (
    owner_employee_id = app.current_employee_id()
    and exists (
      select 1
      from app.clients c
      where c.id = client_id
        and c.account_owner_employee_id = app.current_employee_id()
    )
  )
);

create policy projects_delete_leadership_only
on app.projects
for delete
to authenticated
using (app.is_leadership_or_admin());
