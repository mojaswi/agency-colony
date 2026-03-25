const { getConfig } = require('./config');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FETCH_TIMEOUT_MS = 15000;

async function sendEmail({ to, subject, html, text }) {
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);

  if (!recipients.length) {
    throw new Error('At least one recipient email is required.');
  }

  const invalidEmails = recipients.filter((e) => !EMAIL_RE.test(e));
  if (invalidEmails.length) {
    throw new Error(`Invalid recipient email format: ${invalidEmails.join(', ')}`);
  }

  if (!subject) {
    throw new Error('Email subject is required.');
  }

  const { resendApiKey, emailSender } = getConfig();

  if (!resendApiKey) {
    return {
      skipped: true,
      reason: 'RESEND_API_KEY is not configured.',
      recipients
    };
  }

  if (!emailSender || !EMAIL_RE.test(emailSender)) {
    throw new Error('EMAIL_SENDER is missing or invalid.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: emailSender,
        to: recipients,
        subject,
        html,
        text
      }),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Resend API returned non-JSON response (${response.status})`);
  }

  if (!response.ok) {
    throw new Error(`Resend API error (${response.status}): ${JSON.stringify(data)}`);
  }

  return {
    skipped: false,
    recipients,
    data
  };
}

module.exports = {
  sendEmail
};
