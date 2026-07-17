-- Drop the dead `section` column (hot/cold/active/completed). It duplicated
-- info derivable from stage + clients.is_active and drove only hidden/dead UI;
-- the live Deal Flow is stage- and clients-driven. App refactor removes all
-- reads in the same deploy.
DROP INDEX IF EXISTS app.idx_deals_section;
ALTER TABLE app.deals DROP CONSTRAINT IF EXISTS deals_section_check;
ALTER TABLE app.deals DROP COLUMN IF EXISTS section;
