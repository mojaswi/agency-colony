-- Batch 2: Daily cleanup lock
-- Goal: ensure the daily task cleanup runs ONCE per day total, not once per browser per user.
-- Whichever Colony session opens first today inserts today's date into this table.
-- Everyone else hits the primary key conflict and silently skips the cleanup.

create table if not exists app.system_daily_cleanup_log (
  cleanup_date date primary key,
  ran_by_employee_id uuid references app.employees(id) on delete set null,
  ran_at timestamptz not null default now()
);

alter table app.system_daily_cleanup_log enable row level security;

-- Any authenticated user may attempt to claim the lock and read the log.
drop policy if exists daily_cleanup_log_insert on app.system_daily_cleanup_log;
create policy daily_cleanup_log_insert
on app.system_daily_cleanup_log
for insert
to authenticated
with check (true);

drop policy if exists daily_cleanup_log_select on app.system_daily_cleanup_log;
create policy daily_cleanup_log_select
on app.system_daily_cleanup_log
for select
to authenticated
using (true);

grant select, insert on app.system_daily_cleanup_log to authenticated;
