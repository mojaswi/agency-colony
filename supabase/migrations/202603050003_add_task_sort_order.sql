-- Add sort_order column for user-controlled priority ordering
ALTER TABLE app.daily_tasks ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
