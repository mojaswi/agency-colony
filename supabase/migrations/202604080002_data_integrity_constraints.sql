-- Batch 1: Data integrity constraints
-- Goal: make duplicate / inconsistent rows IMPOSSIBLE at the database level,
-- so JS bugs can no longer silently corrupt the data.

-- ---------- daily_tasks: no duplicate active task per (employee, title, date) ----------
-- Allow archived rows to repeat freely (they're history). Only enforce on live work.
-- Lower-cased title so "Biomass Reel" and "biomass reel" are treated as the same.
create unique index if not exists uniq_daily_tasks_active
  on app.daily_tasks (employee_id, lower(task_title), task_date)
  where status <> 'archived' and task_date is not null;

-- ---------- allocations: no duplicate allocation per (employee, project, week, period_type) ----------
-- A single person should not have two allocation rows for the same project in the same week.
create unique index if not exists uniq_allocations_per_period
  on app.allocations (employee_id, project_id, period_start, period_type);
