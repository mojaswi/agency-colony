-- Leave cycle balances with Apr-Mar reset and archive retention.

create table if not exists app.leave_cycle_policy (
  id bigserial primary key,
  cycle_start_month int not null default 4 check (cycle_start_month between 1 and 12),
  cycle_start_day int not null default 1 check (cycle_start_day between 1 and 31),
  pl_allocation numeric(6,2) not null default 12 check (pl_allocation >= 0),
  cl_allocation numeric(6,2) not null default 12 check (cl_allocation >= 0),
  sl_allocation numeric(6,2) not null default 12 check (sl_allocation >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into app.leave_cycle_policy (cycle_start_month, cycle_start_day, pl_allocation, cl_allocation, sl_allocation, is_active)
select 4, 1, 12, 12, 12, true
where not exists (select 1 from app.leave_cycle_policy);

create table if not exists app.employee_leave_cycles (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references app.employees(id) on delete cascade,
  cycle_start date not null,
  cycle_end date not null,
  pl_allocated numeric(6,2) not null check (pl_allocated >= 0),
  cl_allocated numeric(6,2) not null check (cl_allocated >= 0),
  sl_allocated numeric(6,2) not null check (sl_allocated >= 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, cycle_start),
  constraint employee_leave_cycles_range_ck check (cycle_end >= cycle_start)
);

create index if not exists employee_leave_cycles_employee_cycle_idx
  on app.employee_leave_cycles (employee_id, cycle_start desc);

create table if not exists app.leave_cycle_archives (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references app.employees(id) on delete cascade,
  cycle_start date not null,
  cycle_end date not null,
  pl_allocated numeric(6,2) not null,
  cl_allocated numeric(6,2) not null,
  sl_allocated numeric(6,2) not null,
  pl_taken numeric(7,2) not null default 0,
  cl_taken numeric(7,2) not null default 0,
  sl_taken numeric(7,2) not null default 0,
  pl_remaining numeric(7,2) not null default 0,
  cl_remaining numeric(7,2) not null default 0,
  sl_remaining numeric(7,2) not null default 0,
  archived_at timestamptz not null default now(),
  unique (employee_id, cycle_start),
  constraint leave_cycle_archives_range_ck check (cycle_end >= cycle_start)
);

create index if not exists leave_cycle_archives_employee_cycle_idx
  on app.leave_cycle_archives (employee_id, cycle_start desc);

drop trigger if exists trg_leave_cycle_policy_set_updated_at on app.leave_cycle_policy;
create trigger trg_leave_cycle_policy_set_updated_at
before update on app.leave_cycle_policy
for each row
execute function app.set_updated_at();

drop trigger if exists trg_employee_leave_cycles_set_updated_at on app.employee_leave_cycles;
create trigger trg_employee_leave_cycles_set_updated_at
before update on app.employee_leave_cycles
for each row
execute function app.set_updated_at();

create or replace function app.leave_cycle_start(p_date date default current_date)
returns date
language plpgsql
stable
set search_path = app, public
as $$
declare
  cfg record;
  y int;
  cycle_start_date date;
begin
  select cycle_start_month, cycle_start_day
  into cfg
  from app.leave_cycle_policy
  where is_active = true
  order by id desc
  limit 1;

  if cfg.cycle_start_month is null then
    cfg.cycle_start_month := 4;
    cfg.cycle_start_day := 1;
  end if;

  y := extract(year from coalesce(p_date, current_date))::int;
  cycle_start_date := make_date(y, cfg.cycle_start_month, cfg.cycle_start_day);
  if coalesce(p_date, current_date) < cycle_start_date then
    cycle_start_date := make_date(y - 1, cfg.cycle_start_month, cfg.cycle_start_day);
  end if;

  return cycle_start_date;
end;
$$;

create or replace function app.leave_cycle_end(p_cycle_start date)
returns date
language sql
stable
as $$
  select (p_cycle_start + interval '1 year - 1 day')::date;
$$;

create or replace function app.overlap_days(
  p_start_a date,
  p_end_a date,
  p_start_b date,
  p_end_b date
)
returns int
language sql
immutable
as $$
  select greatest(
    0,
    least(p_end_a, p_end_b) - greatest(p_start_a, p_start_b) + 1
  );
$$;

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
    greatest(cycle_row.pl_allocated - pl_taken_days, 0),
    greatest(cycle_row.cl_allocated - cl_taken_days, 0),
    greatest(cycle_row.sl_allocated - sl_taken_days, 0),
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

create or replace function app.ensure_leave_cycle_record(
  p_employee_id uuid,
  p_as_of_date date default current_date
)
returns app.employee_leave_cycles
language plpgsql
security definer
set search_path = app, public
as $$
declare
  employee_row app.employees%rowtype;
  policy_row app.leave_cycle_policy%rowtype;
  cycle_start_date date;
  cycle_end_date date;
  existing_row app.employee_leave_cycles%rowtype;
  previous_row app.employee_leave_cycles%rowtype;
begin
  if p_employee_id is null then
    return null;
  end if;

  select *
  into employee_row
  from app.employees e
  where e.id = p_employee_id
    and e.is_active = true;

  if not found then
    raise exception 'Active employee not found for leave cycle setup.';
  end if;

  if employee_row.leave_tracking_enabled = false then
    return null;
  end if;

  cycle_start_date := app.leave_cycle_start(coalesce(p_as_of_date, current_date));
  cycle_end_date := app.leave_cycle_end(cycle_start_date);

  select *
  into policy_row
  from app.leave_cycle_policy p
  where p.is_active = true
  order by p.id desc
  limit 1;

  if not found then
    policy_row.pl_allocation := 12;
    policy_row.cl_allocation := 12;
    policy_row.sl_allocation := 12;
  end if;

  select *
  into existing_row
  from app.employee_leave_cycles c
  where c.employee_id = p_employee_id
    and c.cycle_start = cycle_start_date
  limit 1;

  if found then
    return existing_row;
  end if;

  select *
  into previous_row
  from app.employee_leave_cycles c
  where c.employee_id = p_employee_id
    and c.cycle_start < cycle_start_date
  order by c.cycle_start desc
  limit 1;

  if found and previous_row.archived_at is null then
    perform app.archive_leave_cycle_row(previous_row.id);
  end if;

  insert into app.employee_leave_cycles (
    employee_id,
    cycle_start,
    cycle_end,
    pl_allocated,
    cl_allocated,
    sl_allocated
  )
  values (
    p_employee_id,
    cycle_start_date,
    cycle_end_date,
    coalesce(policy_row.pl_allocation, 12),
    coalesce(policy_row.cl_allocation, 12),
    coalesce(policy_row.sl_allocation, 12)
  )
  on conflict (employee_id, cycle_start)
  do update
  set cycle_end = excluded.cycle_end
  returning * into existing_row;

  return existing_row;
end;
$$;

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
      'remaining', greatest(cycle_row.pl_allocated - pl_taken_days, 0)
    ),
    'cl', jsonb_build_object(
      'allocated', cycle_row.cl_allocated,
      'applied', cl_applied_days,
      'taken', cl_taken_days,
      'remaining', greatest(cycle_row.cl_allocated - cl_taken_days, 0)
    ),
    'sl', jsonb_build_object(
      'allocated', cycle_row.sl_allocated,
      'applied', sl_applied_days,
      'taken', sl_taken_days,
      'remaining', greatest(cycle_row.sl_allocated - sl_taken_days, 0)
    ),
    'archive', archive_json
  );
