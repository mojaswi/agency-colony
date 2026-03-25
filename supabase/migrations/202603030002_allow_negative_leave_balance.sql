-- Allow negative remaining leave balances instead of clamping to 0.
-- This lets the UI show when someone has exceeded their allocation.

-- 1. Fix get_leave_cycle_summary_for_employee: remove greatest(..., 0) on remaining
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
begin
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

-- 2. Fix archive_leave_cycle_row: remove greatest(..., 0) on remaining
create or replace function app.archive_leave_cycle_row(p_cycle_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public
as $$
declare
  cycle_row app.employee_leave_cycles%rowtype;
  pl_taken_days numeric := 0;
  cl_taken_days numeric := 0;
  sl_taken_days numeric := 0;
begin
  select *
  into cycle_row
  from app.employee_leave_cycles
  where id = p_cycle_id
  for update;

  if not found then
    return;
  end if;

  select
    coalesce(sum(app.overlap_days(lr.start_date, lr.end_date, cycle_row.cycle_start, cycle_row.cycle_end))
      filter (where lr.leave_type = 'PL' and lr.status = 'approved'), 0),
    coalesce(sum(app.overlap_days(lr.start_date, lr.end_date, cycle_row.cycle_start, cycle_row.cycle_end))
      filter (where lr.leave_type = 'CL' and lr.status = 'approved'), 0),
    coalesce(sum(app.overlap_days(lr.start_date, lr.end_date, cycle_row.cycle_start, cycle_row.cycle_end))
      filter (where lr.leave_type = 'SL' and lr.status = 'approved'), 0)
  into pl_taken_days, cl_taken_days, sl_taken_days
  from app.leave_requests lr
  where lr.employee_id = cycle_row.employee_id
    and lr.status = 'approved'
    and lr.end_date >= cycle_row.cycle_start
    and lr.start_date <= cycle_row.cycle_end;

  insert into app.leave_cycle_archives (
    employee_id,
    cycle_start,
    cycle_end,
    pl_allocated,
    cl_allocated,
    sl_allocated,
    pl_taken,
    cl_taken,
    sl_taken,
    pl_remaining,
    cl_remaining,
    sl_remaining,
    archived_at
  )
  values (
    cycle_row.employee_id,
    cycle_row.cycle_start,
    cycle_row.cycle_end,
    cycle_row.pl_allocated,
    cycle_row.cl_allocated,
    cycle_row.sl_allocated,
    pl_taken_days,
    cl_taken_days,
    sl_taken_days,
    cycle_row.pl_allocated - pl_taken_days,
    cycle_row.cl_allocated - cl_taken_days,
    cycle_row.sl_allocated - sl_taken_days,
    now()
  )
  on conflict (employee_id, cycle_start)
  do update
  set cycle_end = excluded.cycle_end,
      pl_allocated = excluded.pl_allocated,
      cl_allocated = excluded.cl_allocated,
      sl_allocated = excluded.sl_allocated,
      pl_taken = excluded.pl_taken,
      cl_taken = excluded.cl_taken,
      sl_taken = excluded.sl_taken,
      pl_remaining = excluded.pl_remaining,
      cl_remaining = excluded.cl_remaining,
      sl_remaining = excluded.sl_remaining,
      archived_at = excluded.archived_at;

  update app.employee_leave_cycles
  set archived_at = coalesce(archived_at, now())
  where id = cycle_row.id;
end;
$$;
