-- Add currency column to deals table (default INR)
ALTER TABLE app.deals ADD COLUMN currency TEXT NOT NULL DEFAULT 'INR'
  CHECK (currency IN ('INR','USD'));
