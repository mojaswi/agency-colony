-- The superadmin's own leave submissions are auto-approved on insert —
-- he has no approver above him, so routing to himself only added a
-- pointless self-approval click.
CREATE OR REPLACE FUNCTION app.prepare_leave_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'app', 'public'
AS $function$
declare
  employee_row app.employees%rowtype;
  dept_row app.departments%rowtype;
  computed_approvers citext[];
  requested_days int;
begin
  select *
  into employee_row
  from app.employees e
  where e.id = new.employee_id
    and e.is_active = true;

  if not found then
    raise exception 'Active employee record not found.';
  end if;

  if employee_row.leave_tracking_enabled = false then
    raise exception 'Finance leave workflow is excluded from Agency Colony v1.';
  end if;

  if new.end_date < new.start_date then
    raise exception 'Leave end date cannot be before start date.';
  end if;

  requested_days := (new.end_date - new.start_date) + 1;

  if new.leave_type = 'SL' and requested_days >= 3 and coalesce(new.medical_certificate_url, '') = '' then
    raise exception 'SL requests for 3+ days require a medical certificate URL.';
  end if;

  select *
  into dept_row
  from app.departments d
  where d.id = employee_row.department_id;

  computed_approvers := employee_row.approver_emails;

  if coalesce(array_length(computed_approvers, 1), 0) = 0 and dept_row.approver_email is not null then
    computed_approvers := array[lower(dept_row.approver_email::text)::citext];
  end if;

  if coalesce(array_length(computed_approvers, 1), 0) = 0 then
    raise exception 'No leave approver configured for this employee/department.';
  end if;

  new.approver_emails := computed_approvers;

  -- Superadmin's own leave needs no approval theater: log it approved.
  -- (Insert policy doesn't require 'pending'; the leave-submitted email
  -- already skips non-pending rows, so no self-notification goes out.)
  if tg_op = 'INSERT'
    and new.employee_id = app.current_employee_id()
    and app.is_superadmin()
  then
    new.status := 'approved';
    new.decided_by_employee_id := new.employee_id;
    new.decided_at := now();
    new.decision_note := 'Auto-approved (superadmin)';
  end if;

  if tg_op = 'UPDATE' then
    if old.status <> new.status and new.status in ('approved', 'rejected') then
      if new.decided_by_employee_id is null then
        new.decided_by_employee_id := app.current_employee_id();
      end if;
      if new.decided_at is null then
        new.decided_at := now();
      end if;
    elsif new.status = 'pending' then
      new.decided_by_employee_id := null;
      new.decided_at := null;
      new.decision_note := null;
    end if;
  end if;

  return new;
end;
$function$

;
