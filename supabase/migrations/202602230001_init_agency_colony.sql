-- Agency Colony production schema (Supabase)
-- Locked rules included:
-- 1) @youragency.com email restriction
-- 2) Department approver routing
-- 3) Finance leave workflow excluded in v1

create extension if not exists pgcrypto;
create extension if not exists citext;

create schema if not exists app;

-- ---------- Types ----------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'access_level' and typnamespace = 'app'::regnamespace) then
    create type app.access_level as enum ('employee', 'leadership', 'admin');
  end if;

  if not exists (select 1 from pg_type where typname = 'employment_type' and typnamespace = 'app'::regnamespace) then
    create type app.employment_type as enum ('full-time', 'fractional');
  end if;

  if not exists (select 1 from pg_type where typname = 'engagement_type' and typnamespace = 'app'::regnamespace) then
    create type app.engagement_type as enum ('retainer', 'project');
  end if;

  if not exists (select 1 from pg_type where typname = 'allocation_period_type' and typnamespace = 'app'::regnamespace) then
    create type app.allocation_period_type as enum ('week', 'month');
  end if;

  if not exists (select 1 from pg_type where typname = 'task_status' and typnamespace = 'app'::regnamespace) then
    create type app.task_status as enum ('pending', 'in_progress', 'done');
  end if;

  if not exists (select 1 from pg_type where typname = 'leave_type' and typnamespace = 'app'::regnamespace) then
    create type app.leave_type as enum ('PL', 'CL', 'SL');
  end if;

  if not exists (select 1 from pg_type where typname = 'leave_status' and typnamespace = 'app'::regnamespace) then
    create type app.leave_status as enum ('pending', 'approved', 'rejected', 'cancelled');
  end if;

  if not exists (select 1 from pg_type where typname = 'notification_kind' and typnamespace = 'app'::regnamespace) then
    create type app.notification_kind as enum (
      'daily_tasklist_reminder',
      'weekly_allocation_reminder',
      'leave_submitted',
      'pending_leave_digest'
    );
  end if;
end;
$$;

-- ---------- Core tables ----------
create table if not exists app.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  approver_email citext,
  leave_tracking_enabled boolean not null default true,
  sort_order int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint department_approver_domain_ck check (
    approver_email is null or approver_email::text like '%@youragency.com'
  )
);

create table if not exists app.employees (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  email citext not null unique,
  full_name text not null,
  department_id uuid not null references app.departments(id),
  employment_type app.employment_type not null default 'full-time',
  access_level app.access_level not null default 'employee',
  role_title text,
  capacity_percent numeric(5,2) not null default 100,
  leave_tracking_enabled boolean not null default true,
  approver_emails citext[] not null default '{}'::citext[],
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_email_domain_ck check (email::text like '%@youragency.com'),
  constraint employee_capacity_ck check (capacity_percent > 0 and capacity_percent <= 100)
);

create table if not exists app.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  account_owner_employee_id uuid references app.employees(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app.projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references app.clients(id) on delete cascade,
  name text not null,
  engagement_type app.engagement_type not null,
  status text not null default 'active',
  owner_employee_id uuid references app.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, name)
);

create table if not exists app.allocations (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references app.employees(id) on delete cascade,
  project_id uuid not null references app.projects(id) on delete cascade,
  period_type app.allocation_period_type not null,
  period_start date not null,
  allocation_percent numeric(5,2) not null,
  notes text,
  created_by_employee_id uuid references app.employees(id) on delete set null,
  overridden_by_employee_id uuid references app.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint allocation_percent_ck check (allocation_percent >= 0 and allocation_percent <= 100),
  unique (employee_id, project_id, period_type, period_start)
);

create index if not exists allocations_employee_period_idx on app.allocations (employee_id, period_type, period_start);
create index if not exists allocations_updated_at_idx on app.allocations (updated_at desc);

