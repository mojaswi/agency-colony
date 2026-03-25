-- ============================================================
-- BD Pipeline: deals + deal_stage_history
-- ============================================================

-- 1. Deals table
CREATE TABLE app.deals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_name TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'identified'
    CHECK (stage IN ('identified','interest','pitch','proposal','negotiated','closedwon','closedlost')),
  poc_employee_id UUID REFERENCES app.employees(id),
  next_steps TEXT,
  deadline DATE,
  notes TEXT,
  engagement_type TEXT CHECK (engagement_type IN ('Retainer','Project')),
  business_model TEXT CHECK (business_model IN ('B2B','B2C')),
  termination_type TEXT CHECK (termination_type IN ('Active','Good Termination','Bad Termination')),
  amount NUMERIC,
  client_id UUID REFERENCES app.clients(id),
  section TEXT NOT NULL DEFAULT 'hot'
    CHECK (section IN ('hot','cold','active','completed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE app.deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY deals_select ON app.deals FOR SELECT USING (true);

CREATE POLICY deals_insert_leadership ON app.deals FOR INSERT
  WITH CHECK (app.is_leadership_or_admin());

CREATE POLICY deals_update_leadership ON app.deals FOR UPDATE
  USING (app.is_leadership_or_admin());

CREATE POLICY deals_delete_leadership ON app.deals FOR DELETE
  USING (app.is_leadership_or_admin());

-- POC can update their own deals
CREATE POLICY deals_update_poc ON app.deals FOR UPDATE
  USING (poc_employee_id = app.current_employee_id());

-- updated_at trigger (reuse Colony pattern)
CREATE OR REPLACE FUNCTION app.set_deals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_deals_updated_at
  BEFORE UPDATE ON app.deals
  FOR EACH ROW EXECUTE FUNCTION app.set_deals_updated_at();

-- Indexes
CREATE INDEX idx_deals_stage ON app.deals(stage);
CREATE INDEX idx_deals_section ON app.deals(section);
CREATE INDEX idx_deals_poc ON app.deals(poc_employee_id);

-- 2. Deal stage history
CREATE TABLE app.deal_stage_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES app.deals(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  entered_at TIMESTAMPTZ DEFAULT now(),
  exited_at TIMESTAMPTZ,
  changed_by UUID REFERENCES app.employees(id)
);

ALTER TABLE app.deal_stage_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY stage_history_select ON app.deal_stage_history FOR SELECT USING (true);
CREATE POLICY stage_history_insert ON app.deal_stage_history FOR INSERT WITH CHECK (true);
