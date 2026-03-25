const { getSupabaseAdmin } = require('./lib/supabase-admin');
const { sendEmail } = require('./lib/email');
const { logNotification } = require('./lib/notifications');
const { getConfig } = require('./lib/config');

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  };
}

function extractBearerToken(headers = {}) {
  const raw = headers.authorization || headers.Authorization;
  if (!raw) return null;
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' });
  }

  const token = extractBearerToken(event.headers);
  if (!token) {
    return jsonResponse(401, { error: 'Missing bearer token.' });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON payload.' });
  }

  const { type, featureRequestId, actorName } = payload;
  if (!type || !featureRequestId) {
    return jsonResponse(400, { error: 'type and featureRequestId are required.' });
  }

  if (actorName !== undefined && (typeof actorName !== 'string' || actorName.length > 255)) {
    return jsonResponse(400, { error: 'actorName must be a string (max 255 chars).' });
  }

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (typeof featureRequestId !== 'string' || !UUID_RE.test(featureRequestId)) {
    return jsonResponse(400, { error: 'featureRequestId must be a valid UUID.' });
  }

  const validTypes = ['reply', 'upvote', 'status_change', 'new_bug'];
  if (!validTypes.includes(type)) {
    return jsonResponse(400, { error: `Invalid type. Must be one of: ${validTypes.join(', ')}` });
  }

  const { appBaseUrl } = getConfig();
  const supabase = getSupabaseAdmin();

  // Verify the caller is authenticated
  const userResponse = await supabase.auth.getUser(token);
  if (userResponse.error || !userResponse.data?.user) {
    return jsonResponse(401, { error: 'Invalid auth token.' });
  }

  // Look up the feature request and its owner
  const frResponse = await supabase
    .from('feature_requests')
    .select(`
      id,
      employee_id,
      request_text,
      request_type,
      status,
      employee:employees!feature_requests_employee_id_fkey (
        id,
        full_name,
        email
      )
    `)
    .eq('id', featureRequestId)
    .single();

  if (frResponse.error || !frResponse.data) {
    return jsonResponse(404, { error: 'Feature request not found.' });
  }

  const fr = frResponse.data;
  const ownerEmail = fr.employee?.email;
  const ownerName = fr.employee?.full_name || 'there';

  if (!ownerEmail) {
    return jsonResponse(422, { error: 'Feature request owner has no email.' });
  }

  const callerEmail = String(userResponse.data.user.email || '').toLowerCase();
  const actor = actorName || 'Someone';
  const snippet = fr.request_text.length > 80
    ? fr.request_text.slice(0, 80) + '...'
    : fr.request_text;
  const typeLabel = fr.request_type === 'bug' ? 'bug report' : 'feature request';

  // --- New bug → notify admin@youragency.com ---
  if (type === 'new_bug') {
    const adminEmail = 'admin@youragency.com';
    const subject = `🐛 New bug reported by ${actor}`;
    const bodyLine = `<p>${escapeHtml(actor)} reported a new bug on Colony:</p>`;

    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.5">
        <p>Hey Admin,</p>
        ${bodyLine}
        <blockquote style="border-left:3px solid #e74c3c;margin:8px 0;padding:4px 12px;color:#555">${escapeHtml(snippet)}</blockquote>
        <p>View it on Colony: <a href="${appBaseUrl}#feature-requests">${appBaseUrl}#feature-requests</a></p>
      </div>
    `;
    const text = `New bug reported by ${actor}:\n"${snippet}"\nView: ${appBaseUrl}#feature-requests`;

    try {
      const emailResult = await sendEmail({ to: adminEmail, subject, html, text });
      await logNotification({
        kind: 'new_bug_report',
        recipientEmail: adminEmail,
        subject,
        payload: { feature_request_id: featureRequestId, reporter_email: callerEmail },
        status: emailResult.skipped ? 'skipped' : 'sent'
      });
      return jsonResponse(200, { ok: true, emailResult });
    } catch (error) {
      return jsonResponse(500, { error: `Email send failed: ${error.message}` });
    }
  }

  // --- Owner notifications (reply, upvote, status_change) ---
  // Don't notify yourself
  if (callerEmail === ownerEmail.toLowerCase()) {
    return jsonResponse(200, { ok: true, skipped: true, reason: 'Actor is the owner.' });
  }

  let subject;
  let bodyLine;
  let notifKind;

  if (type === 'reply') {
    subject = `${actor} commented on your ${typeLabel}`;
    bodyLine = `<p>${escapeHtml(actor)} left a comment on your ${typeLabel}:</p>`;
    notifKind = 'feature_request_reply';
  } else if (type === 'upvote') {
    subject = `${actor} upvoted your ${typeLabel}`;
    bodyLine = `<p>${escapeHtml(actor)} upvoted your ${typeLabel}:</p>`;
    notifKind = 'feature_request_upvote';
  } else {
    const statusLabel = payload.newStatus === 'done' ? 'Completed'
      : payload.newStatus === 'in_progress' ? 'In Progress' : payload.newStatus;
    subject = `Your ${typeLabel} was marked as ${statusLabel}`;
    bodyLine = `<p>Your ${typeLabel} status was changed to <strong>${escapeHtml(statusLabel)}</strong>:</p>`;
    notifKind = 'feature_request_status';
  }

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5">
      <p>Hello ${escapeHtml(ownerName)},</p>
      ${bodyLine}
      <blockquote style="border-left:3px solid #ccc;margin:8px 0;padding:4px 12px;color:#555">${escapeHtml(snippet)}</blockquote>
      <p>View it on Colony: <a href="${appBaseUrl}#feature-requests">${appBaseUrl}#feature-requests</a></p>
    </div>
  `;

  const text = [
    `Hello ${ownerName},`,
    type === 'reply' ? `${actor} commented on your ${typeLabel}:` :
    type === 'upvote' ? `${actor} upvoted your ${typeLabel}:` :
    `Your ${typeLabel} status was changed:`,
    `"${snippet}"`,
    `View it on Colony: ${appBaseUrl}#feature-requests`
  ].join('\n');

  try {
    const emailResult = await sendEmail({ to: ownerEmail, subject, html, text });

    await logNotification({
      kind: notifKind,
      recipientEmail: ownerEmail,
      subject,
      payload: {
        feature_request_id: featureRequestId,
        type,
        actor_email: callerEmail
      },
      status: emailResult.skipped ? 'skipped' : 'sent'
    });

    return jsonResponse(200, { ok: true, emailResult });
  } catch (error) {
    return jsonResponse(500, { error: `Email send failed: ${error.message}` });
  }
};
