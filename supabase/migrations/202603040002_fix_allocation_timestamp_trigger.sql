-- Fix: allocation updated_at should only change when allocation_percent changes.
-- The generic set_updated_at() trigger stomps on the CASE logic in save_my_allocations.
-- Replace with a dedicated trigger that checks for actual changes.

create or replace function app.set_allocation_updated_at()
returns trigger
language plpgsql
as $$
begin
  if new.allocation_percent is distinct from old.allocation_percent then
    new.updated_at = now();
  else
    new.updated_at = old.updated_at;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_allocations_set_updated_at on app.allocations;
create trigger trg_allocations_set_updated_at
before update on app.allocations
for each row execute function app.set_allocation_updated_at();
