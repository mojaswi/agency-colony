-- Update update_my_profile RPC to accept date_of_birth parameter
create or replace function app.update_my_profile(
  p_full_name text default null,
  p_department_name text default null,
  p_employment_type app.employment_type default null,
  p_capacity_percent numeric default null,
  p_date_of_birth date default null
)
returns app.employees
language plpgsql
security definer
set search_path = app, public
as $$
declare
  requester_employee_id uuid;
  requester_row app.employees%rowtype;
  resolved_department_id uuid;
  resolved_name text;
  resolved_employment app.employment_type;
  resolved_capacity numeric(5,2);
begin
  requester_employee_id := app.current_employee_id();
  if requester_employee_id is null then
    raise exception 'No employee profile mapped for current user';
  end if;

  select *
  into requester_row
  from app.employees
  where id = requester_employee_id;

  if not found then
    raise exception 'Unable to load requester employee row';
  end if;

  resolved_name := nullif(btrim(coalesce(p_full_name, requester_row.full_name)), '');
  if resolved_name is null then
    raise exception 'Full name is required';
  end if;

  if p_department_name is null or btrim(p_department_name) = '' then
    resolved_department_id := requester_row.department_id;
  else
    select d.id
    into resolved_department_id
    from app.departments d
    where d.name = btrim(p_department_name)
      and d.is_active = true
    limit 1;
  end if;

  if resolved_department_id is null then
    raise exception 'Unknown department';
  end if;

  resolved_employment := coalesce(p_employment_type, requester_row.employment_type);
  resolved_capacity := coalesce(p_capacity_percent, requester_row.capacity_percent);
  if resolved_capacity <= 0 or resolved_capacity > 100 then
    raise exception 'Capacity must be between 1 and 100';
  end if;

  update app.employees e
  set
    full_name = resolved_name,
    department_id = resolved_department_id,
    employment_type = resolved_employment,
    capacity_percent = resolved_capacity,
    date_of_birth = coalesce(p_date_of_birth, e.date_of_birth),
    updated_at = now()
  where e.id = requester_employee_id
  returning e.*
  into requester_row;

  return requester_row;
end;
$$;

-- Drop old signature and grant new one
drop function if exists app.update_my_profile(text, text, app.employment_type, numeric);
grant execute on function app.update_my_profile(text, text, app.employment_type, numeric, date) to authenticated;
