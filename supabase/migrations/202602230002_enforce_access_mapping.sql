-- Enforce access levels for known leadership accounts.
-- Guarantees that admin@youragency.com always has full admin access.

create or replace function app.mapped_access_level_for_email(input_email text)
returns app.access_level
language sql
stable
as $$
  select case lower(coalesce(input_email, ''))
    when 'admin@youragency.com' then 'admin'::app.access_level
    when 'leader1@youragency.com' then 'leadership'::app.access_level
    when 'leader2@youragency.com' then 'leadership'::app.access_level
    when 'leader3@youragency.com' then 'leadership'::app.access_level
    else null
  end;
$$;

create or replace function app.enforce_mapped_access_level()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
declare
  mapped_access app.access_level;
begin
  mapped_access := app.mapped_access_level_for_email(new.email::text);
  if mapped_access is not null then
    new.access_level := mapped_access;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_employees_z_enforce_access on app.employees;
create trigger trg_employees_z_enforce_access
before insert or update on app.employees
for each row
execute function app.enforce_mapped_access_level();

-- Ensure the founder/admin row exists and is mapped to full access.
with leadership_dept as (
  select id
  from app.departments
  where name = 'Leadership'
  limit 1
)
insert into app.employees (
  email,
  full_name,
  department_id,
  employment_type,
  access_level,
  role_title,
  leave_tracking_enabled,
  approver_emails,
  is_active
)
select
  'admin@youragency.com'::citext,
  'Admin User',
  ld.id,
  'full-time',
  'admin',
  'Founder',
  true,
  array['admin@youragency.com']::citext[],
  true
from leadership_dept ld
on conflict (email)
do update
set access_level = 'admin',
    role_title = 'Founder',
    is_active = true,
    updated_at = now();

-- Normalize already-present leadership rows to enforced access.
update app.employees e
set access_level = app.mapped_access_level_for_email(e.email::text),
    updated_at = now()
where app.mapped_access_level_for_email(e.email::text) is not null
  and e.access_level is distinct from app.mapped_access_level_for_email(e.email::text);
