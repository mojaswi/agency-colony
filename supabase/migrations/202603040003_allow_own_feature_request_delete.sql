-- Allow original poster to delete their own feature request when status = 'requested'.
-- Previously only leadership/admin could delete.

drop policy if exists feature_requests_delete_leadership on app.feature_requests;

create policy feature_requests_delete_own_or_leadership
  on app.feature_requests for delete to authenticated
  using (
    app.is_leadership_or_admin()
    or (employee_id = app.current_employee_id() and status = 'requested')
  );
