-- ============================================================
-- Fix weekly task creation for non-leadership users
-- 1. Drop NOT NULL on task_date (weekly tasks have null task_date)
-- 2. Fix RPC to pass null through instead of coalescing to current_date
-- ============================================================

-- ---------- 1. Allow null task_date for weekly planner tasks ----------
ALTER TABLE app.daily_tasks ALTER COLUMN task_date DROP NOT NULL;

-- ---------- 2. Fix create_daily_task RPC — don't coalesce null task_date ----------
CREATE OR REPLACE FUNCTION app.create_daily_task(
  p_task_date    date,
  p_task_title   text,
  p_project_id   uuid               default null,
  p_status       app.task_status    default 'in_progress',
  p_notes        text               default null,
  p_description  text               default null,
  p_deadline     date               default null
)
RETURNS app.daily_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  requester_employee_id uuid;
  inserted_row app.daily_tasks%rowtype;
BEGIN
  requester_employee_id := app.current_employee_id();

  IF requester_employee_id IS NULL THEN
    RAISE EXCEPTION 'Employee profile not found. Please complete account bootstrap.';
  END IF;

  INSERT INTO app.daily_tasks (
    employee_id,
    task_date,
    task_title,
    project_id,
    status,
    notes,
    description,
    deadline
  )
  VALUES (
    requester_employee_id,
    p_task_date,  -- pass null through for weekly tasks
    nullif(trim(p_task_title), ''),
    p_project_id,
    coalesce(p_status, 'in_progress'),
    nullif(p_notes, ''),
    nullif(trim(coalesce(p_description, '')), ''),
    p_deadline
  )
  RETURNING * INTO inserted_row;

  RETURN inserted_row;
END;
$$;

-- ---------- 3. Update unique index to include null task_date rows ----------
-- The existing index excluded null task_date, allowing duplicate weekly tasks.
-- Drop and recreate to cover both daily (task_date IS NOT NULL) and weekly (task_date IS NULL).
DROP INDEX IF EXISTS app.uniq_daily_tasks_active;

-- Daily tasks: unique per (employee, title, date) excluding archived
CREATE UNIQUE INDEX uniq_daily_tasks_active
  ON app.daily_tasks (employee_id, lower(task_title), task_date)
  WHERE status <> 'archived' AND task_date IS NOT NULL;

-- Weekly tasks: unique per (employee, title) where task_date IS NULL, excluding archived
CREATE UNIQUE INDEX uniq_weekly_tasks_active
  ON app.daily_tasks (employee_id, lower(task_title))
  WHERE status <> 'archived' AND task_date IS NULL;