end;
$$;

create or replace function app.get_my_leave_cycle_summary(
  p_as_of_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = app, public
as $$
declare
  requester_employee_id uuid;
begin
  requester_employee_id := app.current_employee_id();
  if requester_employee_id is null then
    raise exception 'Employee profile not found. Please complete account bootstrap.';
  end if;

  return app.get_leave_cycle_summary_for_employee(requester_employee_id, p_as_of_date);
end;
$$;

create or replace function app.rollover_all_leave_cycles(
  p_as_of_date date default current_date
)
returns int
language plpgsql
security definer
set search_path = app, public
as $$
declare
  employee_row record;
  processed_count int := 0;
begin
  for employee_row in
    select e.id
    from app.employees e
    where e.is_active = true
      and e.leave_tracking_enabled = true
  loop
    perform app.ensure_leave_cycle_record(employee_row.id, p_as_of_date);
    processed_count := processed_count + 1;
  end loop;

  return processed_count;
end;
$$;

create or replace function app.ensure_leave_cycle_before_request()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
begin
  perform app.ensure_leave_cycle_record(new.employee_id, new.start_date);
  return new;
end;
$$;

drop trigger if exists trg_leave_requests_a_cycle on app.leave_requests;
create trigger trg_leave_requests_a_cycle
before insert on app.leave_requests
for each row
execute function app.ensure_leave_cycle_before_request();

alter table app.leave_cycle_policy enable row level security;
alter table app.employee_leave_cycles enable row level security;
alter table app.leave_cycle_archives enable row level security;

drop policy if exists leave_cycle_policy_select_all on app.leave_cycle_policy;
create policy leave_cycle_policy_select_all
on app.leave_cycle_policy
for select
using (true);

drop policy if exists leave_cycle_policy_manage_leadership on app.leave_cycle_policy;
create policy leave_cycle_policy_manage_leadership
on app.leave_cycle_policy
for all
using (app.is_leadership_or_admin())
with check (app.is_leadership_or_admin());

drop policy if exists employee_leave_cycles_select_self_or_leadership on app.employee_leave_cycles;
create policy employee_leave_cycles_select_self_or_leadership
on app.employee_leave_cycles
for select
using (
  employee_id = app.current_employee_id()
  or app.is_leadership_or_admin()
);

drop policy if exists employee_leave_cycles_manage_leadership on app.employee_leave_cycles;
create policy employee_leave_cycles_manage_leadership
on app.employee_leave_cycles
for all
using (app.is_leadership_or_admin())
with check (app.is_leadership_or_admin());

drop policy if exists leave_cycle_archives_select_self_or_leadership on app.leave_cycle_archives;
create policy leave_cycle_archives_select_self_or_leadership
on app.leave_cycle_archives
for select
using (
  employee_id = app.current_employee_id()
  or app.is_leadership_or_admin()
);

drop policy if exists leave_cycle_archives_manage_leadership on app.leave_cycle_archives;
create policy leave_cycle_archives_manage_leadership
on app.leave_cycle_archives
for all
using (app.is_leadership_or_admin())
with check (app.is_leadership_or_admin());

grant execute on function app.get_my_leave_cycle_summary(date) to authenticated;
grant execute on function app.get_leave_cycle_summary_for_employee(uuid, date) to service_role;
grant execute on function app.rollover_all_leave_cycles(date) to service_role;

select app.rollover_all_leave_cycles(current_date);
