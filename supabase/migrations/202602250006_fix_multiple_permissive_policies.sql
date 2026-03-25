-- Fix "Multiple Permissive Policies" lint warnings across all affected tables.
-- When a table has a FOR ALL policy AND a separate FOR SELECT policy for the same
-- role, the SELECT action ends up with two permissive policies. Fix: replace each
-- FOR ALL policy with explicit FOR INSERT, FOR UPDATE, FOR DELETE policies.
--
-- Also fixes:
-- - Auth RLS Initialization Plan: wrap auth.uid() in (select ...) for employees_select_self
-- - Missing TO role on employee_leave_cycles and leave_cycle_archives policies (defaulted to PUBLIC)
-- - Unindexed FK: app.allocations.project_id

-- ==========================================================
-- 1. app.departments
-- ==========================================================
-- Current: departments_select_all (SELECT, authenticated)
--          departments_manage_leadership (ALL, authenticated) ← overlaps on SELECT
-- Fix: replace FOR ALL with FOR INSERT + FOR UPDATE + FOR DELETE

DROP POLICY IF EXISTS departments_manage_leadership ON app.departments;

CREATE POLICY departments_insert_leadership
ON app.departments
FOR INSERT
TO authenticated
WITH CHECK (app.is_leadership_or_admin());

CREATE POLICY departments_update_leadership
ON app.departments
FOR UPDATE
TO authenticated
USING (app.is_leadership_or_admin())
WITH CHECK (app.is_leadership_or_admin());

CREATE POLICY departments_delete_leadership
ON app.departments
FOR DELETE
TO authenticated
USING (app.is_leadership_or_admin());


-- ==========================================================
-- 2. app.employees
-- ==========================================================
-- Current: employees_select_self (SELECT, authenticated) — uses auth.uid() directly
--          employees_select_leadership (SELECT, authenticated)
--          employees_manage_leadership (ALL, authenticated) ← overlaps on SELECT
-- Fix: replace FOR ALL with FOR INSERT + FOR UPDATE + FOR DELETE
--      also wrap auth.uid() in (select ...) for initplan optimization

DROP POLICY IF EXISTS employees_select_self ON app.employees;
CREATE POLICY employees_select_self
ON app.employees
FOR SELECT
TO authenticated
USING (auth_user_id = (select auth.uid()));

DROP POLICY IF EXISTS employees_manage_leadership ON app.employees;

CREATE POLICY employees_insert_leadership
ON app.employees
FOR INSERT
TO authenticated
WITH CHECK (app.is_leadership_or_admin());

CREATE POLICY employees_update_leadership
ON app.employees
FOR UPDATE
TO authenticated
USING (app.is_leadership_or_admin())
WITH CHECK (app.is_leadership_or_admin());

CREATE POLICY employees_delete_leadership
ON app.employees
FOR DELETE
TO authenticated
USING (app.is_leadership_or_admin());


-- ==========================================================
-- 3. app.employee_leave_cycles
-- ==========================================================
-- Current: employee_leave_cycles_select_self_or_leadership (SELECT, PUBLIC — missing TO)
--          employee_leave_cycles_manage_leadership (ALL, PUBLIC — missing TO) ← overlaps on SELECT
-- Fix: replace FOR ALL with FOR INSERT + FOR UPDATE + FOR DELETE
--      add TO authenticated to all policies

DROP POLICY IF EXISTS employee_leave_cycles_select_self_or_leadership ON app.employee_leave_cycles;
CREATE POLICY employee_leave_cycles_select_self_or_leadership
ON app.employee_leave_cycles
FOR SELECT
TO authenticated
USING (
  employee_id = app.current_employee_id()
  OR app.is_leadership_or_admin()
);

DROP POLICY IF EXISTS employee_leave_cycles_manage_leadership ON app.employee_leave_cycles;

CREATE POLICY employee_leave_cycles_insert_leadership
ON app.employee_leave_cycles
FOR INSERT
TO authenticated
WITH CHECK (app.is_leadership_or_admin());

CREATE POLICY employee_leave_cycles_update_leadership
ON app.employee_leave_cycles
FOR UPDATE
TO authenticated
USING (app.is_leadership_or_admin())
WITH CHECK (app.is_leadership_or_admin());

CREATE POLICY employee_leave_cycles_delete_leadership
ON app.employee_leave_cycles
FOR DELETE
TO authenticated
USING (app.is_leadership_or_admin());


-- ==========================================================
-- 4. app.leave_cycle_archives
-- ==========================================================
-- Current: leave_cycle_archives_select_self_or_leadership (SELECT, PUBLIC — missing TO)
--          leave_cycle_archives_manage_leadership (ALL, PUBLIC — missing TO) ← overlaps on SELECT
-- Fix: replace FOR ALL with FOR INSERT + FOR UPDATE + FOR DELETE
--      add TO authenticated to all policies

DROP POLICY IF EXISTS leave_cycle_archives_select_self_or_leadership ON app.leave_cycle_archives;
CREATE POLICY leave_cycle_archives_select_self_or_leadership
ON app.leave_cycle_archives
FOR SELECT
TO authenticated
USING (
  employee_id = app.current_employee_id()
  OR app.is_leadership_or_admin()
);

DROP POLICY IF EXISTS leave_cycle_archives_manage_leadership ON app.leave_cycle_archives;

CREATE POLICY leave_cycle_archives_insert_leadership
ON app.leave_cycle_archives
FOR INSERT
TO authenticated
WITH CHECK (app.is_leadership_or_admin());

CREATE POLICY leave_cycle_archives_update_leadership
ON app.leave_cycle_archives
FOR UPDATE
TO authenticated
USING (app.is_leadership_or_admin())
WITH CHECK (app.is_leadership_or_admin());

CREATE POLICY leave_cycle_archives_delete_leadership
ON app.leave_cycle_archives
FOR DELETE
TO authenticated
USING (app.is_leadership_or_admin());


-- ==========================================================
-- 5. app.leave_cycle_policy
-- ==========================================================
-- Current: leave_cycle_policy_select_all (SELECT, authenticated — fixed in migration 0003)
--          leave_cycle_policy_manage_leadership (ALL, PUBLIC — missing TO) ← overlaps on SELECT
-- Fix: replace FOR ALL with FOR INSERT + FOR UPDATE + FOR DELETE
--      add TO authenticated

DROP POLICY IF EXISTS leave_cycle_policy_manage_leadership ON app.leave_cycle_policy;

CREATE POLICY leave_cycle_policy_insert_leadership
ON app.leave_cycle_policy
FOR INSERT
TO authenticated
WITH CHECK (app.is_leadership_or_admin());

CREATE POLICY leave_cycle_policy_update_leadership
ON app.leave_cycle_policy
FOR UPDATE
TO authenticated
USING (app.is_leadership_or_admin())
WITH CHECK (app.is_leadership_or_admin());

CREATE POLICY leave_cycle_policy_delete_leadership
ON app.leave_cycle_policy
FOR DELETE
TO authenticated
USING (app.is_leadership_or_admin());


-- ==========================================================
-- 6. Unindexed FK: app.allocations.project_id
-- ==========================================================
-- The existing composite unique index (employee_id, project_id, period_type, period_start)
-- has employee_id as the leading column, so it cannot be used for project_id-only lookups
-- (e.g., ON DELETE CASCADE from app.projects).

CREATE INDEX IF NOT EXISTS idx_allocations_project_id
ON app.allocations (project_id);
