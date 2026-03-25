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

function normalizeEmails(values = []) {
  return [...new Set(values.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean))];
}

function toDateRange(startDate, endDate) {
  const start = formatDateInIST(startDate);
  const end = formatDateInIST(endDate);
  return start === end ? start : `${start} to ${end}`;
}

exports.handler = async () => {
  const runAt = new Date();
  const runLabel = formatDateTimeInIST(runAt);
  const { appBaseUrl } = getConfig();
  const supabase = getSupabaseAdmin();

  const todayIso = runAt.toISOString().slice(0, 10);

  const summary = {
    runAtIst: runLabel,
    leaveCycleRowsProcessed: 0,
    dailyTasksRolledOver: 0,
    dailyTasklistRemindersSent: 0,
    birthdayNotificationsSent: 0,
    pendingLeaveDigestsSent: 0,
    errors: []
  };

  try {
    const rolloverResult = await supabase.rpc('rollover_all_leave_cycles', {
      p_as_of_date: todayIso
    });
    if (rolloverResult.error) {
      summary.errors.push(`Leave cycle rollover failed: ${rolloverResult.error.message}`);
    } else {
      summary.leaveCycleRowsProcessed = Number(rolloverResult.data || 0);
    }
  } catch (error) {
    summary.errors.push(`Leave cycle rollover failed: ${error.message}`);
  }

  // Roll over incomplete daily tasks: move any task from a past date that isn't done to today
  try {
    const taskRollover = await supabase
      .from('daily_tasks')
      .update({ task_date: todayIso, updated_at: new Date().toISOString() })
      .lt('task_date', todayIso)
      .neq('status', 'done');

    if (taskRollover.error) {
      summary.errors.push(`Daily task rollover failed: ${taskRollover.error.message}`);
    } else {
      summary.dailyTasksRolledOver = taskRollover.count || 0;
    }
  } catch (error) {
    summary.errors.push(`Daily task rollover failed: ${error.message}`);
  }

  // Skip email notifications on weekends (IST = UTC+5:30) — data operations above still run
  const istDay = new Date(runAt.getTime() + 5.5 * 60 * 60 * 1000).getDay();
  if (istDay === 0 || istDay === 6) {
    summary.skippedWeekend = true;
    return {
      statusCode: 200,
      body: JSON.stringify(summary)
    };
  }

  const activeEmployeesResponse = await supabase
    .from('employees')
    .select('id, full_name, email, is_active, date_of_birth')
    .eq('is_active', true)
    .order('full_name', { ascending: true });

  if (activeEmployeesResponse.error) {
    summary.errors.push(activeEmployeesResponse.error.message);
    return {
      statusCode: 500,
      body: JSON.stringify(summary)
    };
  }

  const activeEmployees = activeEmployeesResponse.data || [];

  for (const employee of activeEmployees) {
    const subject = 'Daily tasklist reminder (10:00 AM IST)';
    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.5">
        <p>Hello ${escapeHtml(employee.full_name || 'there')},</p>
        <p>This is your daily Agency Colony tasklist reminder for ${escapeHtml(formatDateInIST(runAt))}.</p>
        <p>Please submit/update today's tasks before end-of-day.</p>
        <p>Open app: <a href="${appBaseUrl}">${appBaseUrl}</a></p>
      </div>
    `;

    const text = [
      `Hello ${employee.full_name || 'there'},`,
      `This is your daily Agency Colony tasklist reminder for ${formatDateInIST(runAt)}.`,
      "Please submit/update today's tasks before end-of-day.",
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
        kind: 'daily_tasklist_reminder',
        recipientEmail: employee.email,
        subject,
        payload: {
          employee_id: employee.id,
          sent_for_date: formatDateInIST(runAt)
        },
        status: emailResult.skipped ? 'skipped' : 'sent'
      });

      if (!emailResult.skipped) {
        summary.dailyTasklistRemindersSent += 1;
      }
    } catch (error) {
      summary.errors.push(`Daily reminder failed for ${employee.email}: ${error.message}`);
    }
  }

  // Birthday notifications to leadership
  const todayMonth = runAt.getMonth() + 1;
  const todayDay = runAt.getDate();
  const birthdayEmployees = activeEmployees.filter((emp) => {
    if (!emp.date_of_birth) return false;
    const [, m, d] = emp.date_of_birth.split('-').map(Number);
    return m === todayMonth && d === todayDay;
  });

  if (birthdayEmployees.length) {
    const leadershipEmails = [
      'admin@youragency.com',
      'leader1@youragency.com',
      'leader2@youragency.com',
      'leader3@youragency.com',
      'leader4@youragency.com'
    ];

    const names = birthdayEmployees.map((emp) => emp.full_name).filter(Boolean);
    const nameList = names.length === 1
      ? escapeHtml(names[0])
      : names.slice(0, -1).map(escapeHtml).join(', ') + ' and ' + escapeHtml(names[names.length - 1]);

    const subject = `\u{1F382} Birthday today: ${names.join(', ')}`;
    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.5">
        <p>Hello,</p>
        <p>Today is <strong>${nameList}</strong>'s birthday! \u{1F389}</p>
        <p>Don't forget to wish them!</p>
        <p>Open app: <a href="${appBaseUrl}">${appBaseUrl}</a></p>
      </div>
    `;
    const text = [
      `Today is ${names.join(', ')}'s birthday!`,
      "Don't forget to wish them!",
      `Open app: ${appBaseUrl}`
    ].join('\n');

    for (const recipientEmail of leadershipEmails) {
      // Don't notify someone about their own birthday
      if (birthdayEmployees.some((emp) => emp.email === recipientEmail)) continue;

      try {
        const emailResult = await sendEmail({ to: recipientEmail, subject, html, text });
        await logNotification({
          kind: 'birthday_notification',
          recipientEmail,
          subject,
          payload: {
            birthday_employee_names: names,
            sent_for_date: formatDateInIST(runAt)
          },
          status: emailResult.skipped ? 'skipped' : 'sent'
        });
        if (!emailResult.skipped) {
          summary.birthdayNotificationsSent += 1;
        }
      } catch (error) {
        summary.errors.push(`Birthday notification failed for ${recipientEmail}: ${error.message}`);
      }
    }
  }

  // Pending leave digest (tracked departments only, finance excluded via leave_tracking_enabled).
  const pendingLeaveResponse = await supabase
    .from('leave_requests')
    .select('id, employee_id, leave_type, start_date, end_date, status, approver_emails')
    .eq('status', 'pending')
    .order('start_date', { ascending: true });

  if (pendingLeaveResponse.error) {
    summary.errors.push(pendingLeaveResponse.error.message);
  } else {
    const pendingLeaves = pendingLeaveResponse.data || [];
    const employeeIds = [...new Set(pendingLeaves.map((row) => row.employee_id).filter(Boolean))];

    let employeeMap = new Map();
    let departmentMap = new Map();

    if (employeeIds.length) {
      const leaveEmployeesResponse = await supabase
        .from('employees')
        .select('id, full_name, email, leave_tracking_enabled, department_id')
        .in('id', employeeIds);

      if (leaveEmployeesResponse.error) {
        summary.errors.push(leaveEmployeesResponse.error.message);
      } else {
        const rows = leaveEmployeesResponse.data || [];
        employeeMap = new Map(rows.map((row) => [row.id, row]));

        const departmentIds = [...new Set(rows.map((row) => row.department_id).filter(Boolean))];
        if (departmentIds.length) {
          const departmentsResponse = await supabase
            .from('departments')
            .select('id, name, leave_tracking_enabled')
            .in('id', departmentIds);

          if (departmentsResponse.error) {
            summary.errors.push(departmentsResponse.error.message);
          } else {
            departmentMap = new Map((departmentsResponse.data || []).map((row) => [row.id, row]));
          }
        }
      }
    }

    const digestByApprover = new Map();

    for (const leaveRow of pendingLeaves) {
      const employee = employeeMap.get(leaveRow.employee_id);
      if (!employee || employee.leave_tracking_enabled === false) {
        continue;
      }

      const department = departmentMap.get(employee.department_id);
      if (department && department.leave_tracking_enabled === false) {
        continue;
      }

      const approvers = normalizeEmails(leaveRow.approver_emails);
      for (const approverEmail of approvers) {
        const current = digestByApprover.get(approverEmail) || [];
        current.push({
          leaveId: leaveRow.id,
          employeeName: employee.full_name,
          leaveType: leaveRow.leave_type,
          dateRange: toDateRange(leaveRow.start_date, leaveRow.end_date)
        });
        digestByApprover.set(approverEmail, current);
      }
    }

    for (const [approverEmail, items] of digestByApprover.entries()) {
      if (!items.length) continue;

      const subject = `Pending leave digest (${items.length}) - ${formatDateInIST(runAt)}`;
      const listHtml = items
        .map(
          (item) =>
            `<li>${escapeHtml(item.employeeName)} | ${escapeHtml(item.leaveType)} | ${escapeHtml(item.dateRange)} | Request: ${escapeHtml(item.leaveId)}</li>`
        )
        .join('');
      const html = `
        <div style="font-family:Arial,sans-serif;line-height:1.5">
          <p>Hello,</p>
          <p>You have ${items.length} pending leave request(s) awaiting action in Agency Colony.</p>
          <ul>${listHtml}</ul>
          <p>Open app: <a href="${appBaseUrl}">${appBaseUrl}</a></p>
        </div>
      `;
      const text = [
        `You have ${items.length} pending leave request(s) awaiting action in Agency Colony.`,
        ...items.map((item) => `${item.employeeName} | ${item.leaveType} | ${item.dateRange} | ${item.leaveId}`),
        `Open app: ${appBaseUrl}`
      ].join('\n');

      try {
        const emailResult = await sendEmail({
          to: approverEmail,
          subject,
          html,
          text
        });

        await logNotification({
          kind: 'pending_leave_digest',
          recipientEmail: approverEmail,
          subject,
          payload: {
            pending_leave_ids: items.map((item) => item.leaveId),
            pending_count: items.length,
            sent_for_date: formatDateInIST(runAt)
          },
          status: emailResult.skipped ? 'skipped' : 'sent'
        });

        if (!emailResult.skipped) {
          summary.pendingLeaveDigestsSent += 1;
        }
      } catch (error) {
        summary.errors.push(`Pending digest failed for ${approverEmail}: ${error.message}`);
      }
    }
  }

  return {
    statusCode: summary.errors.length ? 207 : 200,
    body: JSON.stringify(summary)
  };
};
