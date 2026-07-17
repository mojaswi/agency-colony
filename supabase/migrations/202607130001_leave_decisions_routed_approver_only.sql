-- Leave decisions must come from the ROUTED approver (direct manager) or the
-- superadmin — not leadership-wide. Previously any leadership member could
-- update any leave request, so approvals were happening across team lines
-- (e.g. the AM lead deciding Art/Copy requests routed to the creative lead).
--
-- New WITH CHECK, in order:
--   1. superadmin: anything (offboarding bulk-cancel, overrides)
--   2. routed approver: the caller's email is in the row's approver_emails
--      (NOTE: must be qualified as leave_requests.approver_emails — employees
--      has a same-named column that silently shadows it inside the EXISTS)
--   3. the employee themself: pending/cancelled transitions only, while
--      undecided (submit + self-cancel — unchanged from before)
-- The leadership-requester rule (their leave decided only by superadmin) is
-- separately enforced by the existing enforce_leadership_leave_superadmin
-- trigger and is unaffected.
drop policy if exists leave_requests_update_own_pending_or_leadership on app.leave_requests;
create policy leave_requests_update_own_pending_or_leadership on app.leave_requests
  for update to authenticated
  using (
    employee_id = app.current_employee_id()
    or app.is_leadership_or_admin()
  )
  with check (
    app.is_superadmin()
    or exists (
      select 1 from app.employees me
      where me.id = app.current_employee_id()
        and lower(me.email::text) in (select lower(a::text) from unnest(leave_requests.approver_emails) a)
    )
    or (
      employee_id = app.current_employee_id()
      and status = any (array['pending'::app.leave_status, 'cancelled'::app.leave_status])
      and decided_by_employee_id is null
      and decided_at is null
    )
  );
