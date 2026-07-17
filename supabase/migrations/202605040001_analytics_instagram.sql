-- Extend client_analytics.report_type CHECK to allow Instagram (Meta) exports.
-- v1 ships the 'instagram' posts report; 'instagram_audience' is reserved
-- for the audience/demographics export so we don't need a second migration
-- when that lands.

ALTER TABLE app.client_analytics
  DROP CONSTRAINT IF EXISTS client_analytics_report_type_check;

ALTER TABLE app.client_analytics
  ADD CONSTRAINT client_analytics_report_type_check
  CHECK (report_type IN ('content','followers','visitors','instagram','instagram_audience'));

COMMENT ON COLUMN app.client_analytics.report_type IS
  'Source export type: content/followers/visitors (LinkedIn), instagram/instagram_audience (Meta Insights)';
