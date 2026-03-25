-- Invoice Center: table for tracking uploaded invoices, viewer access function,
-- RLS policies, and notification kind for email reminders.

-- 1. Viewer function — only Finance Admin (finance), Leader Three, Admin User can see all invoices
CREATE OR REPLACE FUNCTION app.is_invoice_viewer()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM app.employees
    WHERE auth_user_id = auth.uid()
      AND email IN ('finance@youragency.com', 'leader3@youragency.com', 'admin@youragency.com')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 2. Invoices table
CREATE TABLE IF NOT EXISTS app.invoices (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id uuid NOT NULL REFERENCES app.employees(id),
  invoice_month text NOT NULL,        -- 'YYYY-MM' format
  file_name text NOT NULL,
  file_path text NOT NULL,            -- Supabase Storage path
  file_size_bytes bigint,
  uploaded_at timestamptz DEFAULT now(),
  notes text
);

CREATE INDEX IF NOT EXISTS idx_invoices_employee ON app.invoices(employee_id);
CREATE INDEX IF NOT EXISTS idx_invoices_month ON app.invoices(invoice_month);

-- 3. RLS
ALTER TABLE app.invoices ENABLE ROW LEVEL SECURITY;

-- Employees see own invoices
CREATE POLICY invoices_select_own ON app.invoices FOR SELECT
  USING (employee_id = app.current_employee_id());

-- Viewers see all invoices
CREATE POLICY invoices_select_viewer ON app.invoices FOR SELECT
  USING (app.is_invoice_viewer());

-- Employees insert own invoices
CREATE POLICY invoices_insert_own ON app.invoices FOR INSERT
  WITH CHECK (employee_id = app.current_employee_id());

-- Employees delete own invoices
CREATE POLICY invoices_delete_own ON app.invoices FOR DELETE
  USING (employee_id = app.current_employee_id());

-- 4. Notification kind for invoice reminders
ALTER TYPE app.notification_kind ADD VALUE IF NOT EXISTS 'invoice_upload_reminder';
