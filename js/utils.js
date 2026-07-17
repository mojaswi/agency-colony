/* ── Colony utils: pure helpers only ──
   Classic script (not an ES module) — loaded before app.js in index.html,
   shares the global scope. Everything here must stay pure: no DOM access,
   no `state`, no Supabase. That keeps this file testable in Node
   (see tests/utils.test.mjs). */

function formatTimestamp(dateValue = new Date()) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  const day = String(date.getDate()).padStart(2, '0');
  const month = date.toLocaleString('en-US', { month: 'short' });
  const year = date.getFullYear();
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const suffix = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours === 0 ? 12 : hours;
  return `${day} ${month} ${year}, ${String(hours).padStart(2, '0')}:${minutes} ${suffix}`;
}

function parseTimestamp(timestampText) {
  if (!timestampText) return null;
  const match = timestampText.match(/^(\d{2})\s([A-Za-z]{3})\s(\d{4}),\s(\d{2}):(\d{2})\s(AM|PM)$/);
  if (!match) return null;

  const [, dd, mon, yyyy, hh, mm, meridiem] = match;
  const monthMap = {
    Jan: 0,
    Feb: 1,
    Mar: 2,
    Apr: 3,
    May: 4,
    Jun: 5,
    Jul: 6,
    Aug: 7,
    Sep: 8,
    Oct: 9,
    Nov: 10,
    Dec: 11
  };
  const month = monthMap[mon];
  if (month === undefined) return null;

  let hour = Number(hh);
  if (meridiem === 'PM' && hour !== 12) hour += 12;
  if (meridiem === 'AM' && hour === 12) hour = 0;
  return new Date(Number(yyyy), month, Number(dd), hour, Number(mm), 0, 0);
}

function toISODateLocal(dateValue = new Date()) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateForLabel(dateValue) {
  if (!dateValue) return '--';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(new Date(dateValue));
}

function parseIsoDateLocal(dateValue) {
  const text = String(dateValue || '').trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, yyyy, mm, dd] = match;
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
}

function isoWeekMetaFromDate(dateValue) {
  const local = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(local.getTime())) return { year: new Date().getFullYear(), week: 0 };
  const utcDate = new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()));
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
  const isoYear = utcDate.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const isoWeek = Math.ceil(((utcDate - yearStart) / 86400000 + 1) / 7);
  return { year: isoYear, week: isoWeek };
}

function weekIdentifierFromIsoDate(dateIso) {
  const parsed = parseIsoDateLocal(dateIso);
  if (!parsed) return '';
  const meta = isoWeekMetaFromDate(parsed);
  return `${meta.year}-W${String(meta.week).padStart(2, '0')}`;
}

function formatWeekRangeLabel(weekStartIso) {
  const start = parseIsoDateLocal(weekStartIso) || new Date(weekStartIso);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short' });
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}

function formatWeekIdentifierLabel(weekStartIso) {
  return formatWeekRangeLabel(weekStartIso);
}

function formatPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '0%';
  const bounded = Math.max(0, Math.min(100, numeric));
  const rounded = Math.round(bounded * 100) / 100;
  const text = Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(2).replace(/\.?0+$/, '');
  return `${text}%`;
}

function formatPercentRaw(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '0%';
  const rounded = Math.round(numeric * 100) / 100;
  const text = Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(2).replace(/\.?0+$/, '');
  return `${text}%`;
}

function percentNumberFromText(value) {
  const match = String(value || '').match(/-?\d+(\.\d+)?/);
  if (!match) return 0;
  const numeric = Number(match[0]);
  return Number.isFinite(numeric) ? numeric : 0;
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

// Matches the DB's lower(task_title) unique index — never compare task titles
// with plain ===; always go through this.
function taskTitleKey(title) {
  return (title || '').toLowerCase().trim();
}


// Classify a scheduled job's health from its last heartbeat age. Pure, so the
// thresholds are unit-testable. cadence: 'daily' | 'weekly' | 'monthly'.
// 'late' = one missed window; 'dead' = more than twice the window.
function cronHealthStatus(lastRunIso, cadence, now = new Date()) {
  if (!lastRunIso) return 'unknown';
  const last = new Date(lastRunIso);
  if (Number.isNaN(last.getTime())) return 'unknown';
  const ageHours = (now - last) / 3600000;
  const windowHours = { daily: 26, weekly: 8 * 24, monthly: 32 * 24 }[cadence] || 26;
  if (ageHours <= windowHours) return 'ok';
  return ageHours <= windowHours * 2 ? 'late' : 'dead';
}

// Freshness predicate for the screen-switch cache (state.loadedAt stamps).
function isFreshStamp(stampMs, nowMs, ttlMs) {
  return Boolean(stampMs) && (nowMs - stampMs) < ttlMs;
}

// Task link rule (per the superadmin): a URL in the DESCRIPTION makes the task TITLE
// clickable; the description displays as plain text with the raw URL removed.
// Returns { url, displayDesc } — url null when there's no link.
function taskLinkParts(description) {
  const text = String(description || '');
  const m = text.match(/https?:\/\/[^\s]+/);
  if (!m) return { url: null, displayDesc: text };
  return { url: m[0], displayDesc: text.replace(m[0], '').replace(/\s{2,}/g, ' ').trim() };
}

// Render a task title cell: clickable (new tab) when its description holds a
// URL; always XSS-safe.
function taskTitleHtml(task) {
  const title = escapeHtml(task.task_title);
  const { url } = taskLinkParts(task.description);
  if (!url) return title;
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="task-link" onclick="event.stopPropagation()">${title} ↗</a>`;
}
