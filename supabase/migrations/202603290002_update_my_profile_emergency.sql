-- Update update_my_profile RPC to accept emergency contact and address fields
CREATE OR REPLACE FUNCTION app.update_my_profile(
  p_full_name text DEFAULT NULL,
  p_department_name text DEFAULT NULL,
  p_employment_type app.employment_type DEFAULT NULL,
  p_capacity_percent numeric DEFAULT NULL,
  p_date_of_birth date DEFAULT NULL,
  p_current_city text DEFAULT NULL,
  p_emergency_contact_name text DEFAULT NULL,
  p_emergency_contact_phone text DEFAULT NULL,
  p_personal_address text DEFAULT NULL
)
RETURNS app.employees
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  requester_row app.employees;
  v_department_id uuid;
BEGIN
  SELECT * INTO requester_row
  FROM app.employees
  WHERE auth_user_id = auth.uid() AND is_active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active employee record found for current user.';
  END IF;

  IF p_department_name IS NOT NULL THEN
    SELECT d.id INTO v_department_id
    FROM app.departments d
    WHERE lower(trim(d.name)) = lower(trim(p_department_name))
    LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Department "%" does not exist.', p_department_name;
    END IF;
  ELSE
    v_department_id := requester_row.department_id;
  END IF;

  UPDATE app.employees SET
    full_name        = COALESCE(p_full_name, full_name),
    department_id    = v_department_id,
    employment_type  = COALESCE(p_employment_type, employment_type),
    capacity_percent = COALESCE(p_capacity_percent, capacity_percent),
    date_of_birth    = COALESCE(p_date_of_birth, date_of_birth),
    current_city     = COALESCE(p_current_city, current_city),
    emergency_contact_name  = COALESCE(p_emergency_contact_name, emergency_contact_name),
    emergency_contact_phone = COALESCE(p_emergency_contact_phone, emergency_contact_phone),
    personal_address = COALESCE(p_personal_address, personal_address),
    updated_at       = now()
  WHERE id = requester_row.id;

  SELECT * INTO requester_row
  FROM app.employees
  WHERE id = requester_row.id;

  RETURN requester_row;
END;
$$;

-- Drop old signature and grant new one
DROP FUNCTION IF EXISTS app.update_my_profile(text, text, app.employment_type, numeric, date, text);
GRANT EXECUTE ON FUNCTION app.update_my_profile(text, text, app.employment_type, numeric, date, text, text, text, text) TO authenticated;
