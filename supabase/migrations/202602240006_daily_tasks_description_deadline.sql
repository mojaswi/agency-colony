-- Add description and deadline fields to daily_tasks.
-- Tasks do not carry over between days (already enforced by task_date filter in the app).

alter table app.daily_tasks
  add column if not exists description text,
  add column if not exists deadline date;

-- Drop old function signature so the new one is the only overload.
drop function if exists app.create_daily_task(date, text, uuid, app.task_status, text);

create or replace function app.create_daily_task(
  p_task_date    date,
  p_task_title   text,
  p_project_id   uuid               default null,
  p_status       app.task_status    default 'pending',
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

  if length(coalesce(p_task_title, '')) > 500 then
    raise exception 'Task title must not exceed 500 characters';
  end if;

  if length(coalesce(p_description, '')) > 2000 then
    raise exception 'Description must not exceed 2000 characters';
  end if;

  if p_deadline is not null and (p_deadline < current_date - interval '30 days' or p_deadline > current_date + interval '365 days') then
    raise exception 'Deadline must be within a reasonable date range';
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
    coalesce(p_status, 'pending'),
    nullif(p_notes, ''),
    nullif(trim(coalesce(p_description, '')), ''),
    p_deadline
  )
  returning * into inserted_row;

  return inserted_row;
end;
$$;

-- Revoke old grant (signature changed) only if the old function exists, then grant new signature.
do $$
begin
  begin
    revoke execute on function app.create_daily_task(date, text, uuid, app.task_status, text) from authenticated;
  exception
    when undefined_function then
      null;
  end;
end;
$$;

grant execute on function app.create_daily_task(date, text, uuid, app.task_status, text, text, date) to authenticated;
