-- Only superadmin can assign or change access roles in authenticated sessions.

create or replace function app.enforce_superadmin_role_changes()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
declare
  requester_email text;
begin
  -- Service contexts and SQL editor operations have no end-user JWT.
  if auth.uid() is null or coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  requester_email := app.current_request_email();
  if requester_email = app.superadmin_email() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if coalesce(new.access_level, 'employee'::app.access_level) <> 'employee'::app.access_level then
      raise exception 'Only superadmin can assign leadership/admin roles.';
    end if;
  elsif tg_op = 'UPDATE' then
    if old.access_level is distinct from new.access_level then
      raise exception 'Only superadmin can change access roles.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_employees_zz_restrict_access_roles on app.employees;
create trigger trg_employees_zz_restrict_access_roles
before insert or update on app.employees
for each row
execute function app.enforce_superadmin_role_changes();
