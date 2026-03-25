-- Fix allocations created by populateAllocationForClient() that used real client
-- project IDs instead of Internal client project IDs. The save_my_allocations RPC
-- always resolves projects under the Internal client, so these mismatched rows
-- caused delete+re-insert on save, resetting updated_at timestamps.

-- Move mismatched allocations to their Internal-client project equivalents.
-- Only updates rows where no Internal-based allocation already exists (to avoid
-- unique constraint violations).

update app.allocations a
set project_id = ip.id
from app.projects rp
join app.clients rc on rp.client_id = rc.id and rc.name <> 'Internal'
join app.clients ic on ic.name = 'Internal'
join app.projects ip on ip.client_id = ic.id and lower(ip.name) = lower(rp.name)
where a.project_id = rp.id
  and not exists (
    select 1 from app.allocations dup
    where dup.employee_id = a.employee_id
      and dup.project_id = ip.id
      and dup.period_type = a.period_type
      and dup.period_start = a.period_start
  );
