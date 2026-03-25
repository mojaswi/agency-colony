-- Allow all authenticated users to see the full employee directory.
-- Previously employees could only see their own record.
-- Needed for: client detail view (person names), people directory, task attribution.
-- Write policies remain leadership/admin only.

drop policy if exists employees_select_self on app.employees;
drop policy if exists employees_select_leadership on app.employees;

create policy employees_select_all_authenticated
on app.employees
for select
to authenticated
using (true);
