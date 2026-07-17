-- Add month-range to scope items so projects can be tagged to a specific month/window.
-- Retainers leave both columns null and are always considered active.

alter table app.client_scope_items
  add column if not exists start_month date,
  add column if not exists end_month date;

comment on column app.client_scope_items.start_month is 'First day of first active month for project-type scope items. Null = no start bound (or retainer).';
comment on column app.client_scope_items.end_month is 'First day of last active month for project-type scope items. Null = no end bound (or retainer).';
