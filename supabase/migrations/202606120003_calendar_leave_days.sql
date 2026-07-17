-- POLICY REVERT (the superadmin, 12 Jun): leave deducts CALENDAR days — a Fri→Mon
-- leave costs 4, weekends/holidays inside a range count. This restores the
-- original overlap_days; the half-day 0.5 multiplier (in the summary fns)
-- is unaffected. app.working_days dropped (no longer used).

CREATE OR REPLACE FUNCTION app.overlap_days(p_start_a date, p_end_a date, p_start_b date, p_end_b date)
RETURNS integer
LANGUAGE sql IMMUTABLE
SET search_path TO 'app', 'public'
AS $$
  SELECT greatest(
    0,
    least(p_end_a, p_end_b) - greatest(p_start_a, p_start_b) + 1
  );
$$;

DROP FUNCTION IF EXISTS app.working_days(date, date);
