-- Leave day counts now exclude weekends AND public holidays (team decision,
-- 10 Jun 2026). Previously overlap_days counted CALENDAR days — a Mon-Sun
-- leave deducted 7 days from the balance while the request-form hint said 5.
-- Holidays come from app.public_holidays (leadership-editable), so past-year
-- holidays not in that table simply aren't excluded for archived cycles.

CREATE OR REPLACE FUNCTION app.working_days(p_start date, p_end date)
RETURNS integer
LANGUAGE sql STABLE
SET search_path TO 'app', 'public'
AS $$
  SELECT count(*)::int
  FROM generate_series(p_start, p_end, interval '1 day') AS d
  WHERE extract(isodow FROM d) < 6
    AND d::date NOT IN (SELECT holiday_date FROM app.public_holidays);
$$;

-- Same signature, used by all leave summary/archive functions; was IMMUTABLE
-- calendar math, now STABLE (reads public_holidays).
CREATE OR REPLACE FUNCTION app.overlap_days(p_start_a date, p_end_a date, p_start_b date, p_end_b date)
RETURNS integer
LANGUAGE sql STABLE
SET search_path TO 'app', 'public'
AS $$
  SELECT CASE
    WHEN least(p_end_a, p_end_b) < greatest(p_start_a, p_start_b) THEN 0
    ELSE app.working_days(greatest(p_start_a, p_start_b), least(p_end_a, p_end_b))
  END;
$$;
