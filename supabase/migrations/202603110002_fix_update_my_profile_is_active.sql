-- Fix update_my_profile: departments table has no is_active column
-- The 202603100002 migration incorrectly referenced d.is_active instead of d.leave_tracking_enabled

CREATE OR REPLACE FUNCTION app.update_my_profile(
  p_full_name text DEFAULT NULL,
  p_department_name text DEFAULT NULL,
  p_employment_type app.employment_type DEFAULT NULL,
  p_capacity_percent numeric DEFAULT NULL,
  p_date_of_birth date DEFAULT NULL,
  p_current_city text DEFAULT NULL
)
RETURNS app.employees
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  requester_employee_id uuid;
  requester_row app.employees%rowtype;
  resolved_department_id uuid;
  resolved_name text;
  resolved_employment app.employment_type;
  resolved_capacity numeric(5,2);
BEGIN
  requester_employee_id := app.current_employee_id();
  IF requester_employee_id IS NULL THEN
    RAISE EXCEPTION 'No employee profile mapped for current user';
  END IF;

  SELECT *
  INTO requester_row
  FROM app.employees
  WHERE id = requester_employee_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unable to load requester employee row';
  END IF;

  resolved_name := nullif(btrim(coalesce(p_full_name, requester_row.full_name)), '');
  IF resolved_name IS NULL THEN
    RAISE EXCEPTION 'Full name is required';
  END IF;

  IF p_department_name IS NULL OR btrim(p_department_name) = '' THEN
    resolved_department_id := requester_row.department_id;
  ELSE
    SELECT d.id
    INTO resolved_department_id
    FROM app.departments d
    WHERE d.name = btrim(p_department_name)
    LIMIT 1;
  END IF;

  IF resolved_department_id IS NULL THEN
    RAISE EXCEPTION 'Unknown department';
  END IF;

  resolved_employment := coalesce(p_employment_type, requester_row.employment_type);
  resolved_capacity := coalesce(p_capacity_percent, requester_row.capacity_percent);
  IF resolved_capacity <= 0 OR resolved_capacity > 100 THEN
    RAISE EXCEPTION 'Capacity must be between 1 and 100';
  END IF;

  UPDATE app.employees e
  SET
    full_name = resolved_name,
    department_id = resolved_department_id,
    employment_type = resolved_employment,
    capacity_percent = resolved_capacity,
    date_of_birth = coalesce(p_date_of_birth, e.date_of_birth),
    current_city = coalesce(nullif(btrim(p_current_city), ''), e.current_city),
    updated_at = now()
  WHERE e.id = requester_employee_id
  RETURNING e.*
  INTO requester_row;

  RETURN requester_row;
END;
$$;
