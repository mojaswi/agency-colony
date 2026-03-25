const { getSupabaseAdmin } = require('./lib/supabase-admin');
const { sendEmail } = require('./lib/email');
const { logNotification } = require('./lib/notifications');
const { formatDateInIST, formatDateTimeInIST, getConfig } = require('./lib/config');

// Employees excluded from invoice uploads
const INVOICE_EXCLUDED_EMAILS = ['admin@youragency.com'];

// Email to notify when all invoices are received
const INVOICE_COMPLETION_EMAIL = 'finance@youragency.com';

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

  // Get current day-of-month in IST
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(runAt.getTime() + istOffset);
  const dayOfMonth = istNow.getUTCDate();

  const summary = {
    runAtIst: runLabel,
    dayOfMonth,
    invoiceRemindersSent: 0,
    allInvoicesReceived: false,
    completionEmailSent: false,
    skippedBeforeDeadline: false,
    errors: []
  };

  // Only send reminders from the 25th onwards
  if (dayOfMonth < 25) {
    summary.skippedBeforeDeadline = true;
    return {
      statusCode: 200,
      body: JSON.stringify(summary)
    };
  }

  // Determine invoice month: current month in YYYY-MM format (IST)
  const invoiceMonth = istNow.getUTCFullYear() + '-' + String(istNow.getUTCMonth() + 1).padStart(2, '0');

  // Get active employees who have leave tracking enabled (excludes Finance)
  const employeesResponse = await supabase
    .from('employees')
    .select('id, full_name, email, is_active, leave_tracking_enabled')
    .eq('is_active', true)
    .eq('leave_tracking_enabled', true)
    .order('full_name', { ascending: true });

  if (employeesResponse.error) {
    summary.errors.push(`Employee query failed: ${employeesResponse.error.message}`);
    return { statusCode: 500, body: JSON.stringify(summary) };
  }

  // Filter out excluded employees
  const employees = (employeesResponse.data || []).filter(
    e => !INVOICE_EXCLUDED_EMAILS.includes((e.email || '').toLowerCase().trim())
  );

  // Get all invoice uploads for this month
  const invoicesResponse = await supabase
    .from('invoices')
    .select('employee_id')
    .eq('invoice_month', invoiceMonth);

  if (invoicesResponse.error) {
    summary.errors.push(`Invoice query failed: ${invoicesResponse.error.message}`);
    return { statusCode: 500, body: JSON.stringify(summary) };
  }

  const uploadedEmployeeIds = new Set(
    (invoicesResponse.data || []).map(row => row.employee_id)
  );

  const monthLabel = new Date(invoiceMonth + '-15').toLocaleDateString('en-IN', {
    month: 'long', year: 'numeric'
  });

  // Find employees who still need to upload
  const pendingEmployees = employees.filter(e => !uploadedEmployeeIds.has(e.id));

  // If all invoices received, notify finance admin (only once — check notification log)
  if (pendingEmployees.length === 0) {
    summary.allInvoicesReceived = true;

    // Check if we already sent the completion email for this month
    const alreadySentResponse = await supabase
      .from('notification_log')
      .select('id')
      .eq('kind', 'invoice_all_received')
      .contains('payload', { invoice_month: invoiceMonth })
      .limit(1);

    const alreadySent = (alreadySentResponse.data || []).length > 0;

    if (!alreadySent) {
      const subject = `All invoices received — ${monthLabel}`;
      const html = `
        <div style="font-family:Arial,sans-serif;line-height:1.5">
          <p>Hi Finance Admin,</p>
          <p>All team invoices for <strong>${escapeHtml(monthLabel)}</strong> have been uploaded.</p>
          <p>${employees.length} employee${employees.length !== 1 ? 's' : ''} submitted their invoices.</p>
          <p><a href="${appBaseUrl}#invoice-center">View in Invoice Center</a></p>
        </div>
      `;
      const text = [
        'Hi Finance Admin,',
        `All team invoices for ${monthLabel} have been uploaded.`,
        `${employees.length} employees submitted their invoices.`,
        `View: ${appBaseUrl}#invoice-center`
      ].join('\n');

      try {
        const emailResult = await sendEmail({ to: INVOICE_COMPLETION_EMAIL, subject, html, text });

        await logNotification({
          kind: 'invoice_all_received',
          recipientEmail: INVOICE_COMPLETION_EMAIL,
          subject,
          payload: { invoice_month: invoiceMonth, employee_count: employees.length },
          status: emailResult.skipped ? 'skipped' : 'sent'
        });

        if (!emailResult.skipped) {
          summary.completionEmailSent = true;
        }
      } catch (error) {
        summary.errors.push(`Completion email failed: ${error.message}`);
      }
    }

    return {
      statusCode: summary.errors.length ? 207 : 200,
      body: JSON.stringify(summary)
    };
  }

  // Send reminders to employees who haven't uploaded yet
  for (const employee of pendingEmployees) {
    const subject = `Invoice reminder — ${monthLabel}`;
    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.5">
        <p>Hello ${escapeHtml(employee.full_name || 'there')},</p>
        <p>Your invoice for <strong>${escapeHtml(monthLabel)}</strong> hasn't been uploaded yet.</p>
        <p>Please upload it via your Employee Profile in Agency Colony before the end of this month.</p>
        <p><a href="${appBaseUrl}#employee-profile">Upload Invoice</a></p>
      </div>
    `;
    const text = [
      `Hello ${employee.full_name || 'there'},`,
      `Your invoice for ${monthLabel} hasn't been uploaded yet.`,
      'Please upload it via your Employee Profile in Agency Colony before the end of this month.',
      `Upload: ${appBaseUrl}#employee-profile`
    ].join('\n');

    try {
      const emailResult = await sendEmail({
        to: employee.email,
        subject,
        html,
        text
      });

      await logNotification({
        kind: 'invoice_upload_reminder',
        recipientEmail: employee.email,
        subject,
        payload: {
          employee_id: employee.id,
          invoice_month: invoiceMonth,
          sent_for_date: formatDateInIST(runAt)
        },
        status: emailResult.skipped ? 'skipped' : 'sent'
      });

      if (!emailResult.skipped) {
        summary.invoiceRemindersSent += 1;
      }
    } catch (error) {
      summary.errors.push(`Invoice reminder failed for ${employee.email}: ${error.message}`);
    }
  }

  return {
    statusCode: summary.errors.length ? 207 : 200,
    body: JSON.stringify(summary)
  };
};
