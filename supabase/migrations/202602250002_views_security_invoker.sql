-- Fix Supabase linter critical: views should use SECURITY INVOKER
-- so they respect the querying user's RLS policies, not the view owner's.

ALTER VIEW app.employee_utilization SET (security_invoker = true);
ALTER VIEW app.department_utilization SET (security_invoker = true);
