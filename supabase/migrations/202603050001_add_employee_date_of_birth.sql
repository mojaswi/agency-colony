-- Add date_of_birth column to employees table
ALTER TABLE app.employees ADD COLUMN IF NOT EXISTS date_of_birth date;

-- NOTE: Seed employee date_of_birth values via your own data import or admin UI.
-- Example:
-- UPDATE app.employees SET date_of_birth = '1990-01-15' WHERE email = 'admin@youragency.com';
