-- Community Pulse: newsletter/forum/survey comms analytics (LeadConnector
-- workbook uploads) get their own report type on client_analytics.
alter table app.client_analytics drop constraint if exists client_analytics_report_type_check;
alter table app.client_analytics add constraint client_analytics_report_type_check
  check (report_type = any (array['content'::text, 'followers'::text, 'visitors'::text, 'instagram'::text, 'instagram_audience'::text, 'community_pulse'::text]));
