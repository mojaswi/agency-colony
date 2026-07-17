-- The analytics-upload-reminder cron logs each send with
-- kind = 'analytics_upload_reminder', but that value was never added to the
-- notification_kind enum. logNotification swallows the resulting insert error
-- (console.error, no throw), so the email still sends but the send is never
-- recorded — zero audit trail, and invisible in Admin → Scheduled Jobs Health.
-- Add the missing enum value so these reminders log like every other cron.
alter type app.notification_kind add value if not exists 'analytics_upload_reminder';
