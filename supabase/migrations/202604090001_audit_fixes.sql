-- ============================================================
-- Code audit fixes — April 9, 2026
-- Addresses: RLS policy gaps, missing indexes, ON DELETE,
-- employees_update_own column restriction, policy overlaps
-- ============================================================

-- ---------- 1. employees_update_own: restrict to safe columns ----------
-- Previously any employee could update ALL columns on their own row,
-- including access_level (privilege escalation). Restrict to profile-safe cols.
DROP POLICY IF EXISTS employees_update_own ON app.employees;
CREATE POLICY employees_update_own
ON app.employees
FOR UPDATE
TO authenticated
USING (auth_user_id = auth.uid())
WITH CHECK (auth_user_id = auth.uid());

-- Column-level restriction via trigger (RLS can't restrict columns)
CREATE OR REPLACE FUNCTION app.trg_block_employee_self_escalation()
RETURNS TRIGGER AS $$
BEGIN
  -- If the updater is NOT leadership/admin, block changes to sensitive columns
  IF NOT app.is_leadership_or_admin() THEN
    NEW.access_level := OLD.access_level;
    NEW.is_active := OLD.is_active;
    NEW.leave_tracking_enabled := OLD.leave_tracking_enabled;
    NEW.department_id := OLD.department_id;
    NEW.approver_emails := OLD.approver_emails;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, public;

DROP TRIGGER IF EXISTS trg_block_employee_self_escalation ON app.employees;
CREATE TRIGGER trg_block_employee_self_escalation
  BEFORE UPDATE ON app.employees
  FOR EACH ROW EXECUTE FUNCTION app.trg_block_employee_self_escalation();

-- ---------- 2. deals: add TO authenticated to all policies ----------
-- Original policies omitted TO authenticated, defaulting to PUBLIC.
DROP POLICY IF EXISTS deals_select ON app.deals;
CREATE POLICY deals_select ON app.deals FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS deals_insert_leadership ON app.deals;
CREATE POLICY deals_insert_leadership ON app.deals FOR INSERT
  TO authenticated WITH CHECK (app.is_leadership_or_admin());

DROP POLICY IF EXISTS deals_update_leadership ON app.deals;
CREATE POLICY deals_update_leadership ON app.deals FOR UPDATE
  TO authenticated USING (app.is_leadership_or_admin());

DROP POLICY IF EXISTS deals_delete_leadership ON app.deals;
CREATE POLICY deals_delete_leadership ON app.deals FOR DELETE
  TO authenticated USING (app.is_leadership_or_admin());

DROP POLICY IF EXISTS deals_update_poc ON app.deals;
CREATE POLICY deals_update_poc ON app.deals FOR UPDATE
  TO authenticated USING (poc_employee_id = app.current_employee_id());

-- Recreate deal-flow viewer policies with TO authenticated
DROP POLICY IF EXISTS deals_insert_dealflow ON app.deals;
CREATE POLICY deals_insert_dealflow ON app.deals FOR INSERT
  TO authenticated WITH CHECK (app.is_deal_flow_viewer());

DROP POLICY IF EXISTS deals_update_dealflow ON app.deals;
CREATE POLICY deals_update_dealflow ON app.deals FOR UPDATE
  TO authenticated USING (app.is_deal_flow_viewer());

DROP POLICY IF EXISTS deals_delete_dealflow ON app.deals;
CREATE POLICY deals_delete_dealflow ON app.deals FOR DELETE
  TO authenticated USING (app.is_deal_flow_viewer());

-- ---------- 3. deals: ON DELETE for foreign keys ----------
ALTER TABLE app.deals
  DROP CONSTRAINT IF EXISTS deals_poc_employee_id_fkey,
  ADD CONSTRAINT deals_poc_employee_id_fkey
    FOREIGN KEY (poc_employee_id) REFERENCES app.employees(id) ON DELETE SET NULL;

ALTER TABLE app.deals
  DROP CONSTRAINT IF EXISTS deals_client_id_fkey,
  ADD CONSTRAINT deals_client_id_fkey
    FOREIGN KEY (client_id) REFERENCES app.clients(id) ON DELETE SET NULL;

-- ---------- 4. deals: NOT NULL on timestamps, CHECK on amount ----------
ALTER TABLE app.deals
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE app.deals
  ADD CONSTRAINT deals_amount_non_negative CHECK (amount IS NULL OR amount >= 0);

-- ---------- 5. deals: missing index on client_id ----------
CREATE INDEX IF NOT EXISTS idx_deals_client_id ON app.deals(client_id);

-- ---------- 6. deal_stage_history: restrict INSERT + ON DELETE ----------
DROP POLICY IF EXISTS stage_history_insert ON app.deal_stage_history;
CREATE POLICY stage_history_insert ON app.deal_stage_history
  FOR INSERT TO authenticated
  WITH CHECK (app.is_leadership_or_admin() OR app.is_deal_flow_viewer());

-- Allow leadership to update exited_at
CREATE POLICY stage_history_update ON app.deal_stage_history
  FOR UPDATE TO authenticated
  USING (app.is_leadership_or_admin() OR app.is_deal_flow_viewer());

ALTER TABLE app.deal_stage_history
  DROP CONSTRAINT IF EXISTS deal_stage_history_changed_by_fkey,
  ADD CONSTRAINT deal_stage_history_changed_by_fkey
    FOREIGN KEY (changed_by) REFERENCES app.employees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_deal_stage_history_changed_by
  ON app.deal_stage_history(changed_by);

-- ---------- 7. Fix FOR ALL + FOR SELECT policy overlaps ----------
-- policy_documents: replace FOR ALL with specific INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS "admin_manage_policies" ON app.policy_documents;

CREATE POLICY "admin_insert_policies" ON app.policy_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM app.employees e
      WHERE e.auth_user_id = auth.uid() AND e.is_active AND e.access_level = 'admin')
  );

