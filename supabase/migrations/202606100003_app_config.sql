-- Generic key→JSONB config table for the remaining hardcoded operational lists
-- (invoice viewers/excluded, hidden employees, deal-flow extra viewers, and the
-- department/direct manager-approver mappings). Superadmin-editable in Admin
-- Settings; the client falls back to the in-code constants (config.js) per key
-- if a key is missing or the table is unreachable.

CREATE TABLE IF NOT EXISTS app.app_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE app.app_config ENABLE ROW LEVEL SECURITY;

-- Open read: several of these gate per-user visibility, so every authenticated
-- session must be able to read them on login.
CREATE POLICY app_config_select_all ON app.app_config
  FOR SELECT USING (true);

-- Superadmin-only writes (these control visibility + approver routing).
CREATE POLICY app_config_write_superadmin ON app.app_config
  FOR ALL USING (app.is_superadmin())
  WITH CHECK (app.is_superadmin());

-- Seed with the current hardcoded values so behavior is identical at launch.
INSERT INTO app.app_config (key, value) VALUES
  ('invoice_viewer_emails',  '["finance@youragency.com","am-lead@youragency.com","admin@youragency.com"]'::jsonb),
  ('invoice_excluded_emails','["admin@youragency.com"]'::jsonb),
  ('hidden_employee_emails', '["finance@youragency.com","ops-lead@youragency.com"]'::jsonb),
  ('deal_flow_extra_emails', '["bd@youragency.com"]'::jsonb),
  ('team_manager_by_team',   '{"AM":"am-lead@youragency.com","Art":"creative-lead@youragency.com","Copy":"creative-lead@youragency.com","Video":"creative-lead@youragency.com","Strategy":"strategy-lead@youragency.com"}'::jsonb),
  ('direct_manager_by_email','{"creative-lead@youragency.com":"admin@youragency.com","am-lead@youragency.com":"admin@youragency.com","strategy-lead@youragency.com":"admin@youragency.com","ops-lead@youragency.com":"admin@youragency.com"}'::jsonb)
ON CONFLICT (key) DO NOTHING;
