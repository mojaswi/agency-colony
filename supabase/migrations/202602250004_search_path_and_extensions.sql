-- ==========================================================
-- Fix 1: Move extensions out of public schema
-- ==========================================================
-- Supabase provides an 'extensions' schema for this purpose.
-- We create them there; the existing public copies are dropped automatically
-- when Postgres sees the same extension already exists.

CREATE SCHEMA IF NOT EXISTS extensions;

ALTER EXTENSION pgcrypto SET SCHEMA extensions;
ALTER EXTENSION citext SET SCHEMA extensions;

-- ==========================================================
-- Fix 2: Add SET search_path to all functions missing it
-- ==========================================================

-- 2a. app.now_utc()
CREATE OR REPLACE FUNCTION app.now_utc()
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = app, public
AS $$
  SELECT now();
$$;

-- 2b. app.is_agency_email(text)
CREATE OR REPLACE FUNCTION app.is_agency_email(input_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = app, public
AS $$
  SELECT coalesce(lower(input_email) LIKE '%@youragency.com', false);
$$;

-- 2c. app.current_request_email()
CREATE OR REPLACE FUNCTION app.current_request_email()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = app, public
AS $$
  SELECT lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

-- 2d. app.set_updated_at() — trigger function
CREATE OR REPLACE FUNCTION app.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = app, public
AS $$
BEGIN
  new.updated_at = now();
  RETURN new;
END;
$$;

-- 2e. app.mapped_access_level_for_email(text)
CREATE OR REPLACE FUNCTION app.mapped_access_level_for_email(input_email text)
RETURNS app.access_level
LANGUAGE sql
STABLE
SET search_path = app, public
AS $$
  SELECT CASE lower(coalesce(input_email, ''))
    WHEN 'admin@youragency.com' THEN 'admin'::app.access_level
    WHEN 'leader1@youragency.com' THEN 'leadership'::app.access_level
    WHEN 'leader2@youragency.com' THEN 'leadership'::app.access_level
    WHEN 'leader3@youragency.com' THEN 'leadership'::app.access_level
    ELSE null
  END;
$$;

-- 2f. app.superadmin_email()
CREATE OR REPLACE FUNCTION app.superadmin_email()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = app, public
AS $$
  SELECT 'admin@youragency.com'::text;
$$;

-- 2g. app.leave_cycle_end(date)
CREATE OR REPLACE FUNCTION app.leave_cycle_end(p_cycle_start date)
RETURNS date
LANGUAGE sql
STABLE
SET search_path = app, public
AS $$
  SELECT (p_cycle_start + interval '1 year - 1 day')::date;
$$;

-- 2h. app.overlap_days(date, date, date, date)
CREATE OR REPLACE FUNCTION app.overlap_days(
  p_start_a date,
  p_end_a date,
  p_start_b date,
  p_end_b date
)
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path = app, public
AS $$
  SELECT greatest(
    0,
    least(p_end_a, p_end_b) - greatest(p_start_a, p_start_b) + 1
  );
$$;
