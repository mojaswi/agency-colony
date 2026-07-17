-- Who's-out feed for the home timeline, visible to ALL authenticated employees.
-- leave_requests RLS is own-or-leadership, so regular employees can't see team
-- leave directly; this SECURITY DEFINER RPC exposes only the minimal fields the
-- home feed needs (no reason, no approver trail, no ids).
--
-- Returns leaves overlapping the caller-supplied window [p_from, p_until]
-- (the home feed passes today-7 .. today+7, so recent, current AND upcoming
-- leaves all surface):
--   - all approved leaves overlapping the window
--   - PLUS pending sick leave that has already started (retroactive sickness —
--     someone who was out sick shouldn't be invisible just because the approval
--     hasn't been clicked yet; shown with an "awaiting approval" tag client-side)
-- Window dates come from the client so they match IST, not the server's UTC date.

DROP FUNCTION IF EXISTS app.home_whos_out(date, date);

CREATE FUNCTION app.home_whos_out(p_from date, p_until date)
RETURNS TABLE (
  full_name  text,
  email      text,
  leave_type text,
  status     text,
  start_date date,
  end_date   date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'app', 'public'
AS $$
  SELECT e.full_name, e.email, lr.leave_type, lr.status, lr.start_date, lr.end_date
  FROM app.leave_requests lr
  JOIN app.employees e ON e.id = lr.employee_id
  WHERE e.is_active
    AND p_until >= p_from
    AND p_until <= p_from + 31               -- sanity-clamp the window
    AND lr.end_date >= p_from
    AND lr.start_date <= p_until
    AND (
      lr.status = 'approved'
      OR (lr.status = 'pending' AND lr.leave_type = 'SL' AND lr.start_date <= current_date)
    )
  ORDER BY lr.start_date, e.full_name;
$$;

REVOKE ALL ON FUNCTION app.home_whos_out(date, date) FROM public;
GRANT EXECUTE ON FUNCTION app.home_whos_out(date, date) TO authenticated;
