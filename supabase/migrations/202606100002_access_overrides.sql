-- Move ENFORCED_ACCESS_BY_EMAIL (the client-side role failsafe) into the DB so
-- the superadmin can edit who is pinned to leadership/admin from Admin Settings,
-- without a code deploy. The client keeps the in-code constant as a fallback if
-- this table is empty or unreachable, and SUPERADMIN_EMAIL stays hardcoded so
-- the superadmin can never be locked out.

-- Reusable: is the current authenticated user THE superadmin (by email)?
CREATE OR REPLACE FUNCTION app.is_superadmin()
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'app', 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM app.employees e
    WHERE e.auth_user_id = auth.uid()
      AND e.is_active = true
      AND lower(e.email) = app.superadmin_email()
  );
$$;

CREATE TABLE IF NOT EXISTS app.access_overrides (
  email text PRIMARY KEY,
  role text NOT NULL CHECK (role IN ('admin', 'leadership', 'employee')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE app.access_overrides ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated reads it (needed on login to compute their role).
CREATE POLICY access_overrides_select_all ON app.access_overrides
  FOR SELECT USING (true);

-- Only the superadmin can change who is pinned to which role.
CREATE POLICY access_overrides_write_superadmin ON app.access_overrides
  FOR ALL USING (app.is_superadmin())
  WITH CHECK (app.is_superadmin());

-- Seed with the current hardcoded list so behavior is identical at launch.
INSERT INTO app.access_overrides (email, role) VALUES
  ('admin@youragency.com', 'admin'),
  ('strategy-lead@youragency.com', 'leadership'),
  ('creative-lead@youragency.com', 'leadership'),
  ('am-lead@youragency.com', 'leadership'),
  ('ops-lead@youragency.com', 'leadership')
ON CONFLICT (email) DO NOTHING;