create table if not exists app.daily_tasks (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references app.employees(id) on delete cascade,
  task_date date not null default current_date,
  project_id uuid references app.projects(id) on delete set null,
  task_title text not null,
  status app.task_status not null default 'pending',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists daily_tasks_employee_date_idx on app.daily_tasks (employee_id, task_date desc);

create table if not exists app.leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references app.employees(id) on delete cascade,
  leave_type app.leave_type not null,
  start_date date not null,
  end_date date not null,
  reason text,
  medical_certificate_url text,
  status app.leave_status not null default 'pending',
  approver_emails citext[] not null default '{}'::citext[],
  decided_by_employee_id uuid references app.employees(id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leave_date_range_ck check (end_date >= start_date)
);

create index if not exists leave_requests_employee_idx on app.leave_requests (employee_id, created_at desc);
create index if not exists leave_requests_status_idx on app.leave_requests (status, start_date);

create table if not exists app.notification_log (
  id uuid primary key default gen_random_uuid(),
  kind app.notification_kind not null,
  recipient_email citext not null,
  subject text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'sent',
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notification_log_kind_created_idx on app.notification_log (kind, created_at desc);

-- ---------- Utility functions ----------
create or replace function app.now_utc()
returns timestamptz
language sql
stable
as $$
  select now();
$$;

create or replace function app.is_agency_email(input_email text)
returns boolean
language sql
stable
as $$
  select coalesce(lower(input_email) like '%@youragency.com', false);
$$;

create or replace function app.current_request_email()
returns text
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

create or replace function app.current_employee_id()
returns uuid
language sql
stable
security definer
set search_path = app, public
as $$
  select e.id
  from app.employees e
  where e.auth_user_id = auth.uid()
    and e.is_active = true
  limit 1;
$$;

create or replace function app.current_access_level()
returns app.access_level
language sql
stable
security definer
set search_path = app, public
as $$
  select e.access_level
  from app.employees e
  where e.auth_user_id = auth.uid()
    and e.is_active = true
  limit 1;
$$;

create or replace function app.is_leadership_or_admin()
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select exists (
    select 1
    from app.employees e
    where e.auth_user_id = auth.uid()
      and e.is_active = true
      and e.access_level in ('leadership', 'admin')
  );
$$;

create or replace function app.is_leave_tracking_enabled_for_employee(target_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select coalesce(e.leave_tracking_enabled, false)
  from app.employees e
  where e.id = target_employee_id;
$$;

create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function app.normalize_employee_record()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
declare
  dept app.departments%rowtype;
  normalized_approvers citext[];
begin
  if new.email is null then
    raise exception 'Employee email is required';
  end if;

  new.email := lower(trim(new.email::text))::citext;

  if not app.is_agency_email(new.email::text) then
    raise exception 'Only @youragency.com accounts are allowed.';
  end if;

  select *
  into dept
  from app.departments d
  where d.id = new.department_id;

  if not found then
    raise exception 'Department is required for employee records.';
  end if;

  normalized_approvers := (
    select coalesce(
      array_agg(distinct lower(trim(x::text))::citext)
      filter (where x is not null and trim(x::text) <> ''),
      '{}'::citext[]
    )
    from unnest(coalesce(new.approver_emails, '{}'::citext[])) as x
  );

  if dept.leave_tracking_enabled = false or lower(dept.name) = 'finance' then
    new.leave_tracking_enabled := false;
    new.approver_emails := '{}'::citext[];
  else
    new.leave_tracking_enabled := coalesce(new.leave_tracking_enabled, true);

    if new.leave_tracking_enabled = false then
      new.approver_emails := '{}'::citext[];
    elsif coalesce(array_length(normalized_approvers, 1), 0) = 0 and dept.approver_email is not null then
      new.approver_emails := array[lower(dept.approver_email::text)::citext];
    else
      new.approver_emails := normalized_approvers;
    end if;
  end if;

  return new;
end;
$$;

create or replace function app.prepare_leave_request()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
declare
  employee_row app.employees%rowtype;
  dept_row app.departments%rowtype;
  computed_approvers citext[];
  requested_days int;
begin
  select *
  into employee_row
  from app.employees e
  where e.id = new.employee_id
    and e.is_active = true;

  if not found then
    raise exception 'Active employee record not found.';
  end if;

  if employee_row.leave_tracking_enabled = false then
    raise exception 'Finance leave workflow is excluded from Agency Colony v1.';
  end if;

  if new.end_date < new.start_date then
    raise exception 'Leave end date cannot be before start date.';
  end if;

  requested_days := (new.end_date - new.start_date) + 1;

  if new.leave_type = 'SL' and requested_days >= 3 and coalesce(new.medical_certificate_url, '') = '' then
    raise exception 'SL requests for 3+ days require a medical certificate URL.';
  end if;

  select *
  into dept_row
  from app.departments d
  where d.id = employee_row.department_id;

  computed_approvers := employee_row.approver_emails;

  if coalesce(array_length(computed_approvers, 1), 0) = 0 and dept_row.approver_email is not null then
    computed_approvers := array[lower(dept_row.approver_email::text)::citext];
  end if;

  if coalesce(array_length(computed_approvers, 1), 0) = 0 then
    raise exception 'No leave approver configured for this employee/department.';
  end if;

  new.approver_emails := computed_approvers;

  if tg_op = 'UPDATE' then
    if old.status <> new.status and new.status in ('approved', 'rejected') then
      if new.decided_by_employee_id is null then
        new.decided_by_employee_id := app.current_employee_id();
      end if;
      if new.decided_at is null then
        new.decided_at := now();
      end if;
    elsif new.status = 'pending' then
      new.decided_by_employee_id := null;
      new.decided_at := null;
      new.decision_note := null;
    end if;
  end if;

  return new;
end;
$$;

-- Bootstrap auth user into employee record on first login.
create or replace function app.ensure_employee_profile()
returns app.employees
language plpgsql
security definer
set search_path = app, public
as $$
declare
  request_email text;
  request_name text;
  fallback_department_id uuid;
  found_employee app.employees%rowtype;
begin
  request_email := app.current_request_email();

  if not app.is_agency_email(request_email) then
    raise exception 'Access denied. Use @youragency.com Google Workspace account.';
  end if;

  request_name := coalesce(
    nullif(auth.jwt() -> 'user_metadata' ->> 'full_name', ''),
    split_part(request_email, '@', 1)
  );

  select d.id
  into fallback_department_id
  from app.departments d
  where d.name = 'Acc Management'
  limit 1;

  -- Try by auth user id first.
  select *
  into found_employee
  from app.employees e
  where e.auth_user_id = auth.uid()
  limit 1;

  if found then
    if found_employee.email::text <> request_email then
      update app.employees
      set email = request_email::citext,
          full_name = coalesce(nullif(found_employee.full_name, ''), request_name)
      where id = found_employee.id
      returning * into found_employee;
    end if;

    return found_employee;
  end if;

  -- Existing email row (seeded) should get linked to auth uid.
  select *
  into found_employee
  from app.employees e
  where e.email = request_email::citext
  limit 1;

  if found then
    update app.employees
    set auth_user_id = auth.uid(),
        full_name = coalesce(nullif(found_employee.full_name, ''), request_name),
        is_active = true
    where id = found_employee.id
    returning * into found_employee;

    return found_employee;
  end if;

  -- First sign-in self-creates employee profile as standard employee.
  insert into app.employees (
    auth_user_id,
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
  values (
    auth.uid(),
    request_email::citext,
    request_name,
    fallback_department_id,
    'full-time',
    'employee',
    'Employee',
    true,
    '{}'::citext[],
    true
  )
  returning * into found_employee;

  return found_employee;
end;
$$;

create or replace function app.submit_leave_request(
  p_leave_type app.leave_type,
  p_start_date date,
  p_end_date date,
  p_reason text default null,
  p_medical_certificate_url text default null
)
returns app.leave_requests
language plpgsql
security definer
set search_path = app, public
as $$
declare
  requester_employee_id uuid;
  inserted_row app.leave_requests%rowtype;
begin
  requester_employee_id := app.current_employee_id();

  if requester_employee_id is null then
    raise exception 'Employee profile not found. Please complete account bootstrap.';
  end if;

  insert into app.leave_requests (
    employee_id,
    leave_type,
    start_date,
    end_date,
    reason,
    medical_certificate_url
  )
  values (
    requester_employee_id,
    p_leave_type,
    p_start_date,
    p_end_date,
    nullif(p_reason, ''),
    nullif(p_medical_certificate_url, '')
  )
  returning * into inserted_row;

  return inserted_row;
end;
$$;

create or replace function app.create_daily_task(
  p_task_date date,
  p_task_title text,
  p_project_id uuid default null,
  p_status app.task_status default 'pending',
  p_notes text default null
)
returns app.daily_tasks
language plpgsql
security definer
set search_path = app, public
as $$
declare
  requester_employee_id uuid;
  inserted_row app.daily_tasks%rowtype;
begin
  requester_employee_id := app.current_employee_id();

  if requester_employee_id is null then
    raise exception 'Employee profile not found. Please complete account bootstrap.';
  end if;

  insert into app.daily_tasks (
    employee_id,
    task_date,
    task_title,
    project_id,
    status,
    notes
  )
  values (
    requester_employee_id,
    coalesce(p_task_date, current_date),
    nullif(trim(p_task_title), ''),
    p_project_id,
    coalesce(p_status, 'pending'),
    nullif(p_notes, '')
  )
  returning * into inserted_row;

  return inserted_row;
end;
$$;

create or replace function app.save_my_allocations(
  p_period_type app.allocation_period_type,
  p_period_start date,
  p_lines jsonb
)
returns int
language plpgsql
security definer
set search_path = app, public
as $$
declare
  requester_employee_id uuid;
  period_start_date date;
  internal_client_id uuid;
  line_item jsonb;
  project_name_value text;
  project_id_value uuid;
  allocation_value numeric;
  inserted_count int := 0;
begin
  requester_employee_id := app.current_employee_id();

  if requester_employee_id is null then
    raise exception 'Employee profile not found. Please complete account bootstrap.';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'p_lines must be a JSON array.';
  end if;

  period_start_date := coalesce(
    p_period_start,
    date_trunc('month', now())::date
  );

  -- Ensure an internal client exists for allocation-only entries.
  select c.id
  into internal_client_id
  from app.clients c
  where c.name = 'Internal'
  limit 1;

  if internal_client_id is null then
    insert into app.clients (name)
    values ('Internal')
    returning id into internal_client_id;
  end if;

  delete from app.allocations a
  where a.employee_id = requester_employee_id
    and a.period_type = p_period_type
    and a.period_start = period_start_date;

  for line_item in
    select value from jsonb_array_elements(p_lines)
  loop
    project_name_value := trim(coalesce(line_item ->> 'project_name', ''));
    if project_name_value = '' then
      continue;
    end if;

    allocation_value := greatest(
      0,
      least(
        100,
        coalesce((line_item ->> 'allocation_percent')::numeric, 0)
      )
    );

    select p.id
    into project_id_value
    from app.projects p
    where p.client_id = internal_client_id
      and lower(p.name) = lower(project_name_value)
    limit 1;

    if project_id_value is null then
      insert into app.projects (
        client_id,
        name,
        engagement_type,
        status
      )
      values (
        internal_client_id,
        project_name_value,
        'project',
        'active'
      )
      returning id into project_id_value;
    end if;

    insert into app.allocations (
      employee_id,
      project_id,
      period_type,
      period_start,
      allocation_percent,
      created_by_employee_id
    )
    values (
      requester_employee_id,
      project_id_value,
      p_period_type,
      period_start_date,
      allocation_value,
      requester_employee_id
    )
    on conflict (employee_id, project_id, period_type, period_start)
    do update
    set allocation_percent = excluded.allocation_percent,
        updated_at = now(),
        created_by_employee_id = excluded.created_by_employee_id;

    inserted_count := inserted_count + 1;
  end loop;

  return inserted_count;
end;
$$;

-- ---------- Triggers ----------
drop trigger if exists trg_departments_set_updated_at on app.departments;
create trigger trg_departments_set_updated_at
before update on app.departments
for each row
execute function app.set_updated_at();

drop trigger if exists trg_employees_set_updated_at on app.employees;
create trigger trg_employees_set_updated_at
before update on app.employees
for each row
execute function app.set_updated_at();

drop trigger if exists trg_employees_normalize on app.employees;
create trigger trg_employees_normalize
before insert or update on app.employees
for each row
execute function app.normalize_employee_record();

drop trigger if exists trg_clients_set_updated_at on app.clients;
create trigger trg_clients_set_updated_at
before update on app.clients
for each row
execute function app.set_updated_at();

drop trigger if exists trg_projects_set_updated_at on app.projects;
create trigger trg_projects_set_updated_at
before update on app.projects
for each row
execute function app.set_updated_at();

drop trigger if exists trg_allocations_set_updated_at on app.allocations;
create trigger trg_allocations_set_updated_at
before update on app.allocations
for each row
execute function app.set_updated_at();

drop trigger if exists trg_daily_tasks_set_updated_at on app.daily_tasks;
create trigger trg_daily_tasks_set_updated_at
before update on app.daily_tasks
for each row
execute function app.set_updated_at();

drop trigger if exists trg_leave_requests_set_updated_at on app.leave_requests;
create trigger trg_leave_requests_set_updated_at
before update on app.leave_requests
for each row
execute function app.set_updated_at();

drop trigger if exists trg_leave_requests_prepare on app.leave_requests;
create trigger trg_leave_requests_prepare
before insert or update on app.leave_requests
for each row
execute function app.prepare_leave_request();

-- ---------- Locked department mapping ----------
insert into app.departments (name, approver_email, leave_tracking_enabled, sort_order)
values
  ('Acc Management', 'leader3@youragency.com', true, 10),
  ('Art', 'leader2@youragency.com', true, 20),
  ('Copy', 'leader2@youragency.com', true, 30),
  ('Video', 'leader2@youragency.com', true, 40),
  ('Strategy', 'leader1@youragency.com', true, 50),
  ('Leadership', 'admin@youragency.com', true, 60),
  ('Finance', null, false, 90)
on conflict (name)
do update
set approver_email = excluded.approver_email,
    leave_tracking_enabled = excluded.leave_tracking_enabled,
    sort_order = excluded.sort_order,
    updated_at = now();

-- Seed finance users explicitly as leave-excluded rows.
with finance_dept as (
  select id from app.departments where name = 'Finance'
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
  seed.email::citext,
  seed.full_name,
  fd.id,
  'full-time',
  'employee',
  seed.role_title,
  false,
  '{}'::citext[],
  true
from finance_dept fd
cross join (
  values
    ('user2@youragency.com', 'Finance Head', 'Finance Head'),
    ('finance@youragency.com', 'Finance Admin', 'Finance Controller')
) as seed(email, full_name, role_title)
on conflict (email)
do update
set department_id = excluded.department_id,
    role_title = excluded.role_title,
    leave_tracking_enabled = false,
    approver_emails = '{}'::citext[],
    updated_at = now();

-- Optional seed leadership/admin access according to known approvers.
with leadership_dept as (
  select id from app.departments where name = 'Leadership'
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
  seed.email::citext,
  seed.full_name,
  ld.id,
  'full-time',
  seed.access_level::app.access_level,
  seed.role_title,
  true,
  array['admin@youragency.com']::citext[],
  true
from leadership_dept ld
cross join (
  values
    ('admin@youragency.com', 'Admin User', 'admin', 'Founder'),
    ('leader1@youragency.com', 'Leader One', 'leadership', 'Leadership Approver'),
    ('leader2@youragency.com', 'Leader Two', 'leadership', 'Leadership Approver'),
    ('leader3@youragency.com', 'Leader Three', 'leadership', 'Leadership Approver')
) as seed(email, full_name, access_level, role_title)
on conflict (email)
do update
set access_level = excluded.access_level,
    role_title = excluded.role_title,
    is_active = true,
    updated_at = now();

-- ---------- Analytics views ----------
create or replace view app.employee_utilization as
select
  e.id as employee_id,
  e.full_name,
  d.name as department,
  date_trunc('month', a.period_start)::date as month_start,
  round(sum(a.allocation_percent)::numeric, 2) as month_allocation_percent,
  max(a.updated_at) as last_allocation_edit_at
from app.allocations a
join app.employees e on e.id = a.employee_id
join app.departments d on d.id = e.department_id
where a.period_type = 'month'
group by e.id, e.full_name, d.name, date_trunc('month', a.period_start)::date;

create or replace view app.department_utilization as
select
  eu.department,
  eu.month_start,
  count(*) as employee_count,
  round(avg(eu.month_allocation_percent)::numeric, 2) as avg_month_allocation_percent,
  max(eu.last_allocation_edit_at) as latest_allocation_edit_at
from app.employee_utilization eu
group by eu.department, eu.month_start;

-- ---------- RLS ----------
alter table app.departments enable row level security;
alter table app.employees enable row level security;
alter table app.clients enable row level security;
alter table app.projects enable row level security;
alter table app.allocations enable row level security;
alter table app.daily_tasks enable row level security;
alter table app.leave_requests enable row level security;
alter table app.notification_log enable row level security;

-- Departments: all authenticated users can read; leadership/admin can manage.
drop policy if exists departments_select_all on app.departments;
create policy departments_select_all
on app.departments
for select
to authenticated
using (true);

drop policy if exists departments_manage_leadership on app.departments;
create policy departments_manage_leadership
on app.departments
for all
to authenticated
using (app.is_leadership_or_admin())
with check (app.is_leadership_or_admin());

-- Employees: self read + leadership read all. Writes are leadership-only except bootstrap RPC (security definer).
drop policy if exists employees_select_self on app.employees;
create policy employees_select_self
on app.employees
for select
to authenticated
using (auth_user_id = auth.uid());

drop policy if exists employees_select_leadership on app.employees;
create policy employees_select_leadership
on app.employees
for select
to authenticated
using (app.is_leadership_or_admin());

drop policy if exists employees_manage_leadership on app.employees;
create policy employees_manage_leadership
on app.employees
for all
to authenticated
using (app.is_leadership_or_admin())
with check (app.is_leadership_or_admin());

-- Clients + projects: everyone can read, leadership/admin can write.
drop policy if exists clients_select_all on app.clients;
create policy clients_select_all
on app.clients
for select
to authenticated
using (true);

drop policy if exists clients_manage_leadership on app.clients;
create policy clients_manage_leadership
on app.clients
for all
to authenticated
using (app.is_leadership_or_admin())
with check (app.is_leadership_or_admin());

drop policy if exists projects_select_all on app.projects;
create policy projects_select_all
on app.projects
for select
to authenticated
using (true);

drop policy if exists projects_manage_leadership on app.projects;
create policy projects_manage_leadership
on app.projects
for all
to authenticated
using (app.is_leadership_or_admin())
with check (app.is_leadership_or_admin());

-- Allocations: employee owns own rows; leadership/admin can read/write all.
drop policy if exists allocations_select_own_or_leadership on app.allocations;
create policy allocations_select_own_or_leadership
on app.allocations
for select
to authenticated
using (employee_id = app.current_employee_id() or app.is_leadership_or_admin());

drop policy if exists allocations_insert_own_or_leadership on app.allocations;
create policy allocations_insert_own_or_leadership
on app.allocations
for insert
to authenticated
with check (employee_id = app.current_employee_id() or app.is_leadership_or_admin());

drop policy if exists allocations_update_own_or_leadership on app.allocations;
create policy allocations_update_own_or_leadership
on app.allocations
for update
to authenticated
using (employee_id = app.current_employee_id() or app.is_leadership_or_admin())
with check (employee_id = app.current_employee_id() or app.is_leadership_or_admin());

drop policy if exists allocations_delete_own_or_leadership on app.allocations;
create policy allocations_delete_own_or_leadership
on app.allocations
for delete
to authenticated
using (employee_id = app.current_employee_id() or app.is_leadership_or_admin());

-- Daily tasks: employee owns own rows; leadership/admin can read/write all.
drop policy if exists daily_tasks_select_own_or_leadership on app.daily_tasks;
create policy daily_tasks_select_own_or_leadership
on app.daily_tasks
for select
to authenticated
using (employee_id = app.current_employee_id() or app.is_leadership_or_admin());

drop policy if exists daily_tasks_insert_own_or_leadership on app.daily_tasks;
create policy daily_tasks_insert_own_or_leadership
on app.daily_tasks
for insert
to authenticated
with check (employee_id = app.current_employee_id() or app.is_leadership_or_admin());

drop policy if exists daily_tasks_update_own_or_leadership on app.daily_tasks;
create policy daily_tasks_update_own_or_leadership
on app.daily_tasks
for update
to authenticated
using (employee_id = app.current_employee_id() or app.is_leadership_or_admin())
with check (employee_id = app.current_employee_id() or app.is_leadership_or_admin());

drop policy if exists daily_tasks_delete_own_or_leadership on app.daily_tasks;
create policy daily_tasks_delete_own_or_leadership
on app.daily_tasks
for delete
to authenticated
using (employee_id = app.current_employee_id() or app.is_leadership_or_admin());

-- Leave requests: employee can create/read own requests, leadership/admin can review all.
drop policy if exists leave_requests_select_own_or_leadership on app.leave_requests;
create policy leave_requests_select_own_or_leadership
on app.leave_requests
for select
to authenticated
using (employee_id = app.current_employee_id() or app.is_leadership_or_admin());

drop policy if exists leave_requests_insert_own on app.leave_requests;
create policy leave_requests_insert_own
on app.leave_requests
for insert
to authenticated
with check (
  employee_id = app.current_employee_id()
  and app.is_leave_tracking_enabled_for_employee(employee_id)
);

drop policy if exists leave_requests_update_own_pending_or_leadership on app.leave_requests;
create policy leave_requests_update_own_pending_or_leadership
on app.leave_requests
for update
to authenticated
using (employee_id = app.current_employee_id() or app.is_leadership_or_admin())
with check (
  app.is_leadership_or_admin()
  or (
    employee_id = app.current_employee_id()
    and status in ('pending', 'cancelled')
    and decided_by_employee_id is null
    and decided_at is null
  )
);

drop policy if exists leave_requests_delete_leadership_only on app.leave_requests;
create policy leave_requests_delete_leadership_only
on app.leave_requests
for delete
to authenticated
using (app.is_leadership_or_admin());

-- Notification log: leadership/admin read; service role writes.
drop policy if exists notification_log_select_leadership on app.notification_log;
create policy notification_log_select_leadership
on app.notification_log
for select
to authenticated
using (app.is_leadership_or_admin());

-- ---------- Grants ----------
grant usage on schema app to authenticated, anon, service_role;
grant select on app.department_utilization, app.employee_utilization to authenticated, service_role;
grant execute on function app.ensure_employee_profile() to authenticated;
grant execute on function app.submit_leave_request(app.leave_type, date, date, text, text) to authenticated;
grant execute on function app.create_daily_task(date, text, uuid, app.task_status, text) to authenticated;
grant execute on function app.save_my_allocations(app.allocation_period_type, date, jsonb) to authenticated;
grant execute on all functions in schema app to service_role;

grant select, insert, update, delete on all tables in schema app to authenticated;
grant usage, select on all sequences in schema app to authenticated;

grant all privileges on all tables in schema app to service_role;
grant usage, select on all sequences in schema app to service_role;

alter default privileges in schema app grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema app grant usage, select on sequences to authenticated;
alter default privileges in schema app grant all on tables to service_role;
alter default privileges in schema app grant usage, select on sequences to service_role;

comment on schema app is 'Agency Colony application schema';
