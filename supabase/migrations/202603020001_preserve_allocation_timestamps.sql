-- Fix: only update updated_at when allocation_percent actually changes
-- Also: only delete allocations that are no longer in the incoming set (instead of all)

create or replace function app.save_my_allocations(
  p_period_type app.allocation_period_type,
  p_period_start date,
  p_lines jsonb
)
returns int
language plpgsql
security definer
set search_path = app, public
as $$
declare
  requester_employee_id uuid;
  period_start_date date;
  internal_client_id uuid;
  line_item jsonb;
  project_name_value text;
  project_id_value uuid;
  allocation_value numeric;
  inserted_count int := 0;
  incoming_project_ids uuid[] := '{}';
begin
  requester_employee_id := app.current_employee_id();

  if requester_employee_id is null then
    raise exception 'Employee profile not found. Please complete account bootstrap.';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'p_lines must be a JSON array.';
  end if;

  period_start_date := coalesce(
    p_period_start,
    date_trunc('month', now())::date
  );

  -- Ensure an internal client exists for allocation-only entries.
  select c.id
  into internal_client_id
  from app.clients c
  where c.name = 'Internal'
  limit 1;

  if internal_client_id is null then
    insert into app.clients (name)
    values ('Internal')
    returning id into internal_client_id;
  end if;

  -- Upsert each line, only touching updated_at when percent changes
  for line_item in
    select value from jsonb_array_elements(p_lines)
  loop
    project_name_value := trim(coalesce(line_item ->> 'project_name', ''));
    if project_name_value = '' then
      continue;
    end if;

    allocation_value := greatest(
      0,
      least(
        100,
        coalesce((line_item ->> 'allocation_percent')::numeric, 0)
      )
    );

    select p.id
    into project_id_value
    from app.projects p
    where p.client_id = internal_client_id
      and lower(p.name) = lower(project_name_value)
    limit 1;

    if project_id_value is null then
      insert into app.projects (
        client_id,
        name,
        engagement_type,
        status
      )
      values (
        internal_client_id,
        project_name_value,
        'project',
        'active'
      )
      returning id into project_id_value;
    end if;

    incoming_project_ids := incoming_project_ids || project_id_value;

    insert into app.allocations (
      employee_id,
      project_id,
      period_type,
      period_start,
      allocation_percent,
      created_by_employee_id
    )
    values (
      requester_employee_id,
      project_id_value,
      p_period_type,
      period_start_date,
      allocation_value,
      requester_employee_id
    )
    on conflict (employee_id, project_id, period_type, period_start)
    do update
    set allocation_percent = excluded.allocation_percent,
        updated_at = case
          when app.allocations.allocation_percent <> excluded.allocation_percent then now()
          else app.allocations.updated_at
        end,
        created_by_employee_id = excluded.created_by_employee_id;

    inserted_count := inserted_count + 1;
  end loop;

  -- Only delete allocations not in the incoming set (removed lines)
  delete from app.allocations a
  where a.employee_id = requester_employee_id
    and a.period_type = p_period_type
    and a.period_start = period_start_date
    and a.project_id <> all(incoming_project_ids);

  return inserted_count;
end;
$$;
