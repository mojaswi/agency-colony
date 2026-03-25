-- Add persistent insights cache to analytics reports
-- Stores AI-generated insights keyed by analysis type + view mode
-- e.g. {"weekly-organic": "...", "monthly-sponsored": "...", "post-3-organic": "..."}
-- Cache is per-report row — new upload = new row = fresh cache
ALTER TABLE app.client_analytics
  ADD COLUMN IF NOT EXISTS insights_cache jsonb DEFAULT '{}'::jsonb;
