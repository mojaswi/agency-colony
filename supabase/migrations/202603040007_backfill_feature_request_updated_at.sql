-- Backfill updated_at for feature requests that have never had it set.
-- Done items get NOW() so they appear in the Home timeline as recent completions.
-- Non-done items get their created_at as a sensible default.
UPDATE app.feature_requests
SET updated_at = NOW()
WHERE status = 'done' AND updated_at IS NULL;

UPDATE app.feature_requests
SET updated_at = created_at
WHERE status != 'done' AND updated_at IS NULL;
