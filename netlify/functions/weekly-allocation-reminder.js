const { getSupabaseAdmin } = require('./lib/supabase-admin');
const { sendEmail } = require('./lib/email');
const { logNotification } = require('./lib/notifications');
const { formatDateInIST, formatDateTimeInIST, getConfig } = require('./lib/config');

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

exports.handler = async () => {
  const runAt = new Date();
  const runLabel = formatDateTimeInIST(runAt);
  const { appBaseUrl } = getConfig();
  const supabase = getSupabaseAdmin();

  const summary = {
    runAtIst: runLabel,
    weeklyAllocationRemindersSent: 0,
    errors: []
  };

  const employeesResponse = await supabase
    .from('employees')
    .select('id, full_name, email, is_active')
    .eq('is_active', true)
    .order('full_name', { ascending: true });

  if (employeesResponse.error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        ...summary,
        errors: [employeesResponse.error.message]
      })
    };
  }

  for (const employee of employeesResponse.data || []) {
    const subject = 'Weekly allocation reminder (Monday 10:00 AM IST)';
    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.5">
        <p>Hello ${escapeHtml(employee.full_name || 'there')},</p>
        <p>This is your Monday weekly allocation reminder for ${formatDateInIST(runAt)}.</p>
        <p>Please review and update your week/month allocation lines in Agency Colony.</p>
        <p>Open app: <a href="${appBaseUrl}">${appBaseUrl}</a></p>
      </div>
    `;
    const text = [
      `Hello ${employee.full_name || 'there'},`,
      `This is your Monday weekly allocation reminder for ${formatDateInIST(runAt)}.`,
      'Please review and update your week/month allocation lines in Agency Colony.',
      `Open app: ${appBaseUrl}`
    ].join('\n');

    try {
      const emailResult = await sendEmail({
        to: employee.email,
        subject,
        html,
        text
      });

      await logNotification({
        kind: 'weekly_allocation_reminder',
        recipientEmail: employee.email,
        subject,
        payload: {
          employee_id: employee.id,
          sent_for_date: formatDateInIST(runAt)
        },
        status: emailResult.skipped ? 'skipped' : 'sent'
      });

      if (!emailResult.skipped) {
        summary.weeklyAllocationRemindersSent += 1;
      }
    } catch (error) {
      summary.errors.push(`Weekly reminder failed for ${employee.email}: ${error.message}`);
    }
  }

  return {
    statusCode: summary.errors.length ? 207 : 200,
    body: JSON.stringify(summary)
  };
};
