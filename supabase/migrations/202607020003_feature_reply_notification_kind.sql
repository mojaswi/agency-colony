-- feature-request-notify.js has been logging with kinds that were never added
-- to the enum, so every board-notification log insert failed silently (emails
-- still sent) — the same failure class as the analytics reminder enum bug.
-- 'feature_reply' reserved for the bell/manual-fire path.
alter type app.notification_kind add value if not exists 'feature_reply';
alter type app.notification_kind add value if not exists 'feature_request_reply';
alter type app.notification_kind add value if not exists 'feature_request_upvote';
alter type app.notification_kind add value if not exists 'feature_request_status';
alter type app.notification_kind add value if not exists 'new_bug_report';
