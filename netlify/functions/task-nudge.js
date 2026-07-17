// 11:00 AM IST weekday nudge — ONLY for active employees who haven't touched
// their tasks yet today (no daily_tasks row created/updated since IST
// midnight). Visiting Colony triggers carry-forward writes, and adding or
// updating any task counts — so engaged people never see this. People on
// leave today (approved, or started pending SL) are skipped. Replaces the old
// blanket 10:00 reminder that emailed everyone unconditionally.
const { getSupabaseAdmin } = require('./lib/supabase-admin');
const { sendEmail } = require('./lib/email');
const { logNotification, withCronHeartbeat } = require('./lib/notifications');
const { getConfig } = require('./lib/config');

function escapeHtml(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function istTodayParts(runAt) {
  const ist = new Date(runAt.getTime() + 5.5 * 60 * 60 * 1000);
  const iso = ist.toISOString().slice(0, 10);
  // IST midnight expressed in UTC
  const midnightUtc = new Date(`${iso}T00:00:00+05:30`).toISOString();
  return { iso, midnightUtc, day: ist.getUTCDay() };
}

const run = async (event) => {
  // Allow only Netlify-scheduler invocations (next_run guard — see the project docs)
  let isScheduled = false;
  try { isScheduled = Boolean(JSON.parse(event.body || '{}').next_run); } catch (e) { isScheduled = false; }
  if (!isScheduled) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Scheduled function only' }) };
  }

  const runAt = new Date();
  const { iso: todayIso, midnightUtc, day } = istTodayParts(runAt);
  const summary = { nudgesSent: 0, skippedTouched: 0, skippedOnLeave: 0, errors: [] };
  if (day === 0 || day === 6) {
    return { statusCode: 200, body: JSON.stringify({ ...summary, skippedWeekend: true }) };
  }

  const supabase = getSupabaseAdmin();
  const { appBaseUrl } = getConfig();

  const [empRes, touchedRes, leaveRes, hiddenRes] = await Promise.all([
    supabase.from('employees').select('id, full_name, email').eq('is_active', true).eq('leave_tracking_enabled', true),
    supabase.from('daily_tasks').select('employee_id').gte('updated_at', midnightUtc).limit(3000),
    supabase.from('leave_requests').select('employee_id, leave_type, status')
      .in('status', ['approved', 'pending']).lte('start_date', todayIso).gte('end_date', todayIso),
    supabase.from('app_config').select('value').eq('key', 'hidden_employee_emails').maybeSingle()
  ]);
  for (const r of [empRes, touchedRes, leaveRes]) {
    if (r.error) { summary.errors.push(r.error.message); return { statusCode: 500, body: JSON.stringify(summary) }; }
  }

  const touched = new Set((touchedRes.data || []).map((t) => t.employee_id));
  const onLeave = new Set((leaveRes.data || [])
    .filter((l) => l.status === 'approved' || l.leave_type === 'SL')
    .map((l) => l.employee_id));
  const hidden = new Set(((hiddenRes.data && hiddenRes.data.value) || []).map((e) => String(e).toLowerCase()));

  for (const employee of (empRes.data || [])) {
    if (hidden.has(String(employee.email).toLowerCase())) continue;
    if (touched.has(employee.id)) { summary.skippedTouched += 1; continue; }
    if (onLeave.has(employee.id)) { summary.skippedOnLeave += 1; continue; }

    // Nudge emails work best with a bit of personality — swap this copy (and
    // the image) for whatever your team finds funny. It only goes to people
    // who haven't touched their tasklist by 11 AM.
    const firstName = (employee.full_name || 'there').split(' ')[0];
    const subject = `${firstName}, your tasklist is looking a bit empty 🐜`;
    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.6;max-width:480px">
        <p>Good morning ${escapeHtml(firstName)}!</p>
        <p>It's past 11 and your Colony tasklist hasn't heard from you today.</p>
        <p style="text-align:center;margin:8px 0"><img src="${appBaseUrl.replace(/\/+$/, '')}/assets/analytics-ant.png" alt="A worker ant hauling a chart" style="width:100%;max-width:380px" /></p>
        <p>This little one has been carrying the colony's work all morning. He's not judging. He's just… waiting.</p>
        <p>Take two minutes, log your day: <a href="${appBaseUrl}#daily-tasklist">open My Work →</a></p>
        <p style="color:#888;font-size:12px">You get this only on days you haven't touched your tasks by 11 AM.</p>
      </div>
    `;
    const text = [
      `Good morning ${firstName}!`,
      "It's past 11 AM and your Colony tasklist hasn't heard from you today.",
      'Take two minutes and log your day:',
      `${appBaseUrl}#daily-tasklist`
    ].join('\n');

    try {
      const emailResult = await sendEmail({ to: employee.email, subject, html, text });
      await logNotification({
        kind: 'daily_tasklist_reminder',
        recipientEmail: employee.email,
        subject,
        payload: { employee_id: employee.id, sent_for_date: todayIso, nudge: true },
        status: emailResult.skipped ? 'skipped' : 'sent'
      });
      if (!emailResult.skipped) summary.nudgesSent += 1;
    } catch (error) {
      summary.errors.push(`Nudge failed for ${employee.email}: ${error.message}`);
    }
  }

  return { statusCode: summary.errors.length ? 207 : 200, body: JSON.stringify(summary) };
};

exports.handler = withCronHeartbeat('task-nudge', run);
