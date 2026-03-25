-- Client analytics reports table
CREATE TABLE app.client_analytics (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES app.clients(id) ON DELETE CASCADE,
  report_label text NOT NULL,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_size_bytes bigint,
  metrics_data jsonb,
  posts_data jsonb,
  summary jsonb,
  uploaded_by uuid REFERENCES app.employees(id),
  uploaded_at timestamptz DEFAULT now()
);

CREATE INDEX idx_client_analytics_client ON app.client_analytics(client_id);

-- RLS: everyone authenticated can view
ALTER TABLE app.client_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY analytics_select_all ON app.client_analytics
  FOR SELECT USING (true);

CREATE POLICY analytics_insert ON app.client_analytics
  FOR INSERT WITH CHECK (uploaded_by = app.current_employee_id());

CREATE POLICY analytics_delete ON app.client_analytics
  FOR DELETE USING (uploaded_by = app.current_employee_id() OR app.is_leadership_or_admin());
