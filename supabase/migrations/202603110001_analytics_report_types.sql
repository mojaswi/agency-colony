-- Analytics report types: support Content, Followers, and Visitors LinkedIn exports
-- Each client can have one report per type (upserted on upload)

ALTER TABLE app.client_analytics
  ADD COLUMN IF NOT EXISTS report_type text NOT NULL DEFAULT 'content',
  ADD COLUMN IF NOT EXISTS demographics_data jsonb,
  ADD COLUMN IF NOT EXISTS visitor_metrics jsonb;

-- Add check constraint for report_type
ALTER TABLE app.client_analytics
  ADD CONSTRAINT client_analytics_report_type_check
  CHECK (report_type IN ('content', 'followers', 'visitors'));

-- Backfill existing rows (all are content reports)
UPDATE app.client_analytics SET report_type = 'content' WHERE report_type IS NULL;

-- Deduplicate: keep only the latest report per client before creating unique index
DELETE FROM app.client_analytics a
WHERE a.id NOT IN (
  SELECT DISTINCT ON (client_id) id
  FROM app.client_analytics
  ORDER BY client_id, uploaded_at DESC
);

-- Create unique index: one report per type per client
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_analytics_client_type
  ON app.client_analytics (client_id, report_type);

-- Add UPDATE RLS policy (needed for insights_cache persistence)
CREATE POLICY analytics_update ON app.client_analytics
  FOR UPDATE USING (uploaded_by = app.current_employee_id() OR app.is_leadership_or_admin());

COMMENT ON COLUMN app.client_analytics.report_type IS 'LinkedIn export type: content, followers, or visitors';
COMMENT ON COLUMN app.client_analytics.demographics_data IS 'Audience breakdown from followers/visitors: {job_function, seniority, industry, company_size, location}';
COMMENT ON COLUMN app.client_analytics.visitor_metrics IS 'Daily visitor traffic rows from visitors export';
