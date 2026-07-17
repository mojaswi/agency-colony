-- Half-day leave (board request, a team member 22 Apr). A request can be marked
-- half-day (single-day only, DB-enforced); it deducts 0.5 working days.
-- All existing rows default to full days — balances unchanged.

ALTER TABLE app.leave_requests ADD COLUMN IF NOT EXISTS is_half_day boolean NOT NULL DEFAULT false;
ALTER TABLE app.leave_requests DROP CONSTRAINT IF EXISTS half_day_single_day;
ALTER TABLE app.leave_requests ADD CONSTRAINT half_day_single_day CHECK (NOT is_half_day OR start_date = end_date);

-- Summary/archive math: 0.5 multiplier for half-day rows
CREATE OR REPLACE FUNCTION app.get_leave_cycle_summary_for_employee(p_employee_id uuid, p_as_of_date date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'app', 'public'
AS $function$
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
    coalesce(sum((case when lr.is_half_day then 0.5 else 1 end) * app.overlap_days(lr.start_date, lr.end_date, cycle_row.cycle_start, cycle_row.cycle_end))
      filter (where lr.leave_type = 'PL' and lr.status in ('pending', 'approved')), 0),
    coalesce(sum((case when lr.is_half_day then 0.5 else 1 end) * app.overlap_days(lr.start_date, lr.end_date, cycle_row.cycle_start, cycle_row.cycle_end))
      filter (where lr.leave_type = 'CL' and lr.status in ('pending', 'approved')), 0),
    coalesce(sum((case when lr.is_half_day then 0.5 else 1 end) * app.overlap_days(lr.start_date, lr.end_date, cycle_row.cycle_start, cycle_row.cycle_end))
      filter (where lr.leave_type = 'SL' and lr.status in ('pending', 'approved')), 0),
    coalesce(sum((case when lr.is_half_day then 0.5 else 1 end) * app.overlap_days(lr.start_date, lr.end_date, cycle_row.cycle_start, cycle_row.cycle_end))
      filter (where lr.leave_type = 'PL' and lr.status = 'approved'), 0),
    coalesce(sum((case when lr.is_half_day then 0.5 else 1 end) * app.overlap_days(lr.start_date, lr.end_date, cycle_row.cycle_start, cycle_row.cycle_end))
      filter (where lr.leave_type = 'CL' and lr.status = 'approved'), 0),
    coalesce(sum((case when lr.is_half_day then 0.5 else 1 end) * app.overlap_days(lr.start_date, lr.end_date, cycle_row.cycle_start, cycle_row.cycle_end))
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
$function$;

CREATE OR REPLACE FUNCTION app.get_leave_summaries_for_employees(p_employee_ids uuid[], p_as_of_date date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'app', 'public'
AS $function$
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
        coalesce(sum((case when lr.is_half_day then 0.5 else 1 end) * app.overlap_days(lr.start_date, lr.end_date, c.cycle_start, c.cycle_end))
          filter (where lr.leave_type = 'PL' and lr.status = 'approved'), 0) as pl_taken,
        coalesce(sum((case when lr.is_half_day then 0.5 else 1 end) * app.overlap_days(lr.start_date, lr.end_date, c.cycle_start, c.cycle_end))
          filter (where lr.leave_type = 'CL' and lr.status = 'approved'), 0) as cl_taken,
        coalesce(sum((case when lr.is_half_day then 0.5 else 1 end) * app.overlap_days(lr.start_date, lr.end_date, c.cycle_start, c.cycle_end))
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
$function$;

CREATE OR REPLACE FUNCTION app.archive_leave_cycle_row(p_cycle_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'app', 'public'
AS $function$
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
    coalesce(sum((case when lr.is_half_day then 0.5 else 1 end) * app.overlap_days(lr.start_date, lr.end_date, cycle_row.cycle_start, cycle_row.cycle_end))
      filter (where lr.leave_type = 'PL' and lr.status = 'approved'), 0),
    coalesce(sum((case when lr.is_half_day then 0.5 else 1 end) * app.overlap_days(lr.start_date, lr.end_date, cycle_row.cycle_start, cycle_row.cycle_end))
      filter (where lr.leave_type = 'CL' and lr.status = 'approved'), 0),
    coalesce(sum((case when lr.is_half_day then 0.5 else 1 end) * app.overlap_days(lr.start_date, lr.end_date, cycle_row.cycle_start, cycle_row.cycle_end))
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
$function$;


-- submit RPC gains p_is_half_day (drop the old 5-arg signature to avoid overload ambiguity)
DROP FUNCTION IF EXISTS app.submit_leave_request(app.leave_type, date, date, text, text);
CREATE OR REPLACE FUNCTION app.submit_leave_request(p_leave_type app.leave_type, p_start_date date, p_end_date date, p_reason text DEFAULT NULL::text, p_medical_certificate_url text DEFAULT NULL::text, p_is_half_day boolean DEFAULT false)
 RETURNS app.leave_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'app', 'public'
AS $function$
declare
  requester_employee_id uuid;
  inserted_row app.leave_requests%rowtype;
begin
  requester_employee_id := app.current_employee_id();

  if requester_employee_id is null then
    raise exception 'Employee profile not found. Please complete account bootstrap.';
  end if;

  insert into app.leave_requests (
    employee_id,
    leave_type,
    start_date,
    end_date,
    reason,
    medical_certificate_url,
    is_half_day
  )
  values (
    requester_employee_id,
    p_leave_type,
    p_start_date,
    p_end_date,
    nullif(p_reason, ''),
    nullif(p_medical_certificate_url, ''),
    coalesce(p_is_half_day, false)
  )
  returning * into inserted_row;

  return inserted_row;
end;
$function$;

GRANT EXECUTE ON FUNCTION app.submit_leave_request(app.leave_type, date, date, text, text, boolean) TO authenticated;

-- who's-out feed includes the half-day flag (return type change → drop first)
DROP FUNCTION IF EXISTS app.home_whos_out(date, date);
CREATE OR REPLACE FUNCTION app.home_whos_out(p_from date, p_until date)
 RETURNS TABLE(full_name text, email text, leave_type text, status text, start_date date, end_date date, is_half_day boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'app', 'public'
AS $function$
  SELECT e.full_name, e.email, lr.leave_type, lr.status, lr.start_date, lr.end_date, lr.is_half_day
  FROM app.leave_requests lr
  JOIN app.employees e ON e.id = lr.employee_id
  WHERE e.is_active
    AND p_until >= p_from
    AND p_until <= p_from + 31               -- sanity-clamp the window
    AND lr.end_date >= p_from
    AND lr.start_date <= p_until
    AND (
      lr.status = 'approved'
      OR (lr.status = 'pending' AND lr.leave_type = 'SL' AND lr.start_date <= current_date)
    )
  ORDER BY lr.start_date, e.full_name;
$function$;
REVOKE ALL ON FUNCTION app.home_whos_out(date, date) FROM public;
GRANT EXECUTE ON FUNCTION app.home_whos_out(date, date) TO authenticated;
