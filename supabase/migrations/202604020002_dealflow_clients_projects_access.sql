-- Allow deal flow viewers (a BD viewer, the AM lead) to create/update clients and projects
-- when moving deals to contracted status. They need client insert/update access.

-- Clients: allow deal flow viewers to insert
DROP POLICY IF EXISTS clients_insert_own_or_leadership ON app.clients;
CREATE POLICY clients_insert_own_or_leadership
ON app.clients
FOR INSERT
TO authenticated
WITH CHECK (
  app.is_leadership_or_admin()
  OR account_owner_employee_id = app.current_employee_id()
  OR app.is_deal_flow_viewer()
);

-- Clients: allow deal flow viewers to update
DROP POLICY IF EXISTS clients_update_own_or_leadership ON app.clients;
CREATE POLICY clients_update_own_or_leadership
ON app.clients
FOR UPDATE
TO authenticated
USING (
  app.is_leadership_or_admin()
  OR account_owner_employee_id = app.current_employee_id()
  OR app.is_deal_flow_viewer()
)
WITH CHECK (
  app.is_leadership_or_admin()
  OR account_owner_employee_id = app.current_employee_id()
  OR app.is_deal_flow_viewer()
);

-- Projects: allow deal flow viewers to insert (needed for default project creation)
DROP POLICY IF EXISTS projects_insert_own_or_leadership ON app.projects;
CREATE POLICY projects_insert_own_or_leadership
ON app.projects
FOR INSERT
TO authenticated
WITH CHECK (
  app.is_leadership_or_admin()
  OR app.is_deal_flow_viewer()
  OR (
    owner_employee_id = app.current_employee_id()
    AND EXISTS (
      SELECT 1 FROM app.clients c
      WHERE c.id = client_id
        AND c.account_owner_employee_id = app.current_employee_id()
    )
  )
);
