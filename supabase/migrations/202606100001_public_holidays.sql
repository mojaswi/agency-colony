-- Move the hardcoded public-holiday list into the DB so leadership can edit it
-- in Admin Settings (after the team's yearly exercise) without a code deploy.
-- The client keeps the in-code PUBLIC_HOLIDAYS array as a fallback if this
-- table is empty or unreachable.

CREATE TABLE IF NOT EXISTS app.public_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date date NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE app.public_holidays ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read; only leadership/admin can change the list.
CREATE POLICY public_holidays_select_all ON app.public_holidays
  FOR SELECT USING (true);

CREATE POLICY public_holidays_write_leadership ON app.public_holidays
  FOR ALL USING (app.is_leadership_or_admin())
  WITH CHECK (app.is_leadership_or_admin());

-- Seed with the existing 2026 list (idempotent: skip dates already present).
INSERT INTO app.public_holidays (holiday_date, name) VALUES
  ('2026-01-26', 'Republic Day'),
  ('2026-02-15', 'Maha Shivratri'),
  ('2026-03-04', 'Holi'),
  ('2026-04-03', 'Good Friday'),
  ('2026-05-01', 'Labor Day'),
  ('2026-08-15', 'Independence Day'),
  ('2026-09-14', 'Ganesh Chaturthi'),
  ('2026-10-02', 'Gandhi Jayanti'),
  ('2026-10-19', 'Durga Ashtami'),
  ('2026-11-09', 'Diwali'),
  ('2026-11-24', 'Guru Nanak Jayanti'),
  ('2026-12-25', 'Christmas Break')
ON CONFLICT (holiday_date) DO NOTHING;
