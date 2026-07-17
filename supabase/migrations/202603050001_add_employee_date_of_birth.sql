-- Add date_of_birth column to employees table
ALTER TABLE app.employees ADD COLUMN IF NOT EXISTS date_of_birth date;

-- Pre-populate from HR records; employees can update via their profile going forward
UPDATE app.employees SET date_of_birth = '1995-05-31' WHERE email = 'admin@youragency.com';
UPDATE app.employees SET date_of_birth = '1996-01-11' WHERE email = 'am-lead@youragency.com';
UPDATE app.employees SET date_of_birth = '1997-09-27' WHERE email = 'creative-lead@youragency.com';
UPDATE app.employees SET date_of_birth = '1998-05-10' WHERE email = 'bd@youragency.com';
UPDATE app.employees SET date_of_birth = '1997-11-15' WHERE email = 'design2@youragency.com';
UPDATE app.employees SET date_of_birth = '1970-12-03' WHERE email = 'finance2@youragency.com';
UPDATE app.employees SET date_of_birth = '1996-03-05' WHERE email = 'copy3@youragency.com';
UPDATE app.employees SET date_of_birth = '2003-12-19' WHERE email = 'am2@youragency.com';
UPDATE app.employees SET date_of_birth = '2003-01-01' WHERE email = 'strategy-lead@youragency.com';
UPDATE app.employees SET date_of_birth = '2003-06-06' WHERE email = 'design1@youragency.com';
UPDATE app.employees SET date_of_birth = '1998-05-30' WHERE email = 'copy2@youragency.com';
UPDATE app.employees SET date_of_birth = '1990-11-17' WHERE email = 'video1@youragency.com';
UPDATE app.employees SET date_of_birth = '1998-07-12' WHERE email = 'user@youragency.com';
UPDATE app.employees SET date_of_birth = '2002-03-07' WHERE email = 'am1@youragency.com';