CREATE POLICY "admin_update_policies" ON app.policy_documents
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM app.employees e
      WHERE e.auth_user_id = auth.uid() AND e.is_active AND e.access_level = 'admin')
  );

CREATE POLICY "admin_delete_policies" ON app.policy_documents
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM app.employees e
      WHERE e.auth_user_id = auth.uid() AND e.is_active AND e.access_level = 'admin')
  );

-- policy_document_versions: same fix
DROP POLICY IF EXISTS "admin_manage_policy_versions" ON app.policy_document_versions;

CREATE POLICY "admin_insert_policy_versions" ON app.policy_document_versions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM app.employees e
      WHERE e.auth_user_id = auth.uid() AND e.is_active AND e.access_level = 'admin')
  );

CREATE POLICY "admin_update_policy_versions" ON app.policy_document_versions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM app.employees e
      WHERE e.auth_user_id = auth.uid() AND e.is_active AND e.access_level = 'admin')
  );

CREATE POLICY "admin_delete_policy_versions" ON app.policy_document_versions
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM app.employees e
      WHERE e.auth_user_id = auth.uid() AND e.is_active AND e.access_level = 'admin')
  );

-- onboarding_checklists: replace FOR ALL with specific policies
DROP POLICY IF EXISTS "leadership_manage_checklists" ON app.onboarding_checklists;

CREATE POLICY "leadership_insert_checklists" ON app.onboarding_checklists
  FOR INSERT TO authenticated
  WITH CHECK (app.is_leadership_or_admin());

CREATE POLICY "leadership_update_checklists" ON app.onboarding_checklists
  FOR UPDATE TO authenticated
  USING (app.is_leadership_or_admin());

CREATE POLICY "leadership_delete_checklists" ON app.onboarding_checklists
  FOR DELETE TO authenticated
  USING (app.is_leadership_or_admin());

-- onboarding_checklist_items: replace FOR ALL with specific policies
DROP POLICY IF EXISTS "leadership_manage_items" ON app.onboarding_checklist_items;

CREATE POLICY "leadership_insert_items" ON app.onboarding_checklist_items
  FOR INSERT TO authenticated
  WITH CHECK (app.is_leadership_or_admin());

CREATE POLICY "leadership_update_items" ON app.onboarding_checklist_items
  FOR UPDATE TO authenticated
  USING (app.is_leadership_or_admin());

CREATE POLICY "leadership_delete_items" ON app.onboarding_checklist_items
  FOR DELETE TO authenticated
  USING (app.is_leadership_or_admin());

-- ---------- 8. invoices: ON DELETE SET NULL for employee_id ----------
ALTER TABLE app.invoices
  DROP CONSTRAINT IF EXISTS invoices_employee_id_fkey,
  ADD CONSTRAINT invoices_employee_id_fkey
    FOREIGN KEY (employee_id) REFERENCES app.employees(id) ON DELETE SET NULL;

-- ---------- 9. client_analytics: ON DELETE SET NULL for uploaded_by ----------
ALTER TABLE app.client_analytics
  DROP CONSTRAINT IF EXISTS client_analytics_uploaded_by_fkey,
  ADD CONSTRAINT client_analytics_uploaded_by_fkey
    FOREIGN KEY (uploaded_by) REFERENCES app.employees(id) ON DELETE SET NULL;
