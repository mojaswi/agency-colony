-- Add direct_manager_email column so reporting structure can be edited per employee
alter table app.employees
  add column if not exists direct_manager_email citext;

-- Populate from existing hardcoded mappings
update app.employees set direct_manager_email = 'admin@youragency.com'
  where email in ('leader2@youragency.com', 'leader3@youragency.com', 'leader1@youragency.com');
