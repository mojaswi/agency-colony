-- 1. Add indexes for unindexed foreign keys (medium severity)
CREATE INDEX IF NOT EXISTS idx_employees_department_id
  ON app.employees (department_id);

CREATE INDEX IF NOT EXISTS idx_clients_account_owner_employee_id
  ON app.clients (account_owner_employee_id);

CREATE INDEX IF NOT EXISTS idx_projects_owner_employee_id
  ON app.projects (owner_employee_id);

CREATE INDEX IF NOT EXISTS idx_daily_tasks_project_id
  ON app.daily_tasks (project_id);

-- 2. Optional FK indexes (low severity, adding for completeness)
CREATE INDEX IF NOT EXISTS idx_allocations_created_by_employee_id
  ON app.allocations (created_by_employee_id);

CREATE INDEX IF NOT EXISTS idx_allocations_overridden_by_employee_id
  ON app.allocations (overridden_by_employee_id);

CREATE INDEX IF NOT EXISTS idx_leave_requests_decided_by_employee_id
  ON app.leave_requests (decided_by_employee_id);

-- 3. Fix leave_cycle_policy_select_all: restrict to authenticated (was PUBLIC)
DROP POLICY IF EXISTS leave_cycle_policy_select_all ON app.leave_cycle_policy;
CREATE POLICY leave_cycle_policy_select_all
ON app.leave_cycle_policy
FOR SELECT
TO authenticated
USING (true);
