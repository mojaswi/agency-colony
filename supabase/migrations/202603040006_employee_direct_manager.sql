-- Add direct_manager_email column so reporting structure can be edited per employee
alter table app.employees
  add column if not exists direct_manager_email citext;

-- Populate from existing hardcoded mappings
update app.employees set direct_manager_email = 'admin@youragency.com'
  where email in ('creative-lead@youragency.com', 'am-lead@youragency.com', 'strategy-lead@youragency.com');
