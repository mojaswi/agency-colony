-- Feature Request Replies: threaded comments on feature requests

create table if not exists app.feature_request_replies (
  id uuid primary key default gen_random_uuid(),
  feature_request_id uuid not null references app.feature_requests(id) on delete cascade,
  employee_id uuid not null references app.employees(id) on delete cascade,
  reply_text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists feature_request_replies_fr_idx
  on app.feature_request_replies (feature_request_id, created_at);

create trigger set_feature_request_replies_updated_at
  before update on app.feature_request_replies
  for each row
  execute function app.set_updated_at();

-- RLS
alter table app.feature_request_replies enable row level security;

-- Everyone can read all replies
create policy feature_request_replies_select_all
  on app.feature_request_replies for select to authenticated
  using (true);

-- Users can insert their own replies
create policy feature_request_replies_insert_own
  on app.feature_request_replies for insert to authenticated
  with check (employee_id = app.current_employee_id());

-- Owner can update their own replies
create policy feature_request_replies_update_own
  on app.feature_request_replies for update to authenticated
  using (employee_id = app.current_employee_id());

-- Owner or leadership/admin can delete
create policy feature_request_replies_delete_own_or_leadership
  on app.feature_request_replies for delete to authenticated
  using (employee_id = app.current_employee_id() or app.is_leadership_or_admin());

-- Grant access
grant select, insert, update, delete on app.feature_request_replies to authenticated;
grant all privileges on app.feature_request_replies to service_role;

-- ─── Feature Request Upvotes (one per user per request) ───

create table if not exists app.feature_request_upvotes (
  feature_request_id uuid not null references app.feature_requests(id) on delete cascade,
  employee_id uuid not null references app.employees(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (feature_request_id, employee_id)
);

-- RLS
alter table app.feature_request_upvotes enable row level security;

create policy feature_request_upvotes_select_all
  on app.feature_request_upvotes for select to authenticated
  using (true);

create policy feature_request_upvotes_insert_own
  on app.feature_request_upvotes for insert to authenticated
  with check (employee_id = app.current_employee_id());

create policy feature_request_upvotes_delete_own
  on app.feature_request_upvotes for delete to authenticated
  using (employee_id = app.current_employee_id());

grant select, insert, delete on app.feature_request_upvotes to authenticated;
grant all privileges on app.feature_request_upvotes to service_role;
