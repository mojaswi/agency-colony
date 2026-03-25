-- Leadership leave overview: batch summaries + grant per-employee summary to authenticated.

-- 1. Update get_leave_cycle_summary_for_employee to allow authenticated callers
--    with authorization check (own profile OR leadership/admin).
create or replace function app.get_leave_cycle_summary_for_employee(
  p_employee_id uuid,
  p_as_of_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = app, public
as $$
declare
  cycle_row app.employee_leave_cycles%rowtype;
  employee_row app.employees%rowtype;
  pl_applied_days numeric := 0;
  cl_applied_days numeric := 0;
  sl_applied_days numeric := 0;
  pl_taken_days numeric := 0;
  cl_taken_days numeric := 0;
  sl_taken_days numeric := 0;
  archive_json jsonb := '[]'::jsonb;
  caller_id uuid;
begin
  -- Authorization: caller must be the employee themselves or leadership/admin
  caller_id := app.current_employee_id();
  if p_employee_id is distinct from caller_id and not app.is_leadership_or_admin() then
    raise exception 'Access denied: requires leadership role or own profile.';
  end if;

  if p_employee_id is null then
    return jsonb_build_object(
      'leave_tracking_enabled', false,
      'cycle_label', 'Apr-Mar',
      'pl', jsonb_build_object('allocated', 0, 'applied', 0, 'taken', 0, 'remaining', 0),
      'cl', jsonb_build_object('allocated', 0, 'applied', 0, 'taken', 0, 'remaining', 0),
      'sl', jsonb_build_object('allocated', 0, 'applied', 0, 'taken', 0, 'remaining', 0),
      'archive', '[]'::jsonb
    );
  end if;

  select *
  into employee_row
  from app.employees e
  where e.id = p_employee_id
    and e.is_active = true;

  if not found or employee_row.leave_tracking_enabled = false then
    return jsonb_build_object(
      'leave_tracking_enabled', false,
      'cycle_label', 'Apr-Mar',
      'pl', jsonb_build_object('allocated', 0, 'applied', 0, 'taken', 0, 'remaining', 0),
      'cl', jsonb_build_object('allocated', 0, 'applied', 0, 'taken', 0, 'remaining', 0),
      'sl', jsonb_build_object('allocated', 0, 'applied', 0, 'taken', 0, 'remaining', 0),
      'archive', '[]'::jsonb
    );
  end if;

  cycle_row := app.ensure_leave_cycle_record(p_employee_id, p_as_of_date);
  if cycle_row.id is null then
    return jsonb_build_object(
      'leave_tracking_enabled', false,
      'cycle_label', 'Apr-Mar',
      'pl', jsonb_build_object('allocated', 0, 'applied', 0, 'taken', 0, 'remaining', 0),
      'cl', jsonb_build_object('allocated', 0, 'applied', 0, 'taken', 0, 'remaining', 0),
      'sl', jsonb_build_object('allocated', 0, 'applied', 0, 'taken', 0, 'remaining', 0),
      'archive', '[]'::jsonb
    );
  end if;

  select
    coalesce(sum(app.overlap_days(lr.start_date, lr.end_date, cycle_row.cycle_start, cycle_row.cycle_end))
      filter (where lr.leave_type = 'PL' and lr.status in ('pending', 'approved')), 0),
    coalesce(sum(app.overlap_days(lr.start_date, lr.end_date, cycle_row.cycle_start, cycle_row.cycle_end))
      filter (where lr.leave_type = 'CL' and lr.status in ('pending', 'approved')), 0),
    coalesce(sum(app.overlap_days(lr.start_date, lr.end_date, cycle_row.cycle_start, cycle_row.cycle_end))
      filter (where lr.leave_type = 'SL' and lr.status in ('pending', 'approved')), 0),
    coalesce(sum(app.overlap_days(lr.start_date, lr.end_date, cycle_row.cycle_start, cycle_row.cycle_end))
      filter (where lr.leave_type = 'PL' and lr.status = 'approved'), 0),
    coalesce(sum(app.overlap_days(lr.start_date, lr.end_date, cycle_row.cycle_start, cycle_row.cycle_end))
      filter (where lr.leave_type = 'CL' and lr.status = 'approved'), 0),
    coalesce(sum(app.overlap_days(lr.start_date, lr.end_date, cycle_row.cycle_start, cycle_row.cycle_end))
      filter (where lr.leave_type = 'SL' and lr.status = 'approved'), 0)
  into
    pl_applied_days,
    cl_applied_days,
    sl_applied_days,
    pl_taken_days,
    cl_taken_days,
    sl_taken_days
  from app.leave_requests lr
  where lr.employee_id = p_employee_id
    and lr.status in ('pending', 'approved')
    and lr.end_date >= cycle_row.cycle_start
    and lr.start_date <= cycle_row.cycle_end;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'cycle_start', a.cycle_start,
        'cycle_end', a.cycle_end,
        'cycle_label', to_char(a.cycle_start, 'Mon YYYY') || ' - ' || to_char(a.cycle_end, 'Mon YYYY'),
        'pl_remaining', a.pl_remaining,
        'cl_remaining', a.cl_remaining,
        'sl_remaining', a.sl_remaining,
        'archived_at', a.archived_at
      )
      order by a.cycle_start desc
    ),
    '[]'::jsonb
  )
  into archive_json
  from (
    select *
    from app.leave_cycle_archives
    where employee_id = p_employee_id
    order by cycle_start desc
    limit 8
  ) a;

  return jsonb_build_object(
    'leave_tracking_enabled', true,
    'cycle_start', cycle_row.cycle_start,
    'cycle_end', cycle_row.cycle_end,
    'cycle_label', to_char(cycle_row.cycle_start, 'Mon YYYY') || ' - ' || to_char(cycle_row.cycle_end, 'Mon YYYY'),
    'pl', jsonb_build_object(
      'allocated', cycle_row.pl_allocated,
      'applied', pl_applied_days,
      'taken', pl_taken_days,
      'remaining', cycle_row.pl_allocated - pl_taken_days
    ),
    'cl', jsonb_build_object(
      'allocated', cycle_row.cl_allocated,
      'applied', cl_applied_days,
      'taken', cl_taken_days,
      'remaining', cycle_row.cl_allocated - cl_taken_days
    ),
    'sl', jsonb_build_object(
      'allocated', cycle_row.sl_allocated,
      'applied', sl_applied_days,
      'taken', sl_taken_days,
      'remaining', cycle_row.sl_allocated - sl_taken_days
    ),
    'archive', archive_json
  );
