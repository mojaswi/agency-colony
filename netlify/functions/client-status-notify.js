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

const RECIPIENTS = {
  deal_contracted: ['admin@youragency.com'],
  client_archived: ['am2@youragency.com', 'admin@youragency.com']
};

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

  const { type, dealId, clientId, actorName } = payload;
  if (!type || !RECIPIENTS[type]) {
    return jsonResponse(400, { error: 'Invalid or missing type.' });
  }

  const { appBaseUrl } = getConfig();
  const supabase = getSupabaseAdmin();

  const userResponse = await supabase.auth.getUser(token);
  if (userResponse.error || !userResponse.data?.user) {
    return jsonResponse(401, { error: 'Invalid auth token.' });
  }

  const recipients = RECIPIENTS[type];
  const safeActor = escapeHtml(actorName || 'Someone');
  let subject;
  let html;
  let text;
  let logPayload = { actor: actorName || null };

  if (type === 'deal_contracted') {
    if (!dealId) return jsonResponse(400, { error: 'dealId required.' });
    const { data: deal, error } = await supabase
      .from('deals')
      .select('id, deal_name, amount, currency, engagement_type, client_id')
      .eq('id', dealId)
      .single();
    if (error || !deal) return jsonResponse(404, { error: 'Deal not found.' });

    const dealName = deal.deal_name || 'Unnamed deal';
    const amount = deal.amount != null ? `${deal.currency || ''} ${deal.amount}`.trim() : '—';
    subject = `Deal moved to Contract: ${dealName} — add to Revenue Pipeline`;
    html = `
      <div style="font-family:Arial,sans-serif;line-height:1.5">
        <p>${safeActor} just moved a deal to the <strong>Contract</strong> stage in Colony.</p>
        <ul>
          <li><strong>Deal:</strong> ${escapeHtml(dealName)}</li>
          <li><strong>Amount:</strong> ${escapeHtml(amount)}</li>
          <li><strong>Engagement:</strong> ${escapeHtml(deal.engagement_type || '—')}</li>
        </ul>
        <p><strong>Action:</strong> Please add the financials to the Revenue Pipeline.</p>
        <p>Open Colony: <a href="${appBaseUrl}">${appBaseUrl}</a></p>
      </div>
    `;
    text = `${actorName || 'Someone'} moved deal "${dealName}" to Contract. Amount: ${amount}. Please add the financials to the Revenue Pipeline. ${appBaseUrl}`;
    logPayload = { ...logPayload, deal_id: deal.id, deal_name: dealName, amount: deal.amount };
  } else if (type === 'client_archived') {
    if (!clientId) return jsonResponse(400, { error: 'clientId required.' });
    const { data: client, error } = await supabase
      .from('clients')
      .select('id, name')
      .eq('id', clientId)
      .single();
    if (error || !client) return jsonResponse(404, { error: 'Client not found.' });

    const clientName = client.name || 'Unnamed client';
    subject = `Client archived: ${clientName} — anything for press?`;
    html = `
      <div style="font-family:Arial,sans-serif;line-height:1.5">
        <p>${safeActor} just archived the client <strong>${escapeHtml(clientName)}</strong> in Colony.</p>
        <p><strong>Question:</strong> Was any work done for this client that we can push to press / portfolio / case studies?</p>
        <p>If yes, please flag it before the project gets buried.</p>
        <p>Open Colony: <a href="${appBaseUrl}">${appBaseUrl}</a></p>
      </div>
    `;
    text = `${actorName || 'Someone'} archived client "${clientName}". Was any work done that we can push to press? ${appBaseUrl}`;
    logPayload = { ...logPayload, client_id: client.id, client_name: clientName };
  }

  let emailResult;
  try {
    emailResult = await sendEmail({ to: recipients, subject, html, text });
  } catch (error) {
    return jsonResponse(500, { error: `Email send failed: ${error.message}` });
  }

  try {
    await Promise.all(
      recipients.map((recipientEmail) =>
        logNotification({
          kind: type,
          recipientEmail,
          subject,
          payload: logPayload,
          status: emailResult.skipped ? 'skipped' : 'sent'
        })
      )
    );
  } catch (error) {
    console.error('Notification logging failed:', error.message);
  }

  return jsonResponse(200, { ok: true, recipients, emailResult });
};
