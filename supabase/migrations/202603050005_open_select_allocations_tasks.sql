-- Allow all authenticated users to SELECT allocations and daily_tasks
-- so employees can view team allocations and tasks per client in client detail view.
-- Write policies remain unchanged (own rows or leadership/admin only).

drop policy if exists allocations_select_own_or_leadership on app.allocations;
create policy allocations_select_all_authenticated
on app.allocations
for select
to authenticated
using (true);

drop policy if exists daily_tasks_select_own_or_leadership on app.daily_tasks;
create policy daily_tasks_select_all_authenticated
on app.daily_tasks
for select
to authenticated
using (true);