end;
$$;

-- Grant to authenticated (was service_role only)
grant execute on function app.get_leave_cycle_summary_for_employee(uuid, date) to authenticated;

-- 2. Batch leave summaries for leadership overview
create or replace function app.get_leave_summaries_for_employees(
  p_employee_ids uuid[],
  p_as_of_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = app, public
as $$
declare
  emp_id uuid;
  cycle_row app.employee_leave_cycles%rowtype;
  result_rows jsonb := '[]'::jsonb;
begin
  if not app.is_leadership_or_admin() then
    raise exception 'Access denied: requires leadership or admin role.';
  end if;

  -- Ensure cycle records exist for each employee (has side effects: inserts rows)
  foreach emp_id in array p_employee_ids loop
    begin
      perform app.ensure_leave_cycle_record(emp_id, p_as_of_date);
    exception when others then
      -- Skip employees that error (inactive, etc.)
      null;
    end;
  end loop;

  -- Single set-based query for all summaries
  select coalesce(jsonb_agg(row_obj order by row_obj->>'full_name'), '[]'::jsonb)
  into result_rows
  from (
    select jsonb_build_object(
      'employee_id', e.id,
      'full_name', e.full_name,
      'leave_tracking_enabled', e.leave_tracking_enabled,
      'pl_allocated', c.pl_allocated,
      'cl_allocated', c.cl_allocated,
      'sl_allocated', c.sl_allocated,
      'pl_taken', coalesce(lr_agg.pl_taken, 0),
      'cl_taken', coalesce(lr_agg.cl_taken, 0),
      'sl_taken', coalesce(lr_agg.sl_taken, 0),
      'pl_remaining', c.pl_allocated - coalesce(lr_agg.pl_taken, 0),
      'cl_remaining', c.cl_allocated - coalesce(lr_agg.cl_taken, 0),
      'sl_remaining', c.sl_allocated - coalesce(lr_agg.sl_taken, 0)
    ) as row_obj
    from unnest(p_employee_ids) as eid(id)
    join app.employees e on e.id = eid.id and e.is_active = true
    join app.employee_leave_cycles c
      on c.employee_id = e.id
      and c.cycle_start = app.leave_cycle_start(p_as_of_date)
      and c.archived_at is null
    left join lateral (
      select
        coalesce(sum(app.overlap_days(lr.start_date, lr.end_date, c.cycle_start, c.cycle_end))
          filter (where lr.leave_type = 'PL' and lr.status = 'approved'), 0) as pl_taken,
        coalesce(sum(app.overlap_days(lr.start_date, lr.end_date, c.cycle_start, c.cycle_end))
          filter (where lr.leave_type = 'CL' and lr.status = 'approved'), 0) as cl_taken,
        coalesce(sum(app.overlap_days(lr.start_date, lr.end_date, c.cycle_start, c.cycle_end))
          filter (where lr.leave_type = 'SL' and lr.status = 'approved'), 0) as sl_taken
      from app.leave_requests lr
      where lr.employee_id = e.id
        and lr.status = 'approved'
        and lr.end_date >= c.cycle_start
        and lr.start_date <= c.cycle_end
    ) lr_agg on true
  ) sub;

  return result_rows;
end;
$$;

grant execute on function app.get_leave_summaries_for_employees(uuid[], date) to authenticated;
