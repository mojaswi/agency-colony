-- Feature Requests: reddit-style thread for Colony improvement ideas

do $$
begin
  if not exists (select 1 from pg_type where typname = 'feature_request_status' and typnamespace = 'app'::regnamespace) then
    create type app.feature_request_status as enum ('requested', 'in_progress', 'done');
  end if;
end;
$$;

create table if not exists app.feature_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references app.employees(id) on delete cascade,
  request_text text not null,
  status app.feature_request_status not null default 'requested',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists feature_requests_created_idx
  on app.feature_requests (created_at desc);

create trigger set_feature_requests_updated_at
  before update on app.feature_requests
  for each row
  execute function app.set_updated_at();

-- RLS
alter table app.feature_requests enable row level security;

-- Everyone can read all requests
create policy feature_requests_select_all
  on app.feature_requests for select to authenticated
  using (true);

-- Users can insert their own requests
create policy feature_requests_insert_own
  on app.feature_requests for insert to authenticated
  with check (employee_id = app.current_employee_id());

-- Owner can update when status = 'requested'; leadership/admin can always update
create policy feature_requests_update_own_or_leadership
  on app.feature_requests for update to authenticated
  using (employee_id = app.current_employee_id() or app.is_leadership_or_admin())
  with check (app.is_leadership_or_admin() or (employee_id = app.current_employee_id() and status = 'requested'));

-- Only leadership/admin can delete
create policy feature_requests_delete_leadership
  on app.feature_requests for delete to authenticated
  using (app.is_leadership_or_admin());

-- Grant access
grant select, insert, update, delete on app.feature_requests to authenticated;
grant all privileges on app.feature_requests to service_role;

-- Seed from Slack thread
insert into app.feature_requests (employee_id, request_text, status, created_at)
select e.id,
  'Can we add a timesheet to feed in actual hours spent on each client during the day? The goal is to check how accurate our weekly allocation is to the actual hours we are spending on a task.',
  'requested',
  '2026-03-02T06:05:33Z'
from app.employees e where lower(e.email) = 'user4@youragency.com'
on conflict do nothing;

insert into app.feature_requests (employee_id, request_text, status, created_at)
select e.id,
  'Instead of "team leaves for the next 30 days", we should do Q1, Q2, Q3, and Q4 — which will help everyone plan their leaves and lives!',
  'requested',
  '2026-03-02T07:42:32Z'
from app.employees e where lower(e.email) = 'user3@youragency.com'
on conflict do nothing;

insert into app.feature_requests (employee_id, request_text, status, created_at)
select e.id,
  'Daily tasks — do we get to carry forward to next day if it''s still a pending task?',
  'requested',
  '2026-03-02T12:42:15Z'
from app.employees e where lower(e.email) = 'user6@youragency.com'
on conflict do nothing;
