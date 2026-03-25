-- Allow Deal Flow viewers (sales user, leader three) to update/insert/delete deals
-- They need the same CRUD access as leadership for the deals module

CREATE OR REPLACE FUNCTION app.is_deal_flow_viewer()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, public
AS $$
  SELECT coalesce(
    (SELECT lower(e.email) IN ('sales@youragency.com', 'leader3@youragency.com')
     FROM app.employees e
     WHERE e.id = app.current_employee_id()),
    false
  );
$$;

CREATE POLICY deals_insert_dealflow ON app.deals FOR INSERT
  WITH CHECK (app.is_deal_flow_viewer());

CREATE POLICY deals_update_dealflow ON app.deals FOR UPDATE
  USING (app.is_deal_flow_viewer());

CREATE POLICY deals_delete_dealflow ON app.deals FOR DELETE
  USING (app.is_deal_flow_viewer());
