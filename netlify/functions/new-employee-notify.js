const { getSupabaseAdmin } = require('./lib/supabase-admin');
const { sendEmail } = require('./lib/email');
const { logNotification } = require('./lib/notifications');

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  };
}

function extractBearerToken(headers) {
  const auth = headers?.authorization || headers?.Authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
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

  const { employeeName, employeeEmail } = payload;
  if (!employeeName) {
    return jsonResponse(400, { error: 'Missing employeeName.' });
  }

  const supabase = getSupabaseAdmin();

  // Verify the caller is authenticated
  const userResponse = await supabase.auth.getUser(token);
  if (userResponse.error || !userResponse.data?.user) {
    return jsonResponse(401, { error: 'Invalid auth token.' });
  }

  // Notify the superadmin
  const recipient = 'admin@youragency.com';
  const subject = `${employeeName} has joined Your Agency`;
  const html = `<p><strong>${employeeName}</strong>${employeeEmail ? ` (${employeeEmail})` : ''} has joined Your Agency.</p><p>Add them to the Thursday All Hands recurring invite.</p><p><a href="https://colony.youragency.com">Open Colony</a></p>`;
  const text = `${employeeName} has joined Your Agency. Add them to Thursday All Hands. https://colony.youragency.com`;

  try {
    const emailResult = await sendEmail({ to: [recipient], subject, html, text });

    await logNotification({
      kind: 'new_employee_joined',
      recipientEmail: recipient,
      subject,
      payload: { employeeName, employeeEmail },
      status: emailResult.skipped ? 'skipped' : 'sent'
    });

    return jsonResponse(200, { ok: true });
  } catch (err) {
    console.error('new-employee-notify error:', err);
    return jsonResponse(500, { error: err.message });
  }
};
