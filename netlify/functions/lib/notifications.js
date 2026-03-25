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

module.exports = {
  logNotification
};
