-- Add 'archived' to feature_request_status enum and 'links' JSONB column.
-- Archived requests are hidden from the main view but shown in a collapsed section.
-- Links stores an array of URL strings users attach to their request.

ALTER TYPE app.feature_request_status ADD VALUE IF NOT EXISTS 'archived';

ALTER TABLE app.feature_requests
  ADD COLUMN IF NOT EXISTS links jsonb NOT NULL DEFAULT '[]'::jsonb;
