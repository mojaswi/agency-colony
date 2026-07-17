-- Batch 4: prevent duplicate active scope items per client
-- Archived/inactive rows can repeat (they're history). Only enforce on live items.

create unique index if not exists uniq_client_scope_items_active
  on app.client_scope_items (client_id, lower(title))
  where is_active = true;
