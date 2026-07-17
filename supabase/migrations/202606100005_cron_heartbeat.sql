-- Cron observability: every scheduled-function run writes a heartbeat row to
-- notification_log (kind 'cron_heartbeat', payload carries function name +
-- run summary, status 'sent'|'error'). Surfaced in Admin Settings → Scheduled
-- Jobs Health so a dead scheduler is visible within a day, not after two
-- months (see the Apr–Jun 2026 outage fixed in 598c940).
ALTER TYPE app.notification_kind ADD VALUE IF NOT EXISTS 'cron_heartbeat';
