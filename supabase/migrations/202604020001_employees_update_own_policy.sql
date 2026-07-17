-- Allow employees to update their own row (profile, onboarding_completed, etc.)
-- Previously all self-updates went through the update_my_profile RPC (SECURITY DEFINER),
-- but direct updates from JS were blocked by RLS since only leadership had UPDATE policy.

CREATE POLICY employees_update_own
ON app.employees
FOR UPDATE
TO authenticated
USING (auth_user_id = auth.uid())
WITH CHECK (auth_user_id = auth.uid());
