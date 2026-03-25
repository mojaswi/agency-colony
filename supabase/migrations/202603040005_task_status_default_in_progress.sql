-- Change default task status from 'pending' to 'in_progress' and migrate existing pending tasks.
-- The UI now only exposes two statuses: In Progress and Completed.

-- Migrate all existing pending tasks to in_progress
update app.daily_tasks set status = 'in_progress' where status = 'pending';

-- Change column default
alter table app.daily_tasks alter column status set default 'in_progress';

-- Recreate RPC with updated default (pending -> in_progress)
drop function if exists app.create_daily_task(date, text, uuid, app.task_status, text, text, date);

create or replace function app.create_daily_task(
  p_task_date    date,
  p_task_title   text,
  p_project_id   uuid               default null,
  p_status       app.task_status    default 'in_progress',
  p_notes        text               default null,
  p_description  text               default null,
  p_deadline     date               default null
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
    notes,
    description,
    deadline
  )
  values (
    requester_employee_id,
    coalesce(p_task_date, current_date),
    nullif(trim(p_task_title), ''),
    p_project_id,
    coalesce(p_status, 'in_progress'),
    nullif(p_notes, ''),
    nullif(trim(coalesce(p_description, '')), ''),
    p_deadline
  )
  returning * into inserted_row;

  return inserted_row;
end;
$$;

grant execute on function app.create_daily_task(date, text, uuid, app.task_status, text, text, date) to authenticated;
