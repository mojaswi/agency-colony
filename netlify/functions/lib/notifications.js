const { getSupabaseAdmin } = require('./supabase-admin');

async function logNotification({ kind, recipientEmail, subject, payload = {}, status = 'sent' }) {
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.from('notification_log').insert({
    kind,
    recipient_email: recipientEmail,
    subject,
    payload,
    status,
    sent_at: status === 'sent' ? new Date().toISOString() : null
  });

  if (error) {
    console.error('Failed to write notification log:', error.message);
  }
}

// Wrap a scheduled function so every run (success, partial, or crash) writes a
// heartbeat row to notification_log — a dead scheduler must be visible in
// Admin Settings within a day, not discovered months later by accident.
// 403s (direct URL hits rejected by the scheduler guard) are not logged.
function withCronHeartbeat(functionName, run) {
  return async (event) => {
    const startedAt = new Date().toISOString();
    try {
      const result = await run(event);
      if (result && result.statusCode === 403) return result;
      let body = {};
      try { body = JSON.parse(result.body || '{}'); } catch (parseError) { body = {}; }
      const errors = Array.isArray(body.errors) ? body.errors : [];
      const failed = errors.length > 0 || (result.statusCode >= 500);
      await logNotification({
        kind: 'cron_heartbeat',
        recipientEmail: 'system',
        subject: `${functionName}: ${failed ? `${errors.length || 1} error(s)` : 'ok'}`,
        payload: { function: functionName, started_at: startedAt, status_code: result.statusCode, summary: body },
        status: failed ? 'error' : 'sent'
      });
      return result;
    } catch (error) {
      await logNotification({
        kind: 'cron_heartbeat',
        recipientEmail: 'system',
        subject: `${functionName}: crashed`,
        payload: { function: functionName, started_at: startedAt, fatal: error.message },
        status: 'error'
      });
      throw error;
    }
  };
}

module.exports = {
  logNotification,
  withCronHeartbeat
};
