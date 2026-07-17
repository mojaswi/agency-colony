-- The client detail page now shows an Engagement & Scope summary (read-only) to
-- everyone who can see the client. Scope items were leadership/admin-only to read
-- (scope_items_leadership_all, FOR ALL), so AM/employees saw no scope. Add an
-- open SELECT policy so the whole team can READ scope; writes stay restricted by
-- the existing FOR ALL policy (is_leadership_or_admin). Consistent with deals /
-- allocations / daily_tasks, which are already readable by all authenticated users.
drop policy if exists scope_items_select_all on app.client_scope_items;
create policy scope_items_select_all on app.client_scope_items
  for select to authenticated using (true);
