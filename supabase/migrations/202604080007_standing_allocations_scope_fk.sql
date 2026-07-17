-- Tie each standing allocation to a specific scope item so month-scoped
-- project work only counts toward utilization during that scope's months.
-- NULL scope_item_id = client-wide (retainer) allocation.

alter table app.client_standing_allocations
  add column if not exists scope_item_id uuid
  references app.client_scope_items(id) on delete set null;

-- Backfill: where notes text matches an active scope item title on the same
-- client (case-insensitive), link them.
update app.client_standing_allocations a
   set scope_item_id = s.id
  from app.client_scope_items s
 where a.scope_item_id is null
   and a.client_id = s.client_id
   and s.is_active = true
   and a.notes is not null
   and lower(trim(a.notes)) = lower(trim(s.title));

create index if not exists idx_client_standing_allocations_scope_item
  on app.client_standing_allocations(scope_item_id);

comment on column app.client_standing_allocations.scope_item_id is
  'Optional link to the scope item this allocation covers. NULL = client-wide/retainer bucket.';
