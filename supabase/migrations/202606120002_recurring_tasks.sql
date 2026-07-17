-- Recurring monthly tasks (board request, a team member 1 Jun). A rule spawns its
-- task into the owner's daily list on the chosen day each month (short months
-- clamp to their last day). Spawned rows carry recurring_task_id (↻ marker).

CREATE TABLE IF NOT EXISTS app.recurring_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,
  task_title text NOT NULL,
  notes text,
  description text,
  day_of_month int NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE app.recurring_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY recurring_tasks_own ON app.recurring_tasks
  FOR ALL USING (employee_id = app.current_employee_id())
  WITH CHECK (employee_id = app.current_employee_id());

ALTER TABLE app.daily_tasks ADD COLUMN IF NOT EXISTS recurring_task_id uuid REFERENCES app.recurring_tasks(id) ON DELETE SET NULL;
