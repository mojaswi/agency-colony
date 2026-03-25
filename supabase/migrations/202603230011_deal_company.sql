-- Add company column to deals for multi-brand BD pipeline
ALTER TABLE app.deals ADD COLUMN IF NOT EXISTS company text NOT NULL DEFAULT 'Your Agency';

-- All existing deals belong to Your Agency
UPDATE app.deals SET company = 'Your Agency' WHERE company IS NULL;
