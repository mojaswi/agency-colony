/* ── Colony config: constants only ──
   Classic script (not an ES module) — loaded before app.js in index.html,
   shares the global scope. No DOM, no state, no functions with behavior.
   First slice of the app.js modularization: keep this file pure config. */

const DEFAULT_EMPLOYEE = 'My Profile';
const WORK_HOURS_PER_WEEK = 45;
const HOURS_PER_DAY = 9;

const ENFORCED_ACCESS_BY_EMAIL = {
  'admin@youragency.com': 'admin',
  'strategy-lead@youragency.com': 'leadership',
  'creative-lead@youragency.com': 'leadership',
  'am-lead@youragency.com': 'leadership',
  'ops-lead@youragency.com': 'leadership'
};

const SUPERADMIN_EMAIL = 'admin@youragency.com';
const INVOICE_VIEWER_EMAILS = ['finance@youragency.com', 'am-lead@youragency.com', 'admin@youragency.com'];
const INVOICE_EXCLUDED_EMAILS = ['admin@youragency.com'];
const HIDDEN_EMPLOYEE_EMAILS = ['finance@youragency.com', 'ops-lead@youragency.com']; // have access but hidden from all team views
const DEAL_FLOW_EXTRA_EMAILS = ['bd@youragency.com']; // non-leadership users who can see Deal Flow
const ANT_DOMAIN = '@youragency.com';
const TEAM_AM = 'AM';
const TEAM_AM_LEGACY = 'Acc Management'; // DB renamed to 'AM' — kept for backward compat during transition
const TEAM_MANAGER_BY_TEAM = Object.freeze({
  [TEAM_AM]: 'am-lead@youragency.com',
  Art: 'creative-lead@youragency.com',
  Copy: 'creative-lead@youragency.com',
  Video: 'creative-lead@youragency.com',
  Strategy: 'strategy-lead@youragency.com'
});
const DIRECT_MANAGER_BY_EMAIL = Object.freeze({
  'creative-lead@youragency.com': SUPERADMIN_EMAIL,
  'am-lead@youragency.com': SUPERADMIN_EMAIL,
  'strategy-lead@youragency.com': SUPERADMIN_EMAIL,
  'ops-lead@youragency.com': SUPERADMIN_EMAIL
});

const STATEFUL_SCREENS = [
  'home-feed',
  'executive-dashboard',
  'leadership-planner',
  'daily-tasklist',
  'my-allocations',
  'leave-center',
  'people-directory',
  'client-projects',
  'employee-profile',
  'admin-settings',
  'invoice-center',
  'policy'
];

// Keep sorted by date. The holiday list is decided collaboratively with the
// team each year — append the next year's entries only after that exercise.
// Every consumer filters by date, so past entries are harmless to keep.
const PUBLIC_HOLIDAYS = [
  { date: '2026-01-26', name: 'Republic Day' },
  { date: '2026-02-15', name: 'Maha Shivratri' },
  { date: '2026-03-04', name: 'Holi' },
  { date: '2026-04-03', name: 'Good Friday' },
  { date: '2026-05-01', name: 'Labor Day' },
  { date: '2026-08-15', name: 'Independence Day' },
  { date: '2026-09-14', name: 'Ganesh Chaturthi' },
  { date: '2026-10-02', name: 'Gandhi Jayanti' },
  { date: '2026-10-19', name: 'Durga Ashtami' },
  { date: '2026-11-09', name: 'Diwali' },
  { date: '2026-11-24', name: 'Guru Nanak Jayanti' },
  { date: '2026-12-25', name: 'Christmas Break' }
];
