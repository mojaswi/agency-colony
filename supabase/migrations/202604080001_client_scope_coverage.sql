-- Colony Client View v1 — Scope & Coverage
-- Leadership-only screen for "does the team cover the scope we sold?"
-- Three tables, all FK to existing app.clients / app.employees / app.departments.
-- RLS: leadership/admin only. No employee-facing exposure in v1.

-- ---------- 1. Scope items ----------
create table if not exists app.client_scope_items (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references app.clients(id) on delete cascade,
  title         text not null,
  scope_type    text not null check (scope_type in ('recurring', 'project')),
  description   text,
  owner_employee_id uuid references app.employees(id) on delete set null,
  sort_order    integer not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_client_scope_items_client on app.client_scope_items(client_id);

-- ---------- 2. Discipline needs per scope item ----------
-- Each scope item declares which disciplines it needs and at what % of an FTE.
-- specialty_note is the free-text "packaging skill" / "long-form" / etc.
create table if not exists app.client_scope_discipline_needs (
  id              uuid primary key default gen_random_uuid(),
  scope_item_id   uuid not null references app.client_scope_items(id) on delete cascade,
  department_id   uuid not null references app.departments(id) on delete restrict,
  percent_need    numeric(5,2) not null default 0 check (percent_need >= 0 and percent_need <= 200),
  specialty_note  text,
  created_at      timestamptz not null default now(),
  unique (scope_item_id, department_id)
);

create index if not exists idx_scope_disc_needs_scope on app.client_scope_discipline_needs(scope_item_id);
create index if not exists idx_scope_disc_needs_dept on app.client_scope_discipline_needs(department_id);

-- ---------- 3. Standing allocations ----------
-- Leadership's commitment of person × discipline × % to a client.
-- Distinct from weekly self-reported allocations. No history in v1 — UPDATE in place.
-- (client, employee, department) is unique so the same person can wear two hats
-- on the same client (e.g. the creative lead as Strategy AND Supervision) via separate rows
-- with different department_ids.
create table if not exists app.client_standing_allocations (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references app.clients(id) on delete cascade,
  employee_id   uuid not null references app.employees(id) on delete cascade,
  department_id uuid not null references app.departments(id) on delete restrict,
  percent       numeric(5,2) not null default 0 check (percent >= 0 and percent <= 200),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (client_id, employee_id, department_id)
);

create index if not exists idx_standing_alloc_client on app.client_standing_allocations(client_id);
create index if not exists idx_standing_alloc_employee on app.client_standing_allocations(employee_id);

-- ---------- updated_at triggers ----------
create or replace function app.touch_client_scope_items_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_client_scope_items_updated_at on app.client_scope_items;
create trigger trg_client_scope_items_updated_at
before update on app.client_scope_items
for each row execute function app.touch_client_scope_items_updated_at();

create or replace function app.touch_client_standing_allocations_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_standing_alloc_updated_at on app.client_standing_allocations;
create trigger trg_standing_alloc_updated_at
before update on app.client_standing_allocations
for each row execute function app.touch_client_standing_allocations_updated_at();

-- ---------- RLS: leadership / admin only ----------
alter table app.client_scope_items enable row level security;
alter table app.client_scope_discipline_needs enable row level security;
alter table app.client_standing_allocations enable row level security;

drop policy if exists scope_items_leadership_all on app.client_scope_items;
create policy scope_items_leadership_all
on app.client_scope_items
for all
to authenticated
using (app.is_leadership_or_admin())
with check (app.is_leadership_or_admin());

drop policy if exists scope_disc_needs_leadership_all on app.client_scope_discipline_needs;
create policy scope_disc_needs_leadership_all
on app.client_scope_discipline_needs
for all
to authenticated
using (app.is_leadership_or_admin())
with check (app.is_leadership_or_admin());

drop policy if exists standing_alloc_leadership_all on app.client_standing_allocations;
create policy standing_alloc_leadership_all
on app.client_standing_allocations
for all
to authenticated
using (app.is_leadership_or_admin())
with check (app.is_leadership_or_admin());

-- ---------- Grants ----------
grant select, insert, update, delete on app.client_scope_items to authenticated;
grant select, insert, update, delete on app.client_scope_discipline_needs to authenticated;
grant select, insert, update, delete on app.client_standing_allocations to authenticated;

-- ---------- PostgREST exposure (mirror existing pattern) ----------
-- The app schema is exposed via api views; create thin views if that pattern is in use.
-- Skipping for now — existing tables (clients, deals) appear to be queried directly
-- via the supabase client with schema('app'), so no view needed.
