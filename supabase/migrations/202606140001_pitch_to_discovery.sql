-- Rename deal STAGE 'pitch' → 'discovery' (Your Agency rarely cold-pitches; the
-- real flow is qualified → discovery → proposal → negotiated → contracted).
-- NOTE: this is the deal STAGE only — the separate client/project TYPE 'pitch'
-- (getClientType) is untouched.
ALTER TABLE app.deals DROP CONSTRAINT IF EXISTS deals_stage_check;
UPDATE app.deals SET stage = 'discovery' WHERE stage = 'pitch';
UPDATE app.deal_stage_history SET stage = 'discovery' WHERE stage = 'pitch';
ALTER TABLE app.deals ADD CONSTRAINT deals_stage_check
  CHECK (stage = ANY (ARRAY['qualified','discovery','proposal','negotiated','contracted','stalled','closedlost']));
