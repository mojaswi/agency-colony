-- Leadership leave requests must route to and be decided by superadmin.

create or replace function app.superadmin_email()
returns text
language sql
stable
as $$
  select 'admin@youragency.com'::text;
$$;

create or replace function app.enforce_leadership_leave_superadmin()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
declare
  target_employee app.employees%rowtype;
  requester_email text;
begin
  select *
  into target_employee
  from app.employees e
  where e.id = new.employee_id
    and e.is_active = true;

  if not found then
    raise exception 'Active employee record not found.';
  end if;

  if target_employee.access_level = 'leadership' then
    new.approver_emails := array[app.superadmin_email()::citext];

    if tg_op = 'UPDATE'
      and old.status is distinct from new.status
      and new.status in ('approved', 'rejected')
    then
      requester_email := app.current_request_email();

      if auth.role() <> 'service_role' and requester_email <> app.superadmin_email() then
        raise exception 'Leadership leave requests can only be approved or rejected by superadmin.';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_leave_requests_z_superadmin on app.leave_requests;
create trigger trg_leave_requests_z_superadmin
before insert or update on app.leave_requests
for each row
execute function app.enforce_leadership_leave_superadmin();

update app.employees e
set approver_emails = array[app.superadmin_email()::citext],
    updated_at = now()
where e.access_level = 'leadership'
  and e.is_active = true
  and e.approver_emails is distinct from array[app.superadmin_email()::citext];

update app.leave_requests lr
set approver_emails = array[app.superadmin_email()::citext],
    updated_at = now()
from app.employees e
where lr.employee_id = e.id
  and e.access_level = 'leadership'
  and lr.status = 'pending'
  and lr.approver_emails is distinct from array[app.superadmin_email()::citext];
