-- ============================================================
-- BD Pipeline: Rename stages and update constraints
-- identified → removed, interest → qualified, closedwon → contracted, add stalled
-- ============================================================

-- 1. Drop the old CHECK constraint on stage
ALTER TABLE app.deals DROP CONSTRAINT IF EXISTS deals_stage_check;

-- 2. Rename existing data
UPDATE app.deals SET stage = 'qualified' WHERE stage IN ('identified', 'interest');
UPDATE app.deals SET stage = 'contracted' WHERE stage = 'closedwon';

-- 3. Update stage history too
UPDATE app.deal_stage_history SET stage = 'qualified' WHERE stage IN ('identified', 'interest');
UPDATE app.deal_stage_history SET stage = 'contracted' WHERE stage = 'closedwon';

-- 4. Add new CHECK constraint with updated stages
ALTER TABLE app.deals ADD CONSTRAINT deals_stage_check
  CHECK (stage IN ('qualified','pitch','proposal','negotiated','contracted','stalled','closedlost'));
