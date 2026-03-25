-- Rename 'Acc Management' department to 'AM' to match UI conventions.
-- The UI has always displayed 'AM' — the DB name was a legacy mismatch.
-- Also updates ensure_employee_profile which hardcodes the old name.

-- 1. Rename the department
UPDATE app.departments SET name = 'AM' WHERE name = 'Acc Management';

-- 2. Fix ensure_employee_profile: references 'Acc Management' as default dept
CREATE OR REPLACE FUNCTION app.ensure_employee_profile()
RETURNS app.employees
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  caller_email citext;
  caller_name text;
  emp app.employees%rowtype;
  dept_id uuid;
  mapped_access app.access_level;
BEGIN
  caller_email := lower(coalesce(
    current_setting('request.jwt.claims', true)::json->>'email',
    auth.email()
  ));

  IF caller_email IS NULL OR caller_email = '' THEN
    RAISE EXCEPTION 'No email found in JWT – cannot create employee profile';
  END IF;

  caller_name := coalesce(
    nullif(btrim(current_setting('request.jwt.claims', true)::json->>'name'), ''),
    nullif(btrim(current_setting('request.jwt.claims', true)::json->>'full_name'), ''),
    split_part(caller_email::text, '@', 1)
  );

  SELECT id INTO dept_id
  FROM app.departments d
  WHERE d.name = 'AM'
  LIMIT 1;

  -- Try by auth user id first.
  SELECT *
  INTO emp
  FROM app.employees e
  WHERE e.auth_user_id = auth.uid();

  IF NOT FOUND THEN
    -- Fall back to email match (handles pre-seeded rows).
    SELECT *
    INTO emp
    FROM app.employees e
    WHERE lower(e.email) = caller_email;
  END IF;

  mapped_access := app.mapped_access_level_for_email(caller_email);

  IF FOUND THEN
    UPDATE app.employees
    SET
      auth_user_id = auth.uid(),
      full_name = CASE WHEN full_name IS NULL OR btrim(full_name) = '' THEN caller_name ELSE full_name END,
      access_level = coalesce(mapped_access, employees.access_level),
      updated_at = now()
    WHERE id = emp.id
    RETURNING * INTO emp;
  ELSE
    INSERT INTO app.employees (email, full_name, department_id, auth_user_id, access_level)
    VALUES (
      caller_email,
      caller_name,
      dept_id,
      auth.uid(),
      coalesce(mapped_access, 'employee')
    )
    RETURNING * INTO emp;
  END IF;

  RETURN emp;
END;
$$;
