/* ── Splash screen ── */
function dismissSplash() {
  const el = document.getElementById('splashScreen');
  if (!el || el.classList.contains('splash-hidden')) return;
  el.classList.add('splash-hidden');
  el.addEventListener('transitionend', () => el.remove(), { once: true });
}

const DEFAULT_EMPLOYEE = 'My Profile';
const WORK_HOURS_PER_WEEK = 45;
const HOURS_PER_DAY = 9;
const employeeStore = {};

const ENFORCED_ACCESS_BY_EMAIL = {
  'admin@youragency.com': 'admin',
  'leader1@youragency.com': 'leadership',
  'leader2@youragency.com': 'leadership',
  'leader3@youragency.com': 'leadership',
  'leader4@youragency.com': 'leadership'
};

const SUPERADMIN_EMAIL = 'admin@youragency.com';
const INVOICE_VIEWER_EMAILS = ['finance@youragency.com', 'leader3@youragency.com', 'admin@youragency.com'];
const INVOICE_EXCLUDED_EMAILS = ['admin@youragency.com'];
const DEAL_FLOW_EXTRA_EMAILS = ['sales@youragency.com']; // non-leadership users who can see Deal Flow
const ANT_DOMAIN = '@youragency.com';
const TEAM_AM = 'AM';
const TEAM_AM_LEGACY = 'Acc Management'; // DB renamed to 'AM' — kept for backward compat during transition
const TEAM_MANAGER_BY_TEAM = Object.freeze({
  [TEAM_AM]: 'leader3@youragency.com',
  Art: 'leader2@youragency.com',
  Copy: 'leader2@youragency.com',
  Video: 'leader2@youragency.com',
  Strategy: 'leader1@youragency.com'
});
const DIRECT_MANAGER_BY_EMAIL = Object.freeze({
  'leader2@youragency.com': SUPERADMIN_EMAIL,
  'leader3@youragency.com': SUPERADMIN_EMAIL,
  'leader1@youragency.com': SUPERADMIN_EMAIL,
  'leader4@youragency.com': SUPERADMIN_EMAIL
});
const STATEFUL_SCREENS = [
  'home-feed',
  'leadership-planner',
  'daily-tasklist',
  'my-allocations',
  'leave-center',
  'people-directory',
  'client-projects',
  'employee-profile',
  'admin-settings',
  'invoice-center'
];

const PUBLIC_HOLIDAYS_2026 = [
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

const COLONY_UPDATES = [
  { date: '2026-03-04', text: 'Personalized Home greeting by time of day' },
  { date: '2026-03-04', text: 'Leave approvals: recent history with expandable view' },
  { date: '2026-03-04', text: 'Reportee leave balances: total remaining, own team first' },
  { date: '2026-03-04', text: 'People page: live utilization data' },
  { date: '2026-03-04', text: 'Collapsible Edit Profile section' },
  { date: '2026-03-03', text: 'Home dashboard with team stats and timeline' },
  { date: '2026-03-03', text: 'Email notifications when someone comments/likes your request' },
  { date: '2026-02-28', text: 'Bugs & Features board with upvotes, replies, and status tracking' },
  { date: '2026-02-25', text: 'Daily task archive with calendar view' }
];

const state = {
  role: 'employee',
  currentEmployee: DEFAULT_EMPLOYEE,
  isAuthenticated: false,
  supabase: null,
  session: null,
  employeeProfile: null,
  runtimeConfig: null,
  leaveRowsById: new Map(),
  employeeDirectory: [],
  dailyTasks: [],
  featureRequests: [],
  clients: [],
  weeklyAllocations: [],
  taskViewEmployeeId: null,
  allocationViewEmployeeId: null,
  allocationClientFilter: 'all',
  profileAllocationRows: [],
  profileWeekOptions: [],
  profileWeekKey: '',
  currentEmployeeId: null,
  authIntent: 'signin',
  pendingAuthStatus: null,
  _realRole: null,
  leaveCycleSummary: null,
  homeAllocations: [],
  deals: [],
  dealSection: 'hot',
  dealFilter: 'open',
  dealView: 'board',
  dealFilterPoc: '',
  dealSearch: '',
  dealCompany: 'Your Agency'
};

function makeEmptyEmployeeRecord(overrides = {}) {
  return {
    team: TEAM_AM,
    accessLevel: 'employee',
    employmentType: 'full-time',
    email: '',
    capacityPercent: 100,
    lastAllocationEdit: '',
    utilization: { week: 0, month: 0 },
    projects: { week: [], month: [] },
    leaveTrackingEnabled: true,
    ...overrides
  };
}

function ensureEmployeeRecord(name) {
  const targetName = String(name || '').trim() || DEFAULT_EMPLOYEE;
  if (!employeeStore[targetName]) {
    employeeStore[targetName] = makeEmptyEmployeeRecord();
  }
  return employeeStore[targetName];
}

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

function getStaleReferenceDate() {
  const dates = Object.values(employeeStore)
    .map((row) => parseTimestamp(row.lastAllocationEdit))
    .filter((d) => d instanceof Date && !Number.isNaN(d.getTime()));

  if (!dates.length) return new Date();
  return new Date(Math.max(...dates.map((d) => d.getTime())));
}

function staleMeta(timestampText) {
  const tsDate = parseTimestamp(timestampText);
  const reference = getStaleReferenceDate();
  if (!tsDate || Number.isNaN(tsDate.getTime())) {
    return { status: 'ts-watch', label: 'Unknown', ageDays: null };
  }

  const diffDays = Math.max(0, Math.floor((reference.getTime() - tsDate.getTime()) / (24 * 60 * 60 * 1000)));
  if (diffDays <= 3) return { status: 'ts-fresh', label: `${diffDays}d old`, ageDays: diffDays };
  if (diffDays <= 7) return { status: 'ts-watch', label: `${diffDays}d old`, ageDays: diffDays };
  return { status: 'ts-stale', label: `${diffDays}d old`, ageDays: diffDays };
}

function applyTimestampClass(el, timestampText) {
  if (!el) return;
  const meta = staleMeta(timestampText);
  el.classList.remove('ts-fresh', 'ts-watch', 'ts-stale');
  el.classList.add(meta.status);
}

function updateEmployeeLastEditLabels(employeeName) {
  const record = employeeStore[employeeName];
  if (!record) return;
  document.querySelectorAll('.employee-last-edit').forEach((label) => {
    if (label.dataset.employee === employeeName) {
      label.textContent = record.lastAllocationEdit || '--';
      applyTimestampClass(label, record.lastAllocationEdit);
    }
  });
  document.querySelectorAll('.stale-badge').forEach((badge) => {
    if (badge.dataset.employee === employeeName) {
      const meta = staleMeta(record.lastAllocationEdit);
      badge.textContent = meta.label;
      badge.classList.remove('ts-fresh', 'ts-watch', 'ts-stale');
      badge.classList.add(meta.status);
    }
  });
}

function updateAllLastEditLabels() {
  Object.keys(employeeStore).forEach((name) => updateEmployeeLastEditLabels(name));
}

const navButtons = [...document.querySelectorAll('.screen-link')];
const screens = [...document.querySelectorAll('.screen')];
const loginNavButton = document.getElementById('loginNavButton') || navButtons.find((btn) => btn.dataset.screen === 'login') || null;

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isSuperadminEmail(email) {
  return normalizeEmail(email) === SUPERADMIN_EMAIL;
}

function isSuperadminUser() {
  const candidateEmail = state.employeeProfile?.email || state.session?.user?.email || '';
  return isSuperadminEmail(candidateEmail);
}

function canManageAccessRoles() {
  return isSuperadminUser();
}

function canEditEmployee(employee) {
  if (!state.isAuthenticated) return false;
  if (isSuperadminUser()) return true;
  const empEmail = normalizeEmail(employee?.email || '');
  const myEmail = normalizeEmail(state.employeeProfile?.email || state.session?.user?.email || '');
  if (empEmail && empEmail === myEmail) return true;
  if (isLeadershipRole() && employee) {
    return employeeReportsToManager(employee, myEmail);
  }
  return false;
}

function displayPersonName(value, fallback = 'Employee') {
  const tokens = String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!tokens.length) return fallback;
  if (tokens.length === 1) return tokens[0];
  return `${tokens[0]} ${tokens[tokens.length - 1]}`;
}

function normalizeTeamName(value, fallback = TEAM_AM) {
  const normalized = String(value || '').trim();
  if (!normalized) return fallback;
  if (normalized.toLowerCase() === TEAM_AM_LEGACY.toLowerCase()) return TEAM_AM;
  return normalized;
}

function teamLookupCandidates(value) {
  const normalized = normalizeTeamName(value);
  if (normalized === TEAM_AM) return [TEAM_AM, TEAM_AM_LEGACY];
  return [normalized];
}

function getEnforcedAccessLevel(email) {
  return ENFORCED_ACCESS_BY_EMAIL[normalizeEmail(email)] || null;
}

function setAuthenticatedNavigation(enabled) {
  navButtons.forEach((btn) => {
    if (!STATEFUL_SCREENS.includes(btn.dataset.screen)) return;
    btn.classList.toggle('disabled', !enabled);
  });
}

function isLeadershipRole() {
  return state.role === 'leadership' || state.role === 'admin';
}

function currentUserDepartmentName() {
  const fromProfile = normalizeTeamName(state.employeeProfile?.department?.name || '', '');
  if (fromProfile) return fromProfile;

  if (state.currentEmployeeId) {
    const ownDirectoryRow = state.employeeDirectory.find((entry) => entry.id === state.currentEmployeeId);
    const fromDirectory = normalizeTeamName(ownDirectoryRow?.department?.name || '', '');
    if (fromDirectory) return fromDirectory;
  }

  return normalizeTeamName(selectedEmployeeRecord()?.team || '', '');
}

function isFinanceUser() {
  return currentUserDepartmentName().toLowerCase() === 'finance';
}

function isInvoiceViewer() {
  const email = normalizeEmail(state.session?.user?.email || '');
  return INVOICE_VIEWER_EMAILS.includes(email);
}

function isDealFlowViewer() {
  if (isLeadershipRole()) return true;
  const email = normalizeEmail(state.employeeProfile?.email || state.session?.user?.email || '');
  return DEAL_FLOW_EXTRA_EMAILS.includes(email);
}

function canAccessTeamDashboard() {
  return state.isAuthenticated && (isLeadershipRole() || isFinanceUser());
}

function defaultHomeScreen() {
  return 'home-feed';
}

function employeeDirectoryByEmailMap() {
  const map = new Map();
  state.employeeDirectory.forEach((entry) => {
    const email = normalizeEmail(entry?.email);
    if (email) {
      map.set(email, entry);
    }
  });
  return map;
}

function employeeByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  return state.employeeDirectory.find((entry) => normalizeEmail(entry.email) === normalized) || null;
}

function managerEmailForEmployee(employee) {
  const email = normalizeEmail(employee?.email);
  if (!email || isSuperadminEmail(email)) return null;

  // DB-stored manager takes priority
  const dbManager = normalizeEmail(employee?.direct_manager_email || '');
  if (dbManager) return dbManager;

  const directManager = DIRECT_MANAGER_BY_EMAIL[email];
  if (directManager) return normalizeEmail(directManager);

  const normalizedTeam = normalizeTeamName(employee?.department?.name, '');
  const teamManager = TEAM_MANAGER_BY_TEAM[normalizedTeam];
  if (teamManager && normalizeEmail(teamManager) !== email) return normalizeEmail(teamManager);

  const accessLevel = normalizeAccessLevel(employee?.access_level || 'employee');
  if ((accessLevel === 'leadership' || accessLevel === 'admin') && !isSuperadminEmail(email)) {
    return SUPERADMIN_EMAIL;
  }

  return null;
}

function managerLabelForEmployee(employee) {
  const managerEmail = managerEmailForEmployee(employee);
  if (!managerEmail) return '--';
  const managerRow = employeeByEmail(managerEmail);
  return displayPersonName(managerRow?.full_name || displayNameFromEmail(managerEmail), '--');
}

function employeeReportsToManager(employee, managerEmail) {
  const targetManager = normalizeEmail(managerEmail);
  if (!targetManager) return false;

  const byEmail = employeeDirectoryByEmailMap();
  let current = employee || null;
  const visited = new Set();

  while (current) {
    const email = normalizeEmail(current.email);
    if (!email || visited.has(email)) return false;
    visited.add(email);

    const parentEmail = managerEmailForEmployee(current);
    if (!parentEmail) return false;
    if (normalizeEmail(parentEmail) === targetManager) return true;
    current = byEmail.get(normalizeEmail(parentEmail)) || null;
  }

  return false;
}

function reporteeEmployeesForManager(managerEmail) {
  const normalizedManager = normalizeEmail(managerEmail);
  if (!normalizedManager) return [];
  const list = state.employeeDirectory
    .filter((employee) => {
      const employeeEmail = normalizeEmail(employee.email);
      if (!employeeEmail || employeeEmail === normalizedManager) return false;
      return employeeReportsToManager(employee, normalizedManager);
    })
    .sort((a, b) => String(a.full_name || '').localeCompare(String(b.full_name || '')));
  // Superadmin sees themselves in their own team view
  if (isSuperadminEmail(normalizedManager)) {
    const self = state.employeeDirectory.find((e) => normalizeEmail(e.email) === normalizedManager);
    if (self) list.unshift(self);
  }
  return list;
}

function activateScreen(screenId) {
  const targetScreen = document.getElementById(screenId);
  if (!targetScreen || targetScreen.classList.contains('hidden')) {
    return false;
  }

  if (getActiveScreenId() === screenId) {
    return false;
  }

  // Sub-screens keep their parent sidebar button highlighted
  const PARENT_SCREEN = {
    'employee-profile': 'people-directory',
    'client-analytics': 'client-projects',
  };
  const navTarget = PARENT_SCREEN[screenId] || screenId;
  navButtons.forEach((btn) => {
    const isActive = btn.dataset.screen === navTarget;
    btn.classList.toggle('active', isActive);
  });

  screens.forEach((screen) => {
    screen.classList.toggle('active', screen.id === screenId);
  });

  const isLogin = screenId === 'login';
  document.querySelector('.body').classList.toggle('no-sidebar', isLogin);
  document.querySelector('.global-header').classList.toggle('hidden', isLogin);

  updateScreenArrows();
  scrollCanvasToTop();
  refreshScreenData(screenId);
  syncMobileNav();
  return true;
}

function scrollCanvasToTop() {
  const canvas = document.querySelector('.canvas');
  if (!canvas) return;
  canvas.scrollTop = 0;
  requestAnimationFrame(() => { canvas.scrollTop = 0; });
}

// ── Home Dashboard + Timeline ──────────────────────────────────────────

const HOME_TAGLINES = {
  morning: [
    'Ready to tackle your day?',
    "Let's make today count.",
    "What's on the agenda?",
    'Fresh start, fresh ideas.',
  ],
  afternoon: [
    "How's the day shaping up?",
    'Keep the momentum going.',
    'Halfway there, keep it up!',
    "Hope it's been a productive one.",
  ],
  evening: [
    'Wrapping up for the day?',
    'Almost there, finish strong!',
    'Time to wind down.',
    "Let's close out the day.",
  ],
};

function getHomeGreeting() {
  const now = new Date();
  const hour = now.getHours();
  let timeOfDay, greeting;
  if (hour < 12) { timeOfDay = 'morning'; greeting = 'Good morning'; }
  else if (hour < 17) { timeOfDay = 'afternoon'; greeting = 'Good afternoon'; }
  else { timeOfDay = 'evening'; greeting = 'Good evening'; }

  const firstName = (state.employeeProfile?.full_name || '').split(' ')[0] || 'there';
  const pool = HOME_TAGLINES[timeOfDay];
  // Pick by day-of-year so it's stable within a day but rotates daily
  const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayOfYear = Math.round((nowMidnight - new Date(now.getFullYear(), 0, 1)) / 86400000) + 1;
  const tagline = pool[dayOfYear % pool.length];

  return { greeting: `${greeting}, ${firstName}!`, tagline };
}

function applyHomeGreeting() {
  const el = document.getElementById('homeGreeting');
  const tl = document.getElementById('homeTagline');
  if (!el || !tl) return;
  const { greeting, tagline } = getHomeGreeting();
  el.textContent = greeting;
  tl.textContent = tagline;
}

async function loadHomeStatsFromSupabase() {
  if (!state.supabase || !state.isAuthenticated) {
    state.homeAllocations = [];
    renderHomeFeed();
    return;
  }

  const weekStartIso = getCurrentWeekStartIso();
  const response = await state.supabase
    .from('allocations')
    .select(`
      employee_id,
      allocation_percent,
      project:projects!allocations_project_id_fkey (
        name
      )
    `)
    .eq('period_type', 'week')
    .eq('period_start', weekStartIso);

  if (response.error) {
    console.error('Home allocations load failed:', response.error);
    state.homeAllocations = [];
  } else {
    state.homeAllocations = response.data || [];
  }

  renderHomeFeed();
}

function renderHomeStatCards() {
  if (!homeStatCards) return;

  const todayIso = toISODateLocal();

  // 1. Hours allocated this week (cumulative)
  const empCapacityMap = new Map();
  state.employeeDirectory.forEach(e => empCapacityMap.set(e.id, (e.capacity_percent || 100) / 100));

  let totalWeeklyHours = 0;
  const employeeAllocTotals = new Map();
  state.homeAllocations.forEach(a => {
    const current = employeeAllocTotals.get(a.employee_id) || 0;
    employeeAllocTotals.set(a.employee_id, current + (a.allocation_percent || 0));
  });
  employeeAllocTotals.forEach((totalPct, empId) => {
    const capacity = empCapacityMap.get(empId) || 1;
    totalWeeklyHours += (totalPct / 100) * capacity * WORK_HOURS_PER_WEEK;
  });

  // 2. Top + Chill client by allocation share
  const projectAlloc = new Map();
  let totalAllocPct = 0;
  state.homeAllocations.forEach(a => {
    const projectName = a.project?.name || 'Unassigned';
    if (isGarbageProjectName(projectName)) return;
    const current = projectAlloc.get(projectName) || 0;
    projectAlloc.set(projectName, current + (a.allocation_percent || 0));
    totalAllocPct += (a.allocation_percent || 0);
  });
  let topClient = '--';
  let topClientPct = 0;
  let chillClient = '--';
  let chillClientPct = Infinity;
  projectAlloc.forEach((pct, name) => {
    if (pct > topClientPct) {
      topClientPct = pct;
      topClient = name;
    }
    if (pct < chillClientPct) {
      chillClientPct = pct;
      chillClient = name;
    }
  });
  const topClientShare = totalAllocPct > 0 ? Math.round((topClientPct / totalAllocPct) * 100) : 0;
  const chillClientShare = totalAllocPct > 0 ? Math.round((chillClientPct / totalAllocPct) * 100) : 0;

  // 3. On leave today
  const onLeaveToday = [];
  state.leaveRowsById.forEach(lr => {
    if (lr.status === 'approved' && lr.start_date <= todayIso && lr.end_date >= todayIso) {
      onLeaveToday.push(displayPersonName(lr.employee?.full_name || '', 'Someone'));
    }
  });

  const leadership = isLeadershipRole();
  const cards = [];

  if (leadership) {
    cards.push(
      {
        label: 'Hours Allocated',
        value: `${Math.round(totalWeeklyHours)}h`,
        detail: 'this week'
      },
      {
        label: 'Top Client',
        value: topClient,
        detail: totalAllocPct > 0 ? `${topClientShare}% of allocation` : 'no allocations yet'
      },
      {
        label: 'Chill Client',
        value: chillClient,
        detail: totalAllocPct > 0 ? `${chillClientShare}% of allocation` : 'no allocations yet'
      }
    );
  }

  cards.push({
    label: 'On Leave Today',
    value: `${onLeaveToday.length}`,
    detail: onLeaveToday.length
      ? (leadership
          ? (onLeaveToday.length <= 3 ? onLeaveToday.join(', ') : `${onLeaveToday.slice(0, 2).join(', ')} +${onLeaveToday.length - 2}`)
          : `${onLeaveToday.length} team member${onLeaveToday.length > 1 ? 's' : ''}`)
      : 'everyone\'s in'
  });

  homeStatCards.innerHTML = cards.map(c => `
    <div class="home-stat-card">
      <span class="home-stat-label">${c.label}</span>
      <span class="home-stat-value">${c.value}</span>
      <span class="home-stat-detail">${c.detail}</span>
    </div>
  `).join('');
}

/* ── Sustainability Calendar ── */

const SUSTAINABILITY_CATEGORY_LABELS = {
  un_international_day: 'UN Day',
  awareness_campaign: 'Campaign',
  conference: 'Conference',
  climate_week: 'Climate Week',
  policy_regulatory: 'Policy'
};

function formatSusCalBadge(entry, todayIso, weekEndIso) {
  if (entry.start_date <= todayIso && entry.end_date >= todayIso) {
    if (entry.duration_type === 'day') return { text: 'today', cls: 'today' };
    if (entry.duration_type === 'month') return { text: 'all month', cls: '' };
    return { text: 'this week', cls: '' };
  }
  // Upcoming — show start date
  const d = parseIsoDateLocal(entry.start_date);
  const mon = d.toLocaleString('en-IN', { month: 'short' });
  const day = d.getDate();
  if (entry.start_date === entry.end_date) return { text: `${mon} ${day}`, cls: '' };
  const ed = parseIsoDateLocal(entry.end_date);
  const emon = ed.toLocaleString('en-IN', { month: 'short' });
  if (mon === emon) return { text: `${mon} ${day}–${ed.getDate()}`, cls: '' };
  return { text: `${mon} ${day} – ${emon} ${ed.getDate()}`, cls: '' };
}

function renderSusCalPill(entry, todayIso, weekEndIso) {
  const badge = formatSusCalBadge(entry, todayIso, weekEndIso);
  return `<span class="sus-pill ${badge.cls}" data-sus-id="${escapeHtml(entry.id)}">${entry.emoji || '📅'} ${escapeHtml(entry.name)} <span class="sus-pill-date">${badge.text}</span></span>`;
}

function renderSusCalDetail(entry) {
  return `<div class="sus-pill-detail" data-sus-detail="${escapeHtml(entry.id)}">
    <p>${escapeHtml(entry.description || '')}</p>
    ${entry.content_hook ? `<p class="sus-pill-hook">${escapeHtml(entry.content_hook)}</p>` : ''}
  </div>`;
}

async function renderSustainabilityCalendar() {
  const panel = document.getElementById('homeSustainabilityPanel');
  if (!panel) return;

  // Load calendar data once
  if (!state.sustainabilityCalendar) {
    try {
      const resp = await fetch('/data/sustainability-calendar-2026.json');
      if (!resp.ok) throw new Error(resp.statusText);
      state.sustainabilityCalendar = await resp.json();
    } catch (err) {
      console.warn('Sustainability calendar load failed:', err);
      panel.classList.add('hidden');
      return;
    }
  }

  const cal = state.sustainabilityCalendar;
  const todayIso = toISODateLocal();
  const weekEnd = new Date();
  weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay()));
  const weekEndIso = toISODateLocal(weekEnd);

  // Active today: start <= today && end >= today
  const activeToday = cal.filter(e => e.start_date <= todayIso && e.end_date >= todayIso);
  // Coming this week: starts after today, starts <= weekEnd, not already active
  const comingThisWeek = cal.filter(e => e.start_date > todayIso && e.start_date <= weekEndIso);

  const allEvents = [...activeToday, ...comingThisWeek];
  if (!allEvents.length) {
    const future = cal.filter(e => e.start_date > todayIso).sort((a, b) => a.start_date.localeCompare(b.start_date));
    if (future.length) {
      const next = future[0];
      const d = parseIsoDateLocal(next.start_date);
      const dateStr = d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
      panel.classList.remove('hidden');
      panel.innerHTML = `<div class="sus-strip"><span class="sus-pill">${next.emoji || '📅'} ${escapeHtml(next.name)} <span class="sus-pill-date">${dateStr}</span></span></div>`;
    } else {
      panel.classList.add('hidden');
    }
    return;
  }

  panel.classList.remove('hidden');
  const todayPills = activeToday.map(e => renderSusCalPill(e, todayIso, weekEndIso)).join('');
  const weekLabel = !activeToday.length && comingThisWeek.length ? '<span class="sus-strip-label">Upcoming</span>' : '';
  const weekPills = comingThisWeek.map(e => renderSusCalPill(e, todayIso, weekEndIso)).join('');
  const details = allEvents.map(e => renderSusCalDetail(e)).join('');
  panel.innerHTML = `<div class="sus-strip">${todayPills}${weekLabel}${weekPills}</div>${details}`;

  panel.onclick = (e) => {
    const pill = e.target.closest('.sus-pill');
    if (!pill) return;
    const id = pill.dataset.susId;
    const detail = panel.querySelector(`[data-sus-detail="${id}"]`);
    if (detail) detail.classList.toggle('open');
  };
}

function buildTimelineEvents() {
  const todayIso = toISODateLocal();
  const today = new Date();
  const events = [];

  // Cutoff dates
  const daysAgo14 = new Date(today);
  daysAgo14.setDate(today.getDate() - 14);
  const daysAgo14Iso = toISODateLocal(daysAgo14);
  const daysAhead7 = new Date(today);
  daysAhead7.setDate(today.getDate() + 7);
  const daysAhead7Iso = toISODateLocal(daysAhead7);

  // Holidays (today + next 7 days)
  PUBLIC_HOLIDAYS_2026.forEach(h => {
    if (h.date >= todayIso && h.date <= daysAhead7Iso) {
      const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const daysUntil = Math.round((parseIsoDateLocal(h.date) - todayMidnight) / 86400000);
      const when = daysUntil === 0 ? 'today' : daysUntil === 1 ? 'tomorrow' : `in ${daysUntil} days`;
      events.push({
        type: 'holiday',
        icon: '\uD83C\uDF89',
        text: `${h.name} ${when}`,
        detail: formatDateForLabel(h.date),
        date: h.date,
        sortDate: h.date
      });
    }
  });

  // Track on-leave-today IDs to avoid duplicating in leave approvals
  const onLeaveIds = new Set();
  state.leaveRowsById.forEach(lr => {
    if (lr.status === 'approved' && lr.start_date <= todayIso && lr.end_date >= todayIso) {
      onLeaveIds.add(lr.id);
    }
  });

  // Leave approvals — leadership only, only upcoming or recent leaves (skip retrospective additions)
  const showLeaveApprovals = isLeadershipRole();
  if (showLeaveApprovals) state.leaveRowsById.forEach(lr => {
    if (lr.status === 'approved' && lr.decided_at && !onLeaveIds.has(lr.id)) {
      if (lr.start_date < daysAgo14Iso) return; // skip old leaves added retroactively
      const decidedIso = toISODateLocal(new Date(lr.decided_at));
      if (decidedIso >= daysAgo14Iso && decidedIso <= todayIso) {
        const name = displayPersonName(lr.employee?.full_name || '', 'Someone');
        events.push({
          type: 'leave-approved',
          icon: '\uD83C\uDFD6\uFE0F',
          text: `${name}'s ${lr.leave_type || 'leave'} approved`,
          detail: `${formatDateForLabel(lr.start_date)} – ${formatDateForLabel(lr.end_date)}`,
          date: decidedIso,
          sortDate: decidedIso
        });
      }
    }
  });

  // New team members (last 14 days)
  state.employeeDirectory.forEach(emp => {
    if (emp.created_at) {
      const createdIso = toISODateLocal(new Date(emp.created_at));
      if (createdIso >= daysAgo14Iso && createdIso <= todayIso) {
        events.push({
          type: 'people',
          icon: '\uD83D\uDC4B',
          text: `${displayPersonName(emp.full_name, 'New member')} joined the team`,
          detail: formatDateForLabel(emp.created_at),
          date: createdIso,
          sortDate: createdIso
        });
      }
    }
  });

  // New clients (last 14 days)
  state.clients.forEach(client => {
    if (client.created_at) {
      const createdIso = toISODateLocal(new Date(client.created_at));
      if (createdIso >= daysAgo14Iso && createdIso <= todayIso) {
        events.push({
          type: 'client',
          icon: '\uD83C\uDD95',
          text: `New client: ${client.name}`,
          detail: formatDateForLabel(client.created_at),
          date: createdIso,
          sortDate: createdIso
        });
      }
    }
  });

  // Feature/bug requests — aggregate by day into daily digest
  const frByDate = {};
  state.featureRequests.forEach(fr => {
    let dateStr, category;
    if (fr.status === 'done') {
      dateStr = fr.updated_at || fr.created_at;
      category = 'shipped';
    } else if (fr.created_at) {
      dateStr = fr.created_at;
      category = 'new';
    }
    if (!dateStr) return;
    const dateIso = toISODateLocal(new Date(dateStr));
    if (dateIso < daysAgo14Iso || dateIso > todayIso) return;
    if (!frByDate[dateIso]) frByDate[dateIso] = [];
    const typeLabel = fr.request_type === 'bug' ? 'Bug fix' : 'Feature';
    const snippet = fr.request_text.length > 60 ? fr.request_text.slice(0, 60) + '…' : fr.request_text;
    frByDate[dateIso].push({ category, typeLabel, snippet, author: fr.author_name, requestType: fr.request_type });
  });
  Object.entries(frByDate).forEach(([dateIso, items]) => {
    const shipped = items.filter(i => i.category === 'shipped');
    const newItems = items.filter(i => i.category === 'new');
    const parts = [];
    if (shipped.length) parts.push(`${shipped.length} shipped`);
    if (newItems.length) parts.push(`${newItems.length} new`);
    const summary = parts.join(', ');
    // Build bullet list for expand
    const bullets = [];
    shipped.forEach(i => bullets.push(`<li><span class="feed-bullet-tag shipped">Shipped</span> ${escapeHtml(i.snippet)}</li>`));
    newItems.forEach(i => bullets.push(`<li><span class="feed-bullet-tag new">New ${i.typeLabel.toLowerCase()}</span> ${escapeHtml(i.snippet)}</li>`));
    events.push({
      type: shipped.length ? 'feature-done' : 'feature-new',
      icon: shipped.length ? '\u2728' : '\uD83D\uDCA1',
      text: `Bugs & Features — ${summary}`,
      detail: formatDateForLabel(dateIso),
      date: dateIso,
      sortDate: dateIso,
      expandable: `<ul class="feed-expand-list">${bullets.join('')}</ul><a class="feed-expand-viewall" data-link="feature-requests">View all →</a>`
    });
  });

  // Colony platform updates (last 30 days)
  const daysAgo30 = new Date(today);
  daysAgo30.setDate(today.getDate() - 30);
  const daysAgo30Iso = toISODateLocal(daysAgo30);
  COLONY_UPDATES.forEach(u => {
    if (u.date >= daysAgo30Iso && u.date <= todayIso) {
      events.push({
        type: 'platform',
        icon: '\uD83D\uDE80',
        text: u.text,
        detail: formatDateForLabel(u.date),
        date: u.date,
        sortDate: u.date
      });
    }
  });

  // Sort by date descending
  events.sort((a, b) => b.sortDate.localeCompare(a.sortDate));

  return events.slice(0, 30);
}

function renderBirthdayStrip() {
  const panel = document.getElementById('homeBirthdayPanel');
  if (!panel) return;

  const todayIso = toISODateLocal();
  const todayMD = todayIso.slice(5); // "MM-DD"
  const today = new Date();

  // Collect birthdays from employee directory
  const birthdays = state.employeeDirectory
    .filter((e) => e.date_of_birth && e.is_active)
    .map((e) => {
      const md = e.date_of_birth.slice(5); // "MM-DD"
      const thisYear = new Date(today.getFullYear(), parseInt(md.slice(0, 2)) - 1, parseInt(md.slice(3)));
      if (thisYear < today && md !== todayMD) {
        thisYear.setFullYear(thisYear.getFullYear() + 1);
      }
      const diffDays = Math.round((thisYear - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
      return { name: e.full_name, md, diffDays, date: thisYear };
    })
    .filter((b) => b.diffDays >= 0 && b.diffDays <= 7)
    .sort((a, b) => a.diffDays - b.diffDays);

  if (!birthdays.length) {
    panel.classList.add('hidden');
    return;
  }

  const hasToday = birthdays.some((b) => b.diffDays === 0);
  panel.classList.remove('hidden');
  const pills = birthdays.map((b) => {
    const firstName = b.name.split(' ')[0];
    const isToday = b.diffDays === 0;
    const dateStr = b.date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
    const label = isToday ? `🎂 Today is ${escapeHtml(firstName)}'s birthday!` : `🎂 ${escapeHtml(firstName)} <span class="bday-pill-date">${dateStr}</span>`;
    return `<span class="bday-pill${isToday ? ' bday-today' : ''}">${label}</span>`;
  }).join('');

  const stripLabel = hasToday ? 'Birthdays' : 'Upcoming birthdays';
  panel.innerHTML = `<div class="bday-strip"><span class="bday-strip-label">${stripLabel}</span>${pills}</div>`;
}

function renderHomeFeed() {
  applyHomeGreeting();
  renderHomeStatCards();
  renderBirthdayStrip();
  renderSustainabilityCalendar();

  if (!homeFeedList || !homeFeedEmpty) return;

  const events = buildTimelineEvents();

  if (!events.length) {
    homeFeedList.innerHTML = '';
    homeFeedEmpty.classList.remove('hidden');
    return;
  }

  homeFeedEmpty.classList.add('hidden');

  const todayIso = toISODateLocal();
  const today = new Date();
  const daysAgo7 = new Date(today);
  daysAgo7.setDate(today.getDate() - 7);
  const daysAgo7Iso = toISODateLocal(daysAgo7);
  const daysAhead7 = new Date(today);
  daysAhead7.setDate(today.getDate() + 7);
  const daysAhead7Iso = toISODateLocal(daysAhead7);

  const sections = { today: [], thisWeek: [], recent: [] };
  events.forEach(e => {
    if (e.date === todayIso || (e.date > todayIso && e.date <= daysAhead7Iso)) {
      if (e.date === todayIso) sections.today.push(e);
      else sections.thisWeek.push(e);
    } else if (e.date >= daysAgo7Iso && e.date < todayIso) {
      sections.thisWeek.push(e);
    } else {
      sections.recent.push(e);
    }
  });

  let html = '';
  const renderSection = (label, items) => {
    if (!items.length) return;
    html += `<h4 class="feed-section-heading">${label}</h4>`;
    items.forEach(e => {
      const titleAttr = e.fullText ? ` title="${e.fullText.replace(/"/g, '&quot;')}"` : '';
      const linkAttr = !e.expandable && e.link ? ` data-link="${e.link}" style="cursor:pointer"` : '';
      const expandAttr = e.expandable ? ' data-expandable style="cursor:pointer"' : '';
      html += `
        <div class="feed-card feed-type-${e.type}"${titleAttr}${linkAttr}${expandAttr}>
          <span class="feed-icon">${e.icon}</span>
          <div class="feed-body">
            <span class="feed-text">${e.text}${e.expandable ? ' <span class="feed-chevron">▾</span>' : ''}</span>
            ${e.detail ? `<span class="feed-detail">${e.detail.replace(/\n/g, '<br>')}</span>` : ''}
            ${e.expandable ? `<div class="feed-expand hidden">${e.expandable}</div>` : ''}
          </div>
        </div>`;
    });
  };

  renderSection('Today', sections.today);
  renderSection('This Week', sections.thisWeek);
  renderSection('Recent', sections.recent);

  homeFeedList.innerHTML = html;
  homeFeedList.querySelectorAll('.feed-card[data-link]').forEach(card => {
    card.addEventListener('click', () => navigateToScreen(card.dataset.link));
  });
  homeFeedList.querySelectorAll('.feed-card[data-expandable]').forEach(card => {
    card.addEventListener('click', (ev) => {
      if (ev.target.closest('[data-link]') && !ev.target.closest('.feed-card[data-expandable]').isSameNode(ev.target.closest('[data-link]'))) return;
      const expand = card.querySelector('.feed-expand');
      const chevron = card.querySelector('.feed-chevron');
      if (expand) {
        expand.classList.toggle('hidden');
        if (chevron) chevron.textContent = expand.classList.contains('hidden') ? '▾' : '▴';
      }
    });
  });
  homeFeedList.querySelectorAll('.feed-expand-viewall[data-link]').forEach(link => {
    link.addEventListener('click', (ev) => {
      ev.stopPropagation();
      navigateToScreen(link.dataset.link);
    });
  });
}

function refreshScreenData(screenId) {
  if (!state.isAuthenticated) return;
  switch (screenId) {
    case 'home-feed':
      loadHomeStatsFromSupabase().catch(console.error);
      loadFeatureRequestsFromSupabase().then(() => renderHomeFeed()).catch(console.error);
      break;
    case 'employee-profile':
      loadProfileAllocationHistoryFromSupabase().catch(console.error);
      loadInvoices().catch(console.error);
      break;
    case 'my-allocations':
      // Skip reload if allocation table already has rows (preserves unsaved edits)
      if (allocationTable && allocationTable.querySelector('tr')) break;
      loadWeeklyAllocationsFromSupabase().catch(console.error);
      break;
    case 'leadership-planner':
      if (isLeadershipRole()) loadTeamDashboardFromSupabase().catch(console.error);
      break;
    case 'people-directory':
      loadHomeStatsFromSupabase().then(() => renderPeopleDirectory()).catch(console.error);
      break;
    case 'client-projects':
      hideClientDetail();
      loadHomeStatsFromSupabase().catch(console.error);
      break;
    case 'feature-requests':
      loadFeatureRequestsFromSupabase().catch(console.error);
      break;
    case 'bd-pipeline':
      if (isDealFlowViewer()) {
        loadDealsFromSupabase().catch(console.error);
      } else {
        navigateToScreen('home-feed', { replace: true });
      }
      break;
    case 'invoice-center':
      checkInvoiceAccess().then(allowed => {
        if (allowed) {
          loadInvoices().catch(console.error);
        } else {
          navigateToScreen('home-feed', { replace: true });
        }
      });
      break;
    case 'client-analytics':
      if (analyticsCurrentClientId) {
        renderClientAnalyticsTab(analyticsCurrentClientId);
      } else {
        // No client selected (e.g. direct hash navigation) — redirect to client list
        navigateToScreen('client-projects', { replace: true });
      }
      break;
  }
}

function getActiveScreenId() {
  return document.querySelector('.screen.active')?.id || 'login';
}

function getVisibleScreenOrder() {
  return STATEFUL_SCREENS.filter(id => {
    const el = document.getElementById(id);
    return el && !el.classList.contains('hidden');
  });
}

function navigateScreenByDelta(delta) {
  const order = getVisibleScreenOrder();
  const current = getActiveScreenId();
  const idx = order.indexOf(current);
  if (idx < 0) return;
  const newIdx = idx + delta;
  if (newIdx < 0 || newIdx >= order.length) return;
  navigateToScreen(order[newIdx]);
}

function updateScreenArrows() {
  const order = getVisibleScreenOrder();
  const current = getActiveScreenId();
  const idx = order.indexOf(current);
  document.querySelectorAll('.screen-arrow.prev').forEach(btn => {
    btn.disabled = idx <= 0;
  });
  document.querySelectorAll('.screen-arrow.next').forEach(btn => {
    btn.disabled = idx >= order.length - 1;
  });
}

function readScreenFromHash() {
  const hash = String(window.location.hash || '').replace(/^#/, '').trim();
  if (!hash) return '';
  return hash;
}

function writeScreenToHistory(screenId, { replace = false } = {}) {
  if (!screenId || !window?.history?.pushState) return;
  const url = new URL(window.location.href);
  url.hash = screenId;
  const statePayload = { screenId };
  if (replace) {
    window.history.replaceState(statePayload, '', url.toString());
  } else {
    window.history.pushState(statePayload, '', url.toString());
  }
}

function navigateToScreen(screenId, { replace = false } = {}) {
  const changed = activateScreen(screenId);
  if (!changed) return;
  writeScreenToHistory(screenId, { replace });
}

function hashContainsAuthTokens() {
  const hash = window.location.hash || '';
  const query = window.location.search || '';
  return hash.includes('access_token=') || hash.includes('error_description=') || hash.includes('code=') || hash.includes('refresh_token=') || hash.includes('type=recovery') || query.includes('code=');
}

function initializeScreenHistory() {
  if (!hashContainsAuthTokens()) {
    const hashScreen = readScreenFromHash();
    if (hashScreen) {
      activateScreen(hashScreen);
    }
    writeScreenToHistory(getActiveScreenId(), { replace: true });
  }

  window.addEventListener('popstate', () => {
    const histState = window.history.state || {};

    // If popping back from a client detail view, just close the detail panel
    if (state.selectedClientId && !histState.clientDetailId) {
      state.selectedClientId = null;
      if (typeof hideClientDetail === 'function') hideClientDetail();
      return;
    }

    const hashTarget = readScreenFromHash();
    if (hashTarget) {
      activateScreen(hashTarget);
      return;
    }

    const stateTarget = histState.screenId;
    if (stateTarget) {
      activateScreen(stateTarget);
    }
  });
}

function applyRoleAccess() {
  const leadershipAccess = isLeadershipRole();
  const teamDashboardAccess = canAccessTeamDashboard();
  const peopleDirectoryAccess = state.isAuthenticated;
  const adminSettingsAccess = isSuperadminUser();

  document.querySelectorAll('.leadership-only').forEach((node) => {
    node.classList.toggle('hidden', !leadershipAccess);
  });
  document.querySelectorAll('.superadmin-only').forEach((node) => {
    node.classList.toggle('hidden', !adminSettingsAccess);
  });

  navButtons.forEach((btn) => {
    const requiredRole = btn.dataset.role;
    let hide = false;
    if (requiredRole === 'leadership') hide = !leadershipAccess;
    if (requiredRole === 'admin') hide = !adminSettingsAccess;
    btn.classList.toggle('hidden', hide);
  });

  const teamDashboardNav = navButtons.find((btn) => btn.dataset.screen === 'leadership-planner');
  const peopleDirectoryNav = navButtons.find((btn) => btn.dataset.screen === 'people-directory');
  const adminSettingsNav = navButtons.find((btn) => btn.dataset.screen === 'admin-settings');
  const teamDashboardScreen = document.getElementById('leadership-planner');
  const peopleDirectoryScreen = document.getElementById('people-directory');
  const adminSettingsScreen = document.getElementById('admin-settings');

  teamDashboardNav?.classList.toggle('hidden', !teamDashboardAccess);
  if (teamDashboardScreen) {
    teamDashboardScreen.classList.toggle('hidden', !teamDashboardAccess);
  }

  peopleDirectoryNav?.classList.toggle('hidden', !peopleDirectoryAccess);
  if (peopleDirectoryScreen) {
    peopleDirectoryScreen.classList.toggle('hidden', !peopleDirectoryAccess);
  }

  adminSettingsNav?.classList.toggle('hidden', !adminSettingsAccess);
  if (adminSettingsScreen) {
    adminSettingsScreen.classList.toggle('hidden', !adminSettingsAccess);
  }

  if (!leadershipAccess) {
    const ownName = state.employeeProfile?.full_name || state.currentEmployee || DEFAULT_EMPLOYEE;
    setSelectedEmployee(ownName);
  }

  const active = getActiveScreenId();
  const blockedActiveScreen =
    (active === 'leadership-planner' && !teamDashboardAccess) ||
    (active === 'people-directory' && !peopleDirectoryAccess) ||
    (active === 'admin-settings' && !adminSettingsAccess);
  if (blockedActiveScreen) {
    activateScreen(defaultHomeScreen());
  }

  syncTaskManagerUi();
  syncAllocationManagerUi();
  applySuperadminOnlyControls();
  syncMobileNav();
}

function applySuperadminOnlyControls() {
  const canManage = canManageAccessRoles();
  const profileAccessLabel = profileAccessLevel?.closest('label');

  if (profileAccessLabel) {
    profileAccessLabel.classList.toggle('hidden', !canManage);
  }
  if (profileAccessLevel) {
    profileAccessLevel.disabled = !canManage;
  }
  if (saveAccessRolesBtn) {
    saveAccessRolesBtn.disabled = !canManage;
  }
  if (fullAccessTableBody) {
    fullAccessTableBody.querySelectorAll('.full-access-role').forEach((select) => {
      select.disabled = !canManage;
    });
  }
  if (!canManage) {
    setFullAccessNotice('');
  }
}

// --- Theme toggle ---
function applyTheme(theme) {
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const newTheme = isDark ? 'light' : 'dark';
  applyTheme(newTheme);
  try { localStorage.setItem('colony-theme', newTheme); } catch (_) {}
}

(function initTheme() {
  try {
    const saved = localStorage.getItem('colony-theme');
    if (saved === 'dark') applyTheme('dark');
  } catch (_) {}
})();

navButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    if (btn.classList.contains('hidden') || btn.classList.contains('disabled')) return;
    navigateToScreen(btn.dataset.screen);
  });
});

document.querySelectorAll('.header-logo, .sidebar-brand').forEach((el) => {
  el.addEventListener('click', (e) => {
    if (!e.metaKey && !e.ctrlKey) e.preventDefault();
  });
});

document.querySelector('.canvas').addEventListener('click', (e) => {
  const prev = e.target.closest('.screen-arrow.prev');
  const next = e.target.closest('.screen-arrow.next');
  if (prev) navigateScreenByDelta(-1);
  if (next) navigateScreenByDelta(1);
});

// ── Mobile Bottom Tab Bar + More Sheet ──────────────────────────────────

const MOBILE_TAB_ICONS = {
  'daily-tasklist': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
  'my-allocations': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>',
  'leave-center': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  'home-feed': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
  'leadership-planner': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  'people-directory': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  'client-projects': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
  'admin-settings': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  'feature-requests': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  'bd-pipeline': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
  'invoice-center': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
  'more': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>',
};

const MOBILE_TAB_LABELS = {
  'daily-tasklist': 'Work Planner',
  'my-allocations': 'Allocation',
  'leave-center': 'Leave',
  'home-feed': 'Home',
  'leadership-planner': 'Team',
  'people-directory': 'People',
  'client-projects': 'Clients',
  'admin-settings': 'Admin',
  'feature-requests': 'Features',
  'bd-pipeline': 'Deal Flow',
  'invoice-center': 'Invoices',
  'more': 'More',
};

const mobileTabBar = document.getElementById('mobileTabBar');
const moreSheet = document.getElementById('moreSheet');
const moreSheetBackdrop = document.getElementById('moreSheetBackdrop');
const moreSheetList = document.getElementById('moreSheetList');

function getMobileTabConfig() {
  const leadership = isLeadershipRole();
  const dealFlow = isDealFlowViewer();
  if (leadership) {
    return {
      tabs: ['home-feed', 'leadership-planner', 'daily-tasklist'],
      more: [
        ...(dealFlow ? ['bd-pipeline'] : []),
        'my-allocations', 'leave-center', 'people-directory', 'client-projects', 'feature-requests',
        ...(isSuperadminUser() ? ['admin-settings'] : [])],
    };
  }
  return {
    tabs: ['home-feed', 'daily-tasklist', 'my-allocations'],
    more: [
      ...(dealFlow ? ['bd-pipeline'] : []),
      'leave-center', 'people-directory', 'client-projects', 'feature-requests'],
  };
}

function renderMobileTabBar() {
  if (!mobileTabBar) return;
  const config = getMobileTabConfig();
  const activeScreen = getActiveScreenId();
  const moreActive = config.more.includes(activeScreen);

  let html = '';
  config.tabs.forEach((screenId) => {
    const isActive = screenId === activeScreen;
    html += `<button class="tab-item${isActive ? ' active' : ''}" data-screen="${screenId}" type="button">
      ${MOBILE_TAB_ICONS[screenId] || ''}
      <span class="tab-label">${MOBILE_TAB_LABELS[screenId] || screenId}</span>
    </button>`;
  });

  // "More" button
  html += `<button class="tab-item${moreActive ? ' active' : ''}" data-action="more" type="button">
    ${MOBILE_TAB_ICONS.more}
    <span class="tab-label">More</span>
  </button>`;

  mobileTabBar.innerHTML = html;

  // Attach click handlers
  mobileTabBar.querySelectorAll('.tab-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.action === 'more') {
        toggleMoreSheet(true);
        return;
      }
      toggleMoreSheet(false);
      navigateToScreen(btn.dataset.screen);
    });
  });
}

function renderMoreSheet() {
  if (!moreSheetList) return;
  const config = getMobileTabConfig();
  const activeScreen = getActiveScreenId();

  let html = '';
  config.more.forEach((screenId) => {
    const isActive = screenId === activeScreen;
    html += `<button class="more-sheet-item${isActive ? ' active' : ''}" data-screen="${screenId}" type="button">
      ${MOBILE_TAB_ICONS[screenId] || ''}
      <span>${MOBILE_TAB_LABELS[screenId] || screenId}</span>
    </button>`;
  });

  moreSheetList.innerHTML = html;

  moreSheetList.querySelectorAll('.more-sheet-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      toggleMoreSheet(false);
      navigateToScreen(btn.dataset.screen);
    });
  });
}

function toggleMoreSheet(show) {
  if (!moreSheet || !moreSheetBackdrop) return;
  if (show) {
    renderMoreSheet();
    moreSheetBackdrop.hidden = false;
    moreSheet.hidden = false;
  } else {
    moreSheetBackdrop.hidden = true;
    moreSheet.hidden = true;
  }
}

if (moreSheetBackdrop) {
  moreSheetBackdrop.addEventListener('click', () => toggleMoreSheet(false));
}

function syncMobileNav() {
  if (!mobileTabBar) return;
  const isLoggedIn = state.isAuthenticated && getActiveScreenId() !== 'login';
  mobileTabBar.hidden = !isLoggedIn;
  if (isLoggedIn) {
    renderMobileTabBar();
  }
}

let _lastMobileState = window.matchMedia('(max-width: 768px)').matches;
// Re-run daily cleanup when tab regains focus (handles overnight idle)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && localStorage.getItem('colony_task_cleanup_date') !== toISODateLocal()) {
    loadDailyTasksFromSupabase();
  }
});

window.addEventListener('resize', () => {
  syncMobileNav();
  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  if (isMobile !== _lastMobileState) {
    _lastMobileState = isMobile;
    // Re-render matrix when crossing mobile/desktop breakpoint
    const matrixTable = document.getElementById('resourceMatrix');
    const mobileCards = document.getElementById('matrixMobileCards');
    if (!isMobile) {
      if (matrixTable) matrixTable.style.display = '';
      if (mobileCards) mobileCards.innerHTML = '';
    }
    if (state._matrixTeamMembers) {
      renderResourceMatrix(state._matrixTeamMembers, state._matrixAllocationRows, state._matrixWeekStarts || [], '');
    }
  }
});
syncMobileNav();

// ── End Mobile Nav ──────────────────────────────────────────────────────

const signInBtn = document.getElementById('signInBtn');
const registerBtn = document.getElementById('registerBtn');
const loginMessage = document.getElementById('loginMessage');
const authSessionLine = document.getElementById('authSessionLine');
const logoutBtn = document.getElementById('logoutBtn');
const themeToggleBtn = document.getElementById('themeToggleBtn');
if (themeToggleBtn) {
  themeToggleBtn.addEventListener('click', toggleTheme);
}

function setLoginStatus(message, className = 'status') {
  if (!loginMessage) return;
  loginMessage.className = className;
  loginMessage.textContent = message;
}

function setAuthSessionLine(message = '') {
  if (!authSessionLine) return;
  authSessionLine.textContent = message;
}

function updateSidebarIdentityLabels() {
  if (loginNavButton) {
    if (!state.isAuthenticated) {
      loginNavButton.textContent = 'Login';
      loginNavButton.dataset.screen = 'login';
      loginNavButton.classList.remove('sidebar-identity');
    } else {
      loginNavButton.textContent = displayPersonName(state.employeeProfile?.full_name, 'My Profile');
      loginNavButton.dataset.screen = 'employee-profile';
      loginNavButton.classList.add('sidebar-identity');
    }
    loginNavButton.classList.remove('disabled');
  }
  if (state.isAuthenticated && getActiveScreenId() === 'login') {
    activateScreen(defaultHomeScreen());
  }
}

function upsertEmployeeInStore(employee) {
  const fullName = employee?.full_name || state.currentEmployee || DEFAULT_EMPLOYEE;
  const departmentName = normalizeTeamName(employee?.department?.name, TEAM_AM);
  const employmentType = employee?.employment_type || 'full-time';
  const email = normalizeEmail(employee?.email);
  const parsedCapacity = Number(employee?.capacity_percent);
  const capacityPercent = Number.isFinite(parsedCapacity) ? parsedCapacity : 100;
  const leaveTrackingEnabled = employee?.leave_tracking_enabled !== false;
  const accessLevel = normalizeAccessLevel(employee?.access_level || 'employee');
  const target = ensureEmployeeRecord(fullName);
  target.team = normalizeTeamName(departmentName, TEAM_AM);
  target.accessLevel = accessLevel;
  target.employmentType = employmentType;
  target.email = email || target.email || '';
  target.capacityPercent = capacityPercent;
  target.leaveTrackingEnabled = leaveTrackingEnabled;
  target.lastAllocationEdit = target.lastAllocationEdit || '';
  target.utilization = target.utilization || { week: 0, month: 0 };
  target.projects = target.projects || { week: [], month: [] };
}

async function fetchRuntimeConfig() {
  // Localhost fallback: Netlify functions aren't available locally
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    return {
      supabaseUrl: 'YOUR_SUPABASE_URL',
      supabaseAnonKey: 'YOUR_SUPABASE_ANON_KEY',
      appBaseUrl: location.origin,
      allowedDomain: 'youragency.com'
    };
  }
  const response = await fetch('/api/runtime-config', { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error('Unable to load runtime configuration from Netlify.');
  }
  return response.json();
}

async function fetchCurrentEmployeeProfile() {
  const ensureResult = await state.supabase.rpc('ensure_employee_profile');
  if (ensureResult.error) throw ensureResult.error;

  const profileId = ensureResult.data?.id;
  if (!profileId) {
    throw new Error('Account bootstrap succeeded but profile id is missing.');
  }

  const employeeResult = await state.supabase
    .from('employees')
    .select(`
      id,
      auth_user_id,
      full_name,
      email,
      capacity_percent,
      employment_type,
      access_level,
      leave_tracking_enabled,
      approver_emails,
      department:departments!employees_department_id_fkey (
        id,
        name,
        leave_tracking_enabled
      )
    `)
    .eq('id', profileId)
    .single();

  if (employeeResult.error) throw employeeResult.error;
  return employeeResult.data;
}

async function applyAuthState(session) {
  const wasAuthenticated = state.isAuthenticated;
  const activeScreenBeforeAuthUpdate = getActiveScreenId();
  state.session = session || null;
  state.isAuthenticated = Boolean(session);

  if (!session) {
    state.employeeProfile = null;
    state.currentEmployeeId = null;
    state.employeeDirectory = [];
    state.inactiveEmployees = [];
    state.dailyTasks = [];
    state.featureRequests = [];
    state.frPendingFiles = [];
    state.frReplyPendingFiles = {};
    state.clients = [];
    state.weeklyAllocations = [];
    state.taskViewEmployeeId = null;
    state.allocationViewEmployeeId = null;
    state.role = 'employee';
    state.currentEmployee = DEFAULT_EMPLOYEE;
    invoiceUnlocked = false;
    setAuthenticatedNavigation(false);
    if (signInBtn) signInBtn.classList.remove('hidden');
    if (registerBtn) registerBtn.classList.remove('hidden');
    if (logoutBtn) {
      logoutBtn.classList.add('hidden');
      logoutBtn.disabled = true;
    }
    state._realRole = null;
    setAuthSessionLine('');
    updateSidebarIdentityLabels();
    if (state.pendingAuthStatus) {
      setLoginStatus(state.pendingAuthStatus.message, state.pendingAuthStatus.className);
      state.pendingAuthStatus = null;
    } else {
      setLoginStatus('Choose Sign in or Register with your @youragency.com Google account.', 'status');
    }
    setDailyTaskNotice('');
    renderPeopleDirectory();
    renderTaskEmployeeFilterOptions();
    renderAllocationEmployeeFilterOptions();
    renderClientRegistryTable();
    renderTaskClientOptions();
    renderFullAccessUsers();
    renderClientOwnerOptions();
    renderWeeklyAllocationViews();
    renderTeamDashboardEmpty('Sign in to load team allocation snapshots.');
    setTeamDashboardScopeNote('Sign in to load team allocation snapshots.');
    renderDailyTaskViews();
    applyLeaveCycleSummary(emptyLeaveSummary());
    setLeaveBalanceNotice('Sign in to load leave balances.');
    if (orgChartPanel) orgChartPanel.classList.add('hidden');
    if (toggleOrgChartBtn) toggleOrgChartBtn.textContent = 'Org Chart';
    applyRoleAccess();
    activateScreen('login');
    dismissSplash();
    return;
  }

  const authEmail = normalizeEmail(session.user?.email);
  if (!authEmail.endsWith(ANT_DOMAIN)) {
    const domainError =
      state.authIntent === 'register'
        ? 'Registration failed. Use your @youragency.com Google Workspace account.'
        : 'Sign-in failed. Use your @youragency.com Google Workspace account.';
    state.pendingAuthStatus = { message: domainError, className: 'status error' };
    await state.supabase.auth.signOut();
    setLoginStatus(domainError, 'status error');
    return;
  }

  try {
    const employeeProfile = await fetchCurrentEmployeeProfile();
    const enforcedAccess = getEnforcedAccessLevel(authEmail);
    state.employeeProfile = employeeProfile;
    state.currentEmployeeId = employeeProfile.id;
    // Only reset view employee IDs on fresh sign-in, not token refresh
    if (!wasAuthenticated) {
      state.taskViewEmployeeId = employeeProfile.id;
      state.allocationViewEmployeeId = employeeProfile.id;
    }
    state.role = enforcedAccess || employeeProfile.access_level || 'employee';
    // Sync enforced access level to DB if mismatched
    if (enforcedAccess && normalizeAccessLevel(employeeProfile.access_level) !== enforcedAccess) {
      state.supabase.from('employees').update({ access_level: enforcedAccess }).eq('id', employeeProfile.id).then(res => {
        if (!res.error) {
          employeeProfile.access_level = enforcedAccess;
          console.log(`Synced enforced access level '${enforcedAccess}' to DB for ${authEmail}`);
        }
      });
    }
    upsertEmployeeInStore(employeeProfile);

    if (signInBtn) signInBtn.classList.add('hidden');
    if (registerBtn) registerBtn.classList.add('hidden');
    if (logoutBtn) {
      logoutBtn.classList.remove('hidden');
      logoutBtn.disabled = false;
    }
    updateSidebarIdentityLabels();
    setAuthenticatedNavigation(true);
    setAuthSessionLine(`Signed in as ${displayPersonName(employeeProfile.full_name, 'Employee')} (${authEmail})`);
    if (!wasAuthenticated) {
      if (state.authIntent === 'register') {
        setLoginStatus('Registration complete. Role assigned from your company profile.', 'status');
      } else {
        setLoginStatus('Sign-in successful. Role assigned from your company profile.', 'status');
      }
    }
    state.authIntent = 'signin';

    if (!wasAuthenticated) {
      setSelectedEmployee(employeeProfile.full_name || DEFAULT_EMPLOYEE);
    }
    applyRoleAccess();
    applyInvoiceVisibility();
    applyDealFlowVisibility();
    applyFractionalVisibility();

    // Skip full data reload on token refresh — preserves unsaved form inputs
    if (wasAuthenticated) {
      dismissSplash();
      return;
    }

    await Promise.all([
      loadEmployeeDirectoryFromSupabase().catch((error) => {
        console.error('Employee directory load failed:', error);
      }),
      loadClientsFromSupabase().catch((error) => {
        console.error('Clients load failed:', error);
      }),
      loadDailyTasksFromSupabase().catch((error) => {
        console.error('Daily tasks load failed:', error);
      }),
      loadWeeklyAllocationsFromSupabase().catch((error) => {
        console.error('Weekly allocations load failed:', error);
      }),
      loadLeaveRequestsFromSupabase().catch((error) => {
        console.error('Leave requests load failed:', error);
      }),
      loadFeatureRequestsFromSupabase().catch((error) => {
        console.error('Feature requests load failed:', error);
      })
    ]);
    const hashScreen = readScreenFromHash();
    const hashIsAuthCallback = hashContainsAuthTokens();
    const shouldOpenDashboard = !wasAuthenticated && (!hashScreen || hashIsAuthCallback) && activeScreenBeforeAuthUpdate === 'login';
    if (shouldOpenDashboard) {
      navigateToScreen(defaultHomeScreen(), { replace: true });
    } else if (hashIsAuthCallback) {
      // Auth tokens still in hash — clean up and go to default screen
      navigateToScreen(defaultHomeScreen(), { replace: true });
    } else {
      // Screen already active from initializeScreenHistory but data wasn't loaded
      // because auth hadn't completed yet — refresh it now.
      refreshScreenData(getActiveScreenId());
    }
    dismissSplash();
  } catch (error) {
    console.error(error);
    const bootstrapError = `Unable to bootstrap employee profile: ${error.message}`;
    state.pendingAuthStatus = { message: bootstrapError, className: 'status error' };
    setLoginStatus(bootstrapError, 'status error');
    await state.supabase.auth.signOut();
    dismissSplash();
  }
}

async function startGoogleSignIn(intent = 'signin') {
  if (!state.supabase) {
    setLoginStatus('Supabase auth is not initialized yet.', 'status error');
    return;
  }
  state.authIntent = intent;

  const isRegisterIntent = intent === 'register';

  const { error } = await state.supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}${window.location.pathname}`,
      queryParams: {
        hd: 'youragency.com',
        prompt: isRegisterIntent ? 'consent select_account' : 'select_account'
      }
    }
  });

  if (error) {
    const actionLabel = isRegisterIntent ? 'registration' : 'sign-in';
    setLoginStatus(`Google ${actionLabel} failed: ${error.message}`, 'status error');
  }
}

async function signOutCurrentSession() {
  if (!state.supabase) return;
  const { error } = await state.supabase.auth.signOut();
  if (error) {
    setLoginStatus(`Sign-out failed: ${error.message}`, 'status error');
  }
}

async function initializeSupabaseAuth() {
  if (!window.supabase?.createClient) {
    setLoginStatus('Supabase SDK failed to load.', 'status error');
    return;
  }

  try {
    state.runtimeConfig = await fetchRuntimeConfig();
  } catch (error) {
    setLoginStatus(`Runtime configuration error: ${error.message}`, 'status error');
    return;
  }

  if (!state.runtimeConfig.supabaseUrl || !state.runtimeConfig.supabaseAnonKey) {
    setLoginStatus('Missing SUPABASE_URL or SUPABASE_ANON_KEY in Netlify environment.', 'status error');
    return;
  }

  const { createClient } = window.supabase;
  state.supabase = createClient(state.runtimeConfig.supabaseUrl, state.runtimeConfig.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'implicit'
    },
    db: {
      schema: 'app'
    }
  });

  let sessionResult = await state.supabase.auth.getSession();

  // Fallback: if Supabase didn't detect hash tokens (can happen on some mobile browsers),
  // manually extract and set session from URL hash
  if (!sessionResult.data?.session && window.location.hash.includes('access_token=')) {
    try {
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      if (accessToken && refreshToken) {
        const setResult = await state.supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        });
        if (!setResult.error) {
          sessionResult = { data: { session: setResult.data.session }, error: null };
          window.location.hash = '';
        }
      }
    } catch (err) {
      console.warn('Manual hash token extraction failed:', err);
    }
  }

  if (sessionResult.error) {
    setLoginStatus(`Unable to read auth session: ${sessionResult.error.message}`, 'status error');
    return;
  }

  await applyAuthState(sessionResult.data?.session || null);

  state.supabase.auth.onAuthStateChange((_event, nextSession) => {
    window.setTimeout(() => {
      applyAuthState(nextSession).catch((error) => {
        console.error(error);
        setLoginStatus(`Auth state error: ${error.message}`, 'status error');
      });
    }, 0);
  });
}

if (signInBtn) {
  signInBtn.addEventListener('click', () => {
    startGoogleSignIn('signin').catch((error) => {
      console.error(error);
      setLoginStatus(`Google sign-in failed: ${error.message}`, 'status error');
    });
  });
}

if (registerBtn) {
  registerBtn.addEventListener('click', () => {
    startGoogleSignIn('register').catch((error) => {
      console.error(error);
      setLoginStatus(`Google registration failed: ${error.message}`, 'status error');
    });
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    signOutCurrentSession().catch((error) => {
      console.error(error);
      setLoginStatus(`Sign-out failed: ${error.message}`, 'status error');
    });
  });
}

const taskTodayLabel = document.getElementById('taskTodayLabel');
const taskEmployeeFilterWrap = document.getElementById('taskEmployeeFilterWrap');
const taskEmployeeFilter = document.getElementById('taskEmployeeFilter');
const taskActionHeader = document.getElementById('taskActionHeader');
const dailyTaskTableBody = document.getElementById('dailyTaskTableBody');
const newTaskTitleInput = document.getElementById('newTaskTitleInput');
const newTaskDescriptionInput = document.getElementById('newTaskDescriptionInput');
const newTaskDeadlineInput = document.getElementById('newTaskDeadlineInput');
const newTaskClientSelect = document.getElementById('newTaskClientSelect');
const weeklyPlannerTableBody = document.getElementById('weeklyPlannerTableBody');
const weeklyTaskActionHeader = document.getElementById('weeklyTaskActionHeader');
const addWeeklyTaskBtn = document.getElementById('addWeeklyTaskBtn');
const dailyTaskNotice = document.getElementById('dailyTaskNotice');
const taskArchiveCalendar = document.getElementById('taskArchiveCalendar');
const archiveDayDetail = document.getElementById('archiveDayDetail');
const archiveDayDetailLabel = document.getElementById('archiveDayDetailLabel');
const archiveDayDetailBody = document.getElementById('archiveDayDetailBody');
const archiveDayDetailClose = document.getElementById('archiveDayDetailClose');
const homeStatCards = document.getElementById('homeStatCards');
const homeFeedList = document.getElementById('homeFeedList');
const homeFeedEmpty = document.getElementById('homeFeedEmpty');
const featureRequestThread = document.getElementById('featureRequestThread');
const featureRequestNotice = document.getElementById('featureRequestNotice');
const newFeatureRequestInput = document.getElementById('newFeatureRequestInput');
const submitFeatureRequestBtn = document.getElementById('submitFeatureRequestBtn');
const featureRequestsFooterLink = document.getElementById('featureRequestsFooterLink');
const frCompletedList = document.getElementById('frCompletedList');
const peopleDirectoryBody = document.getElementById('peopleDirectoryBody');
const directorySearch = document.getElementById('directorySearch');
const toggleOrgChartBtn = document.getElementById('toggleOrgChartBtn');
const orgChartPanel = document.getElementById('orgChartPanel');
const orgChartCanvas = document.getElementById('orgChartCanvas');
const orgChartScope = document.getElementById('orgChartScope');
const fullAccessTableBody = document.getElementById('fullAccessTableBody');
const saveAccessRolesBtn = document.getElementById('saveAccessRolesBtn');
const fullAccessNotice = document.getElementById('fullAccessNotice');

function setDailyTaskNotice(message = '') {
  if (!dailyTaskNotice) return;
  dailyTaskNotice.textContent = message;
}

function getDailyTaskStatusMeta(status) {
  if (status === 'done') return { className: 'approved', label: 'Completed' };
  if (status === 'archived') return { className: 'archived', label: 'Archived' };
  return { className: 'pending', label: 'In progress' };
}

function getEmployeeNameById(employeeId) {
  const row = state.employeeDirectory.find((entry) => entry.id === employeeId);
  if (row?.full_name) return displayPersonName(row.full_name, 'Employee');
  if (state.currentEmployeeId === employeeId) {
    return displayPersonName(state.employeeProfile?.full_name || DEFAULT_EMPLOYEE, 'Employee');
  }
  return 'Employee';
}

function getEmployeeIdByName(fullName) {
  const row = state.employeeDirectory.find((entry) => entry.full_name === fullName);
  return row?.id || null;
}

function getTaskViewEmployeeId() {
  if (isLeadershipRole()) {
    return state.taskViewEmployeeId || state.currentEmployeeId || null;
  }
  return state.currentEmployeeId || null;
}

function tasksForDate(employeeId, dateIso) {
  return state.dailyTasks.filter((task) => task.employee_id === employeeId && task.task_date === dateIso);
}

function tasksForWeeklyBacklog(employeeId) {
  return state.dailyTasks.filter(
    (task) => task.employee_id === employeeId && task.task_date === null && task.status !== 'archived'
  );
}

function dedupeSortedNames(values) {
  return [...new Set(values.map((v) => String(v || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function taskClientNamesFromState() {
  const clientNames = state.clients
    .map((row) => row.name)
    .filter((name) => normalizeClientNameKey(name) !== 'internal');
  return dedupeSortedNames(clientNames);
}

function renderTaskClientOptions() {
  if (!newTaskClientSelect) return;
  const current = newTaskClientSelect.value;
  const names = taskClientNamesFromState();
  newTaskClientSelect.innerHTML = '<option value="">Select client</option>';
  names.forEach((name) => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    newTaskClientSelect.appendChild(option);
  });
  if (current && names.includes(current)) {
    newTaskClientSelect.value = current;
  }
}

function renderPeopleDirectory() {
  if (!peopleDirectoryBody) return;
  peopleDirectoryBody.innerHTML = '';
  const showAccessRole = isLeadershipRole();
  const colCount = showAccessRole ? 8 : 7;

  // Toggle Access Role header visibility
  const directoryTable = peopleDirectoryBody.closest('table');
  const accessRoleHeader = directoryTable?.querySelectorAll('thead th')?.[5];
  if (accessRoleHeader) accessRoleHeader.classList.toggle('hidden', !showAccessRole);

  if (!state.employeeDirectory.length) {
    const row = document.createElement('tr');
    row.innerHTML = `<td colspan="${colCount}">No employees yet.</td>`;
    peopleDirectoryBody.appendChild(row);
    renderOrgChart();
    return;
  }

  // Compute per-employee utilization from current week allocations
  const empAllocTotals = new Map();
  state.homeAllocations.forEach(a => {
    const cur = empAllocTotals.get(a.employee_id) || 0;
    empAllocTotals.set(a.employee_id, cur + (a.allocation_percent || 0));
  });

  state.employeeDirectory.forEach((employee) => {
    const util = Math.min(Math.round(empAllocTotals.get(employee.id) || 0), 100);
    const displayName = displayPersonName(employee.full_name, 'Employee');
    const reportsTo = managerLabelForEmployee(employee);
    const accessRole = normalizeAccessLevel(employee.access_level || 'employee');
    const accessLabel = accessRole === 'admin' ? 'Admin' : accessRole === 'leadership' ? 'Leadership' : 'Employee';
    const canEdit = canEditEmployee(employee);
    const actionCell = canEdit
      ? `
        <button class="ghost small" type="button" data-directory-action="edit" data-employee-id="${employee.id}" data-employee="${escapeHtml(employee.full_name)}">Edit</button>
        <button class="ghost small" type="button" data-directory-action="deactivate" data-employee-id="${employee.id}" data-employee="${escapeHtml(employee.full_name)}">Deactivate</button>
      `
      : '<span class="mini-meta">View only</span>';
    const row = document.createElement('tr');
    row.innerHTML = `
      <td data-label="Name"><button class="name-link employee-link" data-employee="${escapeHtml(employee.full_name)}">${escapeHtml(displayName)}</button>${employee.current_city ? `<span class="directory-city">📍 ${escapeHtml(employee.current_city)}</span>` : ''}</td>
      <td data-label="Email">${escapeHtml(employee.email || '')}</td>
      <td data-label="Department">${escapeHtml(normalizeTeamName(employee.department?.name, TEAM_AM))}</td>
      <td data-label="Reports To">${escapeHtml(reportsTo)}</td>
      <td data-label="Type">${employee.employment_type === 'fractional' ? 'Fractional' : 'Full-time'}</td>
      ${showAccessRole ? `<td data-label="Access">${accessLabel}</td>` : ''}
      <td data-label="Utilization">${util}%</td>
      <td data-label="">${actionCell}</td>
    `;
    peopleDirectoryBody.appendChild(row);
  });

  renderOrgChart();
  renderDeactivatedEmployees();
}

function renderDeactivatedEmployees() {
  const panel = document.getElementById('deactivatedEmployeesPanel');
  const body = document.getElementById('deactivatedEmployeesBody');
  if (!panel || !body) return;
  body.innerHTML = '';

  if (!isLeadershipRole() || !state.inactiveEmployees.length) {
    panel.classList.add('hidden');
    return;
  }

  panel.classList.remove('hidden');
  state.inactiveEmployees.forEach((emp) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td data-label="Name">${escapeHtml(displayPersonName(emp.full_name, 'Employee'))}</td>
      <td data-label="Email">${escapeHtml(emp.email || '')}</td>
      <td data-label="Department">${escapeHtml(emp.department?.name || '--')}</td>
      <td data-label="Actions"><button class="ghost small" type="button" data-reactivate-id="${emp.id}" data-reactivate-name="${escapeHtml(emp.full_name)}">Reactivate</button></td>
    `;
    body.appendChild(row);
  });
}

// Delegate reactivate clicks (once)
document.getElementById('deactivatedEmployeesPanel')?.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-reactivate-id]');
  if (!btn) return;
  const id = btn.dataset.reactivateId;
  const name = btn.dataset.reactivateName;
  if (!window.confirm(`Reactivate ${name}?`)) return;
  const result = await state.supabase.from('employees').update({ is_active: true }).eq('id', id);
  if (result.error) {
    window.alert(`Unable to reactivate: ${result.error.message}`);
    return;
  }
  await loadEmployeeDirectoryFromSupabase();
});

function setOrgChartScope(message = '') {
  if (!orgChartScope) return;
  orgChartScope.textContent = message;
}

function buildOrgChartNode(employee, childrenByManagerEmail, { startExpanded = false } = {}) {
  const email = normalizeEmail(employee?.email);
  const role = normalizeAccessLevel(employee?.access_level || (isSuperadminEmail(email) ? 'admin' : 'employee'));
  const isRoot = isSuperadminEmail(email);
  const isLead = role === 'leadership' || role === 'admin';
  const name = displayPersonName(employee?.full_name || displayNameFromEmail(email), 'Employee');
  const team = employee?.department?.name ? normalizeTeamName(employee.department.name, TEAM_AM) : 'Leadership';
  const initial = (name.charAt(0) || '?').toUpperCase();

  const children = (childrenByManagerEmail.get(email) || []).sort((a, b) =>
    String(a.full_name || '').localeCompare(String(b.full_name || ''))
  );
  const hasChildren = children.length > 0;

  const node = document.createElement('li');
  const cardClass = isRoot ? 'vnode root' : isLead ? 'vnode lead' : 'vnode';
  const toggleHtml = hasChildren
    ? `<button class="toggle${startExpanded ? ' expanded' : ''}" type="button" aria-label="Toggle reports">&#x25B6;</button>`
    : '';

  node.innerHTML = `
    <div class="${cardClass}">
      <div class="avatar">${escapeHtml(initial)}</div>
      <div class="info">
        <span class="name">${escapeHtml(name)}</span>
        <span class="meta">${escapeHtml(team)}${isLead ? ' \u00b7 ' + (role === 'admin' ? 'Admin' : 'Leadership') : ''}</span>
      </div>
      ${toggleHtml}
    </div>
  `;

  if (!hasChildren) return node;

  const branch = document.createElement('ul');
  branch.className = startExpanded ? 'children' : 'children collapsed';
  children.forEach((child) => {
    branch.appendChild(buildOrgChartNode(child, childrenByManagerEmail));
  });
  node.appendChild(branch);

  const toggleBtn = node.querySelector('.toggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const isExpanded = toggleBtn.classList.toggle('expanded');
      branch.classList.toggle('collapsed', !isExpanded);
    });
  }

  return node;
}

function renderOrgChart() {
  if (!orgChartCanvas) return;
  orgChartCanvas.innerHTML = '';

  if (!state.employeeDirectory.length) {
    orgChartCanvas.innerHTML = '<p class="mini-meta">No employees available for org chart.</p>';
    setOrgChartScope('Reporting structure based on leadership mapping.');
    return;
  }

  const rootEmployee =
    employeeByEmail(SUPERADMIN_EMAIL) || {
      full_name: displayNameFromEmail(SUPERADMIN_EMAIL),
      email: SUPERADMIN_EMAIL,
      access_level: 'admin',
      department: { name: 'Leadership' }
    };

  const childrenByManagerEmail = new Map();
  state.employeeDirectory.forEach((employee) => {
    const managerEmail = managerEmailForEmployee(employee);
    if (!managerEmail) return;
    if (!childrenByManagerEmail.has(managerEmail)) {
      childrenByManagerEmail.set(managerEmail, []);
    }
    childrenByManagerEmail.get(managerEmail).push(employee);
  });

  const tree = document.createElement('ul');
  tree.className = 'vtree';
  tree.appendChild(buildOrgChartNode(rootEmployee, childrenByManagerEmail, { startExpanded: true }));
  orgChartCanvas.appendChild(tree);
}

async function deactivateDirectoryEmployee(employeeId, employeeName = 'Employee') {
  if (!employeeId || !isLeadershipRole()) return;

  const displayName = displayPersonName(employeeName, 'Employee');
  if (employeeId === state.currentEmployeeId) {
    window.alert('You cannot deactivate your own account.');
    return;
  }

  const confirmDeactivate = window.confirm(`Deactivate ${displayName}?`);
  if (!confirmDeactivate) return;

  if (!state.supabase || !state.isAuthenticated) {
    state.employeeDirectory = state.employeeDirectory.filter((entry) => entry.id !== employeeId);
    renderPeopleDirectory();
    renderTaskEmployeeFilterOptions();
    renderAllocationEmployeeFilterOptions();
    renderFullAccessUsers();
    return;
  }

  const result = await state.supabase.from('employees').update({ is_active: false }).eq('id', employeeId);
  if (result.error) {
    window.alert(`Unable to deactivate ${displayName}: ${result.error.message}`);
    return;
  }

  if (state.taskViewEmployeeId === employeeId) {
    state.taskViewEmployeeId = state.currentEmployeeId;
  }
  if (state.allocationViewEmployeeId === employeeId) {
    state.allocationViewEmployeeId = state.currentEmployeeId;
  }

  await loadEmployeeDirectoryFromSupabase();
  await loadDailyTasksFromSupabase();
  await loadWeeklyAllocationsFromSupabase();
  setSelectedEmployee(state.employeeProfile?.full_name || DEFAULT_EMPLOYEE);
}

if (peopleDirectoryBody) {
  peopleDirectoryBody.addEventListener('click', (event) => {
    const actionBtn = event.target.closest('button[data-directory-action]');
    if (!actionBtn) return;

    const action = actionBtn.dataset.directoryAction;
    const employeeId = actionBtn.dataset.employeeId || '';
    const employeeName = actionBtn.dataset.employee || '';

    if (action === 'edit') {
      if (!employeeName || !isLeadershipRole()) return;
      setSelectedEmployee(employeeName);
      activateScreen('employee-profile');
      return;
    }

    if (action === 'deactivate') {
      deactivateDirectoryEmployee(employeeId, employeeName).catch((error) => {
        console.error(error);
        window.alert(`Unable to deactivate employee: ${error.message}`);
      });
    }
  });
}

if (toggleOrgChartBtn) {
  toggleOrgChartBtn.addEventListener('click', () => {
    if (!orgChartPanel) return;
    const willShow = orgChartPanel.classList.contains('hidden');
    orgChartPanel.classList.toggle('hidden', !willShow);
    toggleOrgChartBtn.textContent = willShow ? 'Hide Org Chart' : 'Org Chart';
    if (willShow) {
      renderOrgChart();
    }
  });
}

if (directorySearch) {
  directorySearch.addEventListener('input', () => {
    filterDirectoryBySearch(directorySearch.value);
  });
}

function filterDirectoryBySearch(query) {
  if (!peopleDirectoryBody) return;
  const term = String(query || '').toLowerCase().trim();
  const rows = peopleDirectoryBody.querySelectorAll('tr');
  rows.forEach((row) => {
    if (!term) {
      row.style.display = '';
      return;
    }
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(term) ? '' : 'none';
  });
}

function normalizeAccessLevel(role) {
  if (role === 'admin' || role === 'leadership' || role === 'employee') return role;
  return 'employee';
}

function displayNameFromEmail(email) {
  const base = String(email || '').split('@')[0] || 'Employee';
  return base
    .split(/[._-]+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
}

function setFullAccessNotice(message = '', className = 'mini-meta') {
  if (!fullAccessNotice) return;
  fullAccessNotice.className = className;
  fullAccessNotice.textContent = message;
}

function fullAccessRoleOptionsMarkup(selectedRole) {
  const role = normalizeAccessLevel(selectedRole);
  return `
    <option value="admin" ${role === 'admin' ? 'selected' : ''}>Admin</option>
    <option value="leadership" ${role === 'leadership' ? 'selected' : ''}>Leadership</option>
    <option value="employee" ${role === 'employee' ? 'selected' : ''}>Employee</option>
  `;
}

function renderFullAccessUsers() {
  if (!fullAccessTableBody) return;
  const canManage = canManageAccessRoles();

  // Merge DB-persisted roles with hardcoded enforced overrides
  const seenEmails = new Set();
  const merged = [];

  // First: all directory entries with admin/leadership in DB
  state.employeeDirectory
    .filter((entry) => entry.access_level === 'admin' || entry.access_level === 'leadership')
    .forEach((entry) => {
      const email = normalizeEmail(entry.email);
      const enforced = getEnforcedAccessLevel(email);
      seenEmails.add(email);
      merged.push({
        full_name: entry.full_name,
        email,
        access_level: normalizeAccessLevel(enforced || entry.access_level)
      });
    });

  // Second: enforced overrides not yet in merged list (DB says employee but hardcode says leadership/admin)
  Object.entries(ENFORCED_ACCESS_BY_EMAIL).forEach(([email, role]) => {
    const normEmail = normalizeEmail(email);
    if (seenEmails.has(normEmail)) return;
    const dirEntry = state.employeeDirectory.find(e => normalizeEmail(e.email) === normEmail);
    if (!dirEntry) return; // not in directory at all — skip
    merged.push({
      full_name: dirEntry.full_name,
      email: normEmail,
      access_level: normalizeAccessLevel(role)
    });
  });

  fullAccessTableBody.innerHTML = '';
  if (!merged.length) {
    fullAccessTableBody.innerHTML = '<tr><td colspan="4">No full-access users configured.</td></tr>';
    return;
  }

  merged.forEach((row) => {
    const tr = document.createElement('tr');
    tr.dataset.email = row.email;
    tr.dataset.name = row.full_name || displayNameFromEmail(row.email);
    const visibleName = displayPersonName(tr.dataset.name, displayNameFromEmail(row.email));
    const role = normalizeAccessLevel(row.access_level);
    const accessLabel = role === 'employee' ? 'Limited' : 'Full';
    tr.innerHTML = `
      <td data-label="Name">${escapeHtml(visibleName)}</td>
      <td data-label="Email">${escapeHtml(row.email)}</td>
      <td data-label="Role"><select class="full-access-role" ${canManage ? '' : 'disabled'}>${fullAccessRoleOptionsMarkup(role)}</select></td>
      <td data-label="Access" class="full-access-level-cell">${accessLabel}</td>
    `;
    fullAccessTableBody.appendChild(tr);
  });

  if (saveAccessRolesBtn) {
    saveAccessRolesBtn.disabled = !canManage;
  }
}

async function saveFullAccessRoles() {
  if (!state.supabase || !state.isAuthenticated) {
    setFullAccessNotice('Sign in first to save access roles.');
    return;
  }
  if (!canManageAccessRoles()) {
    setFullAccessNotice('Access role changes are restricted.', 'status warn');
    return;
  }
  if (!fullAccessTableBody) return;

  const rows = [...fullAccessTableBody.querySelectorAll('tr[data-email]')];
  if (!rows.length) {
    setFullAccessNotice('No rows to save.');
    return;
  }

  const leadershipDeptResult = await state.supabase.from('departments').select('id').eq('name', 'Leadership').single();
  if (leadershipDeptResult.error) {
    setFullAccessNotice(`Unable to load Leadership department: ${leadershipDeptResult.error.message}`);
    return;
  }
  const leadershipDeptId = leadershipDeptResult.data.id;

  let updatedCount = 0;
  let insertedCount = 0;
  let skippedCount = 0;

  for (const row of rows) {
    const email = normalizeEmail(row.dataset.email);
    const fullName = row.dataset.name || displayNameFromEmail(email);
    const selectedRole = normalizeAccessLevel(row.querySelector('.full-access-role')?.value);

    if (!email.endsWith(ANT_DOMAIN)) {
      skippedCount += 1;
      continue;
    }

    const existingResult = await state.supabase.from('employees').select('id').eq('email', email).maybeSingle();
    if (existingResult.error && existingResult.error.code !== 'PGRST116') {
      setFullAccessNotice(`Unable to check employee ${email}: ${existingResult.error.message}`);
      return;
    }

    if (existingResult.data?.id) {
      const updateResult = await state.supabase
        .from('employees')
        .update({
          access_level: selectedRole,
          role_title: selectedRole === 'admin' ? 'Admin' : selectedRole === 'leadership' ? 'Leadership' : 'Employee',
          is_active: true
        })
        .eq('id', existingResult.data.id);
      if (updateResult.error) {
        setFullAccessNotice(`Unable to update ${email}: ${updateResult.error.message}`);
        return;
      }
      updatedCount += 1;
    } else if (selectedRole === 'employee') {
      skippedCount += 1;
    } else {
      const insertResult = await state.supabase.from('employees').insert({
        email,
        full_name: fullName,
        department_id: leadershipDeptId,
        employment_type: 'full-time',
        access_level: selectedRole,
        role_title: selectedRole === 'admin' ? 'Admin' : 'Leadership',
        leave_tracking_enabled: true,
        is_active: true
      });
      if (insertResult.error) {
        setFullAccessNotice(`Unable to add ${email}: ${insertResult.error.message}`);
        return;
      }
      insertedCount += 1;
    }
  }

  await loadEmployeeDirectoryFromSupabase();
  setFullAccessNotice(`Saved. Updated ${updatedCount}, added ${insertedCount}, skipped ${skippedCount}.`);
}

if (fullAccessTableBody) {
  fullAccessTableBody.addEventListener('change', (event) => {
    if (!canManageAccessRoles()) return;
    const select = event.target.closest('.full-access-role');
    if (!select) return;
    const row = select.closest('tr');
    const levelCell = row?.querySelector('.full-access-level-cell');
    if (levelCell) {
      levelCell.textContent = normalizeAccessLevel(select.value) === 'employee' ? 'Limited' : 'Full';
    }
  });
}

if (saveAccessRolesBtn) {
  saveAccessRolesBtn.addEventListener('click', () => {
    saveFullAccessRoles().catch((error) => {
      console.error(error);
      setFullAccessNotice(`Unable to save roles: ${error.message}`);
    });
  });
}

function renderTaskEmployeeFilterOptions() {
  if (!taskEmployeeFilter) return;
  taskEmployeeFilter.innerHTML = '';
  state.employeeDirectory.forEach((employee) => {
    const option = document.createElement('option');
    option.value = employee.id;
    option.textContent = displayPersonName(employee.full_name, 'Employee');
    taskEmployeeFilter.appendChild(option);
  });

  if (!state.taskViewEmployeeId) {
    state.taskViewEmployeeId = state.currentEmployeeId;
  }

  if (state.taskViewEmployeeId && [...taskEmployeeFilter.options].some((opt) => opt.value === state.taskViewEmployeeId)) {
    taskEmployeeFilter.value = state.taskViewEmployeeId;
  } else if (taskEmployeeFilter.options.length) {
    state.taskViewEmployeeId = taskEmployeeFilter.options[0].value;
    taskEmployeeFilter.value = state.taskViewEmployeeId;
  }
}

function canManageTask(task) {
  if (!task) return false;
  if (isLeadershipRole()) return true;
  return Boolean(state.currentEmployeeId && task.employee_id === state.currentEmployeeId);
}

function canManageTaskView(taskEmployeeId) {
  if (isLeadershipRole()) return true;
  return Boolean(state.currentEmployeeId && taskEmployeeId && state.currentEmployeeId === taskEmployeeId);
}

function parseTaskDeadlineInput(value) {
  const text = String(value || '').trim();
  if (!text) return { value: null, valid: true };
  const parsed = parseIsoDateLocal(text);
  if (!parsed || toISODateLocal(parsed) !== text) {
    return { value: null, valid: false };
  }
  return { value: text, valid: true };
}

function renderDailyTaskTable() {
  if (!dailyTaskTableBody) return;
  const todayIso = toISODateLocal();
  const taskEmployeeId = getTaskViewEmployeeId();
  const rows = taskEmployeeId
    ? tasksForDate(taskEmployeeId, todayIso).filter((t) => t.status !== 'archived').sort((a, b) => {
        if ((a.status === 'done') !== (b.status === 'done')) return (a.status === 'done') - (b.status === 'done');
        const aPri = a.sort_order || 0;
        const bPri = b.sort_order || 0;
        if (aPri && bPri) return aPri - bPri;
        if (aPri) return -1;
        if (bPri) return 1;
        return new Date(b.created_at) - new Date(a.created_at);
      })
    : [];
  const showActionColumn = canManageTaskView(taskEmployeeId);

  if (taskTodayLabel) {
    taskTodayLabel.textContent = `Today\u2019s Focus`;
  }
  if (taskActionHeader) {
    taskActionHeader.classList.toggle('hidden', !showActionColumn);
  }

  dailyTaskTableBody.innerHTML = '';
  if (!rows.length) {
    const row = document.createElement('tr');
    row.innerHTML = `<td colspan="${showActionColumn ? 6 : 5}">No tasks for today. Promote tasks from Weekly Planner below.</td>`;
    dailyTaskTableBody.appendChild(row);
    return;
  }

  rows.forEach((task) => {
    const canManage = canManageTask(task);
    const row = document.createElement('tr');
    if (task.status === 'done') row.classList.add('task-done');
    const priorityVal = task.sort_order || '';
    const priorityCell = canManage
      ? `<td data-label="Priority"><select class="priority-input" data-task-id="${task.id}"><option value="0">\u2013</option>${[1,2,3,4,5,6,7,8,9,10].map(n => `<option value="${n}"${priorityVal === n ? ' selected' : ''}>${n}</option>`).join('')}</select></td>`
      : `<td data-label="Priority">${priorityVal || '\u2013'}</td>`;
    const hasWeeklyOriginal = state.dailyTasks.some(
      (t) => t.task_title === task.task_title && t.employee_id === task.employee_id && t.task_date === null && t.status !== 'archived' && t.id !== task.id
    );
    const demoteBtn = hasWeeklyOriginal
      ? `<button class="ghost small" data-task-action="demote" data-task-id="${task.id}">\u2190 Weekly</button>`
      : '';
    const actionCell = canManage
      ? `
        <td data-label="Actions">
          <button class="ghost small" data-task-action="edit" data-task-id="${task.id}">Edit</button>
          ${demoteBtn}
          <button class="ghost small" data-task-action="delete" data-task-id="${task.id}">Delete</button>
        </td>
      `
      : '';
    row.innerHTML = `
      ${priorityCell}
      <td data-label="Task">${escapeHtml(task.task_title)}</td>
      <td data-label="Client">${escapeHtml(task.notes || '--')}</td>
      <td data-label="Description">${escapeHtml(task.description || '--')}</td>
      <td data-label="Status">
        <select class="status-select" data-task-id="${task.id}">
          <option value="in_progress"${task.status !== 'done' ? ' selected' : ''}>In progress</option>
          <option value="done"${task.status === 'done' ? ' selected' : ''}>Completed</option>
        </select>
      </td>
      ${actionCell}
    `;
    dailyTaskTableBody.appendChild(row);
  });
}

function renderTaskArchiveCalendar() {
  if (!taskArchiveCalendar) return;
  const employeeId = getTaskViewEmployeeId();
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayIso = toISODateLocal(today);

  taskArchiveCalendar.innerHTML = '';

  /* Day-of-week headers */
  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  dayLabels.forEach((lbl) => {
    const hdr = document.createElement('div');
    hdr.className = 'archive-day-header';
    hdr.textContent = lbl;
    taskArchiveCalendar.appendChild(hdr);
  });

  /* Empty spacers before the 1st */
  for (let i = 0; i < firstWeekday; i += 1) {
    const empty = document.createElement('div');
    empty.className = 'archive-cell spacer-day';
    empty.setAttribute('aria-hidden', 'true');
    taskArchiveCalendar.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateIso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isPast = dateIso < todayIso;
    const isToday = dateIso === todayIso;
    const tasks = isPast && employeeId ? tasksForDate(employeeId, dateIso) : [];
    const cell = document.createElement('div');

    let cls = 'archive-cell';
    if (tasks.length) cls += ' has-tasks';
    else if (isToday) cls += ' is-today';
    else if (!isPast) cls += ' future-day';

    cell.className = cls;
    cell.textContent = String(day);
    if (isPast && employeeId) {
      cell.style.cursor = 'pointer';
      cell.addEventListener('click', () => showArchiveDayDetail(dateIso, employeeId));
    }
    taskArchiveCalendar.appendChild(cell);
  }

  // Hide detail panel when calendar re-renders (employee switch, etc.)
  if (archiveDayDetail) {
    archiveDayDetail.classList.add('hidden');
    archiveDayDetail.closest('.archive-layout')?.classList.remove('has-detail');
  }
}

function showArchiveDayDetail(dateIso, employeeId) {
  if (!archiveDayDetail || !archiveDayDetailBody) return;
  const tasks = tasksForDate(employeeId, dateIso);
  archiveDayDetailLabel.textContent = formatDateForLabel(dateIso);
  archiveDayDetailBody.innerHTML = '';

  if (!tasks.length) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="4">No tasks logged for this day.</td>';
    archiveDayDetailBody.appendChild(row);
  } else {
    tasks.forEach((task) => {
      const row = document.createElement('tr');
      const statusLabel = task.status === 'done' ? 'Completed' : 'In progress';
      row.innerHTML = `
        <td data-label="Task">${escapeHtml(task.task_title)}</td>
        <td data-label="Client">${escapeHtml(task.notes || '--')}</td>
        <td data-label="Description">${escapeHtml(task.description || '--')}</td>
        <td data-label="Status"><span class="chip ${task.status === 'done' ? 'approved-chip' : task.status === 'in_progress' ? 'pending-chip' : ''}">${statusLabel}</span></td>
      `;
      archiveDayDetailBody.appendChild(row);
    });
  }

  archiveDayDetail.classList.remove('hidden');
  archiveDayDetail.closest('.archive-layout')?.classList.add('has-detail');

  // Highlight selected cell
  taskArchiveCalendar.querySelectorAll('.archive-cell').forEach((c) => c.classList.remove('selected-day'));
  const cells = taskArchiveCalendar.querySelectorAll('.archive-cell:not(.spacer-day)');
  const dayNum = parseInt(dateIso.split('-')[2], 10);
  if (cells[dayNum - 1]) cells[dayNum - 1].classList.add('selected-day');
}

async function loadEmployeeDirectoryFromSupabase() {
  if (!state.supabase || !state.isAuthenticated) {
    state.employeeDirectory = [];
    state.inactiveEmployees = [];
    renderPeopleDirectory();
    renderTaskEmployeeFilterOptions();
    renderAllocationEmployeeFilterOptions();
    renderFullAccessUsers();
    renderClientOwnerOptions();
    return;
  }

  const response = await state.supabase
    .from('employees')
    .select(`
      id,
      full_name,
      email,
      is_active,
      capacity_percent,
      employment_type,
      leave_tracking_enabled,
      access_level,
      created_at,
      direct_manager_email,
      date_of_birth,
      current_city,
      department:departments!employees_department_id_fkey (
        id,
        name,
        leave_tracking_enabled
      )
    `)
    .eq('is_active', true)
    .order('full_name', { ascending: true });

  if (response.error) {
    console.error(response.error);
    return;
  }

  state.employeeDirectory = response.data || [];
  state.employeeDirectory.forEach((employee) => upsertEmployeeInStore(employee));

  // Load deactivated employees for leadership reactivation
  if (isLeadershipRole()) {
    const inactiveRes = await state.supabase
      .from('employees')
      .select('id, full_name, email, department:departments!employees_department_id_fkey (name)')
      .eq('is_active', false)
      .order('full_name', { ascending: true });
    state.inactiveEmployees = inactiveRes.data || [];
  } else {
    state.inactiveEmployees = [];
  }

  if (!state.taskViewEmployeeId) {
    state.taskViewEmployeeId = state.currentEmployeeId;
  }

  renderPeopleDirectory();
  renderTaskEmployeeFilterOptions();
  renderAllocationEmployeeFilterOptions();
  renderFullAccessUsers();
  renderClientOwnerOptions();
  loadTeamDashboardFromSupabase().catch((error) => {
    console.error(error);
    setTeamDashboardScopeNote(`Unable to load team dashboard: ${error.message}`, 'status warn');
  });
}

async function loadDailyTasksFromSupabase() {
  if (!state.supabase || !state.isAuthenticated) {
    state.dailyTasks = [];
    renderDailyTaskViews();
    return;
  }

  const response = await state.supabase
    .from('daily_tasks')
    .select('id, employee_id, task_date, task_title, status, notes, description, deadline, created_at, updated_at, sort_order')
    .order('task_date', { ascending: false })
    .order('created_at', { ascending: true });

  if (response.error) {
    console.error(response.error);
    setDailyTaskNotice(`Unable to load tasks: ${response.error.message}`);
    return;
  }

  state.dailyTasks = response.data || [];

  // Daily cleanup: archive done daily tasks + carry forward unfinished (runs once per new day)
  const today = toISODateLocal();
  const lastCleanup = localStorage.getItem('colony_task_cleanup_date');
  if (lastCleanup !== today) {
    // Archive completed daily tasks (tasks with a date — not weekly backlog)
    const dailyDone = state.dailyTasks.filter((t) => t.status === 'done' && t.task_date !== null);
    if (dailyDone.length) {
      const ids = dailyDone.map((t) => t.id);
      const archiveRes = await state.supabase
        .from('daily_tasks')
        .update({ status: 'archived' })
        .in('id', ids);
      if (archiveRes.error) {
        console.error('Auto-archive daily cleanup failed:', archiveRes.error.message);
      } else {
        dailyDone.forEach((t) => { t.status = 'archived'; });
      }
    }
    // Carry forward unfinished tasks (in_progress/todo from previous days → today)
    const carryForward = state.dailyTasks.filter(
      (t) => t.task_date && t.task_date < today && (t.status === 'in_progress' || t.status === 'todo')
    );
    if (carryForward.length) {
      const ids = carryForward.map((t) => t.id);
      const carryRes = await state.supabase
        .from('daily_tasks')
        .update({ task_date: today })
        .in('id', ids);
      if (carryRes.error) {
        console.error('Task carry-forward failed:', carryRes.error.message);
      } else {
        carryForward.forEach((t) => { t.task_date = today; });
      }
    }
    localStorage.setItem('colony_task_cleanup_date', today);
  }

  // Weekly cleanup: archive ALL done weekly backlog tasks on Monday (fresh start each week)
  // On other days, keep them visible for the rest of the week
  const thisWeekStart = getCurrentWeekStartIso();
  const dayOfWeek = new Date().getDay(); // 0=Sun, 1=Mon
  const weeklyDone = state.dailyTasks.filter((t) => {
    if (t.status !== 'done' || t.task_date !== null) return false;
    // On Monday (or if cleanup hasn't run this week), archive all done weekly tasks
    if (dayOfWeek === 1) return true;
    // Other days: only archive tasks completed before this week started
    const ts = (t.updated_at || t.created_at || '').slice(0, 10);
    return ts && ts < thisWeekStart;
  });
  if (weeklyDone.length) {
    const ids = weeklyDone.map((t) => t.id);
    const archiveRes = await state.supabase
      .from('daily_tasks')
      .update({ status: 'archived' })
      .in('id', ids);
    if (archiveRes.error) {
      console.error('Auto-archive weekly cleanup failed:', archiveRes.error.message);
    } else {
      weeklyDone.forEach((t) => { t.status = 'archived'; });
    }
  }

  renderTaskClientOptions();
  renderDailyTaskViews();
}

function renderWeeklyPlannerTable() {
  if (!weeklyPlannerTableBody) return;
  const taskEmployeeId = getTaskViewEmployeeId();
  const rows = taskEmployeeId ? tasksForWeeklyBacklog(taskEmployeeId).sort((a, b) => {
    if ((a.status === 'done') !== (b.status === 'done')) return (a.status === 'done') - (b.status === 'done');
    const aPri = a.sort_order || 0;
    const bPri = b.sort_order || 0;
    if (aPri && bPri) return aPri - bPri;
    if (aPri) return -1;
    if (bPri) return 1;
    return new Date(b.created_at) - new Date(a.created_at);
  }) : [];
  const showActionColumn = canManageTaskView(taskEmployeeId);

  if (weeklyTaskActionHeader) {
    weeklyTaskActionHeader.classList.toggle('hidden', !showActionColumn);
  }

  weeklyPlannerTableBody.innerHTML = '';
  if (!rows.length) {
    const row = document.createElement('tr');
    row.innerHTML = `<td colspan="${showActionColumn ? 6 : 5}">No tasks in the weekly planner. Add tasks below.</td>`;
    weeklyPlannerTableBody.appendChild(row);
    return;
  }

  rows.forEach((task) => {
    const canManage = canManageTask(task);
    const row = document.createElement('tr');
    if (task.status === 'done') row.classList.add('task-done');
    const priorityVal = task.sort_order || '';
    const priorityCell = canManage
      ? `<td data-label="Priority"><select class="priority-input" data-task-id="${task.id}"><option value="0">\u2013</option>${[1,2,3,4,5,6,7,8,9,10].map(n => `<option value="${n}"${priorityVal === n ? ' selected' : ''}>${n}</option>`).join('')}</select></td>`
      : `<td data-label="Priority">${priorityVal || '\u2013'}</td>`;
    const actionCell = canManage
      ? `
        <td data-label="Actions">
          <button class="ghost small" data-task-action="edit" data-task-id="${task.id}">Edit</button>
          <button class="ghost small" data-task-action="promote" data-task-id="${task.id}">\u2192 Today</button>
          <button class="ghost small danger-text" data-task-action="delete" data-task-id="${task.id}">Delete</button>
        </td>
      `
      : '';
    row.innerHTML = `
      ${priorityCell}
      <td data-label="Task">${escapeHtml(task.task_title)}</td>
      <td data-label="Client">${escapeHtml(task.notes || '--')}</td>
      <td data-label="Description">${escapeHtml(task.description || '--')}</td>
      <td data-label="Status">
        <select class="status-select" data-task-id="${task.id}">
          <option value="in_progress"${task.status !== 'done' ? ' selected' : ''}>In progress</option>
          <option value="done"${task.status === 'done' ? ' selected' : ''}>Completed</option>
        </select>
      </td>
      ${actionCell}
    `;
    weeklyPlannerTableBody.appendChild(row);
  });
}

function renderDailyTaskViews() {
  renderDailyTaskTable();
  renderWeeklyPlannerTable();
  renderTaskArchiveCalendar();
  renderProfileDailyTasks();
}

async function addTask(targetDate = null) {
  const title = String(newTaskTitleInput?.value || '').trim();
  const client = String(newTaskClientSelect?.value || '').trim();
  const normalizedClient = normalizeClientNameKey(client);
  if (!title) {
    setDailyTaskNotice('Enter a task title first.');
    return;
  }
  if (title.length > 25) {
    setDailyTaskNotice('Task title must be 25 characters or less.');
    return;
  }
  if (!client) {
    setDailyTaskNotice('Select a client first.');
    return;
  }
  if (!normalizedClient || normalizedClient === 'internal') {
    setDailyTaskNotice('Select a valid client before saving.');
    return;
  }

  const description = String(newTaskDescriptionInput?.value || '').trim() || null;
  if (description && description.length > 50) {
    setDailyTaskNotice('Description must be 50 characters or less.');
    return;
  }
  const deadline = newTaskDeadlineInput?.value || null;
  const noticeTarget = targetDate ? 'Today' : 'Weekly Planner';

  if (!state.supabase || !state.isAuthenticated) {
    const localTask = {
      id: `local-${Date.now()}`,
      employee_id: getTaskViewEmployeeId() || state.currentEmployeeId,
      task_date: targetDate,
      task_title: title,
      status: 'in_progress',
      notes: client,
      description,
      deadline,
      sort_order: 0,
      created_at: new Date().toISOString()
    };
    state.dailyTasks.push(localTask);
    if (newTaskTitleInput) newTaskTitleInput.value = '';
    if (newTaskClientSelect) newTaskClientSelect.value = '';
    if (newTaskDescriptionInput) newTaskDescriptionInput.value = '';
    if (newTaskDeadlineInput) newTaskDeadlineInput.value = '';
    setDailyTaskNotice('');
    renderDailyTaskViews();
    return;
  }

  if (isLeadershipRole()) {
    const targetEmployeeId = getTaskViewEmployeeId() || state.currentEmployeeId;
    const insertResult = await state.supabase.from('daily_tasks').insert({
      employee_id: targetEmployeeId,
      task_date: targetDate,
      task_title: title,
      status: 'in_progress',
      notes: client,
      description,
      deadline,
      sort_order: 0
    });

    if (insertResult.error) {
      setDailyTaskNotice(`Task add failed: ${insertResult.error.message}`);
      return;
    }
  } else {
    const createResult = await state.supabase.rpc('create_daily_task', {
      p_task_date: targetDate,
      p_task_title: title,
      p_notes: client,
      p_status: 'in_progress',
      p_description: description,
      p_deadline: deadline
    });

    if (createResult.error) {
      setDailyTaskNotice(`Task add failed: ${createResult.error.message}`);
      return;
    }
  }

  if (newTaskTitleInput) newTaskTitleInput.value = '';
  if (newTaskClientSelect) newTaskClientSelect.value = '';
  if (newTaskDescriptionInput) newTaskDescriptionInput.value = '';
  if (newTaskDeadlineInput) newTaskDeadlineInput.value = '';
  setDailyTaskNotice('');
  await loadDailyTasksFromSupabase();
}

async function deleteTaskById(taskId) {
  if (!taskId) return;
  const task = state.dailyTasks.find((item) => item.id === taskId) || null;
  if (!canManageTask(task)) return;
  const isWeekly = task.task_date === null;
  const confirmMsg = isWeekly
    ? 'Delete this task from the weekly planner? Daily copies already promoted will not be affected.'
    : 'Delete this task from today? The weekly copy is not affected.';
  if (!window.confirm(confirmMsg)) return;

  if (!state.supabase || !state.isAuthenticated) {
    state.dailyTasks = state.dailyTasks.filter((t) => t.id !== taskId);
    renderDailyTaskViews();
    setDailyTaskNotice('Task deleted.');
    return;
  }

  let deleteQuery = state.supabase.from('daily_tasks').delete().eq('id', taskId);
  if (!isLeadershipRole()) {
    deleteQuery = deleteQuery.eq('employee_id', state.currentEmployeeId);
  }
  const result = await deleteQuery;
  if (result.error) {
    setDailyTaskNotice(`Unable to delete task: ${result.error.message}`);
    return;
  }

  setDailyTaskNotice('Task deleted.');
  await loadDailyTasksFromSupabase();
}

async function promoteTaskToToday(taskId) {
  if (!taskId) return;
  const task = state.dailyTasks.find((item) => item.id === taskId) || null;
  if (!canManageTask(task)) return;

  const todayIso = toISODateLocal();

  // Prevent duplicate copies
  const alreadyCopied = state.dailyTasks.some(
    (t) =>
      t.task_title === task.task_title &&
      t.employee_id === task.employee_id &&
      t.task_date === todayIso &&
      t.status !== 'archived'
  );
  if (alreadyCopied) {
    setDailyTaskNotice('This task is already on today\u2019s list.');
    return;
  }

  const copyData = {
    employee_id: task.employee_id,
    task_date: todayIso,
    task_title: task.task_title,
    status: 'in_progress',
    notes: task.notes || null,
    description: task.description || null,
    deadline: task.deadline || null
  };

  if (!state.supabase || !state.isAuthenticated) {
    state.dailyTasks.push({ ...copyData, id: `local-${Date.now()}` });
    renderDailyTaskViews();
    setDailyTaskNotice('Task copied to Today.');
    return;
  }

  if (isLeadershipRole()) {
    const insertResult = await state.supabase.from('daily_tasks').insert(copyData);
    if (insertResult.error) {
      setDailyTaskNotice(`Unable to copy task: ${insertResult.error.message}`);
      return;
    }
  } else {
    const createResult = await state.supabase.rpc('create_daily_task', {
      p_task_date: todayIso,
      p_task_title: task.task_title,
      p_notes: task.notes || null,
      p_status: 'in_progress',
      p_description: task.description || null,
      p_deadline: task.deadline || null
    });
    if (createResult.error) {
      setDailyTaskNotice(`Unable to copy task: ${createResult.error.message}`);
      return;
    }
  }

  setDailyTaskNotice('Task copied to Today.');
  await loadDailyTasksFromSupabase();
}

async function demoteTaskToWeekly(taskId) {
  if (!taskId) return;
  const task = state.dailyTasks.find((item) => item.id === taskId) || null;
  if (!canManageTask(task) || task.task_date === null) return;

  if (!state.supabase || !state.isAuthenticated) {
    state.dailyTasks = state.dailyTasks.filter((t) => t.id !== taskId);
    renderDailyTaskViews();
    setDailyTaskNotice('Removed from today. Task stays in Weekly Planner.');
    return;
  }

  let deleteQuery = state.supabase.from('daily_tasks').delete().eq('id', taskId);
  if (!isLeadershipRole()) {
    deleteQuery = deleteQuery.eq('employee_id', state.currentEmployeeId);
  }
  const result = await deleteQuery;
  if (result.error) {
    setDailyTaskNotice(`Unable to remove from today: ${result.error.message}`);
    return;
  }

  setDailyTaskNotice('Removed from today. Task stays in Weekly Planner.');
  await loadDailyTasksFromSupabase();
}

async function updateTaskStatus(taskId, newStatus) {
  const task = state.dailyTasks.find((t) => t.id === taskId);
  if (!task || !canManageTask(task)) return;
  if (task.status === 'archived') return;

  // Lock previous days — only today's tasks can change status
  if (task.task_date !== null && task.task_date !== toISODateLocal()) return;

  if (!state.supabase || !state.isAuthenticated) {
    task.status = newStatus;
    if (newStatus === 'done') {
      handleDoneCascadeLocal(task);
    } else {
      syncLinkedTaskStatusLocal(task, newStatus);
    }
    renderDailyTaskViews();
    return;
  }

  let updateQuery = state.supabase.from('daily_tasks').update({ status: newStatus }).eq('id', taskId);
  if (!isLeadershipRole()) {
    updateQuery = updateQuery.eq('employee_id', state.currentEmployeeId);
  }
  const result = await updateQuery;

  if (result.error) {
    setDailyTaskNotice(`Status update failed: ${result.error.message}`);
    renderDailyTaskViews();
    return;
  }

  task.status = newStatus;

  if (newStatus === 'done') {
    await handleDoneCascade(task);
  } else {
    await syncLinkedTaskStatus(task, newStatus);
  }

  renderDailyTaskViews();
}

function handleDoneCascadeLocal(task) {
  const isDaily = task.task_date !== null;
  if (isDaily) {
    // Daily done → also mark matching weekly original as done
    const weeklyOriginal = state.dailyTasks.find(
      (t) =>
        t.task_title === task.task_title &&
        t.employee_id === task.employee_id &&
        t.task_date === null &&
        t.status !== 'archived' && t.status !== 'done' &&
        t.id !== task.id
    );
    if (weeklyOriginal) weeklyOriginal.status = 'done';
  } else {
    // Weekly done → also mark ALL matching daily copies as done (any date)
    state.dailyTasks.filter(
      (t) =>
        t.task_title === task.task_title &&
        t.employee_id === task.employee_id &&
        t.task_date !== null &&
        t.status !== 'archived' && t.status !== 'done' &&
        t.id !== task.id
    ).forEach((daily) => { daily.status = 'done'; });
  }
}

async function handleDoneCascade(task) {
  const isDaily = task.task_date !== null;
  if (isDaily) {
    // Daily done → also mark matching weekly original as done
    const weeklyOriginal = state.dailyTasks.find(
      (t) =>
        t.task_title === task.task_title &&
        t.employee_id === task.employee_id &&
        t.task_date === null &&
        t.status !== 'archived' && t.status !== 'done' &&
        t.id !== task.id
    );
    if (weeklyOriginal) {
      let cascadeQuery = state.supabase
        .from('daily_tasks')
        .update({ status: 'done' })
        .eq('id', weeklyOriginal.id);
      if (!isLeadershipRole()) {
        cascadeQuery = cascadeQuery.eq('employee_id', state.currentEmployeeId);
      }
      const cascadeResult = await cascadeQuery;
      if (!cascadeResult.error) {
        weeklyOriginal.status = 'done';
      }
    }
  } else {
    // Weekly done → also mark ALL matching daily copies as done (any date)
    const dailyCopies = state.dailyTasks.filter(
      (t) =>
        t.task_title === task.task_title &&
        t.employee_id === task.employee_id &&
        t.task_date !== null &&
        t.status !== 'archived' && t.status !== 'done' &&
        t.id !== task.id
    );
    for (const daily of dailyCopies) {
      let dq = state.supabase.from('daily_tasks').update({ status: 'done' }).eq('id', daily.id);
      if (!isLeadershipRole()) dq = dq.eq('employee_id', state.currentEmployeeId);
      const dr = await dq;
      if (!dr.error) daily.status = 'done';
    }
  }
}

function syncLinkedTaskStatusLocal(task, newStatus) {
  const isDaily = task.task_date !== null;
  if (isDaily) {
    // Daily status change → sync to matching weekly task
    const weekly = state.dailyTasks.find(
      (t) =>
        t.task_title === task.task_title &&
        t.employee_id === task.employee_id &&
        t.task_date === null &&
        t.status !== 'archived' &&
        t.id !== task.id
    );
    if (weekly) weekly.status = newStatus;
  } else {
    // Weekly status change → sync to ALL matching daily copies (any date)
    state.dailyTasks.filter(
      (t) =>
        t.task_title === task.task_title &&
        t.employee_id === task.employee_id &&
        t.task_date !== null &&
        t.status !== 'archived' &&
        t.id !== task.id
    ).forEach((daily) => { daily.status = newStatus; });
  }
}

async function syncLinkedTaskStatus(task, newStatus) {
  const isDaily = task.task_date !== null;
  if (isDaily) {
    // Daily status change → sync to matching weekly task
    const weekly = state.dailyTasks.find(
      (t) =>
        t.task_title === task.task_title &&
        t.employee_id === task.employee_id &&
        t.task_date === null &&
        t.status !== 'archived' &&
        t.id !== task.id
    );
    if (weekly) {
      let q = state.supabase.from('daily_tasks').update({ status: newStatus }).eq('id', weekly.id);
      if (!isLeadershipRole()) q = q.eq('employee_id', state.currentEmployeeId);
      const res = await q;
      if (!res.error) weekly.status = newStatus;
    }
  } else {
    // Weekly status change → sync to ALL matching daily copies (any date)
    const dailyCopies = state.dailyTasks.filter(
      (t) =>
        t.task_title === task.task_title &&
        t.employee_id === task.employee_id &&
        t.task_date !== null &&
        t.status !== 'archived' &&
        t.id !== task.id
    );
    for (const daily of dailyCopies) {
      let q = state.supabase.from('daily_tasks').update({ status: newStatus }).eq('id', daily.id);
      if (!isLeadershipRole()) q = q.eq('employee_id', state.currentEmployeeId);
      const res = await q;
      if (!res.error) daily.status = newStatus;
    }
  }
}

function editTaskById(taskId) {
  const task = state.dailyTasks.find((item) => item.id === taskId) || null;
  if (!task || !canManageTask(task)) return;

  const row = document.querySelector(`[data-task-action="edit"][data-task-id="${taskId}"]`)?.closest('tr');
  if (!row) return;

  const clientOptions = taskClientNamesFromState()
    .map(n => `<option value="${escapeHtml(n)}"${n === task.notes ? ' selected' : ''}>${escapeHtml(n)}</option>`)
    .join('');

  row.innerHTML = `
    <td data-label="Priority"><select class="priority-input" data-task-id="${task.id}"><option value="0">\u2013</option>${[1,2,3,4,5,6,7,8,9,10].map(n => `<option value="${n}"${(task.sort_order || 0) === n ? ' selected' : ''}>${n}</option>`).join('')}</select></td>
    <td><input type="text" class="edit-task-title" value="${escapeHtml(task.task_title || '')}" maxlength="25" /></td>
    <td><select class="edit-task-client"><option value="">Select client</option>${clientOptions}</select></td>
    <td><input type="text" class="edit-task-desc" value="${escapeHtml(task.description || '')}" placeholder="Optional" maxlength="50" /></td>
    <td>
      <select class="status-select" data-task-id="${task.id}">
        <option value="in_progress"${task.status !== 'done' ? ' selected' : ''}>In progress</option>
        <option value="done"${task.status === 'done' ? ' selected' : ''}>Completed</option>
      </select>
    </td>
    <td>
      <button class="ghost small" data-task-action="save-edit" data-task-id="${task.id}">Save</button>
      <button class="ghost small" data-task-action="cancel-edit" data-task-id="${task.id}">Cancel</button>
    </td>
  `;

  row.querySelector('.edit-task-title')?.focus();
}

async function saveTaskEdit(taskId) {
  const task = state.dailyTasks.find((item) => item.id === taskId) || null;
  if (!task) return;

  const row = document.querySelector(`[data-task-action="save-edit"][data-task-id="${taskId}"]`)?.closest('tr');
  if (!row) return;

  const nextTitle = String(row.querySelector('.edit-task-title')?.value || '').trim();
  const nextClient = String(row.querySelector('.edit-task-client')?.value || '').trim();
  const nextDescription = String(row.querySelector('.edit-task-desc')?.value || '').trim() || null;

  if (!nextTitle) { setDailyTaskNotice('Task title cannot be empty.'); return; }
  if (nextTitle.length > 25) { setDailyTaskNotice('Task title must be 25 characters or less.'); return; }
  if (!nextClient) { setDailyTaskNotice('Client cannot be empty.'); return; }
  if (nextDescription && nextDescription.length > 50) { setDailyTaskNotice('Description must be 50 characters or less.'); return; }

  const updates = { task_title: nextTitle, notes: nextClient, description: nextDescription };

  if (!state.supabase || !state.isAuthenticated) {
    Object.assign(task, updates);
    renderDailyTaskViews();
    setDailyTaskNotice('Task updated locally.');
    return;
  }

  let updateQuery = state.supabase.from('daily_tasks').update(updates).eq('id', taskId);
  if (!isLeadershipRole()) {
    updateQuery = updateQuery.eq('employee_id', state.currentEmployeeId);
  }
  const result = await updateQuery;
  if (result.error) {
    setDailyTaskNotice(`Task update failed: ${result.error.message}`);
    return;
  }

  Object.assign(task, updates);
  renderDailyTaskViews();
  setDailyTaskNotice('Task updated.');
}

function syncTaskManagerUi() {
  const managerMode = isLeadershipRole();
  taskEmployeeFilterWrap?.classList.toggle('hidden', !managerMode);
  renderDailyTaskViews();
}

if (taskEmployeeFilter) {
  taskEmployeeFilter.addEventListener('change', () => {
    state.taskViewEmployeeId = taskEmployeeFilter.value || null;
    renderDailyTaskViews();
  });
}

if (archiveDayDetailClose) {
  archiveDayDetailClose.addEventListener('click', () => {
    archiveDayDetail?.classList.add('hidden');
    archiveDayDetail?.closest('.archive-layout')?.classList.remove('has-detail');
    taskArchiveCalendar?.querySelectorAll('.archive-cell').forEach((c) => c.classList.remove('selected-day'));
  });
}

if (addWeeklyTaskBtn) {
  addWeeklyTaskBtn.addEventListener('click', () => {
    addTask(null).catch((error) => {
      console.error(error);
      setDailyTaskNotice(`Task add failed: ${error.message}`);
    });
  });
}


function handleTaskTableClick(event) {
  const actionBtn = event.target.closest('button[data-task-action]');
  if (!actionBtn) return;

  const action = actionBtn.dataset.taskAction;
  const taskId = actionBtn.dataset.taskId;

  if (action === 'delete') {
    deleteTaskById(taskId).catch((error) => {
      console.error(error);
      setDailyTaskNotice(`Unable to delete task: ${error.message}`);
    });
    return;
  }

  if (action === 'promote') {
    promoteTaskToToday(taskId).catch((error) => {
      console.error(error);
      setDailyTaskNotice(`Unable to copy task: ${error.message}`);
    });
    return;
  }

  if (action === 'demote') {
    demoteTaskToWeekly(taskId).catch((error) => {
      console.error(error);
      setDailyTaskNotice(`Unable to remove from today: ${error.message}`);
    });
    return;
  }

  if (action === 'edit') {
    editTaskById(taskId);
    return;
  }

  if (action === 'save-edit') {
    saveTaskEdit(taskId).catch((error) => {
      console.error(error);
      setDailyTaskNotice(`Unable to save task: ${error.message}`);
    });
    return;
  }

  if (action === 'cancel-edit') {
    renderDailyTaskViews();
  }
}

async function updateTaskSortOrder(taskId, newOrder) {
  const task = state.dailyTasks.find((t) => t.id === taskId);
  if (!task) return;

  task.sort_order = newOrder;

  if (state.supabase && state.isAuthenticated) {
    const result = await state.supabase
      .from('daily_tasks')
      .update({ sort_order: newOrder })
      .eq('id', taskId);
    if (result.error) {
      console.error('Priority update failed:', result.error.message);
      setDailyTaskNotice(`Priority update failed: ${result.error.message}`);
      return;
    }
  }

  renderDailyTaskViews();
}

function handleTaskTableChange(event) {
  const select = event.target.closest('select.status-select');
  if (select) {
    const taskId = select.dataset.taskId;
    const newStatus = select.value;
    updateTaskStatus(taskId, newStatus).catch((error) => {
      console.error(error);
      setDailyTaskNotice(`Status update failed: ${error.message}`);
    });
    return;
  }

  const priorityInput = event.target.closest('select.priority-input');
  if (priorityInput) {
    const taskId = priorityInput.dataset.taskId;
    const newOrder = parseInt(priorityInput.value, 10) || 0;
    updateTaskSortOrder(taskId, newOrder).catch((error) => {
      console.error(error);
      setDailyTaskNotice(`Priority update failed: ${error.message}`);
    });
  }
}

if (dailyTaskTableBody) {
  dailyTaskTableBody.addEventListener('click', handleTaskTableClick);
  dailyTaskTableBody.addEventListener('change', handleTaskTableChange);
}
if (weeklyPlannerTableBody) {
  weeklyPlannerTableBody.addEventListener('click', handleTaskTableClick);
  weeklyPlannerTableBody.addEventListener('change', handleTaskTableChange);
}

/* ── Feature Requests ── */

function setFeatureRequestNotice(message = '') {
  if (!featureRequestNotice) return;
  featureRequestNotice.textContent = message;
}

async function loadFeatureRequestsFromSupabase() {
  if (!state.supabase || !state.isAuthenticated) {
    state.featureRequests = [];
    renderFeatureRequests();
    return;
  }

  const response = await state.supabase
    .from('feature_requests')
    .select('id, employee_id, request_text, request_type, status, created_at, updated_at, links, attachments, employee:employees!feature_requests_employee_id_fkey(full_name)')
    .order('created_at', { ascending: true });

  if (response.error) {
    console.error(response.error);
    setFeatureRequestNotice(`Unable to load feature requests: ${response.error.message}`);
    return;
  }

  const requests = (response.data || []).map(r => ({
    ...r,
    author_name: r.employee?.full_name || 'Unknown',
    replies: []
  }));

  // Batch-load all replies
  const repliesRes = await state.supabase
    .from('feature_request_replies')
    .select('id, feature_request_id, employee_id, reply_text, created_at, attachments, employee:employees!feature_request_replies_employee_id_fkey(full_name)')
    .order('created_at', { ascending: true });

  if (!repliesRes.error && repliesRes.data) {
    const byFr = {};
    for (const r of repliesRes.data) {
      const frId = r.feature_request_id;
      if (!byFr[frId]) byFr[frId] = [];
      byFr[frId].push({ ...r, author_name: r.employee?.full_name || 'Unknown' });
    }
    for (const req of requests) {
      req.replies = byFr[req.id] || [];
    }
  }

  // Batch-load all upvotes
  const upvotesRes = await state.supabase
    .from('feature_request_upvotes')
    .select('feature_request_id, employee_id');

  if (!upvotesRes.error && upvotesRes.data) {
    const byFr = {};
    for (const u of upvotesRes.data) {
      const frId = u.feature_request_id;
      if (!byFr[frId]) byFr[frId] = [];
      byFr[frId].push(u.employee_id);
    }
    for (const req of requests) {
      req.upvote_employee_ids = byFr[req.id] || [];
    }
  }

  // Sort by upvote count (most popular first), then by created_at
  requests.sort((a, b) => {
    const diff = (b.upvote_employee_ids?.length || 0) - (a.upvote_employee_ids?.length || 0);
    return diff !== 0 ? diff : new Date(a.created_at) - new Date(b.created_at);
  });

  state.featureRequests = requests;
  renderFeatureRequests();
}

function renderFeatureRequests() {
  if (!featureRequestThread) return;

  const activeRequests = state.featureRequests.filter(fr => fr.status !== 'done' && fr.status !== 'archived');
  const doneRequests = state.featureRequests.filter(fr => fr.status === 'done');
  const archivedRequests = state.featureRequests.filter(fr => fr.status === 'archived');

  // Render completed section — split into Features and Bugs
  if (frCompletedList) {
    if (!doneRequests.length) {
      frCompletedList.innerHTML = '<p class="mini-meta">No completed requests yet.</p>';
    } else {
      const doneFeatures = doneRequests.filter(fr => fr.request_type !== 'bug');
      const doneBugs = doneRequests.filter(fr => fr.request_type === 'bug');

      const renderCompletedItem = (fr) => {
        const ts = new Date(fr.updated_at || fr.created_at);
        const dateStr = ts.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
        const isBug = fr.request_type === 'bug';
        const isOwner = fr.employee_id === state.currentEmployeeId;
        const reopenBtn = (isBug && (isOwner || isSuperadminUser()))
          ? ` <button class="ghost small" data-fr-action="reopen" data-fr-id="${fr.id}">Re-open</button>`
          : '';
        return `<div class="fr-completed-item">
          <div class="fr-completed-text">${escapeHtml(fr.request_text)}</div>
          <div class="fr-completed-meta">by ${escapeHtml(fr.author_name)} · completed ${dateStr}${reopenBtn}</div>
        </div>`;
      };

      const featuresHtml = doneFeatures.length
        ? doneFeatures.map(renderCompletedItem).join('')
        : '<p class="mini-meta">No completed features yet.</p>';
      const bugsHtml = doneBugs.length
        ? doneBugs.map(renderCompletedItem).join('')
        : '<p class="mini-meta">No resolved bugs yet.</p>';

      frCompletedList.innerHTML = `
        <div class="fr-completed-columns">
          <div class="fr-completed-column">
            <h4 class="fr-completed-section-label">Features</h4>
            ${featuresHtml}
          </div>
          <div class="fr-completed-column">
            <h4 class="fr-completed-section-label">Bugs</h4>
            ${bugsHtml}
          </div>
        </div>`;
    }
  }

  // Render archived section (collapsed by default)
  const frArchivedPanel = document.getElementById('frArchivedPanel');
  if (frArchivedPanel) {
    if (!archivedRequests.length) {
      frArchivedPanel.style.display = 'none';
    } else {
      frArchivedPanel.style.display = '';
      const archivedList = document.getElementById('frArchivedList');
      if (archivedList) {
        const isSA = isSuperadminUser();
        archivedList.innerHTML = archivedRequests.map(fr => {
          const ts = new Date(fr.updated_at || fr.created_at);
          const dateStr = ts.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
          const isBug = fr.request_type === 'bug';
          const typeChip = isBug
            ? '<span class="fr-type-chip fr-type-bug">Bug</span>'
            : '<span class="fr-type-chip fr-type-feature">Feature</span>';
          const restoreBtn = isSA
            ? ` <button class="ghost small" data-fr-action="unarchive" data-fr-id="${fr.id}">Restore</button>`
            : '';
          return `<div class="fr-completed-item">
            <div class="fr-completed-text">${typeChip} ${escapeHtml(fr.request_text)}</div>
            <div class="fr-completed-meta">by ${escapeHtml(fr.author_name)} · archived ${dateStr}${restoreBtn}</div>
          </div>`;
        }).join('');
      }
    }
  }

  if (!activeRequests.length) {
    featureRequestThread.innerHTML = '<p class="mini-meta">No open bugs or feature requests. Be the first!</p>';
    return;
  }

  const featureItems = activeRequests.filter(fr => fr.request_type !== 'bug');
  const bugItems = activeRequests.filter(fr => fr.request_type === 'bug');

  const isSuperAdmin = isSuperadminUser();
  const myId = state.currentEmployeeId;

  const renderCard = (fr) => {
    const ts = new Date(fr.created_at);
    const timeStr = ts.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      + ' · ' + ts.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

    const statusLabel = fr.status === 'in_progress' ? 'In Progress'
      : fr.status === 'done' ? 'Done' : 'Requested';
    const statusClass = fr.status === 'in_progress' ? 'in-progress'
      : fr.status === 'done' ? 'done' : 'requested';

    const canEdit = fr.employee_id === myId && fr.status === 'requested';

    let statusHtml;
    if (isSuperAdmin) {
      statusHtml = `<select class="fr-status-select" data-fr-id="${fr.id}">
        <option value="requested"${fr.status === 'requested' ? ' selected' : ''}>Requested</option>
        <option value="in_progress"${fr.status === 'in_progress' ? ' selected' : ''}>In Progress</option>
        <option value="done"${fr.status === 'done' ? ' selected' : ''}>Done</option>
      </select>`;
    } else {
      statusHtml = `<span class="fr-status ${statusClass}">${statusLabel}</span>`;
    }

    const editBtn = canEdit
      ? ` <button class="ghost small" data-fr-action="edit" data-fr-id="${fr.id}">Edit</button>`
      : '';
    const deleteBtn = canEdit
      ? ` <button class="ghost small danger-text" data-fr-action="delete" data-fr-id="${fr.id}">Delete</button>`
      : '';

    const upvoteIds = fr.upvote_employee_ids || [];
    const upvoteCount = upvoteIds.length;
    const hasUpvoted = upvoteIds.includes(myId);
    const upvoteBtn = `<button class="fr-upvote${hasUpvoted ? ' upvoted' : ''}" data-fr-action="upvote" data-fr-id="${fr.id}">\u25B2 ${upvoteCount}</button>`;

    // Replies
    const replies = fr.replies || [];
    const VISIBLE_COUNT = 2;
    const hasHidden = replies.length > VISIBLE_COUNT;
    const hiddenCount = replies.length - VISIBLE_COUNT;

    const renderReply = (reply) => {
      const rts = new Date(reply.created_at);
      const rTimeStr = rts.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
        + ' · ' + rts.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      const replyAttach = (reply.attachments || []).length ? `<div class="fr-attachments">${(reply.attachments || []).map(a =>
        `<a href="#" class="fr-attachment-thumb" data-storage-path="${escapeHtml(a.path)}" title="${escapeHtml(a.name)}"><img class="fr-thumb-img" data-storage-path="${escapeHtml(a.path)}" alt="${escapeHtml(a.name)}"></a>`
      ).join('')}</div>` : '';
      return `<div class="fr-reply" data-reply-id="${reply.id}">
        <div class="fr-reply-head">
          <strong>${escapeHtml(reply.author_name)}</strong>
          <span>${rTimeStr}</span>
        </div>
        <div class="fr-reply-body">${escapeHtml(reply.reply_text).replace(/\n/g, '<br>')}</div>
        ${replyAttach}
      </div>`;
    };

    let repliesHtml = '';
    if (replies.length) {
      const visibleReplies = hasHidden ? replies.slice(-VISIBLE_COUNT) : replies;
      const hiddenReplies = hasHidden ? replies.slice(0, -VISIBLE_COUNT) : [];

      repliesHtml = `<div class="fr-replies">`;
      if (hasHidden) {
        repliesHtml += `<div class="fr-reply-toggle" data-fr-action="toggle-replies" data-fr-id="${fr.id}">Show ${hiddenCount} earlier ${hiddenCount === 1 ? 'reply' : 'replies'}</div>`;
        repliesHtml += `<div class="fr-replies-hidden" data-fr-id="${fr.id}" style="display:none;flex-direction:column;gap:8px;">${hiddenReplies.map(renderReply).join('')}</div>`;
      }
      repliesHtml += visibleReplies.map(renderReply).join('');
      repliesHtml += `</div>`;
    }

    const replyForm = `<div class="fr-reply-form">
      <textarea class="fr-reply-input" data-fr-id="${fr.id}" rows="1" placeholder="Reply..."></textarea>
      <label class="fr-attach-label"><input type="file" class="fr-reply-file-input" data-fr-id="${fr.id}" accept="image/*" multiple hidden><span class="ghost small fr-attach-btn">📎</span></label>
      <button class="ghost small" data-fr-action="submit-reply" data-fr-id="${fr.id}">Reply</button>
    </div>
    <div class="fr-reply-pending fr-pending-files" data-fr-id="${fr.id}"></div>`;

    const isBug = fr.request_type === 'bug';
    let typeChipHtml;
    if (isSuperAdmin) {
      typeChipHtml = `<select class="fr-type-select" data-fr-id="${fr.id}">
        <option value="feature"${!isBug ? ' selected' : ''}>Feature</option>
        <option value="bug"${isBug ? ' selected' : ''}>Bug</option>
      </select>`;
    } else {
      typeChipHtml = isBug
        ? '<span class="fr-type-chip fr-type-bug">Bug</span>'
        : '<span class="fr-type-chip fr-type-feature">Feature</span>';
    }

    const archiveBtn = isSuperAdmin
      ? ` <button class="ghost small" data-fr-action="archive" data-fr-id="${fr.id}">Archive</button>`
      : '';

    // Links display
    const frLinks = fr.links || [];
    const linksHtml = frLinks.length ? `<div class="fr-links">${frLinks.map(url => {
      let label;
      try { label = new URL(url).hostname.replace('www.',''); } catch { label = 'link'; }
      return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="fr-link-pill">${escapeHtml(label)}</a>`;
    }).join('')}</div>` : '';

    // Attachments display
    const frAttachments = fr.attachments || [];
    const attachHtml = frAttachments.length ? `<div class="fr-attachments">${frAttachments.map(a =>
      `<a href="#" class="fr-attachment-thumb" data-storage-path="${escapeHtml(a.path)}" title="${escapeHtml(a.name)}"><img class="fr-thumb-img" data-storage-path="${escapeHtml(a.path)}" alt="${escapeHtml(a.name)}"></a>`
    ).join('')}</div>` : '';

    return `<div class="fr-card ${isBug ? 'fr-card-bug' : ''}" data-fr-id="${fr.id}">
      <div class="fr-card-head">
        ${typeChipHtml}
        <strong>${escapeHtml(fr.author_name)}</strong>
        <span class="mini-meta">${timeStr}</span>
      </div>
      <div class="fr-card-body">${escapeHtml(fr.request_text).replace(/\n/g, '<br>')}</div>
      ${linksHtml}
      ${attachHtml}
      <div class="fr-card-foot">
        ${upvoteBtn} ${statusHtml}${editBtn}${deleteBtn}${archiveBtn}
      </div>
      ${repliesHtml}
      ${replyForm}
    </div>`;
  };

  const featureHtml = featureItems.length
    ? featureItems.map(renderCard).join('')
    : '<p class="mini-meta">No feature requests yet.</p>';
  const bugHtml = bugItems.length
    ? bugItems.map(renderCard).join('')
    : '<p class="mini-meta">No bug reports yet.</p>';

  featureRequestThread.innerHTML = `
    <div class="fr-columns">
      <div class="fr-column">${featureHtml}</div>
      <div class="fr-column">${bugHtml}</div>
    </div>`;

  loadFeatureAttachmentThumbs();
}

async function loadFeatureAttachmentThumbs() {
  if (!state.supabase) return;
  const imgs = document.querySelectorAll('.fr-thumb-img[data-storage-path]');
  if (!imgs.length) return;
  // Batch-load signed URLs for all attachment thumbnails
  const paths = [...new Set([...imgs].map(img => img.dataset.storagePath))];
  const urlMap = {};
  for (const p of paths) {
    const { data } = await state.supabase.storage.from('feature-attachments').createSignedUrl(p, 3600);
    if (data?.signedUrl) urlMap[p] = data.signedUrl;
  }
  imgs.forEach(img => {
    const url = urlMap[img.dataset.storagePath];
    if (url) img.src = url;
  });
}

async function uploadFeatureAttachments(files) {
  if (!state.supabase || !files.length) return [];
  const empId = state.currentEmployeeId;
  const attachments = [];
  for (const file of files) {
    const filePath = `${empId}/${Date.now()}_${file.name}`;
    const { error } = await state.supabase.storage
      .from('feature-attachments')
      .upload(filePath, file, { upsert: false });
    if (error) {
      console.error('Attachment upload error:', error);
      continue;
    }
    attachments.push({ path: filePath, name: file.name, size: file.size });
  }
  return attachments;
}

function renderFrPendingFiles(containerOrId, files) {
  const container = typeof containerOrId === 'string'
    ? (document.getElementById(containerOrId) || document.querySelector(containerOrId))
    : containerOrId;
  if (!container) return;
  if (!files.length) { container.innerHTML = ''; return; }
  container.innerHTML = files.map((f, i) => {
    const thumbUrl = URL.createObjectURL(f);
    return `<div class="fr-pending-thumb" data-index="${i}">
      <img src="${thumbUrl}" alt="${escapeHtml(f.name)}">
      <button type="button" class="fr-remove-file" data-index="${i}">\u00d7</button>
    </div>`;
  }).join('');
}

async function submitFeatureRequest() {
  const text = String(newFeatureRequestInput?.value || '').trim();
  const typeSelect = document.getElementById('newFeatureRequestType');
  const linksInput = document.getElementById('newFeatureRequestLinks');
  const requestType = typeSelect?.value || 'feature';
  if (!text) {
    setFeatureRequestNotice('Please describe the bug or feature.');
    return;
  }

  if (!state.supabase || !state.isAuthenticated) {
    setFeatureRequestNotice('You must be signed in to submit.');
    return;
  }

  // Parse links — comma or space separated URLs
  const linksRaw = String(linksInput?.value || '').trim();
  const links = linksRaw
    ? linksRaw.split(/[,\s]+/).filter(l => l.startsWith('http'))
    : [];

  const submitBtn = document.getElementById('submitFeatureRequestBtn');
  if (submitBtn) submitBtn.disabled = true;

  // Upload attachments if any
  let attachments = [];
  if (state.frPendingFiles && state.frPendingFiles.length) {
    setFeatureRequestNotice('Uploading attachments...');
    attachments = await uploadFeatureAttachments(state.frPendingFiles);
  }

  const result = await state.supabase.from('feature_requests').insert({
    employee_id: state.currentEmployeeId,
    request_text: text,
    request_type: requestType,
    links: links,
    attachments: attachments
  }).select('id').single();

  if (submitBtn) submitBtn.disabled = false;

  if (result.error) {
    setFeatureRequestNotice(`Submit failed: ${result.error.message}`);
    return;
  }

  // Notify admin on new bug reports
  if (requestType === 'bug' && result.data?.id) {
    notifyFeatureRequestOwner('new_bug', result.data.id);
  }

  if (newFeatureRequestInput) newFeatureRequestInput.value = '';
  if (linksInput) linksInput.value = '';
  state.frPendingFiles = [];
  const pendingContainer = document.getElementById('frPendingFiles');
  if (pendingContainer) pendingContainer.innerHTML = '';
  setFeatureRequestNotice('Request submitted!');
  await loadFeatureRequestsFromSupabase();
}

function editFeatureRequest(frId) {
  const fr = state.featureRequests.find(r => r.id === frId);
  if (!fr || fr.employee_id !== state.currentEmployeeId || fr.status !== 'requested') return;

  const card = featureRequestThread?.querySelector(`.fr-card[data-fr-id="${frId}"]`);
  if (!card) return;

  const body = card.querySelector('.fr-card-body');
  if (!body) return;

  body.innerHTML = `<textarea class="fr-edit-text" rows="3">${escapeHtml(fr.request_text)}</textarea>
    <div style="margin-top:6px;display:flex;gap:6px;">
      <button class="ghost small" data-fr-action="save-edit" data-fr-id="${frId}">Save</button>
      <button class="ghost small" data-fr-action="cancel-edit" data-fr-id="${frId}">Cancel</button>
    </div>`;

  body.querySelector('.fr-edit-text')?.focus();
}

async function saveFeatureRequestEdit(frId) {
  const fr = state.featureRequests.find(r => r.id === frId);
  if (!fr) return;

  const card = featureRequestThread?.querySelector(`.fr-card[data-fr-id="${frId}"]`);
  const textarea = card?.querySelector('.fr-edit-text');
  if (!textarea) return;

  const newText = String(textarea.value || '').trim();
  if (!newText) {
    setFeatureRequestNotice('Request text cannot be empty.');
    return;
  }

  if (!state.supabase || !state.isAuthenticated) return;

  const result = await state.supabase.from('feature_requests')
    .update({ request_text: newText })
    .eq('id', frId)
    .eq('employee_id', state.currentEmployeeId);

  if (result.error) {
    setFeatureRequestNotice(`Edit failed: ${result.error.message}`);
    return;
  }

  fr.request_text = newText;
  setFeatureRequestNotice('Request updated.');
  renderFeatureRequests();
}

function notifyFeatureRequestOwner(type, featureRequestId, extra = {}) {
  if (!state.session?.access_token) return;
  const actorName = displayPersonName(state.employeeProfile?.full_name || '', 'Someone');
  fetch('/api/feature-request-notify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${state.session.access_token}`
    },
    body: JSON.stringify({ type, featureRequestId, actorName, ...extra })
  }).catch(err => console.error('Feature request notification failed:', err));
}

async function toggleFeatureRequestUpvote(frId) {
  if (!state.supabase || !state.isAuthenticated) return;

  const fr = state.featureRequests.find(r => r.id === frId);
  if (!fr) return;

  const ids = fr.upvote_employee_ids || [];
  const hasUpvoted = ids.includes(state.currentEmployeeId);

  if (hasUpvoted) {
    const result = await state.supabase.from('feature_request_upvotes')
      .delete()
      .eq('feature_request_id', frId)
      .eq('employee_id', state.currentEmployeeId);
    if (result.error) {
      setFeatureRequestNotice(`Upvote failed: ${result.error.message}`);
      return;
    }
    fr.upvote_employee_ids = ids.filter(id => id !== state.currentEmployeeId);
  } else {
    const result = await state.supabase.from('feature_request_upvotes').insert({
      feature_request_id: frId,
      employee_id: state.currentEmployeeId
    });
    if (result.error) {
      setFeatureRequestNotice(`Upvote failed: ${result.error.message}`);
      return;
    }
    fr.upvote_employee_ids = [...ids, state.currentEmployeeId];
    notifyFeatureRequestOwner('upvote', frId);
  }

  // Update button in-place (no full re-render)
  const btn = featureRequestThread?.querySelector(`.fr-upvote[data-fr-id="${frId}"]`);
  if (btn) {
    const nowUpvoted = fr.upvote_employee_ids.includes(state.currentEmployeeId);
    btn.classList.toggle('upvoted', nowUpvoted);
    btn.textContent = '\u25B2 ' + fr.upvote_employee_ids.length;
  }
}

async function submitFeatureRequestReply(frId) {
  const textarea = featureRequestThread?.querySelector(`.fr-reply-input[data-fr-id="${frId}"]`);
  const text = String(textarea?.value || '').trim();
  if (!text && !(state.frReplyPendingFiles && state.frReplyPendingFiles[frId]?.length)) return;

  if (!state.supabase || !state.isAuthenticated) {
    setFeatureRequestNotice('You must be signed in to reply.');
    return;
  }

  // Upload reply attachments if any
  let attachments = [];
  const replyFiles = state.frReplyPendingFiles?.[frId] || [];
  if (replyFiles.length) {
    setFeatureRequestNotice('Uploading attachments...');
    attachments = await uploadFeatureAttachments(replyFiles);
  }

  const result = await state.supabase.from('feature_request_replies').insert({
    feature_request_id: frId,
    employee_id: state.currentEmployeeId,
    reply_text: text || '(screenshot)',
    attachments: attachments
  });

  if (result.error) {
    setFeatureRequestNotice(`Reply failed: ${result.error.message}`);
    return;
  }

  if (state.frReplyPendingFiles) delete state.frReplyPendingFiles[frId];
  setFeatureRequestNotice('Reply added.');
  notifyFeatureRequestOwner('reply', frId);
  await loadFeatureRequestsFromSupabase();
}

async function updateFeatureRequestStatus(frId, newStatus) {
  if (!isSuperadminUser()) return;
  if (!state.supabase || !state.isAuthenticated) return;

  const now = new Date().toISOString();
  const result = await state.supabase.from('feature_requests')
    .update({ status: newStatus, updated_at: now })
    .eq('id', frId);

  if (result.error) {
    setFeatureRequestNotice(`Status update failed: ${result.error.message}`);
    await loadFeatureRequestsFromSupabase();
    return;
  }

  const fr = state.featureRequests.find(r => r.id === frId);
  if (fr) { fr.status = newStatus; fr.updated_at = now; }
  notifyFeatureRequestOwner('status_change', frId, { newStatus });
  renderFeatureRequests();
}

async function reopenBug(frId) {
  if (!state.supabase || !state.isAuthenticated) return;
  const fr = state.featureRequests.find(r => r.id === frId);
  if (!fr || fr.request_type !== 'bug' || fr.status !== 'done') return;
  if (fr.employee_id !== state.currentEmployeeId && !isSuperadminUser()) return;

  const now = new Date().toISOString();
  const result = await state.supabase.from('feature_requests')
    .update({ status: 'requested', updated_at: now })
    .eq('id', frId);

  if (result.error) {
    setFeatureRequestNotice(`Re-open failed: ${result.error.message}`);
    return;
  }

  fr.status = 'requested';
  fr.updated_at = now;
  setFeatureRequestNotice('Bug re-opened.');
  renderFeatureRequests();
}

async function updateFeatureRequestType(frId, newType) {
  if (!isSuperadminUser()) return;
  if (!state.supabase || !state.isAuthenticated) return;

  const now = new Date().toISOString();
  const result = await state.supabase.from('feature_requests')
    .update({ request_type: newType, updated_at: now })
    .eq('id', frId);

  if (result.error) {
    setFeatureRequestNotice(`Type update failed: ${result.error.message}`);
    await loadFeatureRequestsFromSupabase();
    return;
  }

  const fr = state.featureRequests.find(r => r.id === frId);
  if (fr) { fr.request_type = newType; fr.updated_at = now; }
  renderFeatureRequests();
}

async function archiveFeatureRequest(frId) {
  if (!isSuperadminUser()) return;
  if (!state.supabase || !state.isAuthenticated) return;

  const now = new Date().toISOString();
  const result = await state.supabase.from('feature_requests')
    .update({ status: 'archived', updated_at: now })
    .eq('id', frId);

  if (result.error) {
    setFeatureRequestNotice(`Archive failed: ${result.error.message}`);
    await loadFeatureRequestsFromSupabase();
    return;
  }

  const fr = state.featureRequests.find(r => r.id === frId);
  if (fr) { fr.status = 'archived'; fr.updated_at = now; }
  renderFeatureRequests();
  setFeatureRequestNotice('Request archived.');
}

async function unarchiveFeatureRequest(frId) {
  if (!isSuperadminUser()) return;
  if (!state.supabase || !state.isAuthenticated) return;

  const now = new Date().toISOString();
  const result = await state.supabase.from('feature_requests')
    .update({ status: 'requested', updated_at: now })
    .eq('id', frId);

  if (result.error) {
    setFeatureRequestNotice(`Restore failed: ${result.error.message}`);
    await loadFeatureRequestsFromSupabase();
    return;
  }

  const fr = state.featureRequests.find(r => r.id === frId);
  if (fr) { fr.status = 'requested'; fr.updated_at = now; }
  renderFeatureRequests();
  setFeatureRequestNotice('Request restored.');
}

async function deleteFeatureRequest(frId) {
  if (!state.supabase || !state.isAuthenticated) return;

  const fr = state.featureRequests.find(r => r.id === frId);
  if (!fr) return;
  if (fr.employee_id !== state.currentEmployeeId || fr.status !== 'requested') {
    setFeatureRequestNotice('You can only delete your own requests that are still in "Requested" status.');
    return;
  }

  if (!confirm('Delete this feature request? This cannot be undone.')) return;

  // Delete related data first (upvotes, replies), then the request
  await state.supabase.from('feature_request_upvotes').delete().eq('feature_request_id', frId);
  await state.supabase.from('feature_request_replies').delete().eq('feature_request_id', frId);
  const result = await state.supabase.from('feature_requests').delete().eq('id', frId);

  if (result.error) {
    setFeatureRequestNotice(`Delete failed: ${result.error.message}`);
    return;
  }

  state.featureRequests = state.featureRequests.filter(r => r.id !== frId);
  renderFeatureRequests();
  setFeatureRequestNotice('Request deleted.');
}

if (submitFeatureRequestBtn) {
  submitFeatureRequestBtn.addEventListener('click', () => {
    submitFeatureRequest().catch(error => {
      console.error(error);
      setFeatureRequestNotice(`Submit failed: ${error.message}`);
    });
  });
}

// ── Feature request file attachment handlers ──
const frFileInput = document.getElementById('newFeatureRequestFiles');
if (frFileInput) {
  frFileInput.addEventListener('change', () => {
    if (!state.frPendingFiles) state.frPendingFiles = [];
    const newFiles = [...frFileInput.files];
    state.frPendingFiles.push(...newFiles);
    renderFrPendingFiles('frPendingFiles', state.frPendingFiles);
    frFileInput.value = ''; // reset so same file can be re-selected
  });
}

// Pending files container — remove button clicks
const frPendingContainer = document.getElementById('frPendingFiles');
if (frPendingContainer) {
  frPendingContainer.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('.fr-remove-file');
    if (!removeBtn) return;
    const idx = parseInt(removeBtn.dataset.index, 10);
    if (!isNaN(idx) && state.frPendingFiles) {
      state.frPendingFiles.splice(idx, 1);
      renderFrPendingFiles('frPendingFiles', state.frPendingFiles);
    }
  });
}

if (featureRequestThread) {
  featureRequestThread.addEventListener('click', (event) => {
    // Handle toggle-replies (div, not button)
    const toggle = event.target.closest('[data-fr-action="toggle-replies"]');
    if (toggle) {
      const frId = toggle.dataset.frId;
      const hidden = featureRequestThread.querySelector(`.fr-replies-hidden[data-fr-id="${frId}"]`);
      if (hidden) {
        const visible = hidden.style.display === 'none';
        hidden.style.display = visible ? 'flex' : 'none';
        toggle.textContent = visible ? 'Hide earlier replies' : toggle.textContent.replace('Hide', 'Show');
        if (!visible) {
          const replies = state.featureRequests.find(r => r.id === frId)?.replies || [];
          const hiddenCount = replies.length - 2;
          toggle.textContent = `Show ${hiddenCount} earlier ${hiddenCount === 1 ? 'reply' : 'replies'}`;
        }
      }
      return;
    }

    // Attachment thumbnail click → open full-size in new tab
    const thumb = event.target.closest('.fr-attachment-thumb');
    if (thumb) {
      event.preventDefault();
      const path = thumb.dataset.storagePath;
      if (!path || !state.supabase) return;
      state.supabase.storage.from('feature-attachments').createSignedUrl(path, 3600).then(({ data }) => {
        if (data?.signedUrl) window.open(data.signedUrl, '_blank');
      });
      return;
    }

    // Reply pending file remove buttons
    const removeBtn = event.target.closest('.fr-reply-pending .fr-remove-file');
    if (removeBtn) {
      const idx = parseInt(removeBtn.dataset.index, 10);
      const pendingContainer = removeBtn.closest('.fr-reply-pending');
      const frId = pendingContainer?.dataset.frId;
      if (!isNaN(idx) && frId && state.frReplyPendingFiles?.[frId]) {
        state.frReplyPendingFiles[frId].splice(idx, 1);
        renderFrPendingFiles(pendingContainer, state.frReplyPendingFiles[frId]);
      }
      return;
    }

    const btn = event.target.closest('button[data-fr-action]');
    if (!btn) return;

    const action = btn.dataset.frAction;
    const frId = btn.dataset.frId;

    if (action === 'edit') {
      editFeatureRequest(frId);
      return;
    }

    if (action === 'delete') {
      deleteFeatureRequest(frId).catch(error => {
        console.error(error);
        setFeatureRequestNotice(`Delete failed: ${error.message}`);
      });
      return;
    }

    if (action === 'save-edit') {
      saveFeatureRequestEdit(frId).catch(error => {
        console.error(error);
        setFeatureRequestNotice(`Edit failed: ${error.message}`);
      });
      return;
    }

    if (action === 'cancel-edit') {
      renderFeatureRequests();
      return;
    }

    if (action === 'submit-reply') {
      submitFeatureRequestReply(frId).catch(error => {
        console.error(error);
        setFeatureRequestNotice(`Reply failed: ${error.message}`);
      });
      return;
    }

    if (action === 'upvote') {
      toggleFeatureRequestUpvote(frId).catch(error => {
        console.error(error);
        setFeatureRequestNotice(`Upvote failed: ${error.message}`);
      });
      return;
    }

    if (action === 'archive') {
      archiveFeatureRequest(frId).catch(error => {
        console.error(error);
        setFeatureRequestNotice(`Archive failed: ${error.message}`);
      });
      return;
    }

    if (action === 'unarchive') {
      unarchiveFeatureRequest(frId).catch(error => {
        console.error(error);
        setFeatureRequestNotice(`Restore failed: ${error.message}`);
      });
    }
  });

  featureRequestThread.addEventListener('change', (event) => {
    const statusSelect = event.target.closest('select.fr-status-select');
    if (statusSelect) {
      const frId = statusSelect.dataset.frId;
      const newStatus = statusSelect.value;
      updateFeatureRequestStatus(frId, newStatus).catch(error => {
        console.error(error);
        setFeatureRequestNotice(`Status update failed: ${error.message}`);
      });
      return;
    }

    const typeSelect = event.target.closest('select.fr-type-select');
    if (typeSelect) {
      const frId = typeSelect.dataset.frId;
      const newType = typeSelect.value;
      updateFeatureRequestType(frId, newType).catch(error => {
        console.error(error);
        setFeatureRequestNotice(`Type update failed: ${error.message}`);
      });
      return;
    }

    // Reply file input change handler (delegated)
    const replyFileInput = event.target.closest('.fr-reply-file-input');
    if (replyFileInput) {
      const frId = replyFileInput.dataset.frId;
      if (!frId) return;
      if (!state.frReplyPendingFiles) state.frReplyPendingFiles = {};
      if (!state.frReplyPendingFiles[frId]) state.frReplyPendingFiles[frId] = [];
      const newFiles = [...replyFileInput.files];
      state.frReplyPendingFiles[frId].push(...newFiles);
      const pendingContainer = featureRequestThread.querySelector(`.fr-reply-pending[data-fr-id="${frId}"]`);
      if (pendingContainer) {
        renderFrPendingFiles(pendingContainer, state.frReplyPendingFiles[frId]);
      }
      replyFileInput.value = '';
    }
  });

}

// Archived panel uses delegated events on its own container
const frArchivedList = document.getElementById('frArchivedList');
if (frArchivedList) {
  frArchivedList.addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-fr-action="unarchive"]');
    if (!btn) return;
    const frId = btn.dataset.frId;
    unarchiveFeatureRequest(frId).catch(error => {
      console.error(error);
      setFeatureRequestNotice(`Restore failed: ${error.message}`);
    });
  });
}

if (frCompletedList) {
  frCompletedList.addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-fr-action="reopen"]');
    if (!btn) return;
    const frId = btn.dataset.frId;
    reopenBug(frId).catch(error => {
      console.error(error);
      setFeatureRequestNotice(`Re-open failed: ${error.message}`);
    });
  });
}

if (featureRequestsFooterLink) {
  featureRequestsFooterLink.addEventListener('click', (event) => {
    event.preventDefault();
    navigateToScreen('feature-requests');
  });
}

const allocSummary = document.getElementById('allocSummary');
const addRow = document.getElementById('addRow');
const saveAllocationsBtn = document.getElementById('saveAllocationsBtn');
const allocWeekDisplay = document.getElementById('allocWeekDisplay');
const allocWeekPrevBtn = document.getElementById('allocWeekPrev');
const allocWeekNextBtn = document.getElementById('allocWeekNext');
const allocMonthSelect = document.getElementById('allocMonth');
const allocEmployeeFilterWrap = document.getElementById('allocEmployeeFilterWrap');
const allocEmployeeFilter = document.getElementById('allocEmployeeFilter');
const allocClientFilterWrap = document.getElementById('allocClientFilterWrap');
const allocClientFilter = document.getElementById('allocClientFilter');
const allocEditPolicyNote = document.getElementById('allocEditPolicyNote');
const allocationTable = document.getElementById('allocationTable')?.querySelector('tbody');

function mondayWeekStartDate(dateValue = new Date()) {
  const date = new Date(dateValue.getFullYear(), dateValue.getMonth(), dateValue.getDate());
  const day = date.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diffToMonday);
  return date;
}

function getCurrentWeekStartIso() {
  return toISODateLocal(mondayWeekStartDate());
}

function getEffectiveWorkDaysForWeek(weekStartIso, employeeId) {
  const weekStart = parseIsoDateLocal(weekStartIso);
  if (!weekStart) return { workDays: 5, holidays: [], leaveDays: 0 };
  const weekDates = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    weekDates.push(toISODateLocal(d));
  }
  const holidays = PUBLIC_HOLIDAYS_2026.filter(h => weekDates.includes(h.date));
  const holidayDates = new Set(holidays.map(h => h.date));
  let leaveDayCount = 0;
  if (employeeId && state.leaveRowsById) {
    state.leaveRowsById.forEach((row) => {
      if (row.employee_id !== employeeId) return;
      if (row.status !== 'approved') return;
      weekDates.forEach((dateStr) => {
        if (holidayDates.has(dateStr)) return;
        if (dateStr >= row.start_date && dateStr <= row.end_date) leaveDayCount++;
      });
    });
  }
  return { workDays: Math.max(0, 5 - holidays.length - leaveDayCount), holidays, leaveDays: leaveDayCount };
}

function getEffectiveHoursForWeek(weekStartIso, employeeId) {
  return getEffectiveWorkDaysForWeek(weekStartIso, employeeId).workDays * HOURS_PER_DAY;
}

function getCurrentAllocEffectiveHours() {
  return getEffectiveHoursForWeek(getSelectedAllocWeekIso(), getAllocationViewEmployeeId());
}

/* ── Allocation week navigation ── */

function allocMonthWindow() {
  const raw = String(allocMonthSelect?.value || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})$/);
  const base = new Date();
  const year = match ? Number(match[1]) : base.getFullYear();
  const month = match ? Number(match[2]) : base.getMonth() + 1;
  const monthStartDate = new Date(year, month - 1, 1);
  const monthEndDate = new Date(year, month, 0);
  return { monthStartDate, monthEndDate };
}

function allocWeekStartsForMonth() {
  const mw = allocMonthWindow();
  return plannerWeekStartsForMonth(mw);
}

function getSelectedAllocWeekIso() {
  const weeks = allocWeekStartsForMonth();
  const idx = state._allocSelectedWeekIndex;
  if (idx != null && idx >= 0 && idx < weeks.length) return weeks[idx];
  // Default: find the current week in the list, or last week
  const current = getCurrentWeekStartIso();
  const match = weeks.indexOf(current);
  return match >= 0 ? weeks[match] : weeks[weeks.length - 1] || current;
}

function populateAllocMonthSelector() {
  if (!allocMonthSelect) return;
  const today = new Date();
  const months = [];
  for (let offset = -1; offset <= 2; offset++) {
    const d = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    months.push({ value, label });
  }
  allocMonthSelect.innerHTML = '';
  months.forEach(({ value, label }) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    allocMonthSelect.appendChild(opt);
  });
  // Default to current month
  const currentValue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  allocMonthSelect.value = currentValue;
}

function updateAllocWeekNav() {
  const weeks = allocWeekStartsForMonth();
  const selectedIso = getSelectedAllocWeekIso();
  const idx = weeks.indexOf(selectedIso);
  state._allocSelectedWeekIndex = idx >= 0 ? idx : null;
  if (allocWeekDisplay) {
    allocWeekDisplay.textContent = `Week of ${formatWeekRangeLabel(selectedIso)}`;
  }
  if (allocWeekPrevBtn) allocWeekPrevBtn.disabled = idx <= 0;
  if (allocWeekNextBtn) allocWeekNextBtn.disabled = idx >= weeks.length - 1;
}

function navigateAllocWeek(delta) {
  const weeks = allocWeekStartsForMonth();
  const currentIdx = state._allocSelectedWeekIndex ?? weeks.indexOf(getSelectedAllocWeekIso());
  const newIdx = Math.max(0, Math.min(weeks.length - 1, currentIdx + delta));
  state._allocSelectedWeekIndex = newIdx;
  loadWeeklyAllocationsFromSupabase().catch((error) => {
    console.error(error);
    setAllocationPolicyNote(`Unable to load weekly allocation: ${error.message}`);
  });
}

function formatWeekRangeLabel(weekStartIso) {
  const start = parseIsoDateLocal(weekStartIso) || new Date(weekStartIso);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short' });
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}

function getAllocationViewEmployeeId() {
  if (isLeadershipRole()) {
    return state.allocationViewEmployeeId || state.currentEmployeeId || null;
  }
  return state.currentEmployeeId || null;
}

function getSelectedProfileEmployeeId() {
  return getEmployeeIdByName(state.currentEmployee) || state.currentEmployeeId || null;
}

function currentAllocationTeam() {
  const targetEmployeeId = getAllocationViewEmployeeId();
  const fromDirectory = state.employeeDirectory.find((row) => row.id === targetEmployeeId);
  if (fromDirectory?.department?.name) return normalizeTeamName(fromDirectory.department.name, TEAM_AM);
  const profile = selectedEmployeeRecord();
  return normalizeTeamName(profile.team, TEAM_AM);
}

function canEditWeeklyAllocation(weekIso) {
  const selectedWeek = weekIso || getSelectedAllocWeekIso();
  const currentWeek = getCurrentWeekStartIso();
  // Past weeks are read-only for everyone
  if (selectedWeek < currentWeek) return false;

  const targetEmployeeId = getAllocationViewEmployeeId();
  const targetEmployee = state.employeeDirectory.find((e) => e.id === targetEmployeeId) || null;
  const targetEmail = normalizeEmail(targetEmployee?.email);

  // Rule 1: Superadmin allocations can only be edited by the superadmin themselves
  if (targetEmail && isSuperadminEmail(targetEmail) && targetEmployeeId !== state.currentEmployeeId) return false;

  const currentEmail = normalizeEmail(state.employeeProfile?.email || state.session?.user?.email || '');

  if (isLeadershipRole()) {
    // Editing own allocations — always allowed for leadership
    if (targetEmployeeId === state.currentEmployeeId) return true;

    // Rule 2: Leadership cannot edit other leadership allocations
    const targetAccess = normalizeAccessLevel(targetEmployee?.access_level || 'employee');
    if (targetAccess === 'leadership' || targetAccess === 'admin') return false;

    // Rule 4: Leadership can only edit allocations of people reporting to them
    if (targetEmployee && !employeeReportsToManager(targetEmployee, currentEmail)) return false;

    return true;
  }

  // Rule 3: Employees can only edit their own allocations
  if (targetEmployeeId !== state.currentEmployeeId) return false;

  const dayOfWeek = new Date().getDay();
  return dayOfWeek === 1 || dayOfWeek === 2;
}

function setAllocationPolicyNote(message = '', className = 'mini-meta') {
  if (!allocEditPolicyNote) return;
  allocEditPolicyNote.className = className;
  allocEditPolicyNote.textContent = message;
}

function getAllocViewMode() {
  try {
    return localStorage.getItem('allocViewMode') === 'hours' ? 'hours' : 'percent';
  } catch (_error) {
    return 'percent';
  }
}

function setAllocViewMode(mode) {
  try {
    localStorage.setItem('allocViewMode', mode);
  } catch (_error) {
    // Ignore storage write failures; UI can still function with default mode.
  }
}

function pctToAllocDisplay(pct) {
  if (getAllocViewMode() === 'hours') {
    return Math.round((pct / 100) * getCurrentAllocEffectiveHours());
  }
  return Math.round(pct);
}

function allocDisplayToPct(val) {
  if (getAllocViewMode() === 'hours') {
    const effective = getCurrentAllocEffectiveHours();
    return effective > 0 ? Math.round(((val / effective) * 100) * 100) / 100 : 0;
  }
  return val;
}

function syncAllocViewModeLabels() {
  const isHours = getAllocViewMode() === 'hours';
  const toggleBtn = document.getElementById('allocViewToggle');
  if (toggleBtn) toggleBtn.textContent = isHours ? 'Switch to %' : 'Switch to hrs';
  const allocHeader = document.getElementById('allocUnitHeader');
  if (allocHeader) allocHeader.textContent = isHours ? 'Allocation (hrs)' : 'Allocation %';
}

function renderAllocationEmployeeFilterOptions() {
  if (!allocEmployeeFilter) return;
  allocEmployeeFilter.innerHTML = '';
  state.employeeDirectory.forEach((employee) => {
    const option = document.createElement('option');
    option.value = employee.id;
    option.textContent = displayPersonName(employee.full_name, 'Employee');
    allocEmployeeFilter.appendChild(option);
  });

  if (!state.allocationViewEmployeeId) {
    state.allocationViewEmployeeId = state.currentEmployeeId;
  }

  if (state.allocationViewEmployeeId && [...allocEmployeeFilter.options].some((opt) => opt.value === state.allocationViewEmployeeId)) {
    allocEmployeeFilter.value = state.allocationViewEmployeeId;
  } else if (allocEmployeeFilter.options.length) {
    state.allocationViewEmployeeId = allocEmployeeFilter.options[0].value;
    allocEmployeeFilter.value = state.allocationViewEmployeeId;
  }
}

function renderAllocationClientFilterOptions(rows = []) {
  if (!allocClientFilter) return;
  const current = String(state.allocationClientFilter || 'all');
  const fromState = state.clients.map((row) => String(row.name || '').trim()).filter(Boolean).filter(n => normalizeClientNameKey(n) !== 'internal');
  const fromRows = rows.map((row) => String(row.client || '').trim()).filter(Boolean).filter(n => normalizeClientNameKey(n) !== 'internal');
  const options = dedupeSortedNames([...fromState, ...fromRows]);

  allocClientFilter.innerHTML = '<option value="all">All clients</option>';
  options.forEach((name) => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    allocClientFilter.appendChild(option);
  });

  const hasCurrent = [...allocClientFilter.options].some((opt) => opt.value === current);
  state.allocationClientFilter = hasCurrent ? current : 'all';
  allocClientFilter.value = state.allocationClientFilter;
}

function applyAllocationClientRowFilter() {
  if (!allocationTable) return;
  const selectedClient = String(state.allocationClientFilter || 'all');
  const normalizedClient = selectedClient.toLowerCase();
  const rows = [...allocationTable.querySelectorAll('tr[data-allocation-row="line"]')];
  let visibleCount = 0;

  rows.forEach((row) => {
    const rowClient = String(row.dataset.client || '').toLowerCase();
    const visible = normalizedClient === 'all' || rowClient === normalizedClient;
    row.classList.toggle('hidden', !visible);
    if (visible) visibleCount += 1;
  });

  allocationTable.querySelectorAll('tr[data-allocation-row="filter-empty"]').forEach((row) => row.remove());
  if (rows.length && !visibleCount) {
    const empty = document.createElement('tr');
    empty.dataset.allocationRow = 'filter-empty';
    empty.innerHTML = '<td colspan="5">No allocation lines for selected client.</td>';
    allocationTable.appendChild(empty);
  }
}

function updateAllocationSummary() {
  const isHours = getAllocViewMode() === 'hours';
  const effectiveHours = getCurrentAllocEffectiveHours();
  const weekStartIso = getSelectedAllocWeekIso();
  const weekInfo = getEffectiveWorkDaysForWeek(weekStartIso, getAllocationViewEmployeeId());
  const allocInputs = [...document.querySelectorAll('.alloc-input')];
  const totalPct = allocInputs.reduce((sum, input) => {
    const value = Number(input.value);
    const pct = isHours ? (effectiveHours > 0 ? (value / effectiveHours) * 100 : 0) : value;
    return sum + (Number.isFinite(pct) ? pct : 0);
  }, 0);
  const freePct = 100 - totalPct;
  const total = Math.round(totalPct);
  const free = Math.round(freePct);

  if (!allocSummary) return;

  if (isHours) {
    const totalHrs = Math.round((totalPct / 100) * effectiveHours);
    const freeHrs = Math.round(Math.abs(freePct / 100) * effectiveHours);
    if (totalPct > 100) {
      allocSummary.textContent = `Total: ${totalHrs} of ${effectiveHours} hrs (${freeHrs} hrs overbooked)`;
      allocSummary.className = 'status alloc-total error';
    } else if (totalPct > 90) {
      allocSummary.textContent = `Total: ${totalHrs} of ${effectiveHours} hrs`;
      allocSummary.className = 'status alloc-total warn';
    } else {
      allocSummary.textContent = `Total: ${totalHrs} of ${effectiveHours} hrs`;
      allocSummary.className = 'status alloc-total';
    }
  } else {
    if (totalPct > 100) {
      allocSummary.textContent = `Total allocation: ${total}% (${Math.abs(free)}% overbooked)`;
      allocSummary.className = 'status alloc-total error';
    } else if (totalPct > 90) {
      allocSummary.textContent = `Total allocation: ${total}%`;
      allocSummary.className = 'status alloc-total warn';
    } else {
      allocSummary.textContent = `Total allocation: ${total}%`;
      allocSummary.className = 'status alloc-total';
    }
  }

  const allocWeekNote = document.getElementById('allocWeekNote');
  if (allocWeekNote) {
    if (weekInfo.workDays < 5) {
      const parts = [];
      if (weekInfo.holidays.length) parts.push(`${weekInfo.holidays.length} holiday${weekInfo.holidays.length > 1 ? 's' : ''}: ${weekInfo.holidays.map(h => h.name).join(', ')}`);
      if (weekInfo.leaveDays) parts.push(`${weekInfo.leaveDays} leave day${weekInfo.leaveDays > 1 ? 's' : ''}`);
      allocWeekNote.textContent = `${weekInfo.workDays} working days this week (${parts.join('; ')})`;
    } else {
      allocWeekNote.textContent = '';
    }
  }

  const allocationEmployeeId = getAllocationViewEmployeeId();
  const selectedProfileEmployeeId = getSelectedProfileEmployeeId();
  if (allocationEmployeeId && selectedProfileEmployeeId && allocationEmployeeId === selectedProfileEmployeeId) {
    const profile = selectedEmployeeRecord();
    profile.utilization.week = Math.min(100, Math.round(total));
    const profileUtilWeekEl = document.getElementById('profileUtilWeek');
    if (profileUtilWeekEl) profileUtilWeekEl.textContent = `${profile.utilization.week}%`;
  }
}

function bindAllocationInputListeners() {
  document.querySelectorAll('.alloc-input').forEach((input) => {
    input.addEventListener('input', updateAllocationSummary);
  });
}

function allocationClientOptionsMarkup(selectedClient = '') {
  const selected = String(selectedClient || '').trim();
  const fromState = state.clients.map((row) => String(row.name || '').trim()).filter(Boolean).filter(n => normalizeClientNameKey(n) !== 'internal');
  const names = dedupeSortedNames(selected ? [...fromState, selected] : fromState);
  const options = ['<option value="">Select client</option>'];
  names.forEach((name) => {
    const isSelected = name === selected;
    options.push(`<option value="${escapeHtml(name)}" ${isSelected ? 'selected' : ''}>${escapeHtml(name)}</option>`);
  });
  return options.join('');
}

function isGarbageProjectName(name) {
  return !name || name.length > 100 || name.startsWith('Select client');
}

function getClientType(clientName) {
  const name = String(clientName || '').trim().toLowerCase();
  const match = state.clients.find((c) => String(c.name || '').trim().toLowerCase() === name);
  return match?.type || 'project';
}

function appendAllocationRow(line, editable) {
  if (!allocationTable) return;
  const row = document.createElement('tr');
  const clientName = String(line.client || '').trim();
  const percent = Number.isFinite(Number(line.allocation_percent)) ? Number(line.allocation_percent) : 0;
  const updatedLabel = line.updated_at ? formatTimestamp(line.updated_at) : '--';
  const isHours = getAllocViewMode() === 'hours';
  const displayValue = pctToAllocDisplay(percent);
  const effectiveHours = getCurrentAllocEffectiveHours();
  const maxValue = isHours ? effectiveHours : 100;
  const minValue = isHours ? Math.max(1, Math.round((5 / 100) * effectiveHours)) : 5;
  const stepValue = '1';
  const unitLabel = isHours ? 'hrs' : '%';
  const clientType = getClientType(clientName);
  const isPitch = clientType === 'pitch';
  const isRetainer = clientType === 'retainer';
  const showPopulate = editable && !isPitch;
  row.dataset.allocationRow = 'line';
  row.dataset.client = clientName.toLowerCase();
  const populateHtml = showPopulate ? `<span class="populate-wrapper"><button class="ghost small populate-btn" type="button" data-client="${escapeHtml(clientName)}">Copy to\u2026</button><span class="populate-menu hidden" data-client="${escapeHtml(clientName)}"><button type="button" data-populate-scope="next-week" data-client="${escapeHtml(clientName)}">Next Week</button><button type="button" data-populate-scope="month" data-client="${escapeHtml(clientName)}">Rest of Month</button></span></span>` : '';
  const deleteHtml = editable ? `<button class="alloc-delete-btn" type="button" title="Remove row">\u00d7</button>` : '';
  row.innerHTML = `
    <td data-label="Client"></td>
    <td data-label="Allocation">
      <div class="alloc-percent-field">
        <input class="alloc-input" type="number" min="${minValue}" max="${maxValue}" step="${stepValue}" value="${displayValue}" ${editable ? '' : 'disabled'} placeholder="Min ${minValue}" />
        <span>${unitLabel}</span>
      </div>
    </td>
    <td data-label="Type"><span class="chip ${isRetainer ? 'good' : isPitch ? 'info' : ''}" style="font-size:10px">${isRetainer ? 'Retainer' : isPitch ? 'Pitch' : 'Project'}</span></td>
    <td data-label="Updated" class="alloc-updated-at" data-employee="${escapeHtml(state.currentEmployee)}">${updatedLabel}</td>
    <td data-label="" class="${editable ? '' : 'hidden'}">${populateHtml}${deleteHtml}</td>
  `;

  /* Build select via DOM to avoid innerHTML parsing quirks across browsers */
  const clientSelect = document.createElement('select');
  if (!editable) clientSelect.disabled = true;
  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = 'Select client';
  clientSelect.appendChild(defaultOpt);
  const fromState = state.clients.map((r) => String(r.name || '').trim()).filter(Boolean).filter(n => normalizeClientNameKey(n) !== 'internal');
  const names = dedupeSortedNames(clientName ? [...fromState, clientName] : fromState);
  names.forEach((name) => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    if (name === clientName) opt.selected = true;
    clientSelect.appendChild(opt);
  });
  row.querySelector('td:nth-child(1)').appendChild(clientSelect);

  allocationTable.appendChild(row);
  const stampCell = row.querySelector('.alloc-updated-at');
  if (stampCell) applyTimestampClass(stampCell, updatedLabel);
  if (clientSelect) {
    clientSelect.addEventListener('change', () => {
      row.dataset.client = String(clientSelect.value || '').trim().toLowerCase();
      applyAllocationClientRowFilter();
    });
  }
}

function readAllocationLinesFromTable() {
  if (!allocationTable) return [];
  const hardcodedTeam = currentAllocationTeam();
  const lines = [...allocationTable.querySelectorAll('tr')]
    .map((row) => {
      const clientSelect = row.querySelector('td:nth-child(1) select');
      const clientCell = row.querySelector('td:nth-child(1)');
      const allocationInput = row.querySelector('.alloc-input');
      if (!allocationInput) return null;

      const projectName = (clientSelect?.value || '').trim();
      const rawValue = Number(allocationInput?.value);
      const allocationPercent = allocDisplayToPct(Number.isFinite(rawValue) ? rawValue : 0);

      if (!projectName) return null;

      return {
        project_name: projectName,
        team: hardcodedTeam,
        allocation_percent: Number.isFinite(allocationPercent) ? allocationPercent : 0
      };
    })
    .filter(Boolean);
  const deduped = new Map();
  lines.forEach((line) => {
    deduped.set(line.project_name.toLowerCase(), line);
  });
  return [...deduped.values()];
}

function renderWeeklyAllocationViews() {
  if (!allocationTable) return;
  const managerMode = isLeadershipRole();
  const targetEmployeeId = getAllocationViewEmployeeId();
  updateAllocWeekNav();

  allocationTable.innerHTML = '';
  const editable = canEditWeeklyAllocation();
  const rows = (state.weeklyAllocations || [])
    .map((line) => ({
      client: line.project?.name || line.client || '',
      allocation_percent: line.allocation_percent,
      updated_at: line.updated_at
    }))
    .filter((r) => r.client && !isGarbageProjectName(r.client))
    .sort((a, b) => String(a.client || '').localeCompare(String(b.client || '')));

  renderAllocationClientFilterOptions(rows);
  if (allocClientFilter) allocClientFilter.disabled = !rows.length;

  // Show/hide action column when editable
  const showActionCol = editable && rows.length > 0;
  const allocPopulateHeader = document.getElementById('allocPopulateHeader');
  if (allocPopulateHeader) allocPopulateHeader.classList.toggle('hidden', !showActionCol);

  if (!rows.length) {
    const row = document.createElement('tr');
    row.innerHTML = `<td colspan="${showActionCol ? 5 : 4}">No allocation lines for this week.</td>`;
    allocationTable.appendChild(row);
  } else {
    rows.forEach((line) => appendAllocationRow(line, editable));
  }

  bindAllocationInputListeners();
  applyAllocationClientRowFilter();
  updateAllocationSummary();
  if (addRow) addRow.disabled = !editable;
  if (saveAllocationsBtn) saveAllocationsBtn.disabled = !editable;

  const selectedWeek = getSelectedAllocWeekIso();
  const isPast = selectedWeek < getCurrentWeekStartIso();
  const targetEmployee = state.employeeDirectory.find((e) => e.id === targetEmployeeId) || null;
  const targetEmail = normalizeEmail(targetEmployee?.email);
  if (isPast) {
    setAllocationPolicyNote('Viewing a past week (read-only).');
  } else if (!editable && targetEmail && isSuperadminEmail(targetEmail)) {
    setAllocationPolicyNote('Superadmin allocations are read-only.');
  } else if (!editable && managerMode && targetEmployeeId !== state.currentEmployeeId) {
    const targetAccess = normalizeAccessLevel(targetEmployee?.access_level || 'employee');
    if (targetAccess === 'leadership' || targetAccess === 'admin') {
      setAllocationPolicyNote('Leadership allocations can only be viewed, not edited.');
    } else {
      setAllocationPolicyNote('You can only edit allocations for people who report to you.');
    }
  } else if (!editable) {
    setAllocationPolicyNote('Employees can edit weekly allocations on Monday and Tuesday.');
  } else if (managerMode) {
    setAllocationPolicyNote('Manager mode: you can update this employee\'s allocation now.');
  } else {
    setAllocationPolicyNote('Employee mode: set your weekly allocation on Monday or Tuesday.');
  }

  syncAllocViewModeLabels();
}

async function loadWeeklyAllocationsFromSupabase() {
  const targetEmployeeId = getAllocationViewEmployeeId();
  if (!state.supabase || !state.isAuthenticated || !targetEmployeeId) {
    state.weeklyAllocations = [];
    renderWeeklyAllocationViews();
    const selectedProfileEmployeeId = getSelectedProfileEmployeeId();
    if (!targetEmployeeId || (selectedProfileEmployeeId && targetEmployeeId === selectedProfileEmployeeId)) {
      state.profileAllocationRows = [];
      applySelectedEmployeeAllocationSnapshot([]);
    }
    return;
  }

  const weekStartIso = getSelectedAllocWeekIso();
  const response = await state.supabase
    .from('allocations')
    .select(`
      id,
      employee_id,
      period_start,
      allocation_percent,
      updated_at,
      project:projects!allocations_project_id_fkey (
        id,
        name
      )
    `)
    .eq('employee_id', targetEmployeeId)
    .eq('period_type', 'week')
    .eq('period_start', weekStartIso)
    .order('updated_at', { ascending: true });

  if (response.error) {
    console.error(response.error);
    state.weeklyAllocations = [];
    renderWeeklyAllocationViews();
    setAllocationPolicyNote(`Unable to load weekly allocation: ${response.error.message}`);
    const selectedProfileEmployeeId = getSelectedProfileEmployeeId();
    if (selectedProfileEmployeeId && targetEmployeeId === selectedProfileEmployeeId) {
      state.profileAllocationRows = [];
      applySelectedEmployeeAllocationSnapshot([]);
    }
    return;
  }

  state.weeklyAllocations = response.data || [];
  renderWeeklyAllocationViews();

  const selectedProfileEmployeeId = getSelectedProfileEmployeeId();
  if (targetEmployeeId && selectedProfileEmployeeId && targetEmployeeId === selectedProfileEmployeeId) {
    await loadProfileAllocationHistoryFromSupabase(targetEmployeeId);
  }

  if (isLeadershipRole()) {
    loadTeamDashboardFromSupabase().catch((error) => {
      console.error(error);
      setTeamDashboardScopeNote(`Unable to refresh team dashboard: ${error.message}`, 'status warn');
    });
  }
}

async function ensureInternalClientId() {
  const lookup = await state.supabase.from('clients').select('id').eq('name', 'Internal').maybeSingle();
  if (lookup.error && lookup.error.code !== 'PGRST116') throw lookup.error;
  if (lookup.data?.id) return lookup.data.id;

  const insert = await state.supabase
    .from('clients')
    .insert({
      name: 'Internal',
      account_owner_employee_id: state.currentEmployeeId || null,
      is_active: true
    })
    .select('id')
    .single();
  if (insert.error) throw insert.error;
  return insert.data.id;
}

async function ensureInternalProjectId(clientId, projectName) {
  const lookup = await state.supabase
    .from('projects')
    .select('id')
    .eq('client_id', clientId)
    .eq('name', projectName)
    .maybeSingle();
  if (lookup.error && lookup.error.code !== 'PGRST116') throw lookup.error;
  if (lookup.data?.id) return lookup.data.id;

  const insert = await state.supabase
    .from('projects')
    .insert({
      client_id: clientId,
      name: projectName,
      engagement_type: 'project',
      status: 'active',
      owner_employee_id: state.currentEmployeeId || null
    })
    .select('id')
    .single();
  if (insert.error) throw insert.error;
  return insert.data.id;
}

async function resolveProjectIdForLine(line, internalClientId) {
  const projectName = String(line.project_name || '').trim();
  if (!projectName) return null;

  // Always use Internal-client projects — must match save_my_allocations RPC
  // which resolves project names under the Internal client. Using real client
  // project IDs would cause project_id mismatches on upsert conflict checks,
  // leading to delete+re-insert that resets updated_at timestamps.
  return ensureInternalProjectId(internalClientId, projectName);
}

async function persistAllocationLinesForEmployeeDirect(targetEmployeeId, lines, weekStartIso) {
  const internalClientId = await ensureInternalClientId();

  // Resolve project IDs for incoming lines
  const incomingProjectIds = new Set();
  const lineEntries = [];
  for (const line of lines) {
    const projectId = await resolveProjectIdForLine(line, internalClientId);
    incomingProjectIds.add(projectId);
    lineEntries.push({ projectId, allocation_percent: line.allocation_percent });
  }

  // Remove allocations that are no longer in the incoming set
  const existing = await state.supabase
    .from('allocations')
    .select('project_id, allocation_percent')
    .eq('employee_id', targetEmployeeId)
    .eq('period_type', 'week')
    .eq('period_start', weekStartIso);
  if (existing.error) throw existing.error;

  const toDelete = (existing.data || [])
    .filter(row => !incomingProjectIds.has(row.project_id))
    .map(row => row.project_id);
  if (toDelete.length) {
    const del = await state.supabase
      .from('allocations')
      .delete()
      .eq('employee_id', targetEmployeeId)
      .eq('period_type', 'week')
      .eq('period_start', weekStartIso)
      .in('project_id', toDelete);
    if (del.error) throw del.error;
  }

  // Build lookup of existing percentages for change detection
  const existingMap = new Map((existing.data || []).map(r => [r.project_id, Number(r.allocation_percent)]));

  // Upsert only changed or new lines
  for (const entry of lineEntries) {
    const prev = existingMap.get(entry.projectId);
    if (prev === entry.allocation_percent) continue; // unchanged, skip

    const upsert = await state.supabase.from('allocations').upsert({
      employee_id: targetEmployeeId,
      project_id: entry.projectId,
      period_type: 'week',
      period_start: weekStartIso,
      allocation_percent: entry.allocation_percent,
      created_by_employee_id: state.currentEmployeeId,
      overridden_by_employee_id: state.currentEmployeeId
    }, { onConflict: 'employee_id,project_id,period_type,period_start' });
    if (upsert.error) throw upsert.error;
  }
}

async function populateAllocationForClient(clientName, scope) {
  if (!state.supabase || !state.isAuthenticated) return;

  const lines = readAllocationLinesFromTable();
  const targetLine = lines.find(
    (line) => String(line.project_name || '').trim().toLowerCase() === String(clientName || '').trim().toLowerCase()
  );

  if (!targetLine) {
    setAllocationPolicyNote(`No allocation line found for ${clientName}.`);
    return;
  }

  const selectedWeek = getSelectedAllocWeekIso();
  let targetWeeks;

  if (scope === 'next-week') {
    const selectedDate = parseIsoDateLocal(selectedWeek) || new Date(selectedWeek);
    const nextMonday = new Date(selectedDate);
    nextMonday.setDate(selectedDate.getDate() + 7);
    targetWeeks = [toISODateLocal(nextMonday)];
  } else {
    // 'month' — all remaining weeks in the selected month
    const mw = allocMonthWindow();
    const allWeeks = plannerWeekStartsForMonth(mw);
    targetWeeks = allWeeks.filter((w) => w > selectedWeek);
  }

  if (!targetWeeks.length) {
    setAllocationPolicyNote('No target weeks to populate.');
    return;
  }

  const targetEmployeeId = getAllocationViewEmployeeId() || state.currentEmployeeId;
  const internalClientId = await ensureInternalClientId();
  const projectId = await resolveProjectIdForLine(targetLine, internalClientId);
  if (!projectId) {
    setAllocationPolicyNote(`Unable to resolve project for ${clientName}.`);
    return;
  }

  // Conflict detection — check existing allocations for target weeks
  const existingRes = await state.supabase
    .from('allocations')
    .select('period_start, allocation_percent')
    .eq('employee_id', targetEmployeeId)
    .eq('project_id', projectId)
    .eq('period_type', 'week')
    .in('period_start', targetWeeks);

  const existingRows = existingRes.data || [];
  const newPct = targetLine.allocation_percent;
  const conflicting = existingRows.filter(r => Number(r.allocation_percent) !== newPct);
  const alreadyMatching = existingRows.filter(r => Number(r.allocation_percent) === newPct);

  if (conflicting.length > 0 && alreadyMatching.length === 0 && conflicting.length === targetWeeks.length) {
    // All target weeks already have the same different value — show conflict
    const weekLabels = conflicting.map(r => `${formatWeekRangeLabel(r.period_start)} (${r.allocation_percent}%)`).join(', ');
    const ok = confirm(`${clientName} already has allocations for ${weekLabels}. Overwrite with ${newPct}%?`);
    if (!ok) {
      setAllocationPolicyNote('Populate cancelled.');
      return;
    }
  } else if (conflicting.length > 0) {
    const weekLabels = conflicting.map(r => `${formatWeekRangeLabel(r.period_start)} (${r.allocation_percent}%)`).join(', ');
    const ok = confirm(`${clientName} has different allocations for: ${weekLabels}. Overwrite with ${newPct}%?`);
    if (!ok) {
      setAllocationPolicyNote('Populate cancelled.');
      return;
    }
  } else if (alreadyMatching.length === targetWeeks.length) {
    // All target weeks already have the same value
    setAllocationPolicyNote(`${clientName} already has ${newPct}% for ${scope === 'next-week' ? 'next week' : 'remaining weeks'}. No changes needed.`);
    return;
  }

  let populatedCount = 0;
  for (const weekIso of targetWeeks) {
    // Skip weeks that already match
    if (alreadyMatching.some(r => r.period_start === weekIso)) continue;

    await state.supabase
      .from('allocations')
      .delete()
      .eq('employee_id', targetEmployeeId)
      .eq('project_id', projectId)
      .eq('period_type', 'week')
      .eq('period_start', weekIso);

    const insert = await state.supabase.from('allocations').insert({
      employee_id: targetEmployeeId,
      project_id: projectId,
      period_type: 'week',
      period_start: weekIso,
      allocation_percent: newPct,
      created_by_employee_id: state.currentEmployeeId,
      overridden_by_employee_id: state.currentEmployeeId
    });
    if (insert.error) throw insert.error;
    populatedCount++;
  }

  const label = scope === 'next-week' ? 'next week' : `${populatedCount} week${populatedCount > 1 ? 's' : ''}`;
  setAllocationPolicyNote(`${clientName} allocation (${newPct}%) copied to ${label}.`);
}

async function persistAllocationsToSupabase() {
  if (!state.supabase || !state.isAuthenticated) return { synced: false, count: 0 };

  const lines = readAllocationLinesFromTable();
  const weekStartIso = getSelectedAllocWeekIso();
  const targetEmployeeId = getAllocationViewEmployeeId() || state.currentEmployeeId;

  if (isLeadershipRole() && targetEmployeeId && targetEmployeeId !== state.currentEmployeeId) {
    await persistAllocationLinesForEmployeeDirect(targetEmployeeId, lines, weekStartIso);
    return {
      synced: true,
      count: lines.length
    };
  }

  const { data, error } = await state.supabase.rpc('save_my_allocations', {
    p_period_type: 'week',
    p_period_start: weekStartIso,
    p_lines: lines
  });

  if (error) throw error;

  return {
    synced: true,
    count: Number(data || 0)
  };
}

function syncAllocationManagerUi() {
  const managerMode = isLeadershipRole();
  allocEmployeeFilterWrap?.classList.toggle('hidden', !managerMode);
  renderAllocationEmployeeFilterOptions();
  populateAllocMonthSelector();
  // Ensure week index points to current week if not explicitly set by user navigation
  if (state._allocSelectedWeekIndex == null) {
    const weeks = allocWeekStartsForMonth();
    const currentWeek = getCurrentWeekStartIso();
    const currentIdx = weeks.indexOf(currentWeek);
    state._allocSelectedWeekIndex = currentIdx >= 0 ? currentIdx : null;
  }
  loadWeeklyAllocationsFromSupabase().catch((error) => {
    console.error(error);
    setAllocationPolicyNote(`Unable to load weekly allocation: ${error.message}`);
  });
}

// ── Allocation week navigation listeners ──
if (allocWeekPrevBtn) allocWeekPrevBtn.addEventListener('click', () => navigateAllocWeek(-1));
if (allocWeekNextBtn) allocWeekNextBtn.addEventListener('click', () => navigateAllocWeek(1));
if (allocMonthSelect) {
  allocMonthSelect.addEventListener('change', () => {
    // When switching to the current month, select the current week; otherwise week 1
    const weeks = allocWeekStartsForMonth();
    const currentWeek = getCurrentWeekStartIso();
    const currentIdx = weeks.indexOf(currentWeek);
    state._allocSelectedWeekIndex = currentIdx >= 0 ? currentIdx : 0;
    loadWeeklyAllocationsFromSupabase().catch((error) => {
      console.error(error);
      setAllocationPolicyNote(`Unable to load weekly allocation: ${error.message}`);
    });
  });
}

if (allocEmployeeFilter) {
  allocEmployeeFilter.addEventListener('change', () => {
    state.allocationViewEmployeeId = allocEmployeeFilter.value || null;
    loadWeeklyAllocationsFromSupabase().catch((error) => {
      console.error(error);
      setAllocationPolicyNote(`Unable to load weekly allocation: ${error.message}`);
    });
  });
}

if (allocClientFilter) {
  allocClientFilter.addEventListener('change', () => {
    state.allocationClientFilter = allocClientFilter.value || 'all';
    applyAllocationClientRowFilter();
  });
}

if (addRow && allocationTable) {
  addRow.addEventListener('click', () => {
    if (!canEditWeeklyAllocation()) {
      setAllocationPolicyNote('You can edit weekly allocation on Monday or Tuesday.');
      return;
    }
    if (state.allocationClientFilter !== 'all') {
      state.allocationClientFilter = 'all';
      if (allocClientFilter) allocClientFilter.value = 'all';
      applyAllocationClientRowFilter();
    }
    appendAllocationRow(
      {
        client: '',
        allocation_percent: 0,
        updated_at: ''
      },
      true
    );
    bindAllocationInputListeners();
    updateAllocationSummary();
  });
}

if (saveAllocationsBtn) {
  saveAllocationsBtn.addEventListener('click', async () => {
    if (!canEditWeeklyAllocation()) {
      setAllocationPolicyNote('You can edit weekly allocation on Monday or Tuesday.');
      return;
    }

    const lines = readAllocationLinesFromTable();
    const tooLow = lines.find((l) => l.allocation_percent > 0 && l.allocation_percent < 5);
    if (tooLow) {
      setAllocationPolicyNote(`Minimum allocation is 5%. "${tooLow.project_name}" has ${tooLow.allocation_percent}%.`);
      return;
    }

    saveAllocationsBtn.disabled = true;
    const originalText = saveAllocationsBtn.textContent;
    saveAllocationsBtn.textContent = 'Saving…';

    try {
      const syncResult = await persistAllocationsToSupabase();
      if (syncResult.synced && allocSummary) {
        const base = allocSummary.textContent.split('|')[0].trim();
        allocSummary.textContent = `${base} | Saved ${syncResult.count} line(s).`;
        allocSummary.className = 'status alloc-total';
      }
      saveAllocationsBtn.textContent = 'Saved!';
      await loadWeeklyAllocationsFromSupabase();
    } catch (error) {
      console.error(error);
      if (allocSummary) {
        allocSummary.textContent = `Save failed: ${error.message}. Please check your connection and try again.`;
        allocSummary.className = 'status alloc-total warn';
      }
      saveAllocationsBtn.textContent = 'Retry Save';
    } finally {
      saveAllocationsBtn.disabled = false;
      setTimeout(() => {
        if (saveAllocationsBtn.textContent === 'Saved!' || saveAllocationsBtn.textContent === 'Retry Save') {
          saveAllocationsBtn.textContent = originalText;
        }
      }, 2500);
    }
  });
}

// Delegated click handler for per-row populate button + menu
const allocationTableEl = document.getElementById('allocationTable');
if (allocationTableEl) {
  allocationTableEl.addEventListener('click', async (event) => {
    // Delete row button
    const deleteBtn = event.target.closest('.alloc-delete-btn');
    if (deleteBtn) {
      const row = deleteBtn.closest('tr');
      if (!row) return;
      const clientSelect = row.querySelector('select');
      const clientName = clientSelect?.value || 'this row';
      if (!confirm(`Remove ${clientName} from this week's allocation?`)) return;
      row.remove();
      updateAllocationSummary();
      applyAllocationClientRowFilter();
      return;
    }

    // Toggle menu on "Copy to..." button click
    const toggleBtn = event.target.closest('.populate-btn');
    if (toggleBtn) {
      const menu = toggleBtn.nextElementSibling;
      if (!menu) return;
      // Close all other open menus first
      allocationTableEl.querySelectorAll('.populate-menu:not(.hidden)').forEach(m => {
        if (m !== menu) m.classList.add('hidden');
      });
      const wasHidden = menu.classList.contains('hidden');
      menu.classList.toggle('hidden');
      if (wasHidden) {
        const rect = toggleBtn.getBoundingClientRect();
        const menuHeight = menu.offsetHeight;
        const menuWidth = menu.offsetWidth;
        // Open upward if not enough room below viewport
        const spaceBelow = window.innerHeight - rect.bottom;
        if (spaceBelow < menuHeight + 8) {
          menu.style.top = (rect.top - menuHeight - 4) + 'px';
        } else {
          menu.style.top = (rect.bottom + 4) + 'px';
        }
        // Align right edge of menu with right edge of button
        let left = rect.right - menuWidth;
        if (left < 8) left = 8;
        menu.style.left = left + 'px';
      }
      return;
    }

    // Handle scope button click
    const scopeBtn = event.target.closest('[data-populate-scope]');
    if (!scopeBtn) return;
    const scope = scopeBtn.dataset.populateScope;
    const clientName = scopeBtn.dataset.client;
    if (!clientName || !canEditWeeklyAllocation()) return;
    const wrapper = scopeBtn.closest('.populate-wrapper');
    const mainBtn = wrapper?.querySelector('.populate-btn');
    const menu = scopeBtn.closest('.populate-menu');
    if (menu) menu.classList.add('hidden');
    if (mainBtn) mainBtn.disabled = true;
    try {
      await populateAllocationForClient(clientName, scope);
    } catch (error) {
      console.error(error);
      setAllocationPolicyNote(`Populate failed: ${error.message}`);
    } finally {
      if (mainBtn) mainBtn.disabled = false;
    }
  });

  // Close menus when clicking outside
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.populate-wrapper')) {
      allocationTableEl.querySelectorAll('.populate-menu:not(.hidden)').forEach(m => m.classList.add('hidden'));
    }
  });
}

const allocViewToggle = document.getElementById('allocViewToggle');
if (allocViewToggle) {
  allocViewToggle.addEventListener('click', () => {
    const oldMode = getAllocViewMode();
    const newMode = oldMode === 'hours' ? 'percent' : 'hours';

    // Convert existing inputs in-place so unsaved edits are preserved
    const effectiveHours = getCurrentAllocEffectiveHours();
    document.querySelectorAll('.alloc-input').forEach((input) => {
      const currentVal = Number(input.value);
      if (newMode === 'hours') {
        input.value = Math.round((currentVal / 100) * effectiveHours * 10) / 10;
        input.max = effectiveHours;
        input.step = '0.5';
      } else {
        input.value = effectiveHours > 0 ? Math.round((currentVal / effectiveHours) * 100) : 0;
        input.max = 100;
        input.step = '1';
      }
    });

    document.querySelectorAll('.alloc-percent-field span').forEach((span) => {
      span.textContent = newMode === 'hours' ? 'hrs' : '%';
    });

    setAllocViewMode(newMode);
    syncAllocViewModeLabels();
    updateAllocationSummary();
  });
}

renderWeeklyAllocationViews();

const leaveType = document.getElementById('leaveType');
const leaveStart = document.getElementById('leaveStart');
const leaveEnd = document.getElementById('leaveEnd');
const leaveReason = document.getElementById('leaveReason');
const leaveMedicalCertificateUrl = document.getElementById('leaveMedicalCertificateUrl');
const leaveRuleHint = document.getElementById('leaveRuleHint');
const submitLeaveBtn = document.getElementById('submitLeaveBtn');
const leaveEmailNotice = document.getElementById('leaveEmailNotice');
const leavePlHeadline = document.getElementById('leavePlHeadline');
const leavePlMeta = document.getElementById('leavePlMeta');
const leaveClHeadline = document.getElementById('leaveClHeadline');
const leaveClMeta = document.getElementById('leaveClMeta');
const leaveSlHeadline = document.getElementById('leaveSlHeadline');
const leaveSlMeta = document.getElementById('leaveSlMeta');
const leaveCycleLabel = document.getElementById('leaveCycleLabel');
const leaveCycleMeta = document.getElementById('leaveCycleMeta');
const leaveBalanceNotice = document.getElementById('leaveBalanceNotice');
const leaveArchiveBody = document.getElementById('leaveArchiveBody');
const leaveApprovalTableBody = document.getElementById('leaveApprovalTableBody');
const teamLeaveCalendarTable = document.getElementById('teamLeaveCalendarTable');
const pendingApprovalCount = document.getElementById('pendingApprovalCount');
const leaveApprovalNotice = document.getElementById('leaveApprovalNotice');
const onLeaveTodayCount = document.getElementById('onLeaveTodayCount');
const reporteeLeaveSnapshotBody = document.getElementById('reporteeLeaveSnapshotBody');
const reporteeLeaveSnapshotMeta = document.getElementById('reporteeLeaveSnapshotMeta');
const seeAllLeavesBtn = document.getElementById('seeAllLeavesBtn');
const profileLeaveSummaryNotice = document.getElementById('profileLeaveSummaryNotice');
let leaveRequestSeq = 0;

function leaveDayText(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '0';
  const rounded = Math.round(numeric * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(2).replace(/\.?0+$/, '');
}

function setLeaveBalanceNotice(message = '', className = 'mini-meta') {
  if (!leaveBalanceNotice) return;
  leaveBalanceNotice.className = className;
  leaveBalanceNotice.textContent = message;
}

function emptyLeaveSummary() {
  return {
    cycle_label: 'Apr-Mar',
    cycle_start: null,
    cycle_end: null,
    pl: { allocated: 8, applied: 0, taken: 0, remaining: 8 },
    cl: { allocated: 8, applied: 0, taken: 0, remaining: 8 },
    sl: { allocated: 12, applied: 0, taken: 0, remaining: 12 },
    archive: []
  };
}

function renderLeaveArchiveRows(entries = []) {
  if (!leaveArchiveBody) return;
  leaveArchiveBody.innerHTML = '';
  if (!entries.length) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="5">No archived leave cycles yet.</td>';
    leaveArchiveBody.appendChild(row);
    return;
  }

  entries.forEach((entry) => {
    const row = document.createElement('tr');
    const archivedOn = entry.archived_at ? formatTimestamp(entry.archived_at) : '--';
    row.innerHTML = `
      <td data-label="Cycle">${escapeHtml(entry.cycle_label || '--')}</td>
      <td data-label="PL Rem.">${escapeHtml(leaveDayText(entry.pl_remaining))}</td>
      <td data-label="CL Rem.">${escapeHtml(leaveDayText(entry.cl_remaining))}</td>
      <td data-label="SL Rem.">${escapeHtml(leaveDayText(entry.sl_remaining))}</td>
      <td data-label="Archived">${escapeHtml(archivedOn)}</td>
    `;
    leaveArchiveBody.appendChild(row);
  });
}

function applyLeaveCycleSummary(summaryInput) {
  const summary = summaryInput && typeof summaryInput === 'object' ? summaryInput : emptyLeaveSummary();
  const pl = summary.pl || emptyLeaveSummary().pl;
  const cl = summary.cl || emptyLeaveSummary().cl;
  const sl = summary.sl || emptyLeaveSummary().sl;

  // Cascade: negative PL/CL overflow into SL
  let plRem = pl.remaining, clRem = cl.remaining, slRem = sl.remaining;
  if (plRem < 0) { slRem += plRem; plRem = 0; }
  if (clRem < 0) { slRem += clRem; clRem = 0; }

  state.leaveCycleSummary = summary;

  if (leavePlHeadline) {
    leavePlHeadline.textContent = `Remaining: ${leaveDayText(plRem)}`;
    leavePlHeadline.classList.toggle('leave-negative', plRem < 0);
  }
  if (leaveClHeadline) {
    leaveClHeadline.textContent = `Remaining: ${leaveDayText(clRem)}`;
    leaveClHeadline.classList.toggle('leave-negative', clRem < 0);
  }
  if (leaveSlHeadline) {
    leaveSlHeadline.textContent = `Remaining: ${leaveDayText(slRem)}`;
    leaveSlHeadline.classList.toggle('leave-negative', slRem < 0);
  }

  if (leavePlMeta) {
    leavePlMeta.textContent = `Allocated ${leaveDayText(pl.allocated)} | Taken ${leaveDayText(pl.taken)} | Applied ${leaveDayText(pl.applied)}`;
  }
  if (leaveClMeta) {
    leaveClMeta.textContent = `Allocated ${leaveDayText(cl.allocated)} | Taken ${leaveDayText(cl.taken)} | Applied ${leaveDayText(cl.applied)}`;
  }
  if (leaveSlMeta) {
    leaveSlMeta.textContent = `Allocated ${leaveDayText(sl.allocated)} | Taken ${leaveDayText(sl.taken)} | Applied ${leaveDayText(sl.applied)}`;
  }

  if (leaveCycleLabel) {
    leaveCycleLabel.textContent = summary.cycle_label || 'Apr-Mar';
  }
  if (leaveCycleMeta) {
    const startText = summary.cycle_start ? formatDateForLabel(summary.cycle_start) : '--';
    const endText = summary.cycle_end ? formatDateForLabel(summary.cycle_end) : '--';
    leaveCycleMeta.textContent = `Cycle: ${startText} to ${endText}`;
  }

  renderLeaveArchiveRows(Array.isArray(summary.archive) ? summary.archive : []);
}

async function loadLeaveCycleSummaryFromSupabase() {
  if (!state.supabase || !state.isAuthenticated) {
    applyLeaveCycleSummary(emptyLeaveSummary());
    setLeaveBalanceNotice('Sign in to load leave balances.');
    return;
  }

  const response = await state.supabase.rpc('get_my_leave_cycle_summary', {
    p_as_of_date: toISODateLocal()
  });

  if (response.error) {
    console.error(response.error);
    applyLeaveCycleSummary(emptyLeaveSummary());
    setLeaveBalanceNotice(`Unable to load leave balances: ${response.error.message}`, 'status warn');
    return;
  }

  applyLeaveCycleSummary(response.data || emptyLeaveSummary());
  setLeaveBalanceNotice('Leave balances are loaded from the active leave cycle.');
}

function businessDayCount(startDate, endDate) {
  let count = 0;
  const cur = new Date(startDate);
  while (cur <= endDate) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

function formatShortDate(inputDate) {
  if (!inputDate) return '';
  const [year, month, day] = inputDate.split('-').map(Number);
  if (!year || !month || !day) return '';
  const dt = new Date(year, month - 1, day);
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatLeaveDateRange(startValue, endValue) {
  const start = formatShortDate(startValue);
  const end = formatShortDate(endValue);
  if (!start) return '';
  if (!end || start === end) return start;
  return `${start} – ${end}`;
}

function refreshLeavePendingCount() {
  if (!leaveApprovalTableBody || !pendingApprovalCount) return;
  const pending = leaveApprovalTableBody.querySelectorAll('.leave-approval-status .chip.pending').length;
  pendingApprovalCount.textContent = `(${pending} pending)`;
}

function refreshOnLeaveTodayBadge() {
  if (!onLeaveTodayCount || !isLeadershipRole()) return;
  const todayStr = toISODateLocal();
  const names = new Set();
  state.leaveRowsById.forEach((row) => {
    if (row.status === 'approved' && row.start_date <= todayStr && row.end_date >= todayStr) {
      names.add(displayPersonName(row.employee?.full_name || 'Employee', 'Employee'));
    }
  });
  const count = names.size;
  onLeaveTodayCount.textContent = count === 0
    ? 'No one on leave today'
    : `${count} on leave today`;
  onLeaveTodayCount.className = count > 0 ? 'chip warn' : 'chip info';
  onLeaveTodayCount.title = count > 0 ? Array.from(names).join(', ') : '';
}

function setCalendarLeaveStatus(requestId, statusClass, label) {
  if (!teamLeaveCalendarTable) return;
  const row = teamLeaveCalendarTable.querySelector(`tr[data-request-id=\"${requestId}\"]`);
  const chip = row?.querySelector('.leave-calendar-status');
  if (!chip) return;
  chip.classList.remove('pending', 'approved', 'rejected');
  chip.classList.add(statusClass);
  chip.textContent = label;
}

function setApprovalRowStatus(row, statusClass, label, decisionText) {
  const statusCell = row.querySelector('.leave-approval-status');
  const decisionCell = row.querySelector('.leave-decision-meta');
  const actionButtons = row.querySelectorAll('button[data-leave-action]');
  if (statusCell) {
    statusCell.innerHTML = `<span class=\"chip ${statusClass}\">${label}</span>`;
  }
  if (decisionCell) {
    decisionCell.textContent = decisionText || '--';
  }
  actionButtons.forEach((btn) => {
    btn.disabled = statusClass !== 'pending';
  });
}

function addLeaveRequestToTables({ employee, type, dates }) {
  if (!leaveApprovalTableBody || !teamLeaveCalendarTable) return null;
  leaveRequestSeq += 1;
  const requestId = `lr-${String(leaveRequestSeq).padStart(3, '0')}`;
  const employeeName = escapeHtml(displayPersonName(employee, 'Employee'));

  leaveApprovalTableBody.querySelectorAll('tr').forEach((row) => {
    if (row.children.length === 1 && row.children[0]?.hasAttribute('colspan')) {
      row.remove();
    }
  });

  const approvalRow = document.createElement('tr');
  approvalRow.dataset.requestId = requestId;
  approvalRow.innerHTML = `
    <td>${employeeName}</td>
    <td>${type}</td>
    <td>${dates}</td>
    <td class=\"leave-approval-status\"><span class=\"chip pending\">Pending</span></td>
    <td>
      <button class=\"ghost small\" data-leave-action=\"approve\">Approve</button>
      <button class=\"ghost small\" data-leave-action=\"reject\">Reject</button>
    </td>
    <td class=\"leave-decision-meta\">--</td>
  `;
  leaveApprovalTableBody.appendChild(approvalRow);

  const calendarBody = teamLeaveCalendarTable.querySelector('tbody');
  if (calendarBody) {
    calendarBody.querySelectorAll('tr').forEach((row) => {
      if (row.children.length === 1 && row.children[0]?.hasAttribute('colspan')) {
        row.remove();
      }
    });
    const calendarRow = document.createElement('tr');
    calendarRow.dataset.requestId = requestId;
    calendarRow.innerHTML = `
      <td>${dates}</td>
      <td>${employeeName}</td>
      <td>${type}</td>
      <td><span class=\"chip pending leave-calendar-status\">Pending</span></td>
    `;
    calendarBody.appendChild(calendarRow);
  }

  return requestId;
}

function leaveStatusMeta(status) {
  if (status === 'approved') return { chipClass: 'approved', label: 'Approved' };
  if (status === 'rejected') return { chipClass: 'rejected', label: 'Rejected' };
  if (status === 'cancelled') return { chipClass: 'warn', label: 'Cancelled' };
  return { chipClass: 'pending', label: 'Pending' };
}

function formatDecisionText(row) {
  if (!row.decided_at) return '--';
  const decisionTime = formatTimestamp(row.decided_at);
  const statusMeta = leaveStatusMeta(row.status);
  return `${statusMeta.label} on ${decisionTime}`;
}

function clearRenderedLeaveRows() {
  leaveApprovalTableBody?.querySelectorAll('tr').forEach((row) => row.remove());
  teamLeaveCalendarTable?.querySelectorAll('tbody tr').forEach((row) => row.remove());
}

let showAllHolidays = false;

function renderHolidaysToCalendar() {
  const holidayTable = document.getElementById('holidayCalendarTable');
  const calendarBody = holidayTable?.querySelector('tbody');
  const toggleBtn = document.getElementById('holidayToggleBtn');
  const heading = document.getElementById('holidayHeading');
  if (!calendarBody) return;
  calendarBody.innerHTML = '';
  const todayStr = toISODateLocal(new Date());

  const holidays = showAllHolidays
    ? PUBLIC_HOLIDAYS_2026
    : PUBLIC_HOLIDAYS_2026.filter((h) => h.date >= todayStr).slice(0, 3);

  if (!holidays.length) {
    const emptyRow = document.createElement('tr');
    emptyRow.innerHTML = '<td colspan="3">No upcoming holidays.</td>';
    calendarBody.appendChild(emptyRow);
    if (toggleBtn) toggleBtn.classList.add('hidden');
    return;
  }

  holidays.forEach((h) => {
    const d = new Date(h.date + 'T00:00:00');
    const dateLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const isPast = h.date < todayStr;
    const row = document.createElement('tr');
    if (isPast) row.classList.add('muted-row');
    row.innerHTML = `
      <td data-label="Date">${dateLabel}</td>
      <td data-label="Holiday">${escapeHtml(h.name)}</td>
      <td data-label="Status"><span class="chip ${isPast ? 'muted-chip' : 'approved'}">${isPast ? 'Past' : 'Holiday'}</span></td>
    `;
    calendarBody.appendChild(row);
  });

  if (heading) heading.textContent = showAllHolidays ? 'Public Holidays 2026' : 'Upcoming Public Holidays';
  if (toggleBtn) {
    toggleBtn.textContent = showAllHolidays ? 'Show upcoming only' : 'See all holidays';
    toggleBtn.classList.remove('hidden');
  }
}

const holidayToggleBtn = document.getElementById('holidayToggleBtn');
if (holidayToggleBtn) {
  holidayToggleBtn.addEventListener('click', () => {
    showAllHolidays = !showAllHolidays;
    renderHolidaysToCalendar();
  });
}

function renderLeaveRows(rows) {
  clearRenderedLeaveRows();
  state.leaveRowsById = new Map((rows || []).map((row) => [row.id, row]));

  // Render holidays into their own table
  renderHolidaysToCalendar();

  // Clear the team leave calendar tbody
  const teamLeaveBody = teamLeaveCalendarTable?.querySelector('tbody');
  if (teamLeaveBody) teamLeaveBody.innerHTML = '';

  if (!(rows || []).length) {
    if (leaveApprovalTableBody) {
      const emptyApproval = document.createElement('tr');
      emptyApproval.innerHTML = '<td colspan="6">No leave requests yet.</td>';
      leaveApprovalTableBody.appendChild(emptyApproval);
    }
    if (teamLeaveBody) {
      const emptyLeave = document.createElement('tr');
      emptyLeave.innerHTML = '<td colspan="4">No upcoming team leave.</td>';
      teamLeaveBody.appendChild(emptyLeave);
    }
    refreshLeavePendingCount();
    return;
  }

  // Calculate 30-day window for team leave visibility
  const todayDate = new Date();
  const todayStr = toISODateLocal(todayDate);
  const futureDate = new Date(todayDate);
  futureDate.setDate(futureDate.getDate() + 30);
  const futureStr = toISODateLocal(futureDate);

  let teamLeaveCount = 0;

  // Split into pending and decided for the approval table
  const pendingRows = (rows || []).filter(r => r.status === 'pending');
  const decidedRows = (rows || []).filter(r => r.status !== 'pending')
    .sort((a, b) => {
      // Rows with decided_at sort first (latest on top); imported rows without decision sink to bottom
      if (a.decided_at && !b.decided_at) return -1;
      if (!a.decided_at && b.decided_at) return 1;
      const da = a.decided_at || a.created_at || '';
      const db = b.decided_at || b.created_at || '';
      return db.localeCompare(da);
    });
  const DECIDED_PAGE_SIZE = 5;
  let decidedPage = 0;
  const toggleBtn = document.getElementById('leaveApprovalToggle');

  function buildApprovalRow(row) {
    const employeeName = displayPersonName(row.employee?.full_name || state.currentEmployee || 'Employee', 'Employee');
    const dateLabel = formatLeaveDateRange(row.start_date, row.end_date);
    const statusMeta = leaveStatusMeta(row.status);
    const requesterAccessLevel = normalizeAccessLevel(row.employee?.access_level || 'employee');
    const requiresSuperadminDecision = requesterAccessLevel === 'leadership';
    const canDecide =
      isLeadershipRole() &&
      row.status === 'pending' &&
      (!requiresSuperadminDecision || isSuperadminUser());
    const tr = document.createElement('tr');
    tr.dataset.requestId = row.id;
    tr.innerHTML = `
      <td data-label="Employee">${employeeName}</td>
      <td data-label="Type">${row.leave_type}</td>
      <td data-label="Dates">${dateLabel}</td>
      <td data-label="Status" class="leave-approval-status"><span class="chip ${statusMeta.chipClass}">${statusMeta.label}</span></td>
      <td data-label="Action">
        <button class="ghost small" data-leave-action="approve" ${canDecide ? '' : 'disabled'}>Approve</button>
        <button class="ghost small" data-leave-action="reject" ${canDecide ? '' : 'disabled'}>Reject</button>
      </td>
      <td data-label="Decision" class="leave-decision-meta">${formatDecisionText(row)}</td>
    `;
    return tr;
  }

  function renderApprovalTable() {
    if (!leaveApprovalTableBody) return;
    leaveApprovalTableBody.querySelectorAll('tr').forEach(r => r.remove());

    // Pending first
    pendingRows.forEach(row => leaveApprovalTableBody.appendChild(buildApprovalRow(row)));

    // Then decided — paginated
    const totalDecidedPages = Math.max(1, Math.ceil(decidedRows.length / DECIDED_PAGE_SIZE));
    decidedPage = Math.min(decidedPage, totalDecidedPages - 1);
    const pageStart = decidedPage * DECIDED_PAGE_SIZE;
    const pageSlice = decidedRows.slice(pageStart, pageStart + DECIDED_PAGE_SIZE);
    pageSlice.forEach(row => leaveApprovalTableBody.appendChild(buildApprovalRow(row)));

    if (toggleBtn) {
      if (decidedRows.length > DECIDED_PAGE_SIZE) {
        toggleBtn.classList.remove('hidden');
        const pageLabel = `${decidedPage + 1} / ${totalDecidedPages}`;
        toggleBtn.innerHTML = `<button class="ghost small leave-page-prev" ${decidedPage === 0 ? 'disabled' : ''}>&larr;</button> <span style="font-size:13px;color:var(--muted)">Past decisions · ${pageLabel}</span> <button class="ghost small leave-page-next" ${decidedPage >= totalDecidedPages - 1 ? 'disabled' : ''}>&rarr;</button>`;
      } else {
        toggleBtn.classList.add('hidden');
      }
    }
  }

  renderApprovalTable();

  if (toggleBtn) {
    toggleBtn.onclick = (e) => {
      const totalPages = Math.max(1, Math.ceil(decidedRows.length / DECIDED_PAGE_SIZE));
      if (e.target.closest('.leave-page-next') && decidedPage < totalPages - 1) {
        decidedPage++;
        renderApprovalTable();
        refreshLeavePendingCount();
      } else if (e.target.closest('.leave-page-prev') && decidedPage > 0) {
        decidedPage--;
        renderApprovalTable();
        refreshLeavePendingCount();
      }
    };
  }

  // Team leave calendar
  const allTeamLeave = (rows || []).filter(
    (row) => (row.status === 'approved' || row.status === 'pending') && row.end_date >= todayStr
  );
  const next30Leave = allTeamLeave.filter((row) => row.start_date <= futureStr);
  let showAllTeamLeave = false;
  const teamLeaveToggle = document.getElementById('teamLeaveToggleBtn');
  const teamLeaveHeading = document.getElementById('teamLeaveHeading');

  function buildTeamLeaveRow(row) {
    const employeeName = displayPersonName(row.employee?.full_name || state.currentEmployee || 'Employee', 'Employee');
    const dateLabel = formatLeaveDateRange(row.start_date, row.end_date);
    const statusMeta = leaveStatusMeta(row.status);
    const tr = document.createElement('tr');
    tr.dataset.requestId = row.id;
    tr.innerHTML = `
      <td data-label="Date">${dateLabel}</td>
      <td data-label="Person">${employeeName}</td>
      <td data-label="Type">${row.leave_type}</td>
      <td data-label="Status"><span class="chip ${statusMeta.chipClass} leave-calendar-status">${statusMeta.label}</span></td>
    `;
    return tr;
  }

  function renderTeamLeaveCalendar() {
    if (!teamLeaveBody) return;
    teamLeaveBody.innerHTML = '';
    const visible = showAllTeamLeave ? allTeamLeave : next30Leave.slice(0, 5);
    if (!visible.length) {
      const emptyLeave = document.createElement('tr');
      emptyLeave.innerHTML = `<td colspan="4">No ${showAllTeamLeave ? '' : 'upcoming '}team leave${showAllTeamLeave ? '.' : ' in the next 30 days.'}</td>`;
      teamLeaveBody.appendChild(emptyLeave);
    } else {
      visible.forEach((row) => teamLeaveBody.appendChild(buildTeamLeaveRow(row)));
    }
    if (teamLeaveHeading) {
      teamLeaveHeading.textContent = showAllTeamLeave ? 'All Upcoming Team Leave' : 'Team Leave (Next 30 Days)';
    }
    if (teamLeaveToggle) {
      if (allTeamLeave.length > 0 && (showAllTeamLeave || next30Leave.length > 5 || allTeamLeave.length > next30Leave.length)) {
        teamLeaveToggle.classList.remove('hidden');
        teamLeaveToggle.textContent = showAllTeamLeave ? 'Show next 30 days only' : 'See all team leave';
      } else if (allTeamLeave.length > 0) {
        teamLeaveToggle.classList.remove('hidden');
        teamLeaveToggle.textContent = 'See all team leave';
      } else {
        teamLeaveToggle.classList.add('hidden');
      }
    }
  }

  renderTeamLeaveCalendar();

  if (teamLeaveToggle) {
    teamLeaveToggle.onclick = () => {
      showAllTeamLeave = !showAllTeamLeave;
      renderTeamLeaveCalendar();
    };
  }

  refreshLeavePendingCount();
  refreshOnLeaveTodayBadge();
}

async function loadLeaveRequestsFromSupabase() {
  if (!state.supabase || !state.isAuthenticated) {
    applyLeaveCycleSummary(emptyLeaveSummary());
    setLeaveBalanceNotice('Sign in to load leave balances.');
    clearRenderedLeaveRows();
    renderHolidaysToCalendar();
    return;
  }

  const leaveRowsResult = await state.supabase
    .from('leave_requests')
    .select(`
      id,
      employee_id,
      leave_type,
      start_date,
      end_date,
      reason,
      status,
      approver_emails,
      created_at,
      decided_at,
      employee:employees!leave_requests_employee_id_fkey (
        id,
        full_name,
        email,
        access_level
      )
    `)
    .order('created_at', { ascending: false });

  if (leaveRowsResult.error) {
    console.error(leaveRowsResult.error);
    if (leaveApprovalNotice) {
      leaveApprovalNotice.textContent = `Unable to load leave requests: ${leaveRowsResult.error.message}`;
      leaveApprovalNotice.className = 'status warn';
    }
    setLeaveBalanceNotice(`Unable to load leave balances: ${leaveRowsResult.error.message}`, 'status warn');
    clearRenderedLeaveRows();
    renderHolidaysToCalendar();
    return;
  }

  renderLeaveRows(leaveRowsResult.data || []);
  await loadLeaveCycleSummaryFromSupabase();
  if (isLeadershipRole()) loadReporteeLeaveSnapshot();
}

function computeNextLeaveMap() {
  const todayStr = toISODateLocal();
  const nextLeaveByEmployee = new Map();
  state.leaveRowsById.forEach((row) => {
    if ((row.status === 'approved' || row.status === 'pending') && row.start_date > todayStr) {
      const empId = row.employee_id;
      const existing = nextLeaveByEmployee.get(empId);
      if (!existing || row.start_date < existing) {
        nextLeaveByEmployee.set(empId, row.start_date);
      }
    }
  });
  return nextLeaveByEmployee;
}

function buildLeaveSnapshotRow(emp, summaryMap, nextLeaveMap) {
  const s = summaryMap.get(emp.id) || {};
  let plRem = s.pl_remaining ?? 0;
  let clRem = s.cl_remaining ?? 0;
  let slRem = s.sl_remaining ?? 0;
  if (plRem < 0) { slRem += plRem; plRem = 0; }
  if (clRem < 0) { slRem += clRem; clRem = 0; }
  const totalTaken = (s.pl_taken ?? 0) + (s.cl_taken ?? 0) + (s.sl_taken ?? 0);
  const totalRemaining = plRem + clRem + slRem;
  const nextDate = nextLeaveMap.get(emp.id);
  const tr = document.createElement('tr');
  if (totalRemaining <= 0) tr.className = 'leave-row-warning';
  tr.innerHTML = `
    <td data-label="Name">${escapeHtml(emp.full_name || '--')}</td>
    <td data-label="PL Rem.">${leaveDayText(plRem)}</td>
    <td data-label="CL Rem.">${leaveDayText(clRem)}</td>
    <td data-label="SL Rem." class="${slRem < 0 ? 'leave-negative' : ''}">${leaveDayText(slRem)}</td>
    <td data-label="Taken">${leaveDayText(totalTaken)}</td>
    <td data-label="Total Rem."><strong>${leaveDayText(totalRemaining)}</strong></td>
    <td data-label="Next Leave">${nextDate ? formatDateForLabel(nextDate) : '--'}</td>
  `;
  return tr;
}

function renderReporteeLeaveSnapshotRows(employees, summaryMap, nextLeaveMap) {
  if (!reporteeLeaveSnapshotBody) return;
  reporteeLeaveSnapshotBody.innerHTML = '';
  if (!employees.length) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="7">No reportees with leave tracking.</td>';
    reporteeLeaveSnapshotBody.appendChild(row);
    return;
  }

  // Group by department
  const byDept = new Map();
  employees.forEach((emp) => {
    const dept = normalizeTeamName(emp.department?.name, TEAM_AM);
    if (!byDept.has(dept)) byDept.set(dept, []);
    byDept.get(dept).push(emp);
  });

  // Sort departments: alphabetical, leadership last
  const orderedDepts = [...byDept.keys()].sort((a, b) => {
    const aIsLeadership = a.toLowerCase() === 'leadership' ? 1 : 0;
    const bIsLeadership = b.toLowerCase() === 'leadership' ? 1 : 0;
    if (aIsLeadership !== bIsLeadership) return aIsLeadership - bIsLeadership;
    return a.localeCompare(b);
  });

  // Sort employees within each department by name
  orderedDepts.forEach((dept) => {
    byDept.get(dept).sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
  });

  orderedDepts.forEach((dept) => {
    const deptRow = document.createElement('tr');
    deptRow.className = 'matrix-dept-row';
    deptRow.innerHTML = `<td>${escapeHtml(dept)}</td>${'<td></td>'.repeat(6)}`;
    reporteeLeaveSnapshotBody.appendChild(deptRow);

    byDept.get(dept).forEach((emp) => {
      reporteeLeaveSnapshotBody.appendChild(buildLeaveSnapshotRow(emp, summaryMap, nextLeaveMap));
    });
  });
}

async function loadReporteeLeaveSnapshot() {
  if (!isLeadershipRole() || !state.supabase || !reporteeLeaveSnapshotBody) return;
  const managerEmail = normalizeEmail(state.employeeProfile?.email || state.session?.user?.email || '');
  const reportees = reporteeEmployeesForManager(managerEmail)
    .filter((e) => e.leave_tracking_enabled !== false);
  if (!reportees.length) {
    renderReporteeLeaveSnapshotRows([], new Map(), new Map());
    return;
  }
  const employeeIds = reportees.map((e) => e.id);
  try {
    const response = await state.supabase.rpc('get_leave_summaries_for_employees', {
      p_employee_ids: employeeIds,
      p_as_of_date: toISODateLocal()
    });
    if (response.error) {
      console.error('Reportee leave snapshot error:', response.error);
      reporteeLeaveSnapshotBody.innerHTML = `<tr><td colspan="7">Unable to load: ${escapeHtml(response.error.message)}</td></tr>`;
      return;
    }
    const summaries = Array.isArray(response.data) ? response.data : [];
    const summaryMap = new Map();
    summaries.forEach((s) => summaryMap.set(s.employee_id, s));
    const nextLeaveMap = computeNextLeaveMap();
    renderReporteeLeaveSnapshotRows(reportees, summaryMap, nextLeaveMap);
  } catch (error) {
    console.error('Reportee leave snapshot failed:', error);
  }
}

async function loadAllEmployeeLeaveSnapshot() {
  if (!isLeadershipRole() || !state.supabase || !reporteeLeaveSnapshotBody) return;
  const allEmployees = state.employeeDirectory
    .filter((e) => e.leave_tracking_enabled !== false && e.is_active !== false);
  if (!allEmployees.length) {
    renderReporteeLeaveSnapshotRows([], new Map(), new Map());
    return;
  }
  const employeeIds = allEmployees.map((e) => e.id);
  try {
    const response = await state.supabase.rpc('get_leave_summaries_for_employees', {
      p_employee_ids: employeeIds,
      p_as_of_date: toISODateLocal()
    });
    if (response.error) {
      console.error('All employee leave snapshot error:', response.error);
      return;
    }
    const summaries = Array.isArray(response.data) ? response.data : [];
    const summaryMap = new Map();
    summaries.forEach((s) => summaryMap.set(s.employee_id, s));
    const nextLeaveMap = computeNextLeaveMap();
    renderReporteeLeaveSnapshotRows(allEmployees, summaryMap, nextLeaveMap);
  } catch (error) {
    console.error('All employee leave snapshot failed:', error);
  }
}

if (seeAllLeavesBtn) {
  seeAllLeavesBtn.addEventListener('click', async () => {
    seeAllLeavesBtn.disabled = true;
    seeAllLeavesBtn.textContent = 'Loading...';
    await loadAllEmployeeLeaveSnapshot();
    seeAllLeavesBtn.textContent = 'Showing all employees';
  });
}

async function notifyApproverOnLeaveSubmit(leaveRequestId) {
  if (!state.session?.access_token || !leaveRequestId) return;

  try {
    await fetch('/api/leave-submitted', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${state.session.access_token}`
      },
      body: JSON.stringify({ leaveRequestId })
    });
  } catch (error) {
    console.error('Leave notification trigger failed:', error);
  }
}

function updateLeaveHint() {
  if (!leaveType || !leaveStart || !leaveEnd || !leaveRuleHint) return;
  const employeeRecord = selectedEmployeeRecord();
  const leaveBlocked = employeeRecord.employmentType === 'fractional' || employeeRecord.leaveTrackingEnabled === false;
  if (submitLeaveBtn) submitLeaveBtn.disabled = leaveBlocked;

  if (leaveBlocked) {
    leaveRuleHint.textContent = 'Leave workflow is unavailable for fractional or leave-excluded employees.';
    leaveRuleHint.className = 'status warn';
    return;
  }

  const startValue = leaveStart.value;
  const endValue = leaveEnd.value;

  if (!startValue && !endValue) {
    leaveRuleHint.textContent = '';
    leaveRuleHint.className = 'status';
    return;
  }

  if (!startValue || !endValue) {
    leaveRuleHint.textContent = '';
    leaveRuleHint.className = 'status';
    return;
  }

  const start = parseIsoDateLocal(startValue);
  const end = parseIsoDateLocal(endValue);

  if (!start || !end) {
    leaveRuleHint.textContent = 'Please select valid start and end dates.';
    leaveRuleHint.className = 'status error';
    return;
  }

  if (end < start) {
    leaveRuleHint.textContent = 'Invalid date range. End date must be on or after start date.';
    leaveRuleHint.className = 'status error';
    return;
  }

  const days = businessDayCount(start, end);
  const type = leaveType.value;

  if (days === 0) {
    leaveRuleHint.textContent = 'Selected range has no working days (weekends only).';
    leaveRuleHint.className = 'status warn';
  } else if (type === 'SL' && days >= 3) {
    leaveRuleHint.textContent = `Policy check: SL for ${days} working day(s) requires medical certificate.`;
    leaveRuleHint.className = 'status warn';
  } else {
    leaveRuleHint.textContent = `Policy check: ${type} request for ${days} working day(s) is valid.`;
    leaveRuleHint.className = 'status';
  }
}

[leaveType, leaveStart, leaveEnd].forEach((el) => {
  if (el) el.addEventListener('change', updateLeaveHint);
});
updateLeaveHint();

const medCertLabel = document.getElementById('medCertLabel');
if (leaveType && medCertLabel) {
  const toggleMedCert = () => {
    medCertLabel.classList.toggle('hidden', leaveType.value !== 'SL');
  };
  leaveType.addEventListener('change', toggleMedCert);
  toggleMedCert();
}

if (submitLeaveBtn) {
  submitLeaveBtn.addEventListener('click', async () => {
    const employeeName = displayPersonName(state.currentEmployee || DEFAULT_EMPLOYEE, 'Employee');
    const leaveCode = leaveType?.value || 'CL';
    const dates = formatLeaveDateRange(leaveStart?.value, leaveEnd?.value);
    const employeeRecord = selectedEmployeeRecord();
    const reason = (leaveReason?.value || '').trim();
    const medicalCertificateUrl = (leaveMedicalCertificateUrl?.value || '').trim();

    if (!dates) {
      if (leaveRuleHint) {
        leaveRuleHint.textContent = 'Please select a valid leave date range.';
        leaveRuleHint.className = 'status error';
      }
      return;
    }

    if (employeeRecord.employmentType === 'fractional' || employeeRecord.leaveTrackingEnabled === false) {
      if (leaveEmailNotice) {
        leaveEmailNotice.textContent = 'Leave workflow is unavailable for fractional or leave-excluded employees.';
        leaveEmailNotice.className = 'mini-meta';
      }
      return;
    }

    if (state.leaveCycleSummary) {
      const s = state.leaveCycleSummary;
      const totalRemaining = (s.pl?.remaining ?? 0) + (s.cl?.remaining ?? 0) + (s.sl?.remaining ?? 0);
      if (totalRemaining <= 0) {
        if (leaveRuleHint) {
          leaveRuleHint.textContent = 'You have exhausted your leave balance for this cycle. Please contact leadership.';
          leaveRuleHint.className = 'status error';
        }
        return;
      }
    }

    submitLeaveBtn.disabled = true;
    const origLeaveText = submitLeaveBtn.textContent;
    submitLeaveBtn.textContent = 'Submitting…';

    try {
      if (state.supabase && state.isAuthenticated) {
        const leaveResult = await state.supabase.rpc('submit_leave_request', {
          p_leave_type: leaveCode,
          p_start_date: leaveStart?.value,
          p_end_date: leaveEnd?.value,
          p_reason: reason || null,
          p_medical_certificate_url: medicalCertificateUrl || null
        });

        if (leaveResult.error) {
          if (leaveEmailNotice) {
            leaveEmailNotice.textContent = `Leave submission failed: ${leaveResult.error.message}`;
            leaveEmailNotice.className = 'mini-meta';
          }
          return;
        }

        await notifyApproverOnLeaveSubmit(leaveResult.data?.id);
        await loadLeaveRequestsFromSupabase();
        loadLeaveCycleSummaryFromSupabase();
      } else {
        addLeaveRequestToTables({ employee: employeeName, type: leaveCode, dates });
        refreshLeavePendingCount();
      }

      if (leaveEmailNotice) {
        leaveEmailNotice.textContent = 'Leave submitted. Leadership has been notified by email for approval.';
        leaveEmailNotice.classList.add('ts-fresh');
      }
      if (leaveApprovalNotice) {
        leaveApprovalNotice.textContent = `${employeeName} leave request submitted. Leadership notified by email.`;
        leaveApprovalNotice.className = 'status';
      }
      submitLeaveBtn.textContent = 'Submitted!';
    } catch (error) {
      console.error(error);
      if (leaveEmailNotice) {
        leaveEmailNotice.textContent = `Leave submission failed: ${error.message}`;
        leaveEmailNotice.className = 'mini-meta';
      }
    } finally {
      submitLeaveBtn.disabled = false;
      setTimeout(() => { submitLeaveBtn.textContent = origLeaveText; }, 2000);
    }
  });
}

if (leaveApprovalTableBody) {
  leaveApprovalTableBody.addEventListener('click', async (event) => {
    const actionBtn = event.target.closest('button[data-leave-action]');
    if (!actionBtn) return;

    const row = actionBtn.closest('tr');
    const requestId = row?.dataset.requestId;
    if (!row || !requestId) return;

    const employee = row.children[0]?.textContent?.trim() || 'Employee';
    const action = actionBtn.dataset.leaveAction;
    const approved = action === 'approve';
    const statusClass = approved ? 'approved' : 'rejected';
    const label = approved ? 'Approved' : 'Rejected';
    const decision = `${label} by leadership on ${formatTimestamp()}`;

    actionBtn.disabled = true;
    const origActionText = actionBtn.textContent;
    actionBtn.textContent = approved ? 'Approving…' : 'Rejecting…';
    /* Disable sibling action button too */
    const siblingBtns = row.querySelectorAll('button[data-leave-action]');
    siblingBtns.forEach((b) => { b.disabled = true; });

    try {
      if (state.supabase && state.isAuthenticated) {
        const updateResult = await state.supabase
          .from('leave_requests')
          .update({
            status: approved ? 'approved' : 'rejected',
            decided_at: new Date().toISOString(),
            decision_note: `${label} via leadership panel`
          })
          .eq('id', requestId);

        if (updateResult.error) {
          if (leaveApprovalNotice) {
            leaveApprovalNotice.textContent = `Leave decision failed: ${updateResult.error.message}`;
            leaveApprovalNotice.className = 'status warn';
          }
          return;
        }

        await loadLeaveRequestsFromSupabase();
      } else {
        setApprovalRowStatus(row, statusClass, label, decision);
        setCalendarLeaveStatus(requestId, statusClass, label);
        refreshLeavePendingCount();
    }

    if (leaveApprovalNotice) {
      leaveApprovalNotice.textContent = `${employee} leave has been ${label.toLowerCase()}. Email notification sent to employee.`;
      leaveApprovalNotice.className = approved ? 'status' : 'status warn';
    }
    } catch (error) {
      console.error(error);
      if (leaveApprovalNotice) {
        leaveApprovalNotice.textContent = `Leave decision failed: ${error.message}`;
        leaveApprovalNotice.className = 'status warn';
      }
    } finally {
      siblingBtns.forEach((b) => { b.disabled = false; });
      actionBtn.textContent = origActionText;
    }
  });
}

refreshLeavePendingCount();

const plannerMonth = document.getElementById('plannerMonth');
const weekPrevBtn = document.getElementById('weekPrev');
const weekNextBtn = document.getElementById('weekNext');
const weekLabelEl = document.getElementById('weekLabel');
const matrixSearch = document.getElementById('matrixSearch');
const teamSummaryStrip = document.getElementById('teamSummaryStrip');
const matrixHead = document.getElementById('matrixHead');
const matrixBody = document.getElementById('matrixBody');
const teamDashboardScopeNote = document.getElementById('teamDashboardScopeNote');
const portfolioTableBody = document.getElementById('portfolioTableBody');
const newClientName = document.getElementById('newClientName');
const newClientType = document.getElementById('newClientType');
const newClientOwner = document.getElementById('newClientOwner');
const addClientBtn = document.getElementById('addClientBtn');
const cancelClientEditBtn = document.getElementById('cancelClientEditBtn');
const clientFormNotice = document.getElementById('clientFormNotice');
let editingClientId = null;

function addMonths(dateValue, months) {
  return new Date(dateValue.getFullYear(), dateValue.getMonth() + months, 1);
}

function formatPlannerMonthLabel(dateValue) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(dateValue);
}

function populatePlannerMonthOptions() {
  if (!plannerMonth) return;

  const previousValue = String(plannerMonth.value || '').trim();
  const base = new Date();
  const monthDates = [0, 1, 2].map((offset) => addMonths(base, offset));

  plannerMonth.innerHTML = '';
  monthDates.forEach((monthDate, index) => {
    const option = document.createElement('option');
    option.value = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;
    option.textContent = formatPlannerMonthLabel(monthDate);
    if (previousValue) {
      option.selected = option.value === previousValue;
    } else {
      option.selected = index === 0;
    }
    plannerMonth.appendChild(option);
  });

  if (!plannerMonth.value && plannerMonth.options.length) {
    plannerMonth.selectedIndex = 0;
  }
}

function setTeamDashboardScopeNote(message = '', className = 'mini-meta') {
  if (!teamDashboardScopeNote) return;
  teamDashboardScopeNote.className = className;
  teamDashboardScopeNote.textContent = message;
}

function plannerMonthWindow() {
  const raw = String(plannerMonth?.value || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})$/);
  const base = new Date();
  const year = match ? Number(match[1]) : base.getFullYear();
  const month = match ? Number(match[2]) : base.getMonth() + 1;
  const monthStartDate = new Date(year, month - 1, 1);
  const monthEndDate = new Date(year, month, 0);
  return {
    monthStartDate,
    monthEndDate,
    monthStartIso: toISODateLocal(monthStartDate),
    monthEndIso: toISODateLocal(monthEndDate),
    monthLabel: formatPlannerMonthLabel(monthStartDate)
  };
}

function plannerWeekStartsForMonth(monthWindow) {
  const starts = [];
  const cursor = mondayWeekStartDate(monthWindow.monthStartDate);

  while (cursor <= monthWindow.monthEndDate) {
    if (cursor >= monthWindow.monthStartDate) {
      starts.push(toISODateLocal(cursor));
    }
    cursor.setDate(cursor.getDate() + 7);
  }

  if (!starts.length) {
    starts.push(getCurrentWeekStartIso());
  }

  return starts.sort((a, b) => String(a).localeCompare(String(b)));
}

function shortWeekLabel(weekStartIso) {
  const parsed = parseIsoDateLocal(weekStartIso);
  if (!parsed) return 'W-';
  const { week } = isoWeekMetaFromDate(parsed);
  return `W${week}`;
}

function utilizationStatusMeta(value) {
  const numeric = Number(value) || 0;
  if (numeric > 100) {
    return { key: 'over', label: 'Over', chipClass: 'rejected' };
  }
  if (numeric < 60) {
    return { key: 'under', label: 'Under', chipClass: 'warn' };
  }
  return { key: 'balanced', label: 'Balanced', chipClass: 'approved' };
}

function formatUtilPercentCompact(value, { zeroAsDash = false } = {}) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return zeroAsDash ? '—' : '0%';
  }
  return `${Math.round(numeric)}%`;
}

function weekUtilToneClass(value) {
  const numeric = Number(value) || 0;
  if (numeric > 100) return 'over';
  if (numeric > 0) return 'active';
  return 'zero';
}

function weekChipMarkup(weekStartIso, value, { primary = false } = {}) {
  const toneClass = weekUtilToneClass(value);
  const weekLabel = shortWeekLabel(weekStartIso);
  const valueLabel = formatUtilPercentCompact(value, { zeroAsDash: true });
  const weekId = weekIdentifierFromIsoDate(weekStartIso);
  const emphasisClass = primary ? 'week-chip-primary' : 'week-chip-secondary';
  return `<span class="week-chip ${emphasisClass} week-chip-${toneClass}" title="${escapeHtml(weekId)}">${escapeHtml(
    weekLabel
  )} ${escapeHtml(valueLabel)}</span>`;
}

function formatWeekSpread(weekStarts = [], totalsByWeek = new Map()) {
  if (!weekStarts.length) return '--';
  const primaryWeekStart = weekStarts[0];
  const primaryValue = Number(totalsByWeek.get(primaryWeekStart) || 0);
  const secondaryMarkup = weekStarts
    .slice(1)
    .map((weekStartIso) => weekChipMarkup(weekStartIso, Number(totalsByWeek.get(weekStartIso) || 0)))
    .join('');

  return `
    <div class="week-spread">
      ${weekChipMarkup(primaryWeekStart, primaryValue, { primary: true })}
      ${secondaryMarkup ? `<div class="week-spread-secondary">${secondaryMarkup}</div>` : ''}
    </div>
  `;
}

function renderTeamDashboardEmpty(message = 'No allocation data yet.') {
  if (matrixBody) {
    matrixBody.innerHTML = `<tr><td colspan="3">${escapeHtml(message)}</td></tr>`;
  }
  if (matrixHead) {
    matrixHead.innerHTML = '<tr><th></th><th>Total</th><th>Free</th></tr>';
  }
  if (teamSummaryStrip) {
    teamSummaryStrip.innerHTML = '';
  }
}

function renderResourceMatrix(teamMembers, allocationRows, weekStarts, monthLabel) {
  if (!matrixBody || !matrixHead) return;

  if (!teamMembers.length) {
    renderTeamDashboardEmpty('No reportees mapped for this leadership user yet.');
    setTeamDashboardScopeNote('No reportees mapped for this leadership user yet.');
    return;
  }

  // On mobile, render card layout instead of wide table
  if (window.matchMedia('(max-width: 768px)').matches) {
    renderResourceMatrixMobile(teamMembers, allocationRows, weekStarts, monthLabel);
    return;
  }

  // Build per-employee per-week per-project data
  const empWeekProjectAlloc = new Map(); // employeeId -> Map(weekIso -> Map(projectName -> percent))

  teamMembers.forEach((emp) => {
    empWeekProjectAlloc.set(emp.id, new Map());
    weekStarts.forEach((ws) => {
      empWeekProjectAlloc.get(emp.id).set(ws, new Map());
    });
  });

  (allocationRows || []).forEach((row) => {
    const weekMap = empWeekProjectAlloc.get(row.employee_id);
    if (!weekMap) return;
    const projName = String(row.project?.name || 'Unassigned').trim();
    if (isGarbageProjectName(projName)) return;
    const value = Number(row.allocation_percent) || 0;
    const weekIso = String(row.period_start || '').trim();
    if (weekMap.has(weekIso)) {
      const projWeekMap = weekMap.get(weekIso);
      projWeekMap.set(projName, (projWeekMap.get(projName) || 0) + value);
    }
  });

  // Determine which week to display
  const currentWeekIso = toISODateLocal(mondayWeekStartDate());
  if (state._matrixSelectedWeekIndex == null) {
    const currentIdx = weekStarts.indexOf(currentWeekIso);
    state._matrixSelectedWeekIndex = currentIdx >= 0 ? currentIdx : 0;
  }
  const selectedIdx = Math.max(0, Math.min(state._matrixSelectedWeekIndex, weekStarts.length - 1));
  const selectedWeek = weekStarts[selectedIdx] || currentWeekIso;

  // Update week navigator label and buttons
  if (weekLabelEl) {
    const weekDate = new Date(selectedWeek + 'T00:00:00');
    const monthDay = weekDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    weekLabelEl.textContent = `Week of ${monthDay}`;
  }
  if (weekPrevBtn) weekPrevBtn.disabled = selectedIdx <= 0;
  if (weekNextBtn) weekNextBtn.disabled = selectedIdx >= weekStarts.length - 1;

  // Build per-employee allocations for the selected week only
  const empProjectAlloc = new Map(); // employeeId -> Map(projectName -> percent)
  teamMembers.forEach((emp) => {
    const weekMap = empWeekProjectAlloc.get(emp.id);
    const projMap = weekMap?.get(selectedWeek) || new Map();
    empProjectAlloc.set(emp.id, projMap);
  });

  // Collect active project columns across ALL weeks (so columns stay stable when navigating)
  const projectTotals = new Map();
  empWeekProjectAlloc.forEach((weekMap) => {
    weekMap.forEach((projMap) => {
      projMap.forEach((val, projName) => {
        projectTotals.set(projName, (projectTotals.get(projName) || 0) + val);
      });
    });
  });
  const projectColumns = [...projectTotals.keys()]
    .filter(n => normalizeClientNameKey(n) !== 'internal')
    .sort((a, b) => {
      const diff = (projectTotals.get(b) || 0) - (projectTotals.get(a) || 0);
      return diff !== 0 ? diff : a.localeCompare(b);
    });

  // Build header — Name | Total | Free | ...projects...
  matrixHead.innerHTML = `<tr>
    <th></th>
    <th class="col-total">Total</th>
    <th class="col-free">Free</th>
    ${projectColumns.map((p) => `<th>${escapeHtml(p)}</th>`).join('')}
  </tr>`;

  // Build employee metrics grouped by department
  const byDept = new Map();
  teamMembers.forEach((emp) => {
    const team = normalizeTeamName(emp.department?.name, TEAM_AM);
    if (!byDept.has(team)) byDept.set(team, []);

    const projMap = empProjectAlloc.get(emp.id) || new Map();
    const totalPercent = [...projMap.values()].reduce((s, v) => s + v, 0);
    const capacity = Number(emp.capacity_percent) || 100;
    const freePercent = capacity - totalPercent;

    byDept.get(team).push({
      employee: emp,
      team,
      projMap,
      totalPercent,
      capacity,
      freePercent,
      status: utilizationStatusMeta(totalPercent)
    });
  });

  const orderedDepts = [...byDept.keys()].sort((a, b) => {
    const aIsLeadership = a.toLowerCase() === 'leadership' ? 1 : 0;
    const bIsLeadership = b.toLowerCase() === 'leadership' ? 1 : 0;
    if (aIsLeadership !== bIsLeadership) return aIsLeadership - bIsLeadership;
    return a.localeCompare(b);
  });

  // Sort within each dept: over-utilized first, then by free ascending
  orderedDepts.forEach((dept) => {
    byDept.get(dept).sort((a, b) => {
      if (a.status.key === 'over' && b.status.key !== 'over') return -1;
      if (a.status.key !== 'over' && b.status.key === 'over') return 1;
      return a.freePercent - b.freePercent;
    });
  });

  // Summary stats
  const allMetrics = orderedDepts.flatMap((d) => byDept.get(d));
  const totalPeople = allMetrics.length;
  const totalAllocated = allMetrics.reduce((s, m) => s + m.totalPercent, 0) / 100;
  const totalFree = allMetrics.reduce((s, m) => s + Math.max(0, m.freePercent), 0) / 100;
  const countOver = allMetrics.filter((m) => m.status.key === 'over').length;
  const countIdle = allMetrics.filter((m) => m.totalPercent === 0).length;

  if (teamSummaryStrip) {
    teamSummaryStrip.innerHTML = '';
  }

  // Render rows
  matrixBody.innerHTML = '';
  const colCount = projectColumns.length + 3;

  orderedDepts.forEach((dept) => {
    const deptRow = document.createElement('tr');
    deptRow.className = 'matrix-dept-row';
    deptRow.innerHTML = `<td>${escapeHtml(dept)}</td>${'<td></td>'.repeat(colCount - 1)}`;
    matrixBody.appendChild(deptRow);

    (byDept.get(dept) || []).forEach((metric) => {
      const emp = metric.employee;
      const empName = displayPersonName(emp.full_name, 'Employee');
      const rowClass = metric.status.key === 'over' ? 'matrix-row-over' : metric.totalPercent === 0 ? 'matrix-row-idle' : '';

      const projectCells = projectColumns.map((projName) => {
        const rawPercent = Math.round(metric.projMap.get(projName) || 0);
        if (rawPercent <= 0) {
          return '<td class="matrix-cell-empty">\u2014</td>';
        }
        return `<td class="matrix-cell-val">${rawPercent}%</td>`;
      });

      const totalPercent = Math.round(metric.totalPercent);
      const freePercent = Math.round(metric.freePercent);
      const totalFraction = metric.totalPercent / 100;
      const freeClass = freePercent < 0 ? 'free-over' : freePercent < 10 ? 'free-tight' : 'free-ok';

      const overWidth = totalFraction > 1 ? totalFraction - 1 : 0;
      const allocWidth = Math.min(totalFraction, 1);
      const barHtml = `<div class="capacity-bar">
        <div class="seg seg-alloc" style="width:${(allocWidth * 100).toFixed(0)}%"></div>
        ${overWidth > 0 ? `<div class="seg seg-over" style="width:${(overWidth * 100).toFixed(0)}%"></div>` : ''}
      </div>`;

      const row = document.createElement('tr');
      row.className = rowClass;
      row.dataset.empId = emp.id;
      row.dataset.empName = (emp.full_name || '').toLowerCase();
      row.dataset.empDept = (dept || '').toLowerCase();
      row.innerHTML = `
        <td>
          <span class="matrix-emp-name" data-emp-id="${emp.id}">
            <span class="expand-icon">\u25B6</span>
            ${escapeHtml(empName)}
          </span>
        </td>
        <td class="matrix-cell-total">${totalPercent}%${barHtml}</td>
        <td class="matrix-cell-free ${freeClass}">${freePercent}%</td>
        ${projectCells.join('')}
      `;
      matrixBody.appendChild(row);
    });
  });

  setTeamDashboardScopeNote('');

  // Store data for drill-down and resize re-render
  state._matrixWeekStarts = weekStarts;
  state._matrixEmpWeekProjectAlloc = empWeekProjectAlloc;
  state._matrixProjectColumns = projectColumns;
  state._matrixTeamMembers = teamMembers;
  state._matrixAllocationRows = allocationRows;
}

function renderResourceMatrixMobile(teamMembers, allocationRows, weekStarts, monthLabel) {
  // Reuse data-building logic from renderResourceMatrix
  const empWeekProjectAlloc = new Map();
  teamMembers.forEach((emp) => {
    empWeekProjectAlloc.set(emp.id, new Map());
    weekStarts.forEach((ws) => empWeekProjectAlloc.get(emp.id).set(ws, new Map()));
  });
  (allocationRows || []).forEach((row) => {
    const weekMap = empWeekProjectAlloc.get(row.employee_id);
    if (!weekMap) return;
    const projName = String(row.project?.name || 'Unassigned').trim();
    if (isGarbageProjectName(projName)) return;
    const value = Number(row.allocation_percent) || 0;
    const weekIso = String(row.period_start || '').trim();
    if (weekMap.has(weekIso)) {
      const projWeekMap = weekMap.get(weekIso);
      projWeekMap.set(projName, (projWeekMap.get(projName) || 0) + value);
    }
  });

  const currentWeekIso = toISODateLocal(mondayWeekStartDate());
  if (state._matrixSelectedWeekIndex == null) {
    const currentIdx = weekStarts.indexOf(currentWeekIso);
    state._matrixSelectedWeekIndex = currentIdx >= 0 ? currentIdx : 0;
  }
  const selectedIdx = Math.max(0, Math.min(state._matrixSelectedWeekIndex, weekStarts.length - 1));
  const selectedWeek = weekStarts[selectedIdx] || currentWeekIso;

  if (weekLabelEl) {
    const weekDate = new Date(selectedWeek + 'T00:00:00');
    weekLabelEl.textContent = `Week of ${weekDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }
  if (weekPrevBtn) weekPrevBtn.disabled = selectedIdx <= 0;
  if (weekNextBtn) weekNextBtn.disabled = selectedIdx >= weekStarts.length - 1;

  // Build per-employee allocations for selected week
  const empProjectAlloc = new Map();
  teamMembers.forEach((emp) => {
    const weekMap = empWeekProjectAlloc.get(emp.id);
    empProjectAlloc.set(emp.id, weekMap?.get(selectedWeek) || new Map());
  });

  // Group by department
  const byDept = new Map();
  teamMembers.forEach((emp) => {
    const team = normalizeTeamName(emp.department?.name, TEAM_AM);
    if (!byDept.has(team)) byDept.set(team, []);
    const projMap = empProjectAlloc.get(emp.id) || new Map();
    const totalPercent = [...projMap.values()].reduce((s, v) => s + v, 0);
    const capacity = Number(emp.capacity_percent) || 100;
    const freePercent = capacity - totalPercent;
    byDept.get(team).push({ employee: emp, team, projMap, totalPercent, capacity, freePercent, status: utilizationStatusMeta(totalPercent) });
  });

  const orderedDepts = [...byDept.keys()].sort((a, b) => {
    const aL = a.toLowerCase() === 'leadership' ? 1 : 0;
    const bL = b.toLowerCase() === 'leadership' ? 1 : 0;
    return aL !== bL ? aL - bL : a.localeCompare(b);
  });
  orderedDepts.forEach((dept) => {
    byDept.get(dept).sort((a, b) => {
      if (a.status.key === 'over' && b.status.key !== 'over') return -1;
      if (a.status.key !== 'over' && b.status.key === 'over') return 1;
      return a.freePercent - b.freePercent;
    });
  });

  // Hide table, render cards into wrap
  matrixHead.innerHTML = '';
  matrixBody.innerHTML = '';
  const table = matrixBody.closest('table');
  if (table) table.style.display = 'none';

  let container = document.getElementById('matrixMobileCards');
  if (!container) {
    container = document.createElement('div');
    container.id = 'matrixMobileCards';
    container.className = 'matrix-mobile-cards';
    table.parentNode.appendChild(container);
  }
  container.innerHTML = '';

  orderedDepts.forEach((dept) => {
    const deptLabel = document.createElement('div');
    deptLabel.className = 'matrix-mobile-dept';
    deptLabel.textContent = dept;
    container.appendChild(deptLabel);

    (byDept.get(dept) || []).forEach((metric) => {
      const emp = metric.employee;
      const empName = displayPersonName(emp.full_name, 'Employee');
      const totalPercent = Math.round(metric.totalPercent);
      const freePercent = Math.round(metric.freePercent);
      const freeClass = freePercent < 0 ? 'free-over' : freePercent < 10 ? 'free-tight' : 'free-ok';
      const allocWidth = Math.min(metric.totalPercent / 100, 1);
      const overWidth = metric.totalPercent / 100 > 1 ? metric.totalPercent / 100 - 1 : 0;

      const projects = [...metric.projMap.entries()]
        .filter(([n]) => normalizeClientNameKey(n) !== 'internal')
        .sort((a, b) => b[1] - a[1]);

      const projectsHtml = projects.length
        ? projects.map(([name, pct]) => `<div class="matrix-mobile-proj"><span>${escapeHtml(name)}</span><span>${Math.round(pct)}%</span></div>`).join('')
        : '<div class="matrix-mobile-proj"><span class="mini-meta">No allocations</span></div>';

      const card = document.createElement('div');
      card.className = `matrix-mobile-card ${metric.status.key === 'over' ? 'matrix-card-over' : metric.totalPercent === 0 ? 'matrix-card-idle' : ''}`;
      card.dataset.empId = emp.id;
      card.innerHTML = `
        <div class="matrix-mobile-header">
          <button class="matrix-mobile-name" data-emp-id="${emp.id}">${escapeHtml(empName)}</button>
          <span class="matrix-mobile-pct">${totalPercent}%</span>
        </div>
        <div class="capacity-bar"><div class="seg seg-alloc" style="width:${(allocWidth * 100).toFixed(0)}%"></div>${overWidth > 0 ? `<div class="seg seg-over" style="width:${(overWidth * 100).toFixed(0)}%"></div>` : ''}</div>
        <div class="matrix-mobile-free ${freeClass}">${freePercent}% free</div>
        <div class="matrix-mobile-projects hidden">${projectsHtml}</div>
      `;
      card.querySelector('.matrix-mobile-header').addEventListener('click', () => {
        card.querySelector('.matrix-mobile-projects').classList.toggle('hidden');
      });
      container.appendChild(card);
    });
  });

  setTeamDashboardScopeNote('');
  state._matrixWeekStarts = weekStarts;
  state._matrixEmpWeekProjectAlloc = empWeekProjectAlloc;
  state._matrixProjectColumns = [...new Set(
    [...empWeekProjectAlloc.values()].flatMap(wm => [...wm.values()].flatMap(pm => [...pm.keys()]))
  )].filter(n => normalizeClientNameKey(n) !== 'internal');
  state._matrixTeamMembers = teamMembers;
  state._matrixAllocationRows = allocationRows;
}

async function loadTeamDashboardFromSupabase() {
  if (!canAccessTeamDashboard()) {
    renderTeamDashboardEmpty('Team dashboard is available only for leadership and finance.');
    setTeamDashboardScopeNote('Team dashboard is available only for leadership and finance.');
    return;
  }

  if (!state.supabase || !state.isAuthenticated) {
    renderTeamDashboardEmpty('Sign in to load team allocation snapshots.');
    setTeamDashboardScopeNote('Sign in to load team allocation snapshots.');
    return;
  }

  const TEAM_DASHBOARD_EXCLUDE = ['finance@youragency.com'];
  const managerEmail = normalizeEmail(state.employeeProfile?.email || state.session?.user?.email || '');
  const teamMembers = reporteeEmployeesForManager(managerEmail)
    .filter(e => !TEAM_DASHBOARD_EXCLUDE.includes(normalizeEmail(e.email)));
  const monthWindow = plannerMonthWindow();
  const weekStarts = plannerWeekStartsForMonth(monthWindow);

  if (!teamMembers.length) {
    renderResourceMatrix([], [], weekStarts, monthWindow.monthLabel);
    return;
  }

  const teamEmployeeIds = teamMembers.map((employee) => employee.id);
  const response = await state.supabase
    .from('allocations')
    .select(`
      employee_id,
      period_start,
      allocation_percent,
      updated_at,
      project:projects!allocations_project_id_fkey (
        name
      )
    `)
    .eq('period_type', 'week')
    .in('employee_id', teamEmployeeIds)
    .gte('period_start', monthWindow.monthStartIso)
    .lte('period_start', monthWindow.monthEndIso)
    .order('period_start', { ascending: true })
    .order('updated_at', { ascending: true });

  if (response.error) {
    console.error(response.error);
    renderTeamDashboardEmpty(`Unable to load team dashboard: ${response.error.message}`);
    setTeamDashboardScopeNote(`Unable to load team dashboard: ${response.error.message}`, 'status warn');
    return;
  }

  renderResourceMatrix(teamMembers, response.data || [], weekStarts, monthWindow.monthLabel);
}

function setClientFormNotice(message = '', className = 'mini-meta') {
  if (!clientFormNotice) return;
  clientFormNotice.className = className;
  clientFormNotice.textContent = message;
}

function normalizeClientNameKey(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function currentClientOwnerFullName() {
  const ownDirectoryRow = state.employeeDirectory.find((row) => row.id === state.currentEmployeeId);
  const fallbackFromSession = displayNameFromEmail(state.session?.user?.email || '');
  return String(ownDirectoryRow?.full_name || state.employeeProfile?.full_name || fallbackFromSession || '').trim();
}

function resolveClientOwnerRow(owner) {
  const ownerDisplay = displayPersonName(owner, '');
  return (
    state.employeeDirectory.find((row) => row.full_name === owner || displayPersonName(row.full_name, '') === ownerDisplay) ||
    state.employeeDirectory.find((row) => row.id === state.currentEmployeeId) ||
    null
  );
}

function resetClientEditor() {
  editingClientId = null;
  if (addClientBtn) addClientBtn.textContent = 'Add Client';
  if (cancelClientEditBtn) cancelClientEditBtn.classList.add('hidden');
  if (newClientName) newClientName.value = '';
  if (newClientType) newClientType.value = 'retainer';
  renderClientOwnerOptions();
}

function startClientEdit(clientId) {
  const target = state.clients.find((row) => String(row.id) === String(clientId));
  if (!target) return;

  editingClientId = target.id;
  if (newClientName) newClientName.value = target.name || '';
  if (newClientType) newClientType.value = target.type === 'retainer' ? 'retainer' : target.type === 'pitch' ? 'pitch' : 'project';

  if (newClientOwner) {
    const preferredOwner = target.owner_full_name || '';
    const directMatch = [...newClientOwner.options].some((opt) => opt.value === preferredOwner);
    if (directMatch) {
      newClientOwner.value = preferredOwner;
    } else {
      const ownerDisplay = displayPersonName(target.owner || preferredOwner, '');
      const displayMatch = [...newClientOwner.options].find(
        (opt) => displayPersonName(opt.value, '') === ownerDisplay
      );
      if (displayMatch) {
        newClientOwner.value = displayMatch.value;
      }
    }
  }

  if (addClientBtn) addClientBtn.textContent = 'Update Client';
  if (cancelClientEditBtn) cancelClientEditBtn.classList.remove('hidden');
  setClientFormNotice(`Editing ${target.name}. Save to update, or cancel.`);
  if (newClientName) newClientName.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function refreshProjectFilterOptions() {
  if (isLeadershipRole()) {
    loadTeamDashboardFromSupabase().catch((error) => {
      console.error(error);
      setTeamDashboardScopeNote(`Unable to load team dashboard: ${error.message}`, 'status warn');
    });
  }
}

function renderClientOwnerOptions() {
  if (!newClientOwner) return;
  const leadershipMode = isLeadershipRole();
  const current = newClientOwner.value;
  const ownerNames = dedupeSortedNames(state.employeeDirectory.map((row) => row.full_name));
  const defaultOwner = currentClientOwnerFullName();
  const optionNames = leadershipMode
    ? ownerNames.length
      ? ownerNames
      : defaultOwner
        ? [defaultOwner]
        : []
    : defaultOwner
      ? [defaultOwner]
      : [];
  newClientOwner.disabled = !leadershipMode;

  newClientOwner.innerHTML = '';
  if (!optionNames.length) {
    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = 'No owners available';
    newClientOwner.appendChild(emptyOption);
    return;
  }

  optionNames.forEach((fullName) => {
    const option = document.createElement('option');
    option.value = fullName;
    option.textContent = displayPersonName(fullName, 'Employee');
    newClientOwner.appendChild(option);
  });

  const selectedValue = optionNames.includes(current)
    ? current
    : optionNames.includes(defaultOwner)
      ? defaultOwner
      : optionNames[0];
  newClientOwner.value = selectedValue;
}

function addPortfolioRow({ client, type, owner, status = 'Active' }) {
  const normalizedName = String(client || '').trim();
  if (!normalizedName) return;
  const normalizedType = type === 'retainer' ? 'retainer' : type === 'pitch' ? 'pitch' : 'project';
  const ownerFullName = String(owner || '').trim();
  const ownerLabel = displayPersonName(ownerFullName || '-', '-');
  const existing = state.clients.find((row) => normalizeEmail(row.name) === normalizeEmail(normalizedName));
  if (existing) {
    existing.type = normalizedType;
    existing.owner = ownerLabel;
    existing.owner_full_name = ownerFullName;
    existing.status = status || existing.status || 'Active';
  } else {
    state.clients.push({
      id: `local-${Date.now()}`,
      name: normalizedName,
      type: normalizedType,
      owner: ownerLabel,
      owner_full_name: ownerFullName,
      is_active: true,
      status: status || 'Active'
    });
  }
  renderClientRegistryTable();
}

function canAddClients() {
  if (isSuperadminUser()) return true;
  if (isLeadershipRole()) return true;
  return currentUserDepartmentName() === TEAM_AM;
}

function canEditClients() {
  if (isSuperadminUser()) return true;
  return isLeadershipRole();
}

function canDeleteClients() {
  return isSuperadminUser();
}

function canArchiveClients() {
  if (isSuperadminUser()) return true;
  return isLeadershipRole();
}

function canArchiveClient(clientEntry) {
  if (canArchiveClients()) return true;
  // Client owner (AM) can archive/unarchive their own clients
  return clientEntry?.owner_employee_id && clientEntry.owner_employee_id === state.currentEmployeeId;
}

let clientSortColumn = 'name';
let clientSortAsc = true;

async function renderClientRegistryTable() {
  if (!portfolioTableBody) return;
  const showAdd = canAddClients();
  const showEdit = canEditClients();
  const showDelete = canDeleteClients();
  const showArchiveGlobal = canArchiveClients();

  // Fetch which clients have analytics data (distinct client_ids)
  let clientsWithAnalytics = new Set();
  try {
    const { data: analyticsRows } = await state.supabase
      .from('client_analytics')
      .select('client_id');
    if (analyticsRows) clientsWithAnalytics = new Set(analyticsRows.map(r => r.client_id));
  } catch (_) { /* ignore — just hide all analytics buttons */ }

  const hasAnyAction = true;

  // Show/hide add form based on permission
  const formPanel = portfolioTableBody.closest('section')?.querySelector('.client-form-inline')?.parentElement;
  if (formPanel) formPanel.style.display = showAdd ? '' : 'none';

  portfolioTableBody.innerHTML = '';
  const visibleClients = state.clients.filter((entry) =>
    normalizeClientNameKey(entry.name) !== 'internal' && entry.is_active !== false
  );
  const totalCols = hasAnyAction ? 5 : 4;
  if (!visibleClients.length) {
    const empty = document.createElement('tr');
    empty.innerHTML = `<td colspan="${totalCols}">No clients yet.</td>`;
    portfolioTableBody.appendChild(empty);
    refreshProjectFilterOptions();
    renderTaskClientOptions();
    renderArchivedClientsTable();
    return;
  }

  const sortFn = (a, b) => {
    let valA, valB;
    if (clientSortColumn === 'type') {
      valA = a.type || 'project';
      valB = b.type || 'project';
    } else if (clientSortColumn === 'status') {
      valA = a.status || 'active';
      valB = b.status || 'active';
    } else if (clientSortColumn === 'owner') {
      valA = a.owner || '';
      valB = b.owner || '';
    } else {
      valA = a.name || '';
      valB = b.name || '';
    }
    const cmp = typeof valA === 'number' ? valA - valB : String(valA).localeCompare(String(valB));
    return clientSortAsc ? cmp : -cmp;
  };

  // Update Actions column header visibility
  const table = portfolioTableBody.closest('table');
  const actionsHeader = table?.querySelector('thead th:last-child');
  if (actionsHeader) actionsHeader.style.display = hasAnyAction ? '' : 'none';

  const ordered = [...visibleClients].sort(sortFn);
  ordered.forEach((entry) => {
    const row = document.createElement('tr');
    const normalizedType = entry.type === 'retainer' ? 'Retainer' : entry.type === 'pitch' ? 'Pitch' : 'Project';
    const chipClass = entry.type === 'retainer' ? 'approved' : entry.type === 'pitch' ? 'info' : 'pending';
    const eid = escapeHtml(entry.id);
    const canArchiveThis = canArchiveClient(entry);
    const hasAnalytics = clientsWithAnalytics.has(entry.id);
    let actions = hasAnalytics ? `<button class="ghost small" type="button" data-client-action="analytics" data-client-id="${eid}" title="Analytics">📊</button>` : '';
    if (showEdit) actions += `<button class="ghost small" type="button" data-client-action="edit" data-client-id="${eid}">Edit</button>`;
    if (canArchiveThis) actions += `<button class="ghost small" type="button" data-client-action="archive" data-client-id="${eid}">Archive</button>`;
    if (showDelete) actions += `<button class="ghost small danger" type="button" data-client-action="delete" data-client-id="${eid}">Delete</button>`;
    row.innerHTML = `
      <td data-label="Client"><a href="#" class="client-name-link" data-client-id="${eid}">${escapeHtml(entry.name)}</a></td>
      <td data-label="Type"><span class="chip ${chipClass}">${normalizedType}</span></td>
      <td data-label="Status">${escapeHtml(entry.status || 'Active')}</td>
      <td data-label="Owner">${escapeHtml(entry.owner || '-')}</td>
      <td data-label="">${actions}</td>
    `;
    portfolioTableBody.appendChild(row);
  });
  updateClientSortHeaders();
  refreshProjectFilterOptions();
  renderTaskClientOptions();
  renderWeeklyAllocationViews();
  renderArchivedClientsTable();
}

function updateClientSortHeaders() {
  const table = portfolioTableBody?.closest('table');
  if (!table) return;
  const headers = table.querySelectorAll('thead th');
  const columns = ['name', 'type', 'status', 'owner', null];
  headers.forEach((th, i) => {
    const col = columns[i];
    if (!col) { th.style.cursor = ''; return; }
    th.style.cursor = 'pointer';
    const baseText = th.textContent.replace(/\s*[\u25B2\u25BC\u25BD].*$/, '');
    if (clientSortColumn === col) {
      th.textContent = baseText + (clientSortAsc ? ' \u25B2' : ' \u25BC');
    } else {
      th.textContent = baseText + ' \u25BD';
    }
  });
}

function handleClientSortClick(event) {
  const table = portfolioTableBody?.closest('table');
  if (!table) return;
  const th = event.target.closest('th');
  if (!th) return;
  const headers = [...table.querySelectorAll('thead th')];
  const columns = ['name', 'type', 'status', 'owner', null];
  const idx = headers.indexOf(th);
  const col = columns[idx];
  if (!col) return;
  if (clientSortColumn === col) {
    clientSortAsc = !clientSortAsc;
  } else {
    clientSortColumn = col;
    clientSortAsc = true;
  }
  renderClientRegistryTable();
}

async function loadClientsFromSupabase() {
  if (!state.supabase || !state.isAuthenticated) {
    renderClientRegistryTable();
    return;
  }

  const response = await state.supabase
    .from('clients')
    .select(`
      id,
      name,
      is_active,
      created_at,
      updated_at,
      account_owner:employees!clients_account_owner_employee_id_fkey (
        id,
        full_name
      ),
      projects (
        engagement_type,
        status
      )
    `)
    .order('name', { ascending: true });

  if (response.error) {
    console.error(response.error);
    renderClientRegistryTable();
    return;
  }

  const mapped = (response.data || []).map((row) => {
    const firstProject = Array.isArray(row.projects) && row.projects.length ? row.projects[0] : null;
    const ownerFullName = row.account_owner?.full_name || '';
    return {
      id: row.id,
      name: row.name,
      type: firstProject?.engagement_type === 'retainer' ? 'retainer' : firstProject?.engagement_type === 'pitch' ? 'pitch' : 'project',
      owner_employee_id: row.account_owner?.id || null,
      owner: displayPersonName(ownerFullName || '-', '-'),
      owner_full_name: ownerFullName,
      is_active: row.is_active !== false,
      status: row.is_active === false ? 'Archived' : (firstProject?.status || 'Active'),
      created_at: row.created_at || null,
      updated_at: row.updated_at || null
    };
  });

  const dedupedByName = new Map();
  mapped.forEach((entry) => {
    const key = normalizeClientNameKey(entry.name);
    if (!key) return;
    const existing = dedupedByName.get(key);
    if (!existing) {
      dedupedByName.set(key, entry);
      return;
    }
    const existingTime = existing.updated_at ? new Date(existing.updated_at).getTime() : 0;
    const nextTime = entry.updated_at ? new Date(entry.updated_at).getTime() : 0;
    const shouldReplace = nextTime > existingTime;
    if (shouldReplace) {
      dedupedByName.set(key, entry);
    }
  });
  state.clients = [...dedupedByName.values()].sort((a, b) => a.name.localeCompare(b.name));

  renderClientRegistryTable();
  renderClientOwnerOptions();
}


async function upsertClientToSupabase({ client, type, owner }) {
  const normalizedName = String(client || '').trim();
  if (!normalizedName || !state.supabase || !state.isAuthenticated) return;
  const ownerRow = isLeadershipRole() ? resolveClientOwnerRow(owner) : null;
  const ownerId = isLeadershipRole() ? ownerRow?.id || state.currentEmployeeId || null : state.currentEmployeeId || null;
  if (!ownerId) throw new Error('Could not resolve owner for this client.');

  const clientResult = await state.supabase
    .from('clients')
    .upsert(
      {
        name: normalizedName,
        account_owner_employee_id: ownerId,
        is_active: true
      },
      { onConflict: 'name' }
    )
    .select('id')
    .single();

  if (clientResult.error) throw clientResult.error;

  const projectResult = await state.supabase.from('projects').upsert(
    {
      client_id: clientResult.data.id,
      name: normalizedName,
      engagement_type: type === 'retainer' ? 'retainer' : type === 'pitch' ? 'pitch' : 'project',
      status: 'active',
      owner_employee_id: ownerId
    },
    { onConflict: 'client_id,name' }
  );

  if (projectResult.error) throw projectResult.error;
}

async function syncRenamedClientReferencesInSupabase({ previousName, nextName, ownerId }) {
  const oldName = String(previousName || '').trim();
  const newName = String(nextName || '').trim();
  if (!oldName || !newName || oldName === newName) return;

  const leadershipMode = isLeadershipRole();

  let taskUpdateQuery = state.supabase.from('daily_tasks').update({ notes: newName }).eq('notes', oldName);
  if (!leadershipMode) {
    taskUpdateQuery = taskUpdateQuery.eq('employee_id', state.currentEmployeeId);
  }
  const taskUpdate = await taskUpdateQuery;
  if (taskUpdate.error) {
    console.warn('Unable to sync renamed daily task references:', taskUpdate.error.message);
  }

  const internalClient = await state.supabase.from('clients').select('id').eq('name', 'Internal').maybeSingle();
  if (internalClient.error) {
    console.warn('Unable to locate Internal client for rename sync:', internalClient.error.message);
    return;
  }
  if (!internalClient.data?.id) return;

  let projectsQuery = state.supabase
    .from('projects')
    .select('id, name, owner_employee_id')
    .eq('client_id', internalClient.data.id)
    .in('name', [oldName, newName]);
  if (!leadershipMode) {
    projectsQuery = projectsQuery.eq('owner_employee_id', state.currentEmployeeId);
  }
  const projectsResult = await projectsQuery;
  if (projectsResult.error) {
    console.warn('Unable to load Internal projects for rename sync:', projectsResult.error.message);
    return;
  }

  const projects = projectsResult.data || [];
  const oldProject = projects.find((row) => row.name === oldName) || null;
  const nextProject = projects.find((row) => row.name === newName) || null;

  if (!oldProject) return;

  if (!nextProject) {
    const renameProject = await state.supabase
      .from('projects')
      .update({
        name: newName,
        owner_employee_id: ownerId || null
      })
      .eq('id', oldProject.id);
    if (renameProject.error) {
      console.warn('Unable to rename Internal project during client rename sync:', renameProject.error.message);
    }
    return;
  }

  let allocationUpdateQuery = state.supabase
    .from('allocations')
    .update({ project_id: nextProject.id })
    .eq('project_id', oldProject.id);
  if (!leadershipMode) {
    allocationUpdateQuery = allocationUpdateQuery.eq('employee_id', state.currentEmployeeId);
  }
  const migrateAllocations = await allocationUpdateQuery;
  if (migrateAllocations.error) {
    console.warn('Unable to migrate allocation project references during client rename sync:', migrateAllocations.error.message);
  }

  if (leadershipMode) {
    const deleteOldProject = await state.supabase.from('projects').delete().eq('id', oldProject.id);
    if (deleteOldProject.error) {
      console.warn('Unable to delete old Internal project during client rename sync:', deleteOldProject.error.message);
    }
  }
}

async function updateClientInSupabase({ clientId, client, type, owner }) {
  const normalizedName = String(client || '').trim();
  if (!clientId || !normalizedName || !state.supabase || !state.isAuthenticated) return;

  const currentClientResult = await state.supabase.from('clients').select('name').eq('id', clientId).maybeSingle();
  if (currentClientResult.error) throw currentClientResult.error;
  const previousName = String(currentClientResult.data?.name || '').trim();

  const ownerRow = isLeadershipRole() ? resolveClientOwnerRow(owner) : null;
  const ownerId = isLeadershipRole() ? ownerRow?.id || state.currentEmployeeId || null : state.currentEmployeeId || null;
  if (!ownerId) throw new Error('Could not resolve owner for this client.');

  const clientResult = await state.supabase
    .from('clients')
    .update({
      name: normalizedName,
      account_owner_employee_id: ownerId,
      is_active: true
    })
    .eq('id', clientId);

  if (clientResult.error) throw clientResult.error;

  const projectLookup = await state.supabase
    .from('projects')
    .select('id')
    .eq('client_id', clientId)
    .order('created_at', { ascending: true });
  if (projectLookup.error) throw projectLookup.error;

  const normalizedType = type === 'retainer' ? 'retainer' : type === 'pitch' ? 'pitch' : 'project';
  if ((projectLookup.data || []).length) {
    const updateProject = await state.supabase
      .from('projects')
      .update({
        name: normalizedName,
        engagement_type: normalizedType,
        status: 'active',
        owner_employee_id: ownerId
      })
      .eq('id', projectLookup.data[0].id);
    if (updateProject.error) throw updateProject.error;
  } else {
    const insertProject = await state.supabase.from('projects').insert({
      client_id: clientId,
      name: normalizedName,
      engagement_type: normalizedType,
      status: 'active',
      owner_employee_id: ownerId
    });
    if (insertProject.error) throw insertProject.error;
  }

  await syncRenamedClientReferencesInSupabase({
    previousName,
    nextName: normalizedName,
    ownerId
  });
}

function updateLocalClientById({ clientId, client, type, owner }) {
  const normalizedName = String(client || '').trim();
  if (!clientId || !normalizedName) return;

  const normalizedType = type === 'retainer' ? 'retainer' : type === 'pitch' ? 'pitch' : 'project';
  const ownerFullName = String(owner || '').trim();
  const ownerLabel = displayPersonName(ownerFullName || '-', '-');

  state.clients = state.clients.map((row) => {
    if (String(row.id) !== String(clientId)) return row;
    return {
      ...row,
      name: normalizedName,
      type: normalizedType,
      owner: ownerLabel,
      owner_full_name: ownerFullName,
      status: row.status || 'Active'
    };
  });
}

async function deleteClientById(clientId) {
  if (!clientId) return;
  const target = state.clients.find((row) => String(row.id) === String(clientId));
  const targetName = target?.name || 'this client';
  const confirmed = window.confirm(`Delete ${targetName}? This removes the client and linked projects/allocations.`);
  if (!confirmed) return;

  if (state.supabase && state.isAuthenticated && !String(clientId).startsWith('local-')) {
    const deleteResult = await state.supabase.from('clients').delete().eq('id', clientId);
    if (deleteResult.error) throw deleteResult.error;
    await loadClientsFromSupabase();
    await loadWeeklyAllocationsFromSupabase();
  } else {
    state.clients = state.clients.filter((row) => String(row.id) !== String(clientId));
    renderClientRegistryTable();
  }

  if (String(editingClientId) === String(clientId)) {
    resetClientEditor();
  }
  setClientFormNotice(`Deleted ${targetName}.`);
}

async function archiveClientById(clientId) {
  if (!clientId) return;
  const target = state.clients.find((row) => String(row.id) === String(clientId));
  const targetName = target?.name || 'this client';
  const confirmed = window.confirm(`Archive ${targetName}? The client will be hidden but data is preserved.`);
  if (!confirmed) return;

  if (state.supabase && state.isAuthenticated && !String(clientId).startsWith('local-')) {
    const archiveResult = await state.supabase.from('clients').update({ is_active: false }).eq('id', clientId);
    if (archiveResult.error) throw archiveResult.error;
    await loadClientsFromSupabase();
  } else {
    state.clients = state.clients.map((row) =>
      String(row.id) === String(clientId) ? { ...row, is_active: false, status: 'Archived' } : row
    );
    renderClientRegistryTable();
  }

  if (String(editingClientId) === String(clientId)) {
    resetClientEditor();
  }
  setClientFormNotice(`Archived ${targetName}.`);
}

function renderArchivedClientsTable() {
  const archivedBody = document.getElementById('archivedClientsBody');
  if (!archivedBody) return;
  const archivedPanel = document.getElementById('archivedClientsPanel');

  const archivedClients = state.clients.filter((entry) =>
    normalizeClientNameKey(entry.name) !== 'internal' && entry.is_active === false
  );

  archivedBody.innerHTML = '';
  if (!archivedClients.length) {
    if (archivedPanel) archivedPanel.style.display = 'none';
    return;
  }

  // Only show archived clients that the user can see/unarchive
  const visibleArchived = archivedClients.filter(entry => canArchiveClient(entry));
  if (!visibleArchived.length) {
    if (archivedPanel) archivedPanel.style.display = 'none';
    return;
  }

  if (archivedPanel) archivedPanel.style.display = '';
  visibleArchived.sort((a, b) => a.name.localeCompare(b.name)).forEach((entry) => {
    const row = document.createElement('tr');
    const normalizedType = entry.type === 'retainer' ? 'Retainer' : entry.type === 'pitch' ? 'Pitch' : 'Project';
    const chipClass = entry.type === 'retainer' ? 'approved' : entry.type === 'pitch' ? 'info' : 'pending';
    const eid = escapeHtml(entry.id);
    row.innerHTML = `
      <td data-label="Client">${escapeHtml(entry.name)}</td>
      <td data-label="Type"><span class="chip ${chipClass}">${normalizedType}</span></td>
      <td data-label="Owner">${escapeHtml(entry.owner || '-')}</td>
      <td data-label=""><button class="ghost small" type="button" data-client-action="unarchive" data-client-id="${eid}">Unarchive</button></td>
    `;
    archivedBody.appendChild(row);
  });
}

async function unarchiveClientById(clientId) {
  if (!clientId) return;
  const target = state.clients.find((row) => String(row.id) === String(clientId));
  const targetName = target?.name || 'this client';

  if (state.supabase && state.isAuthenticated && !String(clientId).startsWith('local-')) {
    const result = await state.supabase.from('clients').update({ is_active: true }).eq('id', clientId);
    if (result.error) throw result.error;
    await loadClientsFromSupabase();
  } else {
    state.clients = state.clients.map((row) =>
      String(row.id) === String(clientId) ? { ...row, is_active: true, status: 'Active' } : row
    );
    renderClientRegistryTable();
  }

  setClientFormNotice(`Restored ${targetName}.`);
}

// ── Client Detail View ───────────────────────────────────────────
const clientDetailView = document.getElementById('clientDetailView');
const clientDetailBack = document.getElementById('clientDetailBack');
const clientDetailName = document.getElementById('clientDetailName');
const clientDetailMeta = document.getElementById('clientDetailMeta');
const clientDetailAllocBody = document.getElementById('clientDetailAllocBody');
const clientDetailTaskBody = document.getElementById('clientDetailTaskBody');
const clientListPanels = document.querySelectorAll('#client-projects > .panel, #client-projects > .screen-head');

async function showClientDetail(clientId) {
  const client = state.clients.find(c => String(c.id) === String(clientId));
  if (!client || !clientDetailView) return;

  // Ensure allocation data is loaded (may be empty for non-leadership users)
  if (!state.homeAllocations.length) {
    await loadHomeStatsFromSupabase();
  }

  // Hide list panels, show detail view
  clientListPanels.forEach(el => el.classList.add('hidden'));
  clientDetailView.classList.remove('hidden');
  state.selectedClientId = clientId;

  // Push history state so browser back returns to client list
  const url = new URL(window.location.href);
  url.hash = 'client-projects';
  window.history.pushState({ screenId: 'client-projects', clientDetailId: clientId }, '', url.toString());

  // Allocations — find from homeAllocations where project's client matches
  const empNameMap = new Map();
  const empCapMap = new Map();
  (state.employeeDirectory || []).forEach(e => {
    empNameMap.set(e.id, e.full_name || e.email);
    empCapMap.set(e.id, (e.capacity_percent || 100) / 100);
  });

  const clientName = client.name.toLowerCase().trim();
  const allocRows = (state.homeAllocations || []).filter(a => {
    const projName = (a.project?.name || '').toLowerCase().trim();
    return projName === clientName;
  });

  let totalClientHours = 0;
  if (!allocRows.length) {
    clientDetailAllocBody.innerHTML = '<tr><td colspan="3">No allocations this week.</td></tr>';
  } else {
    const empAllocMap = new Map();
    allocRows.forEach(a => {
      const current = empAllocMap.get(a.employee_id) || 0;
      empAllocMap.set(a.employee_id, current + (a.allocation_percent || 0));
    });
    let allocHtml = '';
    [...empAllocMap.entries()].sort((a, b) => b[1] - a[1]).forEach(([empId, pct]) => {
      const name = empNameMap.get(empId) || 'Unknown';
      const cap = empCapMap.get(empId) || 1;
      const hrs = (pct / 100) * cap * WORK_HOURS_PER_WEEK;
      totalClientHours += hrs;
      allocHtml += `<tr>
        <td data-label="Person">${escapeHtml(name)}</td>
        <td data-label="Allocation %">${pct}%</td>
        <td data-label="Hours">${hrs.toFixed(1)}h</td>
      </tr>`;
    });
    clientDetailAllocBody.innerHTML = allocHtml;
  }

  // Header
  const normalizedType = client.type === 'retainer' ? 'Retainer' : client.type === 'pitch' ? 'Pitch' : 'Project';
  clientDetailName.textContent = client.name;
  clientDetailMeta.innerHTML = `
    <div class="util-box"><div class="util-label">Type</div><div class="util-value">${escapeHtml(normalizedType)}</div></div>
    <div class="util-box"><div class="util-label">Status</div><div class="util-value">${escapeHtml(client.status || 'Active')}</div></div>
    <div class="util-box"><div class="util-label">Owner</div><div class="util-value">${escapeHtml(client.owner || '-')}</div></div>
    <div class="util-box"><div class="util-label">Hrs/Week</div><div class="util-value">${totalClientHours > 0 ? Math.round(totalClientHours) + 'h' : '-'}</div></div>
  `;

  // Tasks — find today's tasks where notes (client) matches this client
  const todayIso = toISODateLocal();
  const clientTasks = (state.dailyTasks || []).filter(t => {
    const taskClient = (t.notes || '').toLowerCase().trim();
    return taskClient === clientName && t.task_date === todayIso && t.status !== 'archived';
  });

  if (!clientTasks.length) {
    clientDetailTaskBody.innerHTML = '<tr><td colspan="4">No tasks for today.</td></tr>';
  } else {
    let taskHtml = '';
    clientTasks.forEach(t => {
      const name = empNameMap.get(t.employee_id) || 'Unknown';
      const statusChip = t.status === 'done' ? 'approved' : 'pending';
      const statusLabel = t.status === 'done' ? 'Done' : t.status === 'in_progress' ? 'In Progress' : t.status;
      taskHtml += `<tr${t.status === 'done' ? ' class="task-done"' : ''}>
        <td data-label="Person">${escapeHtml(name)}</td>
        <td data-label="Task">${escapeHtml(t.task_title || '')}</td>
        <td data-label="Status"><span class="chip ${statusChip}">${statusLabel}</span></td>
        <td data-label="Priority">${t.sort_order || '\u2013'}</td>
      </tr>`;
    });
    clientDetailTaskBody.innerHTML = taskHtml;
  }
}

function hideClientDetail() {
  if (clientDetailView) clientDetailView.classList.add('hidden');
  clientListPanels.forEach(el => el.classList.remove('hidden'));
  state.selectedClientId = null;
}

if (clientDetailBack) {
  clientDetailBack.addEventListener('click', () => {
    hideClientDetail();
    // Pop the detail history entry so back doesn't re-trigger
    if (window.history.state?.clientDetailId) window.history.back();
  });
}

// Delegate click on client name links
if (portfolioTableBody) {
  portfolioTableBody.addEventListener('click', (event) => {
    const link = event.target.closest('.client-name-link');
    if (link) {
      event.preventDefault();
      showClientDetail(link.dataset.clientId);
    }
  });
}

// =============================================
// CLIENT ANALYTICS — LinkedIn Performance Reports
// =============================================

const analyticsUploadInline = document.getElementById('analyticsUploadInline');
const analyticsFileInput = document.getElementById('analyticsFileInput');

let analyticsCurrentClientId = null;


// Format large numbers
function fmtAnalytics(n) {
  if (n == null || isNaN(n)) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return Number(n).toLocaleString();
}

function pctAnalytics(n) {
  if (n == null || isNaN(n)) return '0%';
  return (n * 100).toFixed(1) + '%';
}

function trendArrow(current, previous) {
  const cur = Number(current) || 0;
  const prev = Number(previous) || 0;
  if (prev === 0 && cur === 0) return '';
  if (cur > prev) return ' <span class="trend-up">↑</span>';
  if (cur < prev) return ' <span class="trend-down">↓</span>';
  return '';
}

function weekLabelAnalytics(w) {
  let ds = String(w || '').trim();
  // Normalize MM/DD/YYYY → YYYY-MM-DD
  const m = ds.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) ds = m[3] + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0');
  const d = new Date(ds + 'T00:00:00');
  if (isNaN(d.getTime())) return ds;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function monthLabelAnalytics(key) {
  const [y, m] = key.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

function normalizeDateStr(ds) {
  ds = String(ds || '').trim();
  const m = ds.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return m[3] + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0');
  return ds;
}

function getReportCompareLabel(report) {
  const weekly = report.metrics_data || [];
  if (weekly.length < 1) return report.report_label || 'No data';
  if (weekly.length < 2) return `Week of ${weekLabelAnalytics(weekly[0].week)}`;
  const latest = weekly[weekly.length - 1];
  const prev = weekly[weekly.length - 2];
  const now = new Date();
  const latestDate = new Date(normalizeDateStr(latest.week) + 'T00:00:00');
  const diffDays = Math.floor((now - latestDate) / (1000 * 60 * 60 * 24));
  if (diffDays >= 0 && diffDays < 7) return 'This week vs last week';
  return `Week of ${weekLabelAnalytics(latest.week)} vs ${weekLabelAnalytics(prev.week)}`;
}

function aggregateWeeklyToMonthly(weekly) {
  const map = new Map();
  weekly.forEach(w => {
    const monthKey = w.week.substring(0, 7);
    if (!map.has(monthKey)) {
      map.set(monthKey, {
        month: monthKey,
        'Impressions (organic)': 0, 'Impressions (sponsored)': 0, 'Impressions (total)': 0,
        'Clicks (total)': 0, 'Reactions (total)': 0, 'Comments (total)': 0, 'Reposts (total)': 0,
        'New followers (organic)': 0, 'New followers (sponsored)': 0, 'New followers (total)': 0,
        'Engagement rate (total)': 0, _engCount: 0, 'Posts': 0
      });
    }
    const m = map.get(monthKey);
    m['Posts'] += w['Posts'] || 0;
    m['Impressions (organic)'] += w['Impressions (organic)'] || 0;
    m['Impressions (sponsored)'] += w['Impressions (sponsored)'] || 0;
    m['Impressions (total)'] += w['Impressions (total)'] || 0;
    m['Clicks (total)'] += w['Clicks (total)'] || 0;
    m['Reactions (total)'] += w['Reactions (total)'] || 0;
    m['Comments (total)'] += w['Comments (total)'] || 0;
    m['Reposts (total)'] += w['Reposts (total)'] || 0;
    m['New followers (organic)'] += w['New followers (organic)'] || 0;
    m['New followers (sponsored)'] += w['New followers (sponsored)'] || 0;
    m['New followers (total)'] += w['New followers (total)'] || 0;
    const eng = w['Engagement rate (total)'] || 0;
    if (eng > 0) { m['Engagement rate (total)'] += eng; m._engCount++; }
  });
  const months = [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
  months.forEach(m => {
    if (m._engCount > 0) m['Engagement rate (total)'] /= m._engCount;
    delete m._engCount;
  });
  return months;
}

// --- XLS/CSV Parsing ---
function parseLinkedInAnalytics(file, existingWb) {
  return new Promise((resolve, reject) => {
    function doParse(wb) {
      try {
        // Find sheets — LinkedIn exports have "Metrics" and "All posts" (or similar names)
        const metricsSheetName = wb.SheetNames.find(s => /metric/i.test(s)) || wb.SheetNames[0];
        const postsSheetName = wb.SheetNames.find(s => /post/i.test(s)) || wb.SheetNames[1];

        // LinkedIn XLS has a description row 0, actual headers in row 1, data from row 2
        // Use header:1 to get raw arrays, then manually map using row 1 as keys
        function parseLinkedInSheet(ws) {
          if (!ws) return [];
          const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
          if (raw.length < 3) return [];
          // Row 0 = description, Row 1 = column headers, Row 2+ = data
          // But if row 0 looks like a short header (not a description), use it directly
          let headerIdx = 1;
          const r0First = String(raw[0][0] || '').trim();
          // If row 0 first cell is short (< 50 chars) and looks like a column name, use it as header
          if (r0First.length < 50 && (r0First === 'Date' || r0First === 'Post title')) {
            headerIdx = 0;
          }
          const headers = raw[headerIdx];
          const rows = [];
          for (let i = headerIdx + 1; i < raw.length; i++) {
            const obj = {};
            headers.forEach((h, idx) => { obj[String(h).trim()] = raw[i][idx] !== undefined ? raw[i][idx] : ''; });
            rows.push(obj);
          }
          return rows;
        }
        const metricsRaw = metricsSheetName ? parseLinkedInSheet(wb.Sheets[metricsSheetName]) : [];
        const postsRaw = postsSheetName ? parseLinkedInSheet(wb.Sheets[postsSheetName]) : [];

        // Aggregate metrics into weekly rollups
        const weeklyMap = new Map();
        metricsRaw.forEach(row => {
          // LinkedIn date column is usually "Date"
          let dateVal = row['Date'] || row['date'] || '';
          if (typeof dateVal === 'number') {
            // Excel serial date
            const d = new Date((dateVal - 25569) * 86400 * 1000);
            dateVal = d.toISOString().split('T')[0];
          } else if (dateVal instanceof Date) {
            dateVal = dateVal.toISOString().split('T')[0];
          } else {
            dateVal = String(dateVal).trim();
            // Convert MM/DD/YYYY to YYYY-MM-DD
            const slashParts = dateVal.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
            if (slashParts) dateVal = slashParts[3] + '-' + slashParts[1].padStart(2, '0') + '-' + slashParts[2].padStart(2, '0');
          }
          if (!dateVal || dateVal.length < 8) return;

          // Compute week start (Monday)
          const dt = new Date(dateVal + 'T00:00:00');
          if (isNaN(dt.getTime())) return;
          const day = dt.getDay();
          const diff = day === 0 ? 6 : day - 1;
          const weekStart = new Date(dt);
          weekStart.setDate(dt.getDate() - diff);
          const weekKey = weekStart.toISOString().split('T')[0];

          if (!weeklyMap.has(weekKey)) {
            weeklyMap.set(weekKey, {
              week: weekKey,
              'Impressions (organic)': 0, 'Impressions (sponsored)': 0, 'Impressions (total)': 0,
              'Clicks (total)': 0, 'Reactions (total)': 0, 'Comments (total)': 0, 'Reposts (total)': 0,
              'New followers (organic)': 0, 'New followers (sponsored)': 0, 'New followers (total)': 0,
              'Engagement rate (total)': 0, _engCount: 0, 'Posts': 0
            });
          }
          const w = weeklyMap.get(weekKey);
          w['Impressions (organic)'] += Number(row['Impressions (organic)']) || 0;
          w['Impressions (sponsored)'] += Number(row['Impressions (sponsored)']) || 0;
          w['Impressions (total)'] += Number(row['Impressions (total)']) || Number(row['Impressions (organic)']) || 0;
          w['Clicks (total)'] += Number(row['Clicks (total)']) || 0;
          w['Reactions (total)'] += Number(row['Reactions (total)']) || 0;
          w['Comments (total)'] += Number(row['Comments (total)']) || 0;
          w['Reposts (total)'] += Number(row['Reposts (total)']) || 0;
          w['New followers (organic)'] += Number(row['New followers (organic)']) || 0;
          w['New followers (sponsored)'] += Number(row['New followers (sponsored)']) || 0;
          w['New followers (total)'] += Number(row['New followers (total)']) || Number(row['New followers (organic)']) || 0;
          const eng = Number(row['Engagement rate (total)']) || Number(row['Engagement rate (organic)']) || 0;
          if (eng > 0) { w['Engagement rate (total)'] += eng; w._engCount++; }
        });

        // Average out engagement rates
        const weekly = [...weeklyMap.values()].sort((a, b) => a.week.localeCompare(b.week));
        weekly.forEach(w => {
          if (w._engCount > 0) w['Engagement rate (total)'] /= w._engCount;
          delete w._engCount;
        });

        // Parse posts
        const posts = postsRaw.map(row => {
          const impressions = Number(row['Impressions']) || 0;
          const clicks = Number(row['Clicks']) || 0;
          const likes = Number(row['Likes']) || 0;
          const comments = Number(row['Comments']) || 0;
          const reposts = Number(row['Reposts']) || 0;
          const engRate = Number(row['Engagement rate']) || 0;
          const engScore = likes + comments * 2 + reposts * 3;

          let createdDate = row['Created date'] || '';
          let postWeekKey = '';
          if (typeof createdDate === 'number') {
            const d = new Date((createdDate - 25569) * 86400 * 1000);
            createdDate = d.toLocaleDateString('en-IN', { month: '2-digit', day: '2-digit', year: 'numeric' });
            const day = d.getDay(); const diff = day === 0 ? 6 : day - 1;
            const ws = new Date(d); ws.setDate(d.getDate() - diff);
            postWeekKey = ws.toISOString().split('T')[0];
          } else if (createdDate) {
            const str = String(createdDate).trim();
            const slashParts = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
            const isoStr = slashParts ? slashParts[3] + '-' + slashParts[1].padStart(2, '0') + '-' + slashParts[2].padStart(2, '0') : str;
            const d = new Date(isoStr + 'T00:00:00');
            if (!isNaN(d.getTime())) {
              const day = d.getDay(); const diff = day === 0 ? 6 : day - 1;
              const ws = new Date(d); ws.setDate(d.getDate() - diff);
              postWeekKey = ws.toISOString().split('T')[0];
            }
          }

          // Count post in its weekly bucket
          if (postWeekKey && weeklyMap.has(postWeekKey)) {
            weeklyMap.get(postWeekKey)['Posts']++;
          }

          return {
            'Post title': row['Post title'] || '',
            'Post link': row['Post link'] || '',
            'Post type': row['Post type'] || (row['Campaign name'] ? 'Sponsored' : 'Organic'),
            'Created date': createdDate,
            'Posted by': row['Posted by'] || '',
            'Impressions': impressions,
            'Clicks': clicks,
            'Likes': likes,
            'Comments': comments,
            'Reposts': reposts,
            'Engagement rate': engRate,
            'Content Type': row['Content Type'] || '',
            engagement_score: engScore
          };
        }).sort((a, b) => b.engagement_score - a.engagement_score);

        // Compute summary totals
        const impressions_organic = weekly.reduce((s, w) => s + w['Impressions (organic)'], 0);
        const impressions_sponsored = weekly.reduce((s, w) => s + w['Impressions (sponsored)'], 0);
        const impressions_total = weekly.reduce((s, w) => s + w['Impressions (total)'], 0);
        const clicks = weekly.reduce((s, w) => s + w['Clicks (total)'], 0);
        const reactions = weekly.reduce((s, w) => s + w['Reactions (total)'], 0);
        const comments = weekly.reduce((s, w) => s + w['Comments (total)'], 0);
        const reposts = weekly.reduce((s, w) => s + w['Reposts (total)'], 0);
        const new_followers = weekly.reduce((s, w) => s + (w['New followers (total)'] || 0), 0);
        const new_followers_organic = weekly.reduce((s, w) => s + (w['New followers (organic)'] || 0), 0);
        const new_followers_sponsored = weekly.reduce((s, w) => s + (w['New followers (sponsored)'] || 0), 0);
        const avgEng = weekly.length ? weekly.reduce((s, w) => s + w['Engagement rate (total)'], 0) / weekly.length : 0;

        let dateFrom = '', dateTo = '';
        if (weekly.length) {
          dateFrom = weekLabelAnalytics(weekly[0].week);
          dateTo = weekLabelAnalytics(weekly[weekly.length - 1].week);
        }

        const summary = {
          impressions_total, impressions_organic, impressions_sponsored,
          clicks, reactions, comments, reposts,
          new_followers, new_followers_organic, new_followers_sponsored,
          avg_engagement: (avgEng * 100).toFixed(1),
          total_posts: posts.length,
          date_from: dateFrom, date_to: dateTo
        };

        const reportLabel = dateFrom && dateTo ? `${dateFrom} \u2013 ${dateTo}` : 'Analytics Report';

        resolve({
          metrics_data: weekly,
          posts_data: posts,
          summary,
          report_label: reportLabel
        });
      } catch (err) {
        reject(err);
      }
    }
    if (existingWb) { doParse(existingWb); }
    else {
      const reader = new FileReader();
      reader.onload = function(e) {
        if (typeof XLSX === 'undefined') { reject(new Error('SheetJS library not loaded')); return; }
        const data = new Uint8Array(e.target.result);
        doParse(XLSX.read(data, { type: 'array' }));
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    }
  });
}

// --- Followers Report Parser ---
function parseLinkedInFollowersReport(file, existingWb) {
  return new Promise((resolve, reject) => {
    function doParse(wb) {
      try {
        function parseSheet(ws) {
          if (!ws) return [];
          const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
          if (raw.length < 2) return [];
          const headers = raw[0];
          const rows = [];
          for (let i = 1; i < raw.length; i++) {
            const obj = {};
            headers.forEach((h, idx) => { obj[String(h).trim()] = raw[i][idx] !== undefined ? raw[i][idx] : ''; });
            rows.push(obj);
          }
          return rows;
        }

        function parseDateVal(dateVal) {
          if (typeof dateVal === 'number') {
            return new Date((dateVal - 25569) * 86400 * 1000).toISOString().split('T')[0];
          } else if (dateVal instanceof Date) {
            return dateVal.toISOString().split('T')[0];
          }
          const s = String(dateVal).trim();
          const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
          return m ? m[3] + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0') : s;
        }

        // Parse "New followers" sheet → daily rows
        const followersSheet = wb.Sheets[wb.SheetNames.find(s => /new follower/i.test(s)) || wb.SheetNames[0]];
        const followersRaw = parseSheet(followersSheet);
        const dailyFollowers = followersRaw.map(row => ({
          date: parseDateVal(row['Date'] || ''),
          organic: Number(row['Organic followers']) || 0,
          sponsored: Number(row['Sponsored followers']) || 0,
          total: Number(row['Total followers']) || 0
        })).filter(r => r.date && r.date.length >= 8);

        // Parse demographic sheets
        function parseDemoSheet(sheetName, nameCol, countCol) {
          const ws = wb.Sheets[wb.SheetNames.find(s => s.toLowerCase() === sheetName.toLowerCase())];
          if (!ws) return [];
          const rows = parseSheet(ws);
          return rows.map(r => ({
            name: String(r[nameCol] || '').trim(),
            count: Number(r[countCol]) || 0
          })).filter(r => r.name && r.count > 0).sort((a, b) => b.count - a.count);
        }

        const demographics_data = {
          job_function: parseDemoSheet('Job function', 'Job function', 'Total followers'),
          seniority: parseDemoSheet('Seniority', 'Seniority', 'Total followers'),
          industry: parseDemoSheet('Industry', 'Industry', 'Total followers'),
          company_size: parseDemoSheet('Company size', 'Company size', 'Total followers'),
          location: parseDemoSheet('Location', 'Location', 'Total followers')
        };

        // Date range for label
        let dateFrom = '', dateTo = '';
        if (dailyFollowers.length) {
          dateFrom = weekLabelAnalytics(dailyFollowers[0].date);
          dateTo = weekLabelAnalytics(dailyFollowers[dailyFollowers.length - 1].date);
        }
        const reportLabel = dateFrom && dateTo ? `${dateFrom} – ${dateTo}` : 'Followers Report';

        resolve({
          metrics_data: dailyFollowers,
          demographics_data,
          report_label: reportLabel
        });
      } catch (err) { reject(err); }
    }
    if (existingWb) { doParse(existingWb); }
    else {
      const reader = new FileReader();
      reader.onload = function(e) {
        if (typeof XLSX === 'undefined') { reject(new Error('SheetJS library not loaded')); return; }
        const data = new Uint8Array(e.target.result);
        doParse(XLSX.read(data, { type: 'array' }));
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    }
  });
}

// --- Visitors Report Parser ---
function parseLinkedInVisitorsReport(file, existingWb) {
  return new Promise((resolve, reject) => {
    function doParse(wb) {
      try {

        function parseSheet(ws) {
          if (!ws) return [];
          const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
          if (raw.length < 2) return [];
          const headers = raw[0];
          const rows = [];
          for (let i = 1; i < raw.length; i++) {
            const obj = {};
            headers.forEach((h, idx) => { obj[String(h).trim()] = raw[i][idx] !== undefined ? raw[i][idx] : ''; });
            rows.push(obj);
          }
          return rows;
        }

        function parseDateVal(dateVal) {
          if (typeof dateVal === 'number') {
            return new Date((dateVal - 25569) * 86400 * 1000).toISOString().split('T')[0];
          } else if (dateVal instanceof Date) {
            return dateVal.toISOString().split('T')[0];
          }
          const s = String(dateVal).trim();
          const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
          return m ? m[3] + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0') : s;
        }

        // Parse "Visitor metrics" sheet
        const visitorSheet = wb.Sheets[wb.SheetNames.find(s => /visitor metric/i.test(s)) || wb.SheetNames[0]];
        const visitorRaw = parseSheet(visitorSheet);
        const dailyVisitors = visitorRaw.map(row => ({
          date: parseDateVal(row['Date'] || ''),
          overview_views: Number(row['Overview page views (total)']) || 0,
          overview_unique: Number(row['Overview unique visitors (total)']) || 0,
          total_views: Number(row['Total page views (total)']) || 0,
          total_unique: Number(row['Total unique visitors (total)']) || 0
        })).filter(r => r.date && r.date.length >= 8);

        // Parse demographic sheets (same as followers but count column = "Total views")
        function parseDemoSheet(sheetName, nameCol, countCol) {
          const ws = wb.Sheets[wb.SheetNames.find(s => s.toLowerCase() === sheetName.toLowerCase())];
          if (!ws) return [];
          const rows = parseSheet(ws);
          return rows.map(r => ({
            name: String(r[nameCol] || '').trim(),
            count: Number(r[countCol]) || 0
          })).filter(r => r.name && r.count > 0).sort((a, b) => b.count - a.count);
        }

        const demographics_data = {
          job_function: parseDemoSheet('Job function', 'Job function', 'Total views'),
          seniority: parseDemoSheet('Seniority', 'Seniority', 'Total views'),
          industry: parseDemoSheet('Industry', 'Industry', 'Total views'),
          company_size: parseDemoSheet('Company size', 'Company size', 'Total views'),
          location: parseDemoSheet('Location', 'Location', 'Total views')
        };

        let dateFrom = '', dateTo = '';
        if (dailyVisitors.length) {
          dateFrom = weekLabelAnalytics(dailyVisitors[0].date);
          dateTo = weekLabelAnalytics(dailyVisitors[dailyVisitors.length - 1].date);
        }
        const reportLabel = dateFrom && dateTo ? `${dateFrom} – ${dateTo}` : 'Visitors Report';

        resolve({
          visitor_metrics: dailyVisitors,
          demographics_data,
          report_label: reportLabel
        });
      } catch (err) { reject(err); }
    }
    if (existingWb) { doParse(existingWb); }
    else {
      const reader = new FileReader();
      reader.onload = function(e) {
        if (typeof XLSX === 'undefined') { reject(new Error('SheetJS library not loaded')); return; }
        const data = new Uint8Array(e.target.result);
        doParse(XLSX.read(data, { type: 'array' }));
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    }
  });
}

// --- Auto-detect LinkedIn report type from sheet names ---
function detectReportType(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        if (typeof XLSX === 'undefined') { reject(new Error('SheetJS library not loaded')); return; }
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const names = wb.SheetNames || [];
        let type = null;
        if (names.some(s => /new follower/i.test(s))) type = 'followers';
        else if (names.some(s => /visitor metric/i.test(s))) type = 'visitors';
        else if (names.some(s => /metric/i.test(s)) || names.some(s => /post/i.test(s))) type = 'content';
        if (!type) { reject(new Error('Could not detect report type. Expected a LinkedIn Content, Followers, or Visitors export.')); return; }
        resolve({ type, workbook: wb });
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

// --- Merge helper: appends new rows to existing, keyed by unique identifier ---
function mergeByKey(existing, incoming, keyFn) {
  const map = new Map();
  (existing || []).forEach(r => map.set(keyFn(r), r));
  (incoming || []).forEach(r => map.set(keyFn(r), r));
  return [...map.values()];
}

// --- Upload Flow (auto-detect + append/merge) ---
if (analyticsFileInput) {
  analyticsFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xls', 'xlsx', 'csv'].includes(ext)) {
      alert('Only .xls, .xlsx, or .csv files are supported.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      alert('File too large (max 20 MB).');
      return;
    }
    if (!analyticsCurrentClientId) return;

    const detectedLabel = document.getElementById('analyticsDetectedType');
    const metaEl = document.getElementById('analyticsClientMeta');

    try {
      // Auto-detect report type from sheet names
      const { type: reportType, workbook } = await detectReportType(file);
      if (detectedLabel) { detectedLabel.textContent = reportType.charAt(0).toUpperCase() + reportType.slice(1) + ' report detected'; detectedLabel.style.display = ''; }

      // Parse using detected type (reuse already-read workbook)
      let parsed;
      if (reportType === 'content') {
        parsed = await parseLinkedInAnalytics(file, workbook);
      } else if (reportType === 'followers') {
        parsed = await parseLinkedInFollowersReport(file, workbook);
      } else if (reportType === 'visitors') {
        parsed = await parseLinkedInVisitorsReport(file, workbook);
      }
      if (!parsed) throw new Error('Unknown report type');

      // Upload raw file to storage
      const filePath = `${analyticsCurrentClientId}/${Date.now()}_${file.name}`;
      const { error: storageError } = await state.supabase.storage
        .from('client-analytics')
        .upload(filePath, file, { upsert: false });
      if (storageError) throw new Error('Storage upload failed: ' + storageError.message);

      // Fetch existing record for this client + type (for merging)
      const { data: existing } = await state.supabase
        .from('client_analytics')
        .select('metrics_data, posts_data, summary, demographics_data, visitor_metrics')
        .eq('client_id', analyticsCurrentClientId)
        .eq('report_type', reportType)
        .maybeSingle();

      // Merge parsed data with existing data (append, not replace)
      let mergedMetrics, mergedPosts, mergedSummary, mergedDemographics, mergedVisitorMetrics;
      let newItemCount = 0;

      if (reportType === 'content') {
        const oldMetrics = existing?.metrics_data || [];
        const oldPosts = existing?.posts_data || [];
        mergedMetrics = mergeByKey(oldMetrics, parsed.metrics_data, r => r.week).sort((a, b) => a.week.localeCompare(b.week));
        mergedPosts = mergeByKey(oldPosts, parsed.posts_data, r => r['Post link']).sort((a, b) => (b.engagement_score || 0) - (a.engagement_score || 0));
        newItemCount = mergedMetrics.length - oldMetrics.length;
        const newPostCount = mergedPosts.length - oldPosts.length;
        // Recompute summary from merged metrics
        const impressions_organic = mergedMetrics.reduce((s, w) => s + (w['Impressions (organic)'] || 0), 0);
        const impressions_sponsored = mergedMetrics.reduce((s, w) => s + (w['Impressions (sponsored)'] || 0), 0);
        const impressions_total = mergedMetrics.reduce((s, w) => s + (w['Impressions (total)'] || 0), 0);
        const clicks = mergedMetrics.reduce((s, w) => s + (w['Clicks (total)'] || 0), 0);
        const reactions = mergedMetrics.reduce((s, w) => s + (w['Reactions (total)'] || 0), 0);
        const comments = mergedMetrics.reduce((s, w) => s + (w['Comments (total)'] || 0), 0);
        const reposts = mergedMetrics.reduce((s, w) => s + (w['Reposts (total)'] || 0), 0);
        const new_followers = mergedMetrics.reduce((s, w) => s + (w['New followers (total)'] || 0), 0);
        const avgEng = mergedMetrics.length ? mergedMetrics.reduce((s, w) => s + (w['Engagement rate (total)'] || 0), 0) / mergedMetrics.length : 0;
        let dateFrom = '', dateTo = '';
        if (mergedMetrics.length) { dateFrom = weekLabelAnalytics(mergedMetrics[0].week); dateTo = weekLabelAnalytics(mergedMetrics[mergedMetrics.length - 1].week); }
        mergedSummary = { impressions_total, impressions_organic, impressions_sponsored, clicks, reactions, comments, reposts, new_followers, avg_engagement: (avgEng * 100).toFixed(1), total_posts: mergedPosts.length, date_from: dateFrom, date_to: dateTo };
        // Show feedback
        if (metaEl) {
          const parts = [];
          if (newItemCount > 0) parts.push(`${newItemCount} new week${newItemCount > 1 ? 's' : ''}`);
          if (newPostCount > 0) parts.push(`${newPostCount} new post${newPostCount > 1 ? 's' : ''}`);
          if (newItemCount === 0 && newPostCount === 0) parts.push('data updated');
          metaEl.textContent = `\u2713 Content report merged \u2014 ${parts.join(', ')}`;
        }
      } else if (reportType === 'followers') {
        const oldMetrics = existing?.metrics_data || [];
        mergedMetrics = mergeByKey(oldMetrics, parsed.metrics_data, r => r.date).sort((a, b) => a.date.localeCompare(b.date));
        mergedDemographics = parsed.demographics_data; // always replace (cumulative snapshot)
        newItemCount = mergedMetrics.length - oldMetrics.length;
        if (metaEl) {
          metaEl.textContent = newItemCount > 0 ? `\u2713 Followers report merged \u2014 ${newItemCount} new day${newItemCount > 1 ? 's' : ''} added` : '\u2713 Followers report updated';
        }
      } else if (reportType === 'visitors') {
        const oldMetrics = existing?.visitor_metrics || [];
        mergedVisitorMetrics = mergeByKey(oldMetrics, parsed.visitor_metrics, r => r.date).sort((a, b) => a.date.localeCompare(b.date));
        mergedDemographics = parsed.demographics_data; // always replace
        newItemCount = mergedVisitorMetrics.length - oldMetrics.length;
        if (metaEl) {
          metaEl.textContent = newItemCount > 0 ? `\u2713 Visitors report merged \u2014 ${newItemCount} new day${newItemCount > 1 ? 's' : ''} added` : '\u2713 Visitors report updated';
        }
      }

      // Build DB record with merged data
      const reportLabel = reportType === 'content' && mergedSummary
        ? (mergedSummary.date_from && mergedSummary.date_to ? `${mergedSummary.date_from} \u2013 ${mergedSummary.date_to}` : parsed.report_label)
        : parsed.report_label;

      const record = {
        client_id: analyticsCurrentClientId,
        report_type: reportType,
        report_label: reportLabel,
        file_name: file.name,
        file_path: filePath,
        file_size_bytes: file.size,
        uploaded_by: state.currentEmployeeId,
        insights_cache: {} // clear cache to force re-generation
      };

      if (reportType === 'content') {
        record.metrics_data = mergedMetrics;
        record.posts_data = mergedPosts;
        record.summary = mergedSummary;
      } else if (reportType === 'followers') {
        record.metrics_data = mergedMetrics;
        record.demographics_data = mergedDemographics;
      } else if (reportType === 'visitors') {
        record.visitor_metrics = mergedVisitorMetrics;
        record.demographics_data = mergedDemographics;
      }

      // Upsert using unique index (client_id, report_type)
      const { error: dbError } = await state.supabase
        .from('client_analytics')
        .upsert(record, { onConflict: 'client_id,report_type' });
      if (dbError) throw new Error('Database save failed: ' + dbError.message);

      analyticsFileInput.value = '';
      if (detectedLabel) detectedLabel.style.display = 'none';
      renderClientAnalyticsTab(analyticsCurrentClientId);
      // Revert meta text after 4 seconds
      setTimeout(() => { if (analyticsCurrentClientId) renderClientAnalyticsTab(analyticsCurrentClientId); }, 4000);
    } catch (err) {
      console.error('Analytics upload error:', err);
      alert('Upload failed: ' + err.message);
    }
  });
}

// ═══════════════════════════════════════════════════════
// NEW ANALYTICS TAB — Overview, Audience Intelligence, Post Performance
// ═══════════════════════════════════════════════════════

// Chart.js instance tracking for cleanup
const _analyticsChartInstances = [];
function destroyAnalyticsCharts() {
  while (_analyticsChartInstances.length) {
    const c = _analyticsChartInstances.pop();
    try { c.destroy(); } catch (_) {}
  }
}

// Target persona definitions (hardcoded for altM)
const ANALYTICS_TARGET_INDUSTRIES = ['Pharmaceuticals', 'Biotechnology', 'Chemical Manufacturing', 'Research Services'];
const ANALYTICS_TARGET_JOB_FUNCTIONS = ['Research', 'Engineering', 'Business Development'];
const ANALYTICS_DECISION_MAKER_SENIORITY = ['Manager', 'Director', 'VP', 'CXO', 'Owner', 'Partner'];

// State for current analytics data
window._analyticsReports = {}; // { content, followers, visitors }

// --- Main Analytics Screen Renderer ---
async function renderClientAnalyticsTab(clientId) {
  const overviewPanel = document.getElementById('analyticsTabOverview');
  const audiencePanel = document.getElementById('analyticsTabAudience');
  const postsPanel = document.getElementById('analyticsTabPosts');
  if (!overviewPanel) return;

  // Populate screen header with client name
  const clientEntry = (state.clients || []).find(c => c.id === clientId);
  const nameEl = document.getElementById('analyticsClientName');
  const metaEl = document.getElementById('analyticsClientMeta');
  if (nameEl) nameEl.textContent = clientEntry ? `${clientEntry.name} — Analytics` : 'Analytics';

  // Show upload button for AMs / leadership / admin
  if (analyticsUploadInline) {
    analyticsUploadInline.style.display = canAddClients() ? '' : 'none';
  }

  overviewPanel.innerHTML = '<p class="mini-meta" style="padding:var(--space-4)">Loading analytics...</p>';

  const { data: reports, error } = await state.supabase
    .from('client_analytics')
    .select('id, report_type, report_label, file_name, uploaded_at, metrics_data, posts_data, summary, demographics_data, visitor_metrics, uploaded_by, insights_cache')
    .eq('client_id', clientId)
    .order('uploaded_at', { ascending: false });

  if (error) {
    overviewPanel.innerHTML = '<p class="mini-meta" style="padding:var(--space-4)">Failed to load reports.</p>';
    return;
  }

  // Group by report_type — take the latest of each type
  const grouped = {};
  (reports || []).forEach(r => {
    if (!grouped[r.report_type]) grouped[r.report_type] = r;
  });
  window._analyticsReports = grouped;

  const contentReport = grouped.content || null;
  const followersReport = grouped.followers || null;
  const visitorsReport = grouped.visitors || null;

  // Show "Data uploaded until" date in header meta
  if (metaEl) {
    const allUploads = (reports || []).map(r => r.uploaded_at).filter(Boolean).sort();
    const latestUpload = allUploads.length ? new Date(allUploads[allUploads.length - 1]) : null;
    if (latestUpload && !isNaN(latestUpload)) {
      const dd = String(latestUpload.getDate()).padStart(2, '0');
      const mm = String(latestUpload.getMonth() + 1).padStart(2, '0');
      const yy = String(latestUpload.getFullYear()).slice(-2);
      metaEl.innerHTML = `Data uploaded until:<br>${dd}/${mm}/${yy}`;
    } else {
      metaEl.textContent = '';
    }
  }

  // Store content report as current for insights
  window._analyticsCurrentReport = contentReport;

  if (!contentReport && !followersReport && !visitorsReport) {
    overviewPanel.innerHTML = `
      <div class="analytics-empty">
        <div class="analytics-empty-icon">📊</div>
        <p>No analytics reports uploaded yet.</p>
        ${canAddClients() ? '<p class="mini-meta">Upload LinkedIn analytics exports to see data.</p>' : ''}
      </div>`;
    if (audiencePanel) audiencePanel.innerHTML = '';
    if (postsPanel) postsPanel.innerHTML = '';
    return;
  }

  // Render Overview tab
  destroyAnalyticsCharts();
  renderAnalyticsOverview(contentReport, followersReport, visitorsReport);

  // Render Audience Intelligence tab
  renderAnalyticsAudience(followersReport, visitorsReport);

  // Render Post Performance tab
  renderAnalyticsPostPerformance(contentReport);

  // Wire inner tab switching
  wireAnalyticsInnerTabs();
}

// --- Inner Tab Switching ---
let _analyticsInnerTabsWired = false;
function wireAnalyticsInnerTabs() {
  if (_analyticsInnerTabsWired) return;
  const tabBar = document.getElementById('analyticsInnerTabs');
  if (!tabBar) return;
  _analyticsInnerTabsWired = true;
  tabBar.addEventListener('click', (e) => {
    const tab = e.target.closest('.analytics-inner-tab');
    if (!tab) return;
    e.preventDefault();
    tabBar.querySelectorAll('.analytics-inner-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('#client-analytics > .analytics-tab-panel').forEach(p => p.classList.remove('active'));
    const panel = document.getElementById(
      tab.dataset.analyticsTab === 'overview' ? 'analyticsTabOverview' :
      tab.dataset.analyticsTab === 'audience' ? 'analyticsTabAudience' : 'analyticsTabPosts'
    );
    if (panel) panel.classList.add('active');
  });
}

// --- Overview Tab ---
function renderAnalyticsOverview(contentReport, followersReport, visitorsReport) {
  const panel = document.getElementById('analyticsTabOverview');
  if (!panel) return;

  const weekly = contentReport?.metrics_data || [];
  const posts = contentReport?.posts_data || [];
  const followerDaily = followersReport?.metrics_data || [];
  const visitorDaily = visitorsReport?.visitor_metrics || [];
  const followerDemo = followersReport?.demographics_data || {};

  // KPI cards — last week vs previous week (week-on-week)
  const latestWeek = weekly.length ? weekly[weekly.length - 1] : null;
  const prevWeek = weekly.length > 1 ? weekly[weekly.length - 2] : null;

  const lastWeekImpressions = latestWeek ? Math.round(latestWeek['Impressions (organic)'] || 0) : 0;
  const lastWeekEngRate = latestWeek ? (latestWeek['Engagement rate (total)'] || 0) : 0;

  // Followers — last 7 days vs previous 7 days
  const fLen = followerDaily.length;
  const fRecent = fLen >= 7 ? followerDaily.slice(-7).reduce((s, d) => s + (d.total || 0), 0) : 0;
  const fPrev = fLen >= 14 ? followerDaily.slice(-14, -7).reduce((s, d) => s + (d.total || 0), 0) : 0;

  // Visitors — last 7 days vs previous 7 days
  const vLen = visitorDaily.length;
  const vRecent = vLen >= 7 ? visitorDaily.slice(-7).reduce((s, d) => s + (d.overview_unique || 0), 0) : 0;
  const vPrev = vLen >= 14 ? visitorDaily.slice(-14, -7).reduce((s, d) => s + (d.overview_unique || 0), 0) : 0;

  const kpis = [
    { label: 'Impressions', value: fmtAnalytics(lastWeekImpressions), arrow: prevWeek ? trendArrow(lastWeekImpressions, prevWeek['Impressions (organic)'] || 0) : '' },
    { label: 'Engagement Rate', value: pctAnalytics(lastWeekEngRate), arrow: prevWeek ? trendArrow(lastWeekEngRate, prevWeek['Engagement rate (total)'] || 0) : '' },
    { label: 'New Followers', value: fRecent > 0 ? `+${fmtAnalytics(fRecent)}` : '–', arrow: fLen >= 14 ? trendArrow(fRecent, fPrev) : '' },
    { label: 'Page Visits', value: vRecent > 0 ? fmtAnalytics(vRecent) : '–', arrow: vLen >= 14 ? trendArrow(vRecent, vPrev) : '' },
  ];

  const kpiPeriod = latestWeek?.week ? `Week of ${weekLabelAnalytics(latestWeek.week)}` : 'Last week';
  const kpiHtml = `<div class="analytics-kpi-period">${kpiPeriod}${prevWeek ? ' · vs previous week' : ''}</div>
  <div class="analytics-overview-kpi">${kpis.map(k => `
    <div class="analytics-kpi-card">
      <div class="analytics-kpi-label">${k.label}</div>
      <div class="analytics-kpi-value">${k.value}${k.arrow || ''}</div>
    </div>`).join('')}</div>`;

  // AI Brand Signal banner
  const brandSignalHtml = buildInsightsBanner('brand-signal', 'Week-on-week brand signal analysis');

  // Charts placeholder canvases
  const chartsHtml = `<div class="analytics-charts-row">
    <div class="analytics-chart-card panel">
      <h4>Weekly Impressions</h4>
      <canvas id="chartWeeklyImpressions"></canvas>
    </div>
    <div class="analytics-chart-card panel">
      <h4>Engagement Rate %</h4>
      <canvas id="chartEngagementRate"></canvas>
    </div>
  </div>
  <div class="analytics-charts-row">
    <div class="analytics-chart-card panel">
      <h4>New Followers Weekly</h4>
      <canvas id="chartNewFollowers"></canvas>
    </div>
    <div class="analytics-chart-card panel">
      <h4>Audience Quality Snapshot</h4>
      ${buildAudienceQualitySnapshot(followerDemo)}
    </div>
  </div>`;

  panel.innerHTML = kpiHtml + brandSignalHtml + chartsHtml;

  // Render Chart.js charts
  if (typeof Chart !== 'undefined') {
    renderOverviewCharts(weekly, followerDaily);
  }
}

function getChartThemeColors() {
  const style = getComputedStyle(document.documentElement);
  return {
    primary: style.getPropertyValue('--primary').trim() || '#bca4b6',
    primarySoft: 'rgba(188, 164, 182, 0.25)',
    good: style.getPropertyValue('--good').trim() || '#3a9d6a',
    text: style.getPropertyValue('--text').trim() || '#e8e6df',
    muted: style.getPropertyValue('--text-secondary').trim() || 'rgba(232, 230, 223, 0.55)',
    line: 'rgba(255, 255, 255, 0.08)',
    surface: style.getPropertyValue('--surface-quiet').trim() || '#2a2a28',
  };
}

function renderOverviewCharts(weekly, followerDaily) {
  const colors = getChartThemeColors();
  const chartFont = { family: "'Manrope', 'Avenir Next', sans-serif", size: 11 };
  const MAX_CHART_WEEKS = 10;
  const chartDefaults = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(30, 30, 28, 0.95)',
        titleFont: { family: chartFont.family, size: 12 },
        bodyFont: { family: chartFont.family, size: 12 },
        titleColor: '#fff',
        bodyColor: '#e8e6df',
        padding: 10,
        cornerRadius: 6,
        displayColors: false
      }
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: chartFont, color: colors.muted, maxRotation: 45 } },
      y: { grid: { color: colors.line }, ticks: { font: chartFont, color: colors.muted } }
    }
  };

  // Limit weekly data to last N weeks
  const recentWeekly = weekly.slice(-MAX_CHART_WEEKS);

  // Weekly Impressions — area chart
  const imprCanvas = document.getElementById('chartWeeklyImpressions');
  if (imprCanvas && recentWeekly.length) {
    const ctx = imprCanvas.getContext('2d');
    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: recentWeekly.map(w => weekLabelAnalytics(w.week)),
        datasets: [{
          data: recentWeekly.map(w => w['Impressions (organic)'] || 0),
          borderColor: colors.primary,
          backgroundColor: colors.primarySoft,
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointHoverRadius: 6,
          borderWidth: 2
        }]
      },
      options: {
        ...chartDefaults,
        plugins: { ...chartDefaults.plugins, tooltip: { ...chartDefaults.plugins.tooltip, callbacks: { label: ctx => fmtAnalytics(ctx.parsed.y) + ' impressions' } } },
        scales: { ...chartDefaults.scales, y: { ...chartDefaults.scales.y, beginAtZero: true, ticks: { ...chartDefaults.scales.y.ticks, callback: v => v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v } } }
      }
    });
    _analyticsChartInstances.push(chart);
  }

  // Engagement Rate — bar chart
  const engCanvas = document.getElementById('chartEngagementRate');
  if (engCanvas && recentWeekly.length) {
    const ctx = engCanvas.getContext('2d');
    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: recentWeekly.map(w => weekLabelAnalytics(w.week)),
        datasets: [{
          data: recentWeekly.map(w => Math.round(((w['Engagement rate (total)'] || 0) * 100) * 10) / 10),
          backgroundColor: colors.primary,
          borderRadius: 4,
          barPercentage: 0.6
        }]
      },
      options: {
        ...chartDefaults,
        plugins: { ...chartDefaults.plugins, tooltip: { ...chartDefaults.plugins.tooltip, callbacks: { label: ctx => ctx.parsed.y.toFixed(1) + '% engagement' } } },
        scales: { ...chartDefaults.scales, y: { ...chartDefaults.scales.y, beginAtZero: true, ticks: { ...chartDefaults.scales.y.ticks, callback: v => v + '%' } } }
      }
    });
    _analyticsChartInstances.push(chart);
  }

  // New Followers Weekly — aggregate daily to weekly, then area chart
  const followCanvas = document.getElementById('chartNewFollowers');
  if (followCanvas && followerDaily.length) {
    // Aggregate daily follower data to weekly buckets
    const weekMap = new Map();
    followerDaily.forEach(d => {
      // Handle both YYYY-MM-DD and MM/DD/YYYY date formats
      let ds = String(d.date || '').trim();
      const slashMatch = ds.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (slashMatch) ds = slashMatch[3] + '-' + slashMatch[1].padStart(2, '0') + '-' + slashMatch[2].padStart(2, '0');
      const dt = new Date(ds + 'T00:00:00');
      if (isNaN(dt.getTime())) return;
      const day = dt.getDay();
      const diff = day === 0 ? 6 : day - 1;
      const ws = new Date(dt);
      ws.setDate(dt.getDate() - diff);
      const wk = ws.toISOString().split('T')[0];
      weekMap.set(wk, (weekMap.get(wk) || 0) + (d.total || 0));
    });
    const weeklyFollowers = [...weekMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-MAX_CHART_WEEKS);

    const ctx = followCanvas.getContext('2d');
    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: weeklyFollowers.map(([wk]) => weekLabelAnalytics(wk)),
        datasets: [{
          data: weeklyFollowers.map(([, v]) => v),
          borderColor: colors.good,
          backgroundColor: 'rgba(58, 157, 106, 0.15)',
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointHoverRadius: 6,
          borderWidth: 2
        }]
      },
      options: {
        ...chartDefaults,
        plugins: { ...chartDefaults.plugins, tooltip: { ...chartDefaults.plugins.tooltip, callbacks: { label: ctx => '+' + ctx.parsed.y + ' new followers' } } },
        scales: { ...chartDefaults.scales, y: { ...chartDefaults.scales.y, beginAtZero: true } }
      }
    });
    _analyticsChartInstances.push(chart);
  }
}

function buildAudienceQualitySnapshot(demographics) {
  if (!demographics || !demographics.industry) {
    return '<p class="mini-meta">Upload a Followers report to see audience quality.</p>';
  }

  const industryTotal = demographics.industry.reduce((s, d) => s + d.count, 0) || 1;
  const targetIndustryCount = demographics.industry
    .filter(d => ANALYTICS_TARGET_INDUSTRIES.some(t => d.name.toLowerCase().includes(t.toLowerCase())))
    .reduce((s, d) => s + d.count, 0);
  const targetIndustryPct = ((targetIndustryCount / industryTotal) * 100).toFixed(1);

  const seniorityTotal = demographics.seniority?.reduce((s, d) => s + d.count, 0) || 1;
  const dmCount = (demographics.seniority || [])
    .filter(d => ANALYTICS_DECISION_MAKER_SENIORITY.some(t => d.name.toLowerCase().includes(t.toLowerCase())))
    .reduce((s, d) => s + d.count, 0);
  const dmPct = ((dmCount / seniorityTotal) * 100).toFixed(1);

  const jfTotal = demographics.job_function?.reduce((s, d) => s + d.count, 0) || 1;
  const targetJfCount = (demographics.job_function || [])
    .filter(d => ANALYTICS_TARGET_JOB_FUNCTIONS.some(t => d.name.toLowerCase().includes(t.toLowerCase())))
    .reduce((s, d) => s + d.count, 0);
  const targetJfPct = ((targetJfCount / jfTotal) * 100).toFixed(1);

  const metrics = [
    { label: 'Target Industries', pct: targetIndustryPct, desc: 'Pharma, Biotech, Chemical, Research' },
    { label: 'Decision-Makers', pct: dmPct, desc: 'Manager – CXO' },
    { label: 'Target Job Functions', pct: targetJfPct, desc: 'Research, Engineering, BizDev' }
  ];

  return `<div class="audience-quality-bars">
    ${metrics.map(m => `
      <div class="audience-quality-metric">
        <div class="audience-quality-header">
          <span class="audience-quality-label">${m.label}</span>
          <span class="audience-quality-pct">${m.pct}%</span>
        </div>
        <div class="audience-quality-bar-bg">
          <div class="audience-quality-bar-fill" style="width:${Math.min(Number(m.pct), 100)}%"></div>
        </div>
        <span class="mini-meta">${m.desc}</span>
      </div>
    `).join('')}
  </div>`;
}

// --- Audience Intelligence Tab ---
function renderAnalyticsAudience(followersReport, visitorsReport) {
  const panel = document.getElementById('analyticsTabAudience');
  if (!panel) return;

  if (!followersReport && !visitorsReport) {
    panel.innerHTML = '<div class="analytics-empty"><p>Upload Followers or Visitors reports to see audience intelligence.</p></div>';
    return;
  }

  // Followers/Visitors toggle
  const hasFollowers = !!followersReport;
  const hasVisitors = !!visitorsReport;
  const defaultView = hasFollowers ? 'followers' : 'visitors';

  let toggleHtml = '';
  if (hasFollowers && hasVisitors) {
    toggleHtml = `<div class="audience-toggle">
      <button class="audience-toggle-btn active" data-audience-view="followers" type="button">Followers</button>
      <button class="audience-toggle-btn" data-audience-view="visitors" type="button">Visitors</button>
    </div>`;
  }

  const targetLegend = `<div class="audience-target-legend">
    <span class="audience-target-dot"></span>
    <span>Green rows = target persona (Pharma, Biotech, Chemical, Research)</span>
  </div>`;

  panel.innerHTML = `${toggleHtml}${targetLegend}
    <div id="audiencePanelsContainer"></div>`;

  renderAudiencePanels(defaultView);

  // Wire toggle
  const toggleBtns = panel.querySelectorAll('.audience-toggle-btn');
  toggleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      toggleBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderAudiencePanels(btn.dataset.audienceView);
    });
  });
}

function renderAudiencePanels(viewType) {
  const container = document.getElementById('audiencePanelsContainer');
  if (!container) return;

  const report = window._analyticsReports[viewType];
  if (!report || !report.demographics_data) {
    container.innerHTML = '<p class="mini-meta" style="padding:var(--space-4)">No demographic data available.</p>';
    return;
  }

  const demo = report.demographics_data;
  const countLabel = viewType === 'followers' ? 'followers' : 'views';

  container.innerHTML = `<div class="audience-panels-row">
    <div class="audience-panel panel">
      <h4>Job Function</h4>
      ${buildDemographicBars(demo.job_function || [], ANALYTICS_TARGET_JOB_FUNCTIONS, countLabel)}
    </div>
    <div class="audience-panel panel">
      <h4>Industry</h4>
      ${buildDemographicBars(demo.industry || [], ANALYTICS_TARGET_INDUSTRIES, countLabel)}
    </div>
    <div class="audience-panel panel">
      <h4>Seniority</h4>
      ${buildDemographicBars(demo.seniority || [], ANALYTICS_DECISION_MAKER_SENIORITY, countLabel)}
      ${buildDecisionMakerCallout(demo.seniority || [])}
    </div>
  </div>`;
}

function buildDemographicBars(data, targetList, countLabel) {
  if (!data.length) return '<p class="mini-meta">No data</p>';
  const maxCount = data[0]?.count || 1;
  const total = data.reduce((s, d) => s + d.count, 0) || 1;

  return `<div class="audience-bar-list">
    ${data.slice(0, 15).map(d => {
      const isTarget = targetList.some(t => d.name.toLowerCase().includes(t.toLowerCase()));
      const pct = ((d.count / total) * 100).toFixed(1);
      const barWidth = ((d.count / maxCount) * 100).toFixed(1);
      return `<div class="audience-bar-row${isTarget ? ' target' : ''}">
        <div class="audience-bar-label">
          ${isTarget ? '<span class="audience-target-dot"></span>' : ''}
          <span>${escapeHtml(d.name)}</span>
        </div>
        <div class="audience-bar-track">
          <div class="audience-bar-fill${isTarget ? ' target' : ''}" style="width:${barWidth}%"></div>
        </div>
        <span class="audience-bar-value">${pct}%</span>
      </div>`;
    }).join('')}
  </div>`;
}

function buildDecisionMakerCallout(seniorityData) {
  const total = seniorityData.reduce((s, d) => s + d.count, 0) || 1;
  const dmCount = seniorityData
    .filter(d => ANALYTICS_DECISION_MAKER_SENIORITY.some(t => d.name.toLowerCase().includes(t.toLowerCase())))
    .reduce((s, d) => s + d.count, 0);
  const dmPct = ((dmCount / total) * 100).toFixed(1);
  return `<div class="audience-callout">
    <span class="audience-callout-label">Decision-makers (Mgr–CXO):</span>
    <span class="audience-callout-value">${dmPct}%</span>
  </div>`;
}

// --- Post Performance Tab ---
function renderAnalyticsPostPerformance(contentReport) {
  const panel = document.getElementById('analyticsTabPosts');
  if (!panel) return;

  if (!contentReport || !contentReport.posts_data?.length) {
    panel.innerHTML = '<div class="analytics-empty"><p>Upload a Content report to see post performance.</p></div>';
    return;
  }

  const allPosts = contentReport.posts_data;

  // Check if posts have actual metrics (not all zeros)
  const hasPostMetrics = allPosts.some(p => (Number(p['Impressions']) || 0) > 0 || (Number(p['Clicks']) || 0) > 0);
  if (!hasPostMetrics) {
    panel.innerHTML = `<div class="analytics-empty"><p>Post-level metrics are not available in this export. LinkedIn's Content report sometimes excludes per-post impressions and clicks.</p>
      <p class="mini-meta" style="margin-top:8px">${allPosts.length} posts found, but all have zero metrics. Try re-exporting the Content report from LinkedIn.</p></div>`;
    return;
  }

  // Filter to last 2 weeks of posts by default
  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
  const recentPosts = allPosts.filter(p => {
    const d = new Date(normalizeDateStr(p['Created date'] || p['Date'] || ''));
    return !isNaN(d) && d >= twoWeeksAgo;
  });
  const hasRecentPosts = recentPosts.length > 0 && recentPosts.some(p => (Number(p['Impressions']) || 0) > 0);
  let activePosts = hasRecentPosts ? recentPosts : allPosts;
  window._analyticsPostsData = activePosts;

  const periodNote = hasRecentPosts
    ? `<span class="mini-meta">Showing ${recentPosts.length} posts from last 2 weeks</span>`
    : `<span class="mini-meta">No posts in the last 2 weeks — showing all ${allPosts.length} posts</span>`;

  panel.innerHTML = `
    <div class="analytics-filter-row">
      <label>Sort by:</label>
      <select id="analyticsPostSort">
        <option value="Created date">Date</option>
        <option value="Engagement rate">Engagement Rate</option>
        <option value="Impressions">Impressions</option>
        <option value="Clicks">Clicks</option>
      </select>
      ${hasRecentPosts && allPosts.length > recentPosts.length ? `<button id="analyticsPostToggleAll" class="ghost small" type="button">Show all ${allPosts.length} posts</button>` : ''}
      ${periodNote}
    </div>
    <div id="analyticsPostTableContainer"></div>
    <div class="analytics-charts-row" id="postPerformanceCharts">
      <div class="analytics-chart-card panel">
        <h4>Avg Engagement by Content Type</h4>
        <canvas id="chartContentTypeEng"></canvas>
      </div>
      <div class="analytics-chart-card panel">
        <h4>What works for ${escapeHtml(getClientName())}</h4>
        <div id="patternCardsContainer"></div>
      </div>
    </div>`;

  renderPostTable(activePosts, 'Created date');

  // Wire sort dropdown
  const sortSelect = document.getElementById('analyticsPostSort');
  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      renderPostTable(activePosts, sortSelect.value);
    });
  }

  // Wire "show all" toggle
  const toggleBtn = document.getElementById('analyticsPostToggleAll');
  if (toggleBtn) {
    let showingAll = false;
    toggleBtn.addEventListener('click', () => {
      showingAll = !showingAll;
      activePosts = showingAll ? allPosts : recentPosts;
      window._analyticsPostsData = activePosts;
      toggleBtn.textContent = showingAll ? `Show last 2 weeks (${recentPosts.length})` : `Show all ${allPosts.length} posts`;
      const sortVal = sortSelect ? sortSelect.value : 'Created date';
      renderPostTable(activePosts, sortVal);
      renderContentTypeChart(activePosts);
      renderPatternCards(activePosts);
    });
  }

  // Render content type chart
  renderContentTypeChart(activePosts);

  // Render pattern cards
  renderPatternCards(activePosts);
}

function getClientName() {
  const c = state.clients?.find(c => String(c.id) === String(analyticsCurrentClientId));
  return c?.name || 'this client';
}

function renderPostTable(posts, sortKey) {
  const container = document.getElementById('analyticsPostTableContainer');
  if (!container) return;

  let sorted;
  if (sortKey === 'Created date') {
    // Date sort — most recent first
    sorted = [...posts].sort((a, b) => {
      const da = new Date(normalizeDateStr(a['Created date'] || a['Date'] || ''));
      const db = new Date(normalizeDateStr(b['Created date'] || b['Date'] || ''));
      return (db.getTime() || 0) - (da.getTime() || 0);
    });
  } else {
    sorted = [...posts].sort((a, b) => (Number(b[sortKey]) || 0) - (Number(a[sortKey]) || 0));
  }
  const topPostIndex = 0; // first after sort = top

  container.innerHTML = `<table class="analytics-post-table">
    <thead><tr>
      <th>Title</th><th>Date</th><th>Type</th><th style="text-align:right">Impressions</th>
      <th style="text-align:right">Clicks</th><th style="text-align:right">Eng. Rate</th>
    </tr></thead>
    <tbody>${sorted.map((p, i) => {
      const title = (p['Post title'] || '').substring(0, 60);
      const contentType = p['Content Type'] || 'Post';
      const engRate = Number(p['Engagement rate']) || 0;
      const engClass = engRate >= 0.20 ? 'eng-high' : engRate >= 0.10 ? 'eng-good' : engRate >= 0.07 ? 'eng-ok' : 'eng-low';
      const isTop = i === topPostIndex;
      const postDate = new Date(normalizeDateStr(p['Created date'] || p['Date'] || ''));
      const postDateStr = !isNaN(postDate) ? postDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '–';

      return `<tr class="post-table-row${isTop ? ' top-post' : ''}">
        <td data-label="Title">
          ${isTop ? '<span class="chip approved" style="font-size:0.65rem;padding:1px 6px;margin-right:4px">TOP</span>' : ''}
          ${p['Post link'] ? `<a href="${escapeHtml(p['Post link'])}" target="_blank" rel="noopener">${escapeHtml(title)}</a>` : escapeHtml(title)}
        </td>
        <td data-label="Date" class="mini-meta">${postDateStr}</td>
        <td data-label="Type"><span class="chip">${escapeHtml(contentType)}</span></td>
        <td data-label="Impressions" style="text-align:right">${fmtAnalytics(p['Impressions'] || 0)}</td>
        <td data-label="Clicks" style="text-align:right">${fmtAnalytics(p['Clicks'] || 0)}</td>
        <td data-label="Eng. Rate" style="text-align:right"><span class="${engClass}">${pctAnalytics(engRate)}</span></td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;
}

function renderContentTypeChart(posts) {
  const canvas = document.getElementById('chartContentTypeEng');
  if (!canvas || typeof Chart === 'undefined') return;

  // Group by content type
  const typeMap = new Map();
  posts.forEach(p => {
    const ct = p['Content Type'] || 'Post';
    if (!typeMap.has(ct)) typeMap.set(ct, { sum: 0, count: 0 });
    const entry = typeMap.get(ct);
    entry.sum += Number(p['Engagement rate']) || 0;
    entry.count++;
  });

  const types = [...typeMap.entries()].map(([name, data]) => ({
    name,
    avg: data.count > 0 ? (data.sum / data.count) * 100 : 0
  })).sort((a, b) => b.avg - a.avg);

  const colors = getChartThemeColors();
  const chart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: types.map(t => t.name),
      datasets: [{
        data: types.map(t => t.avg.toFixed(1)),
        backgroundColor: types.map((_, i) => i === 0 ? colors.good : colors.primary),
        borderRadius: 4,
        barPercentage: 0.6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: colors.line }, ticks: { callback: v => v + '%', color: colors.muted } },
        y: { grid: { display: false }, ticks: { color: colors.text } }
      }
    }
  });
  _analyticsChartInstances.push(chart);
}

function renderPatternCards(posts) {
  const container = document.getElementById('patternCardsContainer');
  if (!container || !posts.length) return;

  // Pattern 1: Best content type
  const typeMap = new Map();
  posts.forEach(p => {
    const ct = p['Content Type'] || 'Post';
    if (!typeMap.has(ct)) typeMap.set(ct, { engSum: 0, count: 0 });
    const e = typeMap.get(ct);
    e.engSum += Number(p['Engagement rate']) || 0;
    e.count++;
  });
  const bestType = [...typeMap.entries()]
    .map(([name, d]) => ({ name, avg: d.count ? d.engSum / d.count : 0, count: d.count }))
    .sort((a, b) => b.avg - a.avg)[0];

  // Pattern 2: Best posting day
  const dayMap = new Map();
  posts.forEach(p => {
    let cd = p['Created date'];
    if (!cd) return;
    if (typeof cd === 'number') cd = new Date((cd - 25569) * 86400 * 1000);
    else {
      const s = String(cd).trim();
      const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      cd = m ? new Date(m[3], m[1] - 1, m[2]) : new Date(s);
    }
    if (!(cd instanceof Date) || isNaN(cd.getTime())) return;
    const dayName = cd.toLocaleDateString('en-US', { weekday: 'long' });
    if (!dayMap.has(dayName)) dayMap.set(dayName, { engSum: 0, count: 0 });
    const e = dayMap.get(dayName);
    e.engSum += Number(p['Engagement rate']) || 0;
    e.count++;
  });
  const bestDay = [...dayMap.entries()]
    .map(([name, d]) => ({ name, avg: d.count ? d.engSum / d.count : 0, count: d.count }))
    .filter(d => d.count >= 2)
    .sort((a, b) => b.avg - a.avg)[0];

  // Pattern 3: High performer count
  const highPerformers = posts.filter(p => (Number(p['Engagement rate']) || 0) >= 0.10).length;
  const highPct = ((highPerformers / posts.length) * 100).toFixed(0);

  // Pattern 4: Consistency
  const avgEng = posts.reduce((s, p) => s + (Number(p['Engagement rate']) || 0), 0) / posts.length;

  const patterns = [
    { emoji: '🎬', label: `${bestType?.name || 'Posts'} perform best`, note: `${pctAnalytics(bestType?.avg || 0)} avg engagement across ${bestType?.count || 0} posts` },
    { emoji: '📅', label: bestDay ? `${bestDay.name}s get more engagement` : 'Post more consistently', note: bestDay ? `${pctAnalytics(bestDay.avg)} avg on ${bestDay.name}s (${bestDay.count} posts)` : 'Not enough data to determine best day' },
    { emoji: '🔥', label: `${highPct}% are high performers`, note: `${highPerformers} of ${posts.length} posts hit ≥10% engagement` },
    { emoji: '📊', label: `${pctAnalytics(avgEng)} overall engagement`, note: `Across ${posts.length} total posts in this period` },
  ];

  container.innerHTML = `<div class="pattern-cards">
    ${patterns.map(p => `<div class="pattern-card">
      <span class="pattern-emoji">${p.emoji}</span>
      <div class="pattern-label">${escapeHtml(p.label)}</div>
      <div class="pattern-note mini-meta">${escapeHtml(p.note)}</div>
    </div>`).join('')}
  </div>`;
}

// --- Insights banner (collapsible) ---
function buildInsightsBanner(type, previewText) {
  const id = `insights-banner-${type}`;
  return `<div class="insights-banner" id="${id}">
    <button class="insights-banner-trigger" type="button" data-insights-type="${type}">
      <span class="insights-banner-icon">✦</span>
      <span class="insights-banner-label">Insights</span>
      <span class="insights-banner-preview" id="${id}-preview">(${previewText || 'Click to generate analysis'})</span>
      <span class="insights-banner-chevron">›</span>
    </button>
    <div class="insights-banner-body" id="${id}-body" style="display:none">
      <div class="insights-banner-content" id="${id}-content"></div>
    </div>
  </div>`;
}


// --- Insights API calls + click handling ---
// Cache is stored in DB: client_analytics.insights_cache (JSONB)
// Key format: `${type}-${viewMode}` or `post-${postIndex}-${viewMode}`
// New upload = new DB row = empty cache automatically

function getDbInsightCache(key) {
  const report = window._analyticsCurrentReport;
  if (!report || !report.insights_cache) return null;
  return report.insights_cache[key] || null;
}

async function setDbInsightCache(key, insights) {
  const report = window._analyticsCurrentReport;
  if (!report) return;
  // Update local object immediately
  if (!report.insights_cache) report.insights_cache = {};
  report.insights_cache[key] = insights;
  // Persist to DB (fire-and-forget — don't block UI)
  state.supabase
    .from('client_analytics')
    .update({ insights_cache: report.insights_cache })
    .eq('id', report.id)
    .then(({ error }) => { if (error) console.error('Failed to save insight cache:', error); });
}

async function fetchInsights(analysisType, data, clientName, extras) {
  const token = state.session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const payload = { analysisType, data, clientName };
  // Pass view mode and benchmarks when available
  if (extras) {
    if (extras.viewMode) payload.viewMode = extras.viewMode;
    if (extras.benchmarks) payload.benchmarks = extras.benchmarks;
  }

  const res = await fetch('/api/analyze-analytics', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || `HTTP ${res.status}`);
  }

  return res.json();
}

// Delegated click handlers for insights (inside analytics screen)
const analyticsScreenEl = document.getElementById('client-analytics');
if (analyticsScreenEl) {
  analyticsScreenEl.addEventListener('click', async (e) => {
    // --- Banner trigger click ---
    const trigger = e.target.closest('.insights-banner-trigger');
    if (trigger) {
      e.preventDefault();
      e.stopPropagation();
      const type = trigger.dataset.insightsType; // 'monthly' or 'weekly'
      const banner = trigger.closest('.insights-banner');
      const body = banner.querySelector('.insights-banner-body');
      const content = banner.querySelector('.insights-banner-content');
      const chevron = banner.querySelector('.insights-banner-chevron');

      // Toggle if already loaded
      if (body.style.display !== 'none') {
        body.style.display = 'none';
        chevron.textContent = '›';
        banner.classList.remove('open');
        return;
      }

      body.style.display = 'block';
      chevron.textContent = '‹';
      banner.classList.add('open');

      // Check DB-persisted cache (v2 = week-on-week scoped data)
      const vm = 'organic';
      const cacheKey = `${type}-${vm}-v2`;
      const cached = getDbInsightCache(cacheKey);
      if (cached) {
        content.innerHTML = formatInsightsText(cached);
        return;
      }

      // Fetch from API
      content.innerHTML = '<div class="insights-loading"><span class="insights-spinner"></span> Analyzing...</div>';
      try {
        const report = (window._analyticsCurrentReport);
        const weekly = report?.metrics_data || [];
        let analysisData;
        let clientName = '';

        // Get client name
        const clientRow = state.clients?.find(c => c.id === analyticsCurrentClientId);
        if (clientRow) clientName = clientRow.name || '';

        if (type === 'brand-signal') {
          // Build combined data — scoped to last 2 weeks only
          const reports = window._analyticsReports || {};
          const cr = reports.content;
          const fr = reports.followers;
          const vr = reports.visitors;

          // Content: last 2 weekly rows
          const contentWeekly = cr?.metrics_data || [];
          const last2Weeks = contentWeekly.slice(-2);
          // Posts: last 14 days only
          const allPosts = cr?.posts_data || [];
          const twoWeeksAgo = new Date();
          twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
          const recentPosts = allPosts.filter(p => {
            const d = new Date(normalizeDateStr(p['Created date'] || p['Date'] || ''));
            return !isNaN(d) && d >= twoWeeksAgo;
          });
          // Followers: last 14 daily rows
          const followerRecent = (fr?.metrics_data || []).slice(-14);
          // Visitors: last 14 daily rows
          const visitorRecent = (vr?.visitor_metrics || []).slice(-14);

          analysisData = {
            period: 'last 2 weeks',
            contentSummary: cr ? {
              totalImpressions: last2Weeks.reduce((s, w) => s + (w['Impressions (total)'] || 0), 0),
              avgEngagement: (() => { const rows = last2Weeks.filter(w => w['Engagement rate (total)'] > 0); return rows.length ? rows.reduce((s, w) => s + w['Engagement rate (total)'], 0) / rows.length : 0; })(),
              totalPosts: recentPosts.length,
              topPostImpressions: recentPosts.length ? Math.max(0, ...recentPosts.map(p => p['Impressions'] || 0)) : 0,
              weekOverWeek: last2Weeks.length === 2 ? {
                impressionsDelta: (last2Weeks[1]['Impressions (total)'] || 0) - (last2Weeks[0]['Impressions (total)'] || 0),
                engagementDelta: (last2Weeks[1]['Engagement rate (total)'] || 0) - (last2Weeks[0]['Engagement rate (total)'] || 0),
              } : null,
            } : null,
            followerSummary: followerRecent.length ? {
              newFollowers: followerRecent.reduce((s, d) => s + (d.total || 0), 0),
              days: followerRecent.length,
            } : null,
            visitorSummary: visitorRecent.length ? {
              totalVisits: visitorRecent.reduce((s, d) => s + (d.overview_unique || 0), 0),
              days: visitorRecent.length,
            } : null,
            followerDemographics: fr?.demographics_data || null,
            visitorDemographics: vr?.demographics_data || null,
          };
        } else if (type === 'monthly') {
          analysisData = aggregateWeeklyToMonthly(weekly);
        } else {
          analysisData = weekly;
        }

        const result = await fetchInsights(type, analysisData, clientName, { viewMode: vm });
        await setDbInsightCache(cacheKey, result.insights);
        content.innerHTML = formatInsightsText(result.insights);

        // Update preview text
        const preview = banner.querySelector('.insights-banner-preview');
        if (preview) {
          const firstLine = result.insights.split('\n').find(l => l.trim()) || '';
          preview.textContent = firstLine.substring(0, 80) + (firstLine.length > 80 ? '…' : '');
        }
      } catch (err) {
        console.error('Insights error:', err);
        content.innerHTML = `<div class="insights-error">Could not generate insights. ${escapeHtml(err.message)}</div>`;
      }
      return;
    }
  });
}

function formatInsightsText(text) {
  // Simple text formatting — convert bullet points and newlines to HTML
  return text
    .split('\n')
    .map(line => {
      line = line.trim();
      if (!line) return '';
      // Bold section headers (lines ending with :)
      if (/^\d+\.\s/.test(line) || /^(Key Trends|Notable Changes|Recommendations|Performance|Suggestions)/i.test(line)) {
        return `<div class="insights-section-header">${escapeHtml(line)}</div>`;
      }
      if (line.startsWith('•') || line.startsWith('-')) {
        return `<div class="insights-bullet">${escapeHtml(line)}</div>`;
      }
      return `<div class="insights-line">${escapeHtml(line)}</div>`;
    })
    .join('');
}

// Store current report reference for insights
window._analyticsCurrentReport = null;

// =============================================
// END CLIENT ANALYTICS
// =============================================

function filterMatrixBySearch(query) {
  if (!matrixBody) return;
  const q = (query || '').toLowerCase().trim();
  const rows = [...matrixBody.querySelectorAll('tr')];
  const visibleDepts = new Set();

  rows.forEach((row) => {
    if (row.classList.contains('matrix-dept-row')) return;
    if (row.classList.contains('matrix-detail-row')) {
      row.classList.add('hidden');
      return;
    }
    const name = row.dataset.empName || '';
    const dept = row.dataset.empDept || '';
    const visible = !q || name.includes(q) || dept.includes(q);
    row.classList.toggle('hidden', !visible);
    if (visible) {
      let prev = row.previousElementSibling;
      while (prev && !prev.classList.contains('matrix-dept-row')) {
        prev = prev.previousElementSibling;
      }
      if (prev) visibleDepts.add(prev);
    }
  });

  rows.forEach((row) => {
    if (row.classList.contains('matrix-dept-row')) {
      row.classList.toggle('hidden', q && !visibleDepts.has(row));
    }
  });
}

function toggleMatrixDrillDown(empId) {
  if (!matrixBody) return;
  const existingDetail = matrixBody.querySelector(`.matrix-detail-row[data-detail-emp="${empId}"]`);
  const empRow = matrixBody.querySelector(`tr[data-emp-id="${empId}"]`);
  const icon = empRow?.querySelector('.expand-icon');

  if (existingDetail) {
    existingDetail.remove();
    if (icon) icon.classList.remove('open');
    return;
  }

  const weekStarts = state._matrixWeekStarts || [];
  const weekProjectAlloc = state._matrixEmpWeekProjectAlloc?.get(empId);
  const projectColumns = state._matrixProjectColumns || [];
  if (!weekProjectAlloc || !weekStarts.length) return;

  const colCount = projectColumns.length + 3;
  const weekStartsDisplay = weekStarts.slice(0, 4);

  let detailHtml = '<div class="matrix-week-grid">';
  detailHtml += `<span class="wk-label">Project</span>`;
  weekStartsDisplay.forEach((ws) => {
    detailHtml += `<span class="wk-label">${escapeHtml(shortWeekLabel(ws))}</span>`;
  });
  for (let i = weekStartsDisplay.length; i < 4; i++) {
    detailHtml += `<span class="wk-label">—</span>`;
  }

  projectColumns.forEach((projName) => {
    const hasAny = weekStartsDisplay.some((ws) => {
      const projMap = weekProjectAlloc.get(ws);
      return projMap && (projMap.get(projName) || 0) > 0;
    });
    if (!hasAny) return;

    detailHtml += `<span class="wk-proj">${escapeHtml(projName)}</span>`;
    weekStartsDisplay.forEach((ws) => {
      const projMap = weekProjectAlloc.get(ws);
      const val = Math.round(projMap ? (projMap.get(projName) || 0) : 0);
      if (val <= 0) {
        detailHtml += '<span class="wk-val" style="color:#c8cdd6">\u2014</span>';
      } else {
        const tone = weekUtilToneClass(val);
        const color = tone === 'over' ? '#8e2222' : '#1d4f8e';
        detailHtml += `<span class="wk-val" style="color:${color}">${val}%</span>`;
      }
    });
    for (let i = weekStartsDisplay.length; i < 4; i++) {
      detailHtml += '<span class="wk-val">\u2014</span>';
    }
  });
  detailHtml += '</div>';

  const detailRow = document.createElement('tr');
  detailRow.className = 'matrix-detail-row';
  detailRow.dataset.detailEmp = empId;
  detailRow.innerHTML = `<td colspan="${colCount}">${detailHtml}</td>`;

  if (empRow && empRow.nextSibling) {
    matrixBody.insertBefore(detailRow, empRow.nextSibling);
  } else {
    matrixBody.appendChild(detailRow);
  }

  if (icon) icon.classList.add('open');
}

// Matrix click handler for drill-down
document.addEventListener('click', (e) => {
  const empNameEl = e.target.closest('.matrix-emp-name');
  if (empNameEl) {
    const empId = empNameEl.dataset.empId;
    if (empId) toggleMatrixDrillDown(empId);
  }
});

if (matrixSearch) {
  matrixSearch.addEventListener('input', () => {
    filterMatrixBySearch(matrixSearch.value);
  });
}

if (plannerMonth) {
  plannerMonth.addEventListener('change', () => {
    state._matrixSelectedWeekIndex = null; // reset to current week for new month
    loadTeamDashboardFromSupabase().catch((error) => {
      console.error(error);
      renderTeamDashboardEmpty(`Unable to load team dashboard: ${error.message}`);
      setTeamDashboardScopeNote(`Unable to load team dashboard: ${error.message}`, 'status warn');
    });
  });
}

function navigateWeek(delta) {
  if (state._matrixSelectedWeekIndex == null) return;
  state._matrixSelectedWeekIndex = Math.max(0, state._matrixSelectedWeekIndex + delta);
  loadTeamDashboardFromSupabase().catch((error) => {
    console.error(error);
  });
}

if (weekPrevBtn) weekPrevBtn.addEventListener('click', () => navigateWeek(-1));
if (weekNextBtn) weekNextBtn.addEventListener('click', () => navigateWeek(1));

populatePlannerMonthOptions();

if (addClientBtn) {
  addClientBtn.addEventListener('click', () => {
    if (!canAddClients()) return;
    const client = (newClientName?.value || '').trim();
    const type = newClientType?.value || 'retainer';
    const owner = isLeadershipRole() ? newClientOwner?.value || '' : currentClientOwnerFullName();
    if (!client) {
      setClientFormNotice('Enter a client name first.', 'status warn');
      return;
    }

    addClientBtn.disabled = true;
    const origClientBtnText = addClientBtn.textContent;
    addClientBtn.textContent = editingClientId ? 'Updating…' : 'Adding…';

    const run = async () => {
      if (editingClientId) {
        if (state.supabase && state.isAuthenticated && !String(editingClientId).startsWith('local-')) {
          await updateClientInSupabase({ clientId: editingClientId, client, type, owner });
          await loadClientsFromSupabase();
        } else {
          updateLocalClientById({ clientId: editingClientId, client, type, owner });
          renderClientRegistryTable();
        }
        setClientFormNotice(`Updated ${client}.`);
      } else {
        if (state.supabase && state.isAuthenticated) {
          await upsertClientToSupabase({ client, type, owner });
          await loadClientsFromSupabase();
        } else {
          addPortfolioRow({
            client,
            type,
            owner,
            status: 'Active'
          });
        }
        setClientFormNotice(`Added ${client}.`);
      }
      resetClientEditor();
    };
    run().catch((error) => {
      console.error(error);
      setClientFormNotice(`Unable to save client: ${error.message}`, 'status warn');
    }).finally(() => {
      addClientBtn.disabled = false;
      addClientBtn.textContent = origClientBtnText;
    });
  });
}

if (cancelClientEditBtn) {
  cancelClientEditBtn.addEventListener('click', () => {
    resetClientEditor();
    setClientFormNotice('Edit cancelled.');
  });
}

if (portfolioTableBody) {
  portfolioTableBody.addEventListener('click', (event) => {
    const actionBtn = event.target.closest('button[data-client-action]');
    if (!actionBtn) return;

    const action = actionBtn.dataset.clientAction;
    const clientId = actionBtn.dataset.clientId || '';

    if (action === 'analytics') {
      analyticsCurrentClientId = clientId;
      navigateToScreen('client-analytics');
      return;
    }

    if (action === 'edit' && canEditClients()) {
      startClientEdit(clientId);
      return;
    }

    const clientEntry = state.clients.find(c => String(c.id) === String(clientId));
    if (action === 'archive' && canArchiveClient(clientEntry)) {
      archiveClientById(clientId).catch((error) => {
        console.error(error);
        setClientFormNotice(`Unable to archive client: ${error.message}`, 'status warn');
      });
      return;
    }

    if (action === 'delete' && canDeleteClients()) {
      deleteClientById(clientId).catch((error) => {
        console.error(error);
        setClientFormNotice(`Unable to delete client: ${error.message}`, 'status warn');
      });
    }
  });

  const clientTable = portfolioTableBody.closest('table');
  if (clientTable) {
    clientTable.querySelector('thead')?.addEventListener('click', handleClientSortClick);
  }
}

const archivedClientsBody = document.getElementById('archivedClientsBody');
if (archivedClientsBody) {
  archivedClientsBody.addEventListener('click', (event) => {
    const actionBtn = event.target.closest('button[data-client-action]');
    if (!actionBtn) return;
    const action = actionBtn.dataset.clientAction;
    const clientId = actionBtn.dataset.clientId || '';
    const archivedEntry = state.clients.find(c => String(c.id) === String(clientId));
    if (action === 'unarchive' && canArchiveClient(archivedEntry)) {
      unarchiveClientById(clientId).catch((error) => {
        console.error(error);
        setClientFormNotice(`Unable to restore client: ${error.message}`, 'status warn');
      });
    }
  });
}

const profileMetaLine = document.getElementById('profileMetaLine');
const profileStatCards = document.getElementById('profileStatCards');
const profileProjectsBody = document.getElementById('profileProjectsBody');
const profileDailyTasksBody = document.getElementById('profileDailyTasksBody');
const profileTeamSelect = document.getElementById('profileTeamSelect');
const profileEmploymentType = document.getElementById('profileEmploymentType');
const profileAccessLevel = document.getElementById('profileAccessLevel');
const profileManagerSelect = document.getElementById('profileManagerSelect');
const profileNameInput = document.getElementById('profileNameInput');
const profileEmailInput = document.getElementById('profileEmailInput');
const profileCapacityInput = document.getElementById('profileCapacityInput');
const profileBirthday = document.getElementById('profileBirthday');
const profileCity = document.getElementById('profileCity');
const profilePeriod = document.getElementById('profilePeriod');
const profileWeekFilterWrap = document.getElementById('profileWeekFilterWrap');
const profileWeekFilter = document.getElementById('profileWeekFilter');
const profilePeriodMeta = document.getElementById('profilePeriodMeta');
const saveProfileBtn = document.getElementById('saveProfileBtn');
const profileSaveNotice = document.getElementById('profileSaveNotice');

function setProfileSaveNotice(message = '', className = 'mini-meta') {
  if (!profileSaveNotice) return;
  profileSaveNotice.className = className;
  profileSaveNotice.textContent = message;
}

function selectedDirectoryEmployeeByName(name = state.currentEmployee) {
  const targetName = String(name || '').trim();
  if (!targetName) return null;
  return state.employeeDirectory.find((entry) => entry.full_name === targetName) || null;
}

function parseCapacityPercentInput(value) {
  const normalized = String(value || '')
    .replace('%', '')
    .trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function refreshProfileUtilizationSummary() {
  if (!profileStatCards) return;
  const profile = selectedEmployeeRecord();
  const lastEdit = profile.lastAllocationEdit || '--';

  // Snapshot existing leave values before re-render (they're populated async)
  const prevPl = document.getElementById('profileLeavePl');
  const prevCl = document.getElementById('profileLeaveCl');
  const prevSl = document.getElementById('profileLeaveSl');
  const plVal = prevPl ? prevPl.textContent : '--';
  const clVal = prevCl ? prevCl.textContent : '--';
  const slVal = prevSl ? prevSl.textContent : '--';
  const plNeg = prevPl ? prevPl.classList.contains('leave-negative') : false;
  const clNeg = prevCl ? prevCl.classList.contains('leave-negative') : false;
  const slNeg = prevSl ? prevSl.classList.contains('leave-negative') : false;

  const cards = [
    { label: 'Week Utilization', value: `${profile.utilization.week}%` },
    { label: 'Month Utilization', value: `${profile.utilization.month}%` },
    { label: 'Last Allocation Edit', value: lastEdit, id: 'profileLastAllocationEdit' }
  ];

  const leaveCards = isLeadershipRole() ? [
    { label: 'PL Remaining', value: plVal, id: 'profileLeavePl' },
    { label: 'CL Remaining', value: clVal, id: 'profileLeaveCl' },
    { label: 'SL Remaining', value: slVal, id: 'profileLeaveSl' }
  ] : [];

  profileStatCards.innerHTML = [...cards, ...leaveCards].map(c => `
    <div class="profile-stat-card${leaveCards.includes(c) ? ' leadership-only' : ''}">
      <span class="profile-stat-label">${c.label}</span>
      <span class="profile-stat-value"${c.id ? ` id="${c.id}"` : ''}>${c.value}</span>
    </div>
  `).join('');

  // Restore leave-negative classes
  if (plNeg) document.getElementById('profileLeavePl')?.classList.add('leave-negative');
  if (clNeg) document.getElementById('profileLeaveCl')?.classList.add('leave-negative');
  if (slNeg) document.getElementById('profileLeaveSl')?.classList.add('leave-negative');
}

function aggregateProjectAllocations(lines = [], denominator = 1) {
  const divisor = Math.max(1, Number(denominator) || 1);
  const projectTotals = new Map();
  lines.forEach((line) => {
    const project = String(line.project || '').trim();
    if (!project || normalizeClientNameKey(project) === 'internal') return;
    const allocation = Number.isFinite(Number(line.allocationPercent)) ? Number(line.allocationPercent) : 0;
    projectTotals.set(project, (projectTotals.get(project) || 0) + allocation);
  });

  return [...projectTotals.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([project, total]) => ({
      project,
      allocation: formatPercent(total / divisor)
    }));
}

function buildAllocationWeekBuckets(allocationRows = []) {
  const weekBuckets = new Map();

  allocationRows.forEach((row) => {
    const weekStartIso = String(row.period_start || '').trim();
    if (!weekStartIso) return;
    const weekKey = weekIdentifierFromIsoDate(weekStartIso);
    if (!weekKey) return;

    if (!weekBuckets.has(weekKey)) {
      weekBuckets.set(weekKey, {
        key: weekKey,
        weekStartIso,
        lines: [],
        lastUpdated: null
      });
    }

    const bucket = weekBuckets.get(weekKey);
    const projectName = String(row.project?.name || row.client || '').trim();
    if (projectName && !isGarbageProjectName(projectName)) {
      bucket.lines.push({
        project: projectName,
        allocationPercent: Number.isFinite(Number(row.allocation_percent)) ? Number(row.allocation_percent) : 0
      });
    }

    if (row.updated_at && (!bucket.lastUpdated || new Date(row.updated_at) > new Date(bucket.lastUpdated))) {
      bucket.lastUpdated = row.updated_at;
    }
  });

  return [...weekBuckets.values()].sort((a, b) => String(b.weekStartIso).localeCompare(String(a.weekStartIso)));
}

function monthWindowFromWeekStart(weekStartIso) {
  const baseDate = parseIsoDateLocal(weekStartIso) || new Date();
  const monthStart = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
  const monthEnd = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);
  return {
    monthStartIso: toISODateLocal(monthStart),
    monthEndIso: toISODateLocal(monthEnd),
    monthLabel: new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric' }).format(monthStart)
  };
}

function renderProfileWeekFilterOptions() {
  if (!profileWeekFilter) return;

  profileWeekFilter.innerHTML = '';
  if (!state.profileWeekOptions.length) {
    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = 'No week data';
    profileWeekFilter.appendChild(emptyOption);
    profileWeekFilter.disabled = true;
    return;
  }

  state.profileWeekOptions.forEach((optionData) => {
    const option = document.createElement('option');
    option.value = optionData.key;
    option.textContent = optionData.label;
    profileWeekFilter.appendChild(option);
  });

  const hasCurrent = [...profileWeekFilter.options].some((opt) => opt.value === state.profileWeekKey);
  if (!hasCurrent) {
    state.profileWeekKey = state.profileWeekOptions[0].key;
  }
  profileWeekFilter.value = state.profileWeekKey;
  profileWeekFilter.disabled = false;
}

function applySelectedEmployeeAllocationSnapshot(allocationRows = []) {
  const profile = selectedEmployeeRecord();
  const weekBuckets = buildAllocationWeekBuckets(allocationRows);

  state.profileWeekOptions = weekBuckets.map((bucket) => ({
    key: bucket.key,
    weekStartIso: bucket.weekStartIso,
    label: formatWeekIdentifierLabel(bucket.weekStartIso)
  }));

  if (state.profileWeekKey && !state.profileWeekOptions.some((optionData) => optionData.key === state.profileWeekKey)) {
    state.profileWeekKey = '';
  }
  if (!state.profileWeekKey && state.profileWeekOptions.length) {
    state.profileWeekKey = state.profileWeekOptions[0].key;
  }

  const selectedWeekBucket = weekBuckets.find((bucket) => bucket.key === state.profileWeekKey) || null;
  const latestUpdatedAt = allocationRows
    .map((row) => row.updated_at)
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];

  profile.lastAllocationEdit = latestUpdatedAt ? formatTimestamp(latestUpdatedAt) : '';

  if (!selectedWeekBucket) {
    profile.utilization.week = 0;
    profile.utilization.month = 0;
    profile.projects.week = [];
    profile.projects.month = [];
    renderProfileWeekFilterOptions();
    refreshProfileUtilizationSummary();
    renderProfileProjects();
    renderPeopleDirectory();
    return;
  }

  const weekTotal = selectedWeekBucket.lines.reduce((sum, line) => sum + (Number(line.allocationPercent) || 0), 0);
  const weekProjects = aggregateProjectAllocations(selectedWeekBucket.lines, 1).map((entry) => ({
    ...entry,
    period: formatWeekIdentifierLabel(selectedWeekBucket.weekStartIso)
  }));

  const monthWindow = monthWindowFromWeekStart(selectedWeekBucket.weekStartIso);
  const monthBuckets = weekBuckets.filter(
    (bucket) => bucket.weekStartIso >= monthWindow.monthStartIso && bucket.weekStartIso <= monthWindow.monthEndIso
  );
  const monthTotals = monthBuckets.map((bucket) =>
    bucket.lines.reduce((sum, line) => sum + (Number(line.allocationPercent) || 0), 0)
  );
  const monthUtilAverage = monthTotals.length
    ? monthTotals.reduce((sum, value) => sum + value, 0) / monthTotals.length
    : weekTotal;
  const monthPeriodTag = monthWindow.monthLabel;
  const monthProjects = aggregateProjectAllocations(
    monthBuckets.flatMap((bucket) => bucket.lines),
    monthBuckets.length || 1
  ).map((entry) => ({
    ...entry,
    period: monthPeriodTag
  }));

  profile.utilization.week = Math.min(100, Math.round(weekTotal));
  profile.utilization.month = Math.min(100, Math.round(monthUtilAverage));
  profile.projects.week = weekProjects;
  profile.projects.month = monthProjects;

  renderProfileWeekFilterOptions();
  refreshProfileUtilizationSummary();
  renderProfileProjects();
  renderPeopleDirectory();
}

async function loadProfileAllocationHistoryFromSupabase(targetEmployeeId = getSelectedProfileEmployeeId()) {
  if (!targetEmployeeId) {
    state.profileAllocationRows = [];
    applySelectedEmployeeAllocationSnapshot([]);
    return;
  }

  if (!state.supabase || !state.isAuthenticated) {
    const fallbackRows = (state.weeklyAllocations || []).map((row) => ({
      period_start: getCurrentWeekStartIso(),
      allocation_percent: row.allocation_percent,
      updated_at: row.updated_at,
      project: row.project || { name: row.client || '' }
    }));
    state.profileAllocationRows = fallbackRows;
    applySelectedEmployeeAllocationSnapshot(fallbackRows);
    return;
  }

  const historyStart = mondayWeekStartDate();
  historyStart.setDate(historyStart.getDate() - 7 * 26);
  const historyStartIso = toISODateLocal(historyStart);

  const response = await state.supabase
    .from('allocations')
    .select(`
      id,
      employee_id,
      period_type,
      period_start,
      allocation_percent,
      updated_at,
      project:projects!allocations_project_id_fkey (
        id,
        name
      )
    `)
    .eq('employee_id', targetEmployeeId)
    .eq('period_type', 'week')
    .gte('period_start', historyStartIso)
    .order('period_start', { ascending: false })
    .order('updated_at', { ascending: false });

  if (response.error) {
    console.error(response.error);
    state.profileAllocationRows = [];
    applySelectedEmployeeAllocationSnapshot([]);
    return;
  }

  state.profileAllocationRows = response.data || [];
  applySelectedEmployeeAllocationSnapshot(state.profileAllocationRows);
}

async function resolveDepartmentIdByName(teamName, fallbackDepartmentId = null) {
  const selected = normalizeTeamName(teamName);
  if (!selected) return fallbackDepartmentId;

  const localMatch = state.employeeDirectory.find(
    (entry) => normalizeTeamName(entry.department?.name, '') === selected && entry.department?.id
  );
  if (localMatch?.department?.id) return localMatch.department.id;

  if (!state.supabase || !state.isAuthenticated) return fallbackDepartmentId;
  const candidates = teamLookupCandidates(selected);
  const departmentResult = await state.supabase.from('departments').select('id, name').in('name', candidates);
  if (departmentResult.error) throw departmentResult.error;
  const matched = (departmentResult.data || []).find((row) => normalizeTeamName(row.name, '') === selected);
  return matched?.id || departmentResult.data?.[0]?.id || fallbackDepartmentId;
}

async function saveCurrentProfile() {
  if (!state.supabase || !state.isAuthenticated) {
    setProfileSaveNotice('Sign in first to save profile details.', 'status error');
    return;
  }

  const originalName = state.currentEmployee;
  const selectedDirectoryEmployee = selectedDirectoryEmployeeByName(originalName);
  const targetEmployeeId = selectedDirectoryEmployee?.id || state.currentEmployeeId;
  if (!targetEmployeeId) {
    setProfileSaveNotice('Could not resolve employee record to save.', 'status error');
    return;
  }

  const canSave = canEditEmployee(selectedDirectoryEmployee || { id: targetEmployeeId, email: state.session?.user?.email });
  if (!canSave) {
    setProfileSaveNotice('You can only edit your own profile or your reportees.', 'status error');
    return;
  }

  const updatedNameInput = String(profileNameInput?.value || '').trim();
  const canonicalName = String(profileNameInput?.dataset.canonicalName || originalName || '').trim();
  const canonicalDisplayName = displayPersonName(canonicalName, 'Employee');
  const updatedName = updatedNameInput === canonicalDisplayName ? canonicalName : updatedNameInput;
  if (!updatedName) {
    setProfileSaveNotice('Full name is required.', 'status error');
    return;
  }
  if (updatedName.length > 25) {
    setProfileSaveNotice('Name must be 25 characters or less.', 'status error');
    return;
  }

  const selectedTeam = normalizeTeamName(profileTeamSelect?.value || TEAM_AM, TEAM_AM);
  const selectedEmploymentType = profileEmploymentType?.value === 'fractional' ? 'fractional' : 'full-time';
  const selectedAccessLevel = normalizeAccessLevel(
    profileAccessLevel?.value || selectedDirectoryEmployee?.access_level || state.employeeProfile?.access_level || 'employee'
  );
  const parsedCapacity = parseCapacityPercentInput(profileCapacityInput?.value);
  if (parsedCapacity === null || parsedCapacity <= 0 || parsedCapacity > 100) {
    setProfileSaveNotice('Capacity must be a number from 1 to 100.', 'status error');
    return;
  }

  let departmentId = selectedDirectoryEmployee?.department?.id || null;
  if (!departmentId || normalizeTeamName(selectedDirectoryEmployee?.department?.name, '') !== selectedTeam) {
    try {
      departmentId = await resolveDepartmentIdByName(selectedTeam, departmentId);
    } catch (error) {
      setProfileSaveNotice(`Unable to resolve team: ${error.message}`, 'status error');
      return;
    }
  }
  if (!departmentId) {
    setProfileSaveNotice('Department mapping missing. Select a valid team.', 'status error');
    return;
  }

  const birthdayValue = profileBirthday?.value || null;
  const cityValue = profileCity?.value?.trim() || null;
  const updatePayload = {
    full_name: updatedName,
    department_id: departmentId,
    employment_type: selectedEmploymentType,
    capacity_percent: parsedCapacity,
    date_of_birth: birthdayValue,
    current_city: cityValue
  };
  if (canManageAccessRoles()) {
    updatePayload.access_level = selectedAccessLevel;
    updatePayload.role_title =
      selectedAccessLevel === 'admin' ? 'Admin' : selectedAccessLevel === 'leadership' ? 'Leadership' : 'Employee';
  }
  if (isLeadershipRole() && profileManagerSelect) {
    updatePayload.direct_manager_email = profileManagerSelect.value || null;
  }

  setProfileSaveNotice('Saving profile...', 'mini-meta');

  if (isLeadershipRole()) {
    const updateResult = await state.supabase.from('employees').update(updatePayload).eq('id', targetEmployeeId);
    if (updateResult.error) {
      setProfileSaveNotice(`Unable to save profile: ${updateResult.error.message}`, 'status error');
      return;
    }
  } else {
    const rpcResult = await state.supabase.rpc('update_my_profile', {
      p_full_name: updatedName,
      p_department_name: selectedTeam,
      p_employment_type: selectedEmploymentType,
      p_capacity_percent: parsedCapacity,
      p_date_of_birth: birthdayValue,
      p_current_city: cityValue
    });
    if (rpcResult.error) {
      setProfileSaveNotice(`Unable to save profile: ${rpcResult.error.message}`, 'status error');
      return;
    }
  }

  const existingStore = employeeStore[originalName];
  if (existingStore && updatedName !== originalName) {
    employeeStore[updatedName] = existingStore;
    delete employeeStore[originalName];
  }
  const updatedStore = ensureEmployeeRecord(updatedName);
  updatedStore.team = normalizeTeamName(selectedTeam, TEAM_AM);
  updatedStore.employmentType = selectedEmploymentType;
  updatedStore.accessLevel = canManageAccessRoles()
    ? selectedAccessLevel
    : normalizeAccessLevel(selectedDirectoryEmployee?.access_level || updatedStore.accessLevel || state.role || 'employee');
  updatedStore.capacityPercent = parsedCapacity;
  updatedStore.email = selectedDirectoryEmployee?.email || updatedStore.email;

  await loadEmployeeDirectoryFromSupabase();
  if (targetEmployeeId === state.currentEmployeeId) {
    const ownRow = state.employeeDirectory.find((entry) => entry.id === state.currentEmployeeId);
    if (ownRow) {
      state.employeeProfile = {
        ...(state.employeeProfile || {}),
        ...ownRow
      };
      state.role = normalizeAccessLevel(ownRow.access_level || state.role);
    }
  }

  setSelectedEmployee(updatedName);
  updateSidebarIdentityLabels();
  applyRoleAccess();
  setProfileSaveNotice('Profile saved.', 'status');
}

function selectedEmployeeRecord() {
  const targetName = state.currentEmployee || state.employeeProfile?.full_name || DEFAULT_EMPLOYEE;
  return ensureEmployeeRecord(targetName);
}

function renderProfileProjects() {
  if (!profileProjectsBody) return;
  const profile = selectedEmployeeRecord();
  const period = profilePeriod?.value || 'month';
  const projects = profile.projects[period] || [];
  const selectedWeekOption = state.profileWeekOptions.find((optionData) => optionData.key === state.profileWeekKey) || null;

  if (profileWeekFilterWrap) {
    profileWeekFilterWrap.classList.toggle('hidden', !state.profileWeekOptions.length);
  }
  if (profilePeriodMeta) {
    profilePeriodMeta.textContent = '';
  }

  profileProjectsBody.innerHTML = '';
  if (!projects.length) {
    const emptyRow = document.createElement('tr');
    const periodLabel = period === 'week' ? 'selected week' : 'selected month';
    emptyRow.innerHTML = `<td colspan="3">No allocation lines for the ${periodLabel}.</td>`;
    profileProjectsBody.appendChild(emptyRow);
    return;
  }

  projects.forEach((item) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td data-label="Project">${escapeHtml(item.project || '--')}</td>
      <td data-label="Allocation">${escapeHtml(item.allocation || '0%')}</td>
      <td data-label="Period">${escapeHtml(item.period || '--')}</td>
    `;
    profileProjectsBody.appendChild(row);
  });

  const totalPercent = projects.reduce((sum, item) => sum + percentNumberFromText(item.allocation), 0);
  const totalRow = document.createElement('tr');
  totalRow.innerHTML = `
    <td data-label="Project"><strong>Total</strong></td>
    <td data-label="Allocation"><strong>${escapeHtml(formatPercentRaw(totalPercent))}</strong></td>
    <td data-label="Period"></td>
  `;
  profileProjectsBody.appendChild(totalRow);
}

function renderProfileDailyTasks() {
  if (!profileDailyTasksBody) return;

  const selectedEmployeeId = getEmployeeIdByName(state.currentEmployee) || state.currentEmployeeId;
  const todayIso = toISODateLocal();
  const rows = selectedEmployeeId
    ? tasksForDate(selectedEmployeeId, todayIso).filter((t) => t.status !== 'archived')
    : [];

  profileDailyTasksBody.innerHTML = '';
  if (!rows.length) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="3">No tasks yet.</td>';
    profileDailyTasksBody.appendChild(row);
    return;
  }

  rows.forEach((task) => {
    const statusMeta = getDailyTaskStatusMeta(task.status);
    const row = document.createElement('tr');
    row.innerHTML = `
      <td data-label="Task">${escapeHtml(task.task_title)}</td>
      <td data-label="Client">${escapeHtml(task.notes || '--')}</td>
      <td data-label="Status"><span class="chip ${statusMeta.className}">${statusMeta.label}</span></td>
    `;
    profileDailyTasksBody.appendChild(row);
  });
}

function setSelectedEmployee(name) {
  const previousEmployee = state.currentEmployee;
  const fallbackName = state.employeeProfile?.full_name || DEFAULT_EMPLOYEE;
  const targetName = String(name || '').trim() || fallbackName;
  const employeeChanged = targetName !== previousEmployee;
  state.currentEmployee = targetName;
  if (employeeChanged) {
    state.profileAllocationRows = [];
    state.profileWeekOptions = [];
    state.profileWeekKey = '';
    renderProfileWeekFilterOptions();
  }
  const profile = ensureEmployeeRecord(targetName);
  const selectedEmployeeId = getEmployeeIdByName(targetName);
  const selectedDirectoryEmployee =
    selectedDirectoryEmployeeByName(targetName) ||
    (selectedEmployeeId ? state.employeeDirectory.find((entry) => entry.id === selectedEmployeeId) : null);

  if (isLeadershipRole() && selectedEmployeeId) {
    state.taskViewEmployeeId = selectedEmployeeId;
    state.allocationViewEmployeeId = selectedEmployeeId;
    if (taskEmployeeFilter) {
      taskEmployeeFilter.value = selectedEmployeeId;
    }
    if (allocEmployeeFilter) {
      allocEmployeeFilter.value = selectedEmployeeId;
    }
  }

  const isSelf = !selectedEmployeeId || selectedEmployeeId === state.currentEmployeeId;
  const profileEyebrow = document.getElementById('profileEyebrow');
  const profileMainHeading = document.getElementById('profileMainHeading');
  if (profileEyebrow) profileEyebrow.textContent = isSelf ? 'Self View' : 'Employee Profile';
  if (profileMainHeading) profileMainHeading.textContent = isSelf ? 'My Profile' : displayPersonName(state.currentEmployee, 'Employee');
  if (profileMetaLine) {
    const typeLabel = profile.employmentType === 'fractional' ? 'Fractional' : 'Full-time';
    const leaveLabel = profile.leaveTrackingEnabled === false ? 'Leave Excluded' : 'Leave Enabled';
    const cityValue = selectedDirectoryEmployee?.current_city || '';
    const cityPill = cityValue ? `<span class="dot">&middot;</span><span class="profile-location-pill">📍 ${escapeHtml(cityValue)}</span>` : '';
    profileMetaLine.innerHTML = `<span>${escapeHtml(profile.team)}</span><span class="dot">&middot;</span><span>${escapeHtml(typeLabel)}</span><span class="dot">&middot;</span><span>${escapeHtml(leaveLabel)}</span>${cityPill}`;
  }
  refreshProfileUtilizationSummary();

  if (profileTeamSelect) {
    if (![...profileTeamSelect.options].some((opt) => opt.value === profile.team)) {
      profileTeamSelect.value = TEAM_AM;
    } else {
      profileTeamSelect.value = profile.team;
    }
  }
  if (profileEmploymentType) profileEmploymentType.value = profile.employmentType;
  if (profileAccessLevel) {
    const selectedAccessLevel = normalizeAccessLevel(
      selectedDirectoryEmployee?.access_level || profile.accessLevel || state.employeeProfile?.access_level || 'employee'
    );
    profileAccessLevel.value = selectedAccessLevel;
  }
  if (profileManagerSelect) {
    // Populate with leadership + admin employees
    const managerOptions = state.employeeDirectory
      .filter(e => e.access_level === 'leadership' || e.access_level === 'admin')
      .map(e => ({ email: normalizeEmail(e.email), name: displayPersonName(e.full_name, e.email) }));
    profileManagerSelect.innerHTML = '<option value="">— Auto (by team) —</option>' +
      managerOptions.map(m => `<option value="${escapeHtml(m.email)}">${escapeHtml(m.name)}</option>`).join('');
    const currentManager = normalizeEmail(selectedDirectoryEmployee?.direct_manager_email || '');
    profileManagerSelect.value = currentManager || '';
  }
  if (profileNameInput) {
    profileNameInput.dataset.canonicalName = state.currentEmployee;
    profileNameInput.value = displayPersonName(state.currentEmployee, 'Employee');
  }
  if (profileEmailInput) {
    profileEmailInput.value =
      selectedDirectoryEmployee?.email ||
      profile.email ||
      state.employeeProfile?.email ||
      normalizeEmail(state.session?.user?.email || '');
  }
  if (profileCapacityInput) {
    const capacity = Number.isFinite(Number(selectedDirectoryEmployee?.capacity_percent))
      ? Number(selectedDirectoryEmployee.capacity_percent)
      : Number(profile.capacityPercent);
    profileCapacityInput.value = Number.isFinite(capacity) ? String(capacity) : '100';
  }
  if (profileBirthday) {
    profileBirthday.value = selectedDirectoryEmployee?.date_of_birth || '';
  }
  if (profileCity) {
    profileCity.value = selectedDirectoryEmployee?.current_city || '';
  }
  if (saveProfileBtn) {
    const canSave = state.isAuthenticated && canEditEmployee(selectedDirectoryEmployee || { id: selectedEmployeeId, email: state.session?.user?.email });
    saveProfileBtn.disabled = !canSave;
  }
  // Address/personal data: visible to own profile or leadership
  const personalDataBlock = document.getElementById('personalDataBlock');
  if (personalDataBlock) {
    const viewingOwnForAddress = selectedEmployeeId
      ? selectedEmployeeId === state.currentEmployeeId
      : targetName === (state.employeeProfile?.full_name || '');
    const canSeePersonalData = isLeadershipRole() || viewingOwnForAddress;
    personalDataBlock.classList.toggle('hidden', !canSeePersonalData);
  }

  setProfileSaveNotice('', 'mini-meta');
  loadProfileLeaveSummary(selectedEmployeeId).catch((err) => console.error('Profile leave summary:', err));
  renderProfileProjects();
  renderDailyTaskViews();
  loadWeeklyAllocationsFromSupabase().catch((error) => {
    console.error(error);
    setAllocationPolicyNote(`Unable to load weekly allocation: ${error.message}`);
  });
  applyFractionalVisibility();
  scrollCanvasToTop();
}

async function loadProfileLeaveSummary(employeeId) {
  const plEl = document.getElementById('profileLeavePl');
  const clEl = document.getElementById('profileLeaveCl');
  const slEl = document.getElementById('profileLeaveSl');
  if (!plEl) return;
  const effectiveId = employeeId || state.currentEmployeeId;
  if (!isLeadershipRole() || !effectiveId || !state.supabase) {
    if (plEl) plEl.textContent = '--';
    if (clEl) clEl.textContent = '--';
    if (slEl) slEl.textContent = '--';
    return;
  }
  const response = await state.supabase.rpc('get_leave_cycle_summary_for_employee', {
    p_employee_id: effectiveId,
    p_as_of_date: toISODateLocal()
  });
  if (response.error) {
    if (profileLeaveSummaryNotice) {
      profileLeaveSummaryNotice.textContent = `Unable to load: ${response.error.message}`;
      profileLeaveSummaryNotice.className = 'status warn';
    }
    return;
  }
  const summary = response.data || {};
  const pl = summary.pl || { remaining: 0 };
  const cl = summary.cl || { remaining: 0 };
  const sl = summary.sl || { remaining: 0 };
  // Cascade: negative PL/CL overflow into SL
  let plRem = pl.remaining, clRem = cl.remaining, slRem = sl.remaining;
  if (plRem < 0) { slRem += plRem; plRem = 0; }
  if (clRem < 0) { slRem += clRem; clRem = 0; }
  if (plEl) {
    plEl.textContent = leaveDayText(plRem);
    plEl.classList.toggle('leave-negative', plRem < 0);
  }
  if (clEl) {
    clEl.textContent = leaveDayText(clRem);
    clEl.classList.toggle('leave-negative', clRem < 0);
  }
  if (slEl) {
    slEl.textContent = leaveDayText(slRem);
    slEl.classList.toggle('leave-negative', slRem < 0);
  }
  if (profileLeaveSummaryNotice) {
    profileLeaveSummaryNotice.textContent = summary.leave_tracking_enabled === false
      ? 'Leave tracking is not enabled for this employee.'
      : `Cycle: ${summary.cycle_label || 'Apr-Mar'}`;
    profileLeaveSummaryNotice.className = 'mini-meta';
  }
}

function applyFractionalVisibility() {
  const profile = selectedEmployeeRecord();
  const isFractional = profile.employmentType === 'fractional';
  const leaveTrackingDisabled = profile.leaveTrackingEnabled === false;
  const employeeOnlyMode = state.role === 'employee';

  const leaveNavButton = document.getElementById('leaveNavButton');
  const leaveCenterContent = document.getElementById('leaveCenterContent');
  const fractionalLeaveNotice = document.getElementById('fractionalLeaveNotice');

  if (employeeOnlyMode && (isFractional || leaveTrackingDisabled)) {
    leaveNavButton?.classList.add('hidden');
    leaveCenterContent?.classList.add('hidden');
    fractionalLeaveNotice?.classList.remove('hidden');

    const noticeTitle = fractionalLeaveNotice?.querySelector('h3');
    const noticeBody = fractionalLeaveNotice?.querySelector('p');
    if (leaveTrackingDisabled) {
      if (noticeTitle) noticeTitle.textContent = 'Leave Workflow Disabled';
      if (noticeBody) noticeBody.textContent = 'Finance leaves are excluded from Agency Colony v1. Leave and holiday modules stay hidden in employee view.';
    } else {
      if (noticeTitle) noticeTitle.textContent = 'Leave/Holiday Access Hidden';
      if (noticeBody) noticeBody.textContent = 'This employee is marked as fractional, so leave policy and leave workflow are not available.';
    }

    if (getActiveScreenId() === 'leave-center') {
      activateScreen('daily-tasklist');
    }
  } else {
    leaveNavButton?.classList.remove('hidden');
    leaveCenterContent?.classList.remove('hidden');
    fractionalLeaveNotice?.classList.add('hidden');
  }
}

if (profileTeamSelect) {
  profileTeamSelect.addEventListener('change', (event) => {
    const value = normalizeTeamName(event.target.value, TEAM_AM);
    const profile = selectedEmployeeRecord();
    profile.team = value;
    setSelectedEmployee(state.currentEmployee);
    setProfileSaveNotice('Unsaved changes. Click Save Profile.', 'status warn');
  });
}

if (profileEmploymentType) {
  profileEmploymentType.addEventListener('change', (event) => {
    const value = event.target.value;
    const profile = selectedEmployeeRecord();
    profile.employmentType = value;
    setSelectedEmployee(state.currentEmployee);
    setProfileSaveNotice('Unsaved changes. Click Save Profile.', 'status warn');
  });
}

if (profileAccessLevel) {
  profileAccessLevel.addEventListener('change', () => {
    setProfileSaveNotice('Unsaved changes. Click Save Profile.', 'status warn');
  });
}

if (profileManagerSelect) {
  profileManagerSelect.addEventListener('change', () => {
    setProfileSaveNotice('Unsaved changes. Click Save Profile.', 'status warn');
  });
}

document.querySelectorAll('.collapsible-toggle').forEach(btn => {
  btn.addEventListener('click', () => {
    const panel = btn.closest('.collapsible-panel');
    if (!panel) return;
    const isCollapsed = panel.classList.toggle('collapsed');
    btn.setAttribute('aria-expanded', String(!isCollapsed));
  });
});

if (profileNameInput) {
  profileNameInput.addEventListener('input', () => {
    setProfileSaveNotice('Unsaved changes. Click Save Profile.', 'status warn');
  });
}

if (profileCapacityInput) {
  profileCapacityInput.addEventListener('input', () => {
    setProfileSaveNotice('Unsaved changes. Click Save Profile.', 'status warn');
  });
}

if (profilePeriod) {
  profilePeriod.addEventListener('change', renderProfileProjects);
}

if (profileWeekFilter) {
  profileWeekFilter.addEventListener('change', () => {
    state.profileWeekKey = profileWeekFilter.value || '';
    applySelectedEmployeeAllocationSnapshot(state.profileAllocationRows || []);
  });
}

if (saveProfileBtn) {
  saveProfileBtn.addEventListener('click', () => {
    saveCurrentProfile().catch((error) => {
      console.error(error);
      setProfileSaveNotice(`Unable to save profile: ${error.message}`, 'status error');
    });
  });
}

document.addEventListener('click', (event) => {
  const link = event.target.closest('.employee-link');
  if (!link) return;
  const target = link.dataset.employee;
  if (!target) return;
  if (!isLeadershipRole() && target !== state.currentEmployee) return;
  setSelectedEmployee(target);
  navigateToScreen('employee-profile');
});

/* ── Invoice System ─────────────────────────────────────────────── */
state.invoices = [];
state.invoicePendingFiles = [];

// Invoice Center (viewer-only checklist)
const invoiceTeamChecklist = document.getElementById('invoiceTeamChecklist');
const invoiceFilterMonth = document.getElementById('invoiceFilterMonth');
const invoiceNavButton = document.getElementById('invoiceNavButton');

// Profile invoice upload
const profileInvoicePanel = document.getElementById('profileInvoicePanel');
const profileInvoiceDropzone = document.getElementById('profileInvoiceDropzone');
const profileInvoiceFileInput = document.getElementById('profileInvoiceFileInput');
const profileInvoiceFileLabel = document.getElementById('profileInvoiceFileLabel');
const profileInvoiceType = document.getElementById('profileInvoiceType');
const profileInvoiceMonth = document.getElementById('profileInvoiceMonth');
const profileInvoiceUploadBtn = document.getElementById('profileInvoiceUploadBtn');
const profileInvoiceNotice = document.getElementById('profileInvoiceNotice');
const profileInvoiceStatus = document.getElementById('profileInvoiceStatus');
const profileInvoiceHistory = document.getElementById('profileInvoiceHistory');

function setProfileInvoiceNotice(msg, className) {
  if (!profileInvoiceNotice) return;
  profileInvoiceNotice.textContent = msg;
  profileInvoiceNotice.className = className || 'mini-meta';
}

function currentInvoiceMonth() {
  const now = new Date();
  return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
}

function formatInvoiceMonth(ym) {
  if (!ym) return '';
  const [y, m] = ym.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return months[parseInt(m, 10) - 1] + ' ' + y;
}

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function applyInvoiceVisibility() {
  const viewer = isInvoiceViewer();
  if (invoiceNavButton) {
    invoiceNavButton.classList.toggle('hidden', !viewer);
  }
  const invoiceScreen = document.getElementById('invoice-center');
  if (invoiceScreen) {
    invoiceScreen.classList.toggle('hidden', !viewer);
  }
}

function applyDealFlowVisibility() {
  const canView = isDealFlowViewer();
  const dealNav = document.getElementById('dealFlowNavButton');
  if (dealNav) dealNav.classList.toggle('hidden', !canView);
  const dealScreen = document.getElementById('bd-pipeline');
  if (dealScreen) dealScreen.classList.toggle('hidden', !canView);
}

// Invoice Center password gate — one unlock per session
const INVOICE_PIN_HASH = 'e9dde5cc1465ecb66b2d761a3799803f283e5327909f248e22990e407ba1ace4';
let invoiceUnlocked = false;

async function hashPin(pin) {
  const encoded = new TextEncoder().encode(pin);
  const buffer = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function checkInvoiceAccess() {
  if (invoiceUnlocked) return true;
  const pin = prompt('Enter Invoice Center PIN:');
  if (!pin) return false;
  const hash = await hashPin(pin.trim());
  if (hash === INVOICE_PIN_HASH) {
    invoiceUnlocked = true;
    return true;
  }
  alert('Incorrect PIN.');
  return false;
}

async function loadInvoices() {
  if (!state.supabase || !state.isAuthenticated) {
    state.invoices = [];
    renderInvoiceChecklist();
    renderProfileInvoicePanel();
    return;
  }

  applyInvoiceVisibility();

  const response = await state.supabase
    .from('invoices')
    .select('id, employee_id, invoice_month, file_name, file_path, file_size_bytes, uploaded_at, notes, employee:employees!invoices_employee_id_fkey(full_name)')
    .order('uploaded_at', { ascending: false });

  if (response.error) {
    console.error('Invoice load error:', response.error);
    return;
  }

  state.invoices = (response.data || []).map(inv => ({
    ...inv,
    employee_name: inv.employee?.full_name || 'Unknown'
  }));

  if (invoiceFilterMonth && !invoiceFilterMonth.value) {
    invoiceFilterMonth.value = currentInvoiceMonth();
  }

  renderInvoiceChecklist();
  renderProfileInvoicePanel();
}

// ── Invoice Center: viewer-only team checklist ──

function renderInvoiceChecklist() {
  if (!invoiceTeamChecklist || !isInvoiceViewer()) return;

  const filterMonth = invoiceFilterMonth?.value || currentInvoiceMonth();
  const employees = state.employeeDirectory
    .filter(e => e.department?.leave_tracking_enabled !== false)
    .filter(e => !INVOICE_EXCLUDED_EMAILS.includes(normalizeEmail(e.email || '')))
    .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));

  const monthInvoices = state.invoices.filter(inv => inv.invoice_month === filterMonth);
  const uploadsByEmp = {};
  monthInvoices.forEach(inv => {
    if (!uploadsByEmp[inv.employee_id]) uploadsByEmp[inv.employee_id] = { invoices: [], reimbursements: [] };
    if (inv.invoice_type === 'reimbursement') {
      uploadsByEmp[inv.employee_id].reimbursements.push(inv);
    } else {
      uploadsByEmp[inv.employee_id].invoices.push(inv);
    }
  });

  const submitted = employees.filter(e => uploadsByEmp[e.id]?.invoices.length).length;
  const reimbursementCount = employees.filter(e => uploadsByEmp[e.id]?.reimbursements.length).length;

  function renderFileButtons(files, emptyLabel) {
    if (!files.length) return `<span class="mini-meta">${emptyLabel}</span>`;
    return files.map(inv => `<button class="ghost invoice-download-btn" data-path="${escapeHtml(inv.file_path)}" type="button" title="${escapeHtml(inv.file_name)}">${escapeHtml(inv.file_name.length > 18 ? inv.file_name.slice(0, 15) + '...' : inv.file_name)}</button>`).join('');
  }

  invoiceTeamChecklist.innerHTML =
    `<p class="mini-meta" style="margin-bottom:var(--space-3)">${submitted} of ${employees.length} invoices submitted${reimbursementCount ? `, ${reimbursementCount} reimbursement${reimbursementCount > 1 ? 's' : ''}` : ''} for ${formatInvoiceMonth(filterMonth)}</p>` +
    `<div class="invoice-checklist-header">
      <span class="invoice-checklist-name">Name</span>
      <span class="invoice-checklist-col">Invoice</span>
      <span class="invoice-checklist-col">Reimbursement</span>
    </div>` +
    employees.map(emp => {
      const empData = uploadsByEmp[emp.id] || { invoices: [], reimbursements: [] };
      const hasInvoice = empData.invoices.length > 0;
      return `<div class="invoice-checklist-row">
        <span class="invoice-checklist-name ${hasInvoice ? 'submitted' : ''}">${escapeHtml(emp.full_name || 'Unknown')}</span>
        <div class="invoice-checklist-col">${renderFileButtons(empData.invoices, '—')}</div>
        <div class="invoice-checklist-col">${renderFileButtons(empData.reimbursements, '—')}</div>
      </div>`;
    }).join('');
}

// ── Profile: invoice upload panel ──

function renderProfileInvoicePanel() {
  if (!profileInvoicePanel) return;

  // Only show on own profile for non-finance, non-excluded employees
  const isOwnProfile = state.selectedEmployeeId === state.currentEmployeeId || !state.selectedEmployeeId;
  const finance = isFinanceUser();
  const excludedFromInvoice = INVOICE_EXCLUDED_EMAILS.includes(normalizeEmail(state.session?.user?.email || ''));
  if (!isOwnProfile || finance || excludedFromInvoice || !state.isAuthenticated) {
    profileInvoicePanel.style.display = 'none';
    return;
  }
  profileInvoicePanel.style.display = '';

  if (profileInvoiceMonth && !profileInvoiceMonth.value) {
    profileInvoiceMonth.value = currentInvoiceMonth();
  }

  const empId = state.currentEmployeeId;
  const myInvoices = state.invoices.filter(inv => inv.employee_id === empId);

  // Current month status
  const curMonth = currentInvoiceMonth();
  const thisMonthUploads = myInvoices.filter(inv => inv.invoice_month === curMonth);
  if (profileInvoiceStatus) {
    if (thisMonthUploads.length) {
      profileInvoiceStatus.textContent = `${thisMonthUploads.length} file${thisMonthUploads.length > 1 ? 's' : ''} uploaded for ${formatInvoiceMonth(curMonth)}`;
      profileInvoiceStatus.classList.remove('warn');
      profileInvoiceStatus.classList.add('status');
    } else {
      profileInvoiceStatus.textContent = `No invoice uploaded for ${formatInvoiceMonth(curMonth)} yet`;
      profileInvoiceStatus.classList.remove('status');
      profileInvoiceStatus.classList.add('warn');
    }
  }

  // Upload history
  if (profileInvoiceHistory) {
    if (!myInvoices.length) {
      profileInvoiceHistory.innerHTML = '';
    } else {
      const sorted = [...myInvoices].sort((a, b) => b.invoice_month.localeCompare(a.invoice_month) || new Date(b.uploaded_at) - new Date(a.uploaded_at));
      profileInvoiceHistory.innerHTML = sorted.map(inv => renderInvoiceRow(inv)).join('');
    }
  }
}

function renderInvoiceRow(inv) {
  const dateStr = new Date(inv.uploaded_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const sizeStr = formatFileSize(inv.file_size_bytes);
  const typeLabel = inv.invoice_type === 'reimbursement' ? 'Reimbursement' : 'Invoice';
  return `<div class="invoice-row">
    <span class="invoice-row-name">${escapeHtml(inv.file_name)}</span>
    <span class="invoice-row-meta">${typeLabel}</span>
    <span class="invoice-row-meta">${formatInvoiceMonth(inv.invoice_month)}</span>
    <span class="invoice-row-meta">${dateStr}</span>
    <span class="invoice-row-meta">${sizeStr}</span>
    <span class="invoice-row-actions">
      <button class="ghost invoice-download-btn" data-path="${escapeHtml(inv.file_path)}" type="button">Download</button>
      <button class="ghost invoice-delete-btn" data-id="${inv.id}" data-path="${escapeHtml(inv.file_path)}" type="button" style="color:var(--bad)">Delete</button>
    </span>
  </div>`;
}

function renderInvoiceCard(inv, showDelete) {
  const uploaded = new Date(inv.uploaded_at);
  const dateStr = uploaded.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const sizeStr = formatFileSize(inv.file_size_bytes);
  const nameLabel = showDelete ? '' : `<strong>${escapeHtml(inv.employee_name)}</strong> &middot; `;
  const typeLabel = inv.invoice_type === 'reimbursement' ? 'Reimbursement &middot; ' : '';
  const notesHtml = inv.notes ? ` &middot; ${escapeHtml(inv.notes)}` : '';

  return `<div class="invoice-card">
    <div class="invoice-info">
      <div class="invoice-file-name">${escapeHtml(inv.file_name)}</div>
      <div class="invoice-meta">${nameLabel}${typeLabel}${dateStr}${sizeStr ? ' &middot; ' + sizeStr : ''}${notesHtml}</div>
    </div>
    <div class="invoice-actions">
      <button class="ghost invoice-download-btn" data-path="${escapeHtml(inv.file_path)}" type="button">Download</button>
      ${showDelete ? `<button class="ghost invoice-delete-btn" data-id="${inv.id}" data-path="${escapeHtml(inv.file_path)}" type="button" style="color:var(--bad)">Delete</button>` : ''}
    </div>
  </div>`;
}

function handleInvoiceFileSelect(files) {
  const MAX_SIZE = 10 * 1024 * 1024;
  const allowed = ['.pdf','.png','.jpg','.jpeg','.doc','.docx','.xls','.xlsx'];

  for (const file of files) {
    if (file.size > MAX_SIZE) {
      setProfileInvoiceNotice(`${file.name} exceeds 10 MB limit.`, 'mini-meta status error');
      continue;
    }
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!allowed.includes(ext)) {
      setProfileInvoiceNotice(`${file.name}: unsupported file type.`, 'mini-meta status error');
      continue;
    }
    state.invoicePendingFiles.push(file);
  }
  renderPendingInvoiceFiles();
}

function renderPendingInvoiceFiles() {
  if (!state.invoicePendingFiles.length) {
    if (profileInvoiceFileLabel) profileInvoiceFileLabel.textContent = 'Choose file';
    if (profileInvoiceUploadBtn) profileInvoiceUploadBtn.disabled = true;
    return;
  }
  if (profileInvoiceUploadBtn) profileInvoiceUploadBtn.disabled = false;
  const names = state.invoicePendingFiles.map(f => f.name);
  if (profileInvoiceFileLabel) {
    profileInvoiceFileLabel.textContent = names.length === 1 ? names[0] : `${names.length} files`;
  }
}

async function uploadProfileInvoices() {
  if (!state.invoicePendingFiles.length) return;
  const month = profileInvoiceMonth?.value;
  if (!month) {
    setProfileInvoiceNotice('Please select a month.', 'mini-meta status error');
    return;
  }
  const invoiceType = profileInvoiceType?.value || 'invoice';

  const empId = state.currentEmployeeId;
  if (!empId) {
    setProfileInvoiceNotice('Employee profile not loaded.', 'mini-meta status error');
    return;
  }

  if (profileInvoiceUploadBtn) profileInvoiceUploadBtn.disabled = true;
  setProfileInvoiceNotice('Uploading...', 'mini-meta');

  let uploaded = 0;

  for (const file of state.invoicePendingFiles) {
    const filePath = `${empId}/${month}/${Date.now()}_${file.name}`;

    const { error: storageError } = await state.supabase.storage
      .from('invoices')
      .upload(filePath, file, { upsert: false });

    if (storageError) {
      console.error('Storage upload error:', storageError);
      setProfileInvoiceNotice(`Upload failed for ${file.name}: ${storageError.message}`, 'mini-meta status error');
      continue;
    }

    const { error: dbError } = await state.supabase
      .from('invoices')
      .insert({
        employee_id: empId,
        invoice_month: month,
        invoice_type: invoiceType,
        file_name: file.name,
        file_path: filePath,
        file_size_bytes: file.size
      });

    if (dbError) {
      console.error('Invoice DB insert error:', dbError);
      setProfileInvoiceNotice(`Saved file but failed to record ${file.name}: ${dbError.message}`, 'mini-meta status error');
      continue;
    }
    uploaded++;
  }

  state.invoicePendingFiles = [];
  renderPendingInvoiceFiles();
  if (uploaded > 0) {
    setProfileInvoiceNotice(`${uploaded} file${uploaded > 1 ? 's' : ''} uploaded successfully.`, 'mini-meta status');
  }
  loadInvoices().catch(console.error);
}

async function downloadInvoice(filePath) {
  const { data, error } = await state.supabase.storage
    .from('invoices')
    .createSignedUrl(filePath, 300);

  if (error) {
    console.error('Download URL error:', error);
    return;
  }
  window.open(data.signedUrl, '_blank');
}

async function deleteInvoice(invoiceId, filePath) {
  if (!confirm('Delete this invoice? This cannot be undone.')) return;

  const { error: storageErr } = await state.supabase.storage
    .from('invoices')
    .remove([filePath]);

  if (storageErr) console.error('Storage delete error:', storageErr);

  const { error: dbErr } = await state.supabase
    .from('invoices')
    .delete()
    .eq('id', invoiceId);

  if (dbErr) {
    console.error('Invoice delete error:', dbErr);
    return;
  }

  loadInvoices().catch(console.error);
}

// Profile invoice upload events
if (profileInvoiceFileInput) {
  profileInvoiceFileInput.addEventListener('change', () => {
    if (profileInvoiceFileInput.files.length) {
      handleInvoiceFileSelect(profileInvoiceFileInput.files);
      profileInvoiceFileInput.value = '';
    }
  });
}

if (profileInvoiceUploadBtn) {
  profileInvoiceUploadBtn.addEventListener('click', () => {
    uploadProfileInvoices().catch(console.error);
  });
}

// Download & delete delegation (global)
document.addEventListener('click', (e) => {
  const dlBtn = e.target.closest('.invoice-download-btn');
  if (dlBtn) {
    downloadInvoice(dlBtn.dataset.path).catch(console.error);
    return;
  }
  const delBtn = e.target.closest('.invoice-delete-btn');
  if (delBtn) {
    deleteInvoice(delBtn.dataset.id, delBtn.dataset.path).catch(console.error);
  }
});

// Invoice Center filter
if (invoiceFilterMonth) {
  invoiceFilterMonth.addEventListener('change', () => renderInvoiceChecklist());
}

// ══════════════════════════════════════════════════════════════════════
// ── Deal Flow / BD Pipeline ─────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════

const DEAL_STAGES = [
  { key: 'qualified', label: 'Qualifying', prob: '20%' },
  { key: 'pitch', label: 'Pitching', prob: '50%' },
  { key: 'proposal', label: 'Proposal', prob: '70%' },
  { key: 'negotiated', label: 'Negotiating', prob: '90%' },
  { key: 'contracted', label: 'Contracted', prob: '100%' },
  { key: 'stalled', label: 'Stalled', prob: '0%' },
  { key: 'closedlost', label: 'Lost', prob: '0%' },
];
const DEAL_OPEN_STAGES = ['qualified', 'pitch', 'proposal', 'negotiated'];
const DEAL_STAGE_LABEL = Object.fromEntries(DEAL_STAGES.map(s => [s.key, s.label]));

// DOM refs
const dealBoard = document.getElementById('dealBoard');
const dealListBody = document.getElementById('dealListBody');
const dealListHead = document.getElementById('dealListHead');
const dealListWrap = document.getElementById('dealListWrap');
const dealSectionBody = document.getElementById('dealSectionBody');
const dealSectionHead = document.getElementById('dealSectionHead');
const dealSectionTableWrap = document.getElementById('dealSectionTableWrap');
const dealStatsBar = document.getElementById('dealStatsBar');
const dealSectionTabs = document.getElementById('dealSectionTabs');
const dealFilters = document.getElementById('dealFilters');
const dealFilterPoc = document.getElementById('dealFilterPoc');
const dealSearchInput = document.getElementById('dealSearchInput');
const dealCompanySelect = document.getElementById('dealCompanySelect');

// Returns deals filtered by selected company
function getCompanyDeals() {
  return state.deals.filter(d => (d.company || 'Your Agency') === state.dealCompany);
}
const dealViewBoard = document.getElementById('dealViewBoard');
const dealViewList = document.getElementById('dealViewList');
const dealAddBtn = document.getElementById('dealAddBtn');
const dealDetailPanel = document.getElementById('dealDetailPanel');
const dealDetailInner = document.getElementById('dealDetailInner');
const dealDetailBackdrop = document.getElementById('dealDetailBackdrop');

let dealSortCol = 'deal_name';
let dealSortAsc = true;

// ── Load deals ──
async function loadDealsFromSupabase() {
  if (!state.supabase || !state.isAuthenticated) return;
  const { data, error } = await state.supabase
    .from('deals')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Failed to load deals:', error.message);
    return;
  }
  state.deals = data || [];
  renderDealFlow();
}

// ── Master render ──
function renderDealFlow() {
  renderDealStats();
  renderDealPocFilter();
  const filter = state.dealFilter;
  const isOpen = filter === 'open';

  // Hide section tabs — stats bar is the nav now
  if (dealSectionTabs) dealSectionTabs.style.display = 'none';

  // Show/hide board vs list — force list for non-open filters (stalled/contracted/lost have no Kanban columns)
  const canShowBoard = isOpen || filter === 'overdue';
  const showBoard = canShowBoard && state.dealView === 'board';
  if (dealBoard) dealBoard.style.display = showBoard ? '' : 'none';
  if (dealListWrap) dealListWrap.style.display = showBoard ? 'none' : '';
  if (dealSectionTableWrap) dealSectionTableWrap.style.display = 'none';
  if (dealFilters) dealFilters.style.display = '';

  // View toggle always visible, highlight selected
  if (dealViewBoard) {
    dealViewBoard.classList.toggle('active', state.dealView === 'board');
  }
  if (dealViewList) {
    dealViewList.classList.toggle('active', state.dealView === 'list');
  }

  const filtered = isOpen ? getFilteredHotDeals() : getFilteredDealsByFilter(filter);
  if (showBoard) {
    renderDealBoard(filtered);
  } else if (filter === 'contracted') {
    renderContractedListView(filtered);
  } else {
    renderDealListView(filtered);
  }
}

function getFilteredHotDeals() {
  let deals = getCompanyDeals().filter(d => d.section === 'hot' && DEAL_OPEN_STAGES.includes(d.stage));
  if (state.dealFilterPoc) {
    deals = deals.filter(d => d.poc_employee_id === state.dealFilterPoc);
  }
  if (state.dealSearch) {
    const q = state.dealSearch.toLowerCase();
    deals = deals.filter(d => d.deal_name.toLowerCase().includes(q));
  }
  return deals;
}

function getFilteredDealsByFilter(filter) {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const companyDeals = getCompanyDeals();
  const hot = companyDeals.filter(d => d.section === 'hot' && DEAL_OPEN_STAGES.includes(d.stage));

  let deals;
  switch (filter) {
    case 'overdue':
      deals = hot.filter(d => d.deadline && d.deadline < todayStr); break;
    case 'stalled':
      deals = companyDeals.filter(d => d.stage === 'stalled'); break;
    case 'contracted':
      deals = companyDeals.filter(d => d.stage === 'contracted').sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || '')); break;
    case 'lost':
      deals = companyDeals.filter(d => d.stage === 'closedlost').sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || '')); break;
    default:
      deals = hot;
  }
  // Apply POC and search filters
  if (state.dealFilterPoc) {
    deals = deals.filter(d => d.poc_employee_id === state.dealFilterPoc);
  }
  if (state.dealSearch) {
    const q = state.dealSearch.toLowerCase();
    deals = deals.filter(d => d.deal_name && d.deal_name.toLowerCase().includes(q));
  }
  return deals;
}

// ── Stats bar ──
function renderDealStats() {
  if (!dealStatsBar) return;
  const companyDeals = getCompanyDeals();
  const hot = companyDeals.filter(d => d.section === 'hot' && DEAL_OPEN_STAGES.includes(d.stage));
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  const overdue = hot.filter(d => d.deadline && d.deadline < todayStr).length;
  const stalledDeals = companyDeals.filter(d => d.stage === 'stalled');
  const stalled = stalledDeals.length;
  const stalledHasFollowup = stalledDeals.some(d => d.deadline);
  const EXCLUDED_CLIENTS = ['internal', 'misc', 'pitches/bd'];
  const contracted = (state.clients || []).filter(c => c.is_active && !EXCLUDED_CLIENTS.includes(c.name.toLowerCase())).length;
  const lost = companyDeals.filter(d => d.stage === 'closedlost').length;

  // Color logic: Open = always yellow, Stalled = red if follow-up date exists, Contracted = green
  const openClass = ' deal-stat-warn';
  const stalledClass = stalledHasFollowup ? ' deal-stat-bad' : '';
  const contractedClass = ' deal-stat-good';

  const f = state.dealFilter;
  dealStatsBar.innerHTML = `
    <div class="deal-stat deal-stat-link${f === 'open' ? ' deal-stat-active' : ''}${openClass}" data-filter="open"><span class="deal-stat-num">${hot.length}</span><span class="deal-stat-label">Open Deals</span></div>
    <div class="deal-stat deal-stat-link${f === 'overdue' ? ' deal-stat-active' : ''}${overdue ? ' deal-stat-bad' : ''}" data-filter="overdue"><span class="deal-stat-num">${overdue}</span><span class="deal-stat-label">Overdue</span></div>
    <div class="deal-stat deal-stat-link${f === 'stalled' ? ' deal-stat-active' : ''}${stalledClass}" data-filter="stalled"><span class="deal-stat-num">${stalled}</span><span class="deal-stat-label">Stalled</span></div>
    <div class="deal-stat deal-stat-link${f === 'contracted' ? ' deal-stat-active' : ''}${contractedClass}" data-filter="contracted"><span class="deal-stat-num">${contracted}</span><span class="deal-stat-label">Contracted</span></div>
    <div class="deal-stat deal-stat-link${f === 'lost' ? ' deal-stat-active' : ''}" data-filter="lost"><span class="deal-stat-num">${lost}</span><span class="deal-stat-label">Lost</span></div>
  `;
}

// ── POC filter ──
const DEAL_POC_EMAILS = ['admin@youragency.com', 'sales@youragency.com'];

function getDealPocEmployees() {
  return state.employeeDirectory.filter(e => DEAL_POC_EMAILS.includes(normalizeEmail(e.email)));
}

function renderDealPocFilter() {
  if (!dealFilterPoc) return;
  // Only show POCs who actually have deals assigned
  const assignedPocIds = [...new Set(getCompanyDeals().filter(d => d.poc_employee_id).map(d => d.poc_employee_id))];
  const pocEmps = state.employeeDirectory.filter(e => assignedPocIds.includes(e.id));
  let html = '<option value="">All POCs</option>';
  pocEmps.forEach(emp => {
    html += `<option value="${emp.id}"${state.dealFilterPoc === emp.id ? ' selected' : ''}>${escapeHtml(emp.full_name)}</option>`;
  });
  dealFilterPoc.innerHTML = html;
}

// ── Deal value helpers ──
function dealAmountInINR(deal) {
  if (!deal.amount) return 0;
  const amt = parseFloat(deal.amount);
  if (isNaN(amt)) return 0;
  const inr = deal.currency === 'USD' ? amt * 90 : amt;
  return deal.engagement_type === 'Retainer' ? inr * 6 : inr;
}

function formatLakhs(inr) {
  if (!inr) return '—';
  const lakhs = inr / 100000;
  if (lakhs >= 100) return Math.round(lakhs).toLocaleString('en-IN') + 'L';
  if (lakhs >= 10) return lakhs.toFixed(1).replace(/\.0$/, '') + 'L';
  return lakhs.toFixed(2).replace(/\.?0+$/, '') + 'L';
}

function totalDealsInLakhs(deals) {
  const total = deals.reduce((sum, d) => sum + dealAmountInINR(d), 0);
  return total ? formatLakhs(total) : '';
}

// ── Board view (Kanban) ──
const BOARD_SORT_OPTIONS = [
  { key: 'deadline', label: 'Deadline' },
  { key: 'updated_at', label: 'Modified' },
  { key: 'amount', label: 'Amount' },
];
// Per-column sort state: { stageKey: 'deadline' | 'updated_at' | 'amount' }
const boardColumnSort = {};

function sortDealsForBoard(deals, sortKey) {
  return [...deals].sort((a, b) => {
    if (sortKey === 'deadline') {
      // Deals with deadline first (soonest on top), no deadline at bottom
      if (!a.deadline && !b.deadline) return 0;
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return a.deadline.localeCompare(b.deadline);
    } else if (sortKey === 'amount') {
      return dealAmountInINR(b) - dealAmountInINR(a);
    } else {
      // updated_at — most recent first
      return (b.updated_at || '').localeCompare(a.updated_at || '');
    }
  });
}

function renderDealBoard(deals) {
  if (!dealBoard) return;
  let html = '';
  DEAL_OPEN_STAGES.forEach(stageKey => {
    const sortKey = boardColumnSort[stageKey] || 'deadline';
    const stageDeals = sortDealsForBoard(deals.filter(d => d.stage === stageKey), sortKey);
    const label = DEAL_STAGE_LABEL[stageKey];
    const value = totalDealsInLakhs(stageDeals);
    const sortLabel = BOARD_SORT_OPTIONS.find(o => o.key === sortKey)?.label || 'Deadline';
    html += `<div class="deal-col" data-stage="${stageKey}">
      <div class="deal-col-header">
        <span class="deal-col-title">${label}</span>
        <span class="deal-col-count">${value}</span>
        <button class="deal-col-sort-btn" data-stage="${stageKey}" title="Sort by">${sortLabel} ▾</button>
      </div>
      <div class="deal-col-body" data-stage="${stageKey}">`;
    stageDeals.forEach(d => { html += renderDealCard(d); });
    html += `</div></div>`;
  });
  dealBoard.innerHTML = html;
  initDealDragAndDrop();

  // Sort button click handlers
  dealBoard.querySelectorAll('.deal-col-sort-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const stage = btn.dataset.stage;
      const currentSort = boardColumnSort[stage] || 'deadline';
      const currentIdx = BOARD_SORT_OPTIONS.findIndex(o => o.key === currentSort);
      const nextIdx = (currentIdx + 1) % BOARD_SORT_OPTIONS.length;
      boardColumnSort[stage] = BOARD_SORT_OPTIONS[nextIdx].key;
      renderDealBoard(deals);
    });
  });
}

function renderDealCard(deal) {
  const poc = deal.poc_employee_id ? state.employeeDirectory.find(e => e.id === deal.poc_employee_id) : null;
  const pocLabel = poc ? escapeHtml(poc.full_name.split(' ')[0]) : '';
  const initials = poc ? poc.full_name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) : '';
  const nextStep = deal.next_steps ? escapeHtml(deal.next_steps).slice(0, 60) : '';
  const deadlineClass = getDealDeadlineClass(deal.deadline);
  const deadlineLabel = deal.deadline ? formatDealDate(deal.deadline) : '';
  const engBadge = deal.engagement_type ? `<span class="deal-badge deal-badge-${deal.engagement_type.toLowerCase()}">${escapeHtml(deal.engagement_type)}</span>` : '';

  return `<div class="deal-card" draggable="true" data-deal-id="${deal.id}">
    <div class="deal-card-top">
      <span class="deal-card-name">${escapeHtml(deal.deal_name)}</span>
      ${engBadge}
    </div>
    ${nextStep ? `<div class="deal-card-next">${nextStep}</div>` : ''}
    <div class="deal-card-bottom">
      <span class="deal-card-poc" title="${poc ? escapeHtml(poc.full_name) : ''}">${initials}</span>
      ${deadlineLabel ? `<span class="deal-card-deadline ${deadlineClass}">${deadlineLabel}</span>` : ''}
    </div>
  </div>`;
}

function getDealDeadlineClass(deadline) {
  if (!deadline) return '';
  const now = new Date();
  const d = new Date(deadline + 'T00:00:00');
  const todayStr = now.toISOString().slice(0, 10);
  if (deadline < todayStr) return 'deal-overdue';
  const diff = (d - now) / (1000 * 60 * 60 * 24);
  if (diff <= 7) return 'deal-due-soon';
  return '';
}

function formatDealDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

// ── Drag and drop ──
function initDealDragAndDrop() {
  if (!dealBoard) return;
  const cards = dealBoard.querySelectorAll('.deal-card');
  const cols = dealBoard.querySelectorAll('.deal-col-body');

  cards.forEach(card => {
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', card.dataset.dealId);
      card.classList.add('deal-card-dragging');
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('deal-card-dragging');
      cols.forEach(c => c.classList.remove('deal-col-drop-target'));
    });
  });

  cols.forEach(col => {
    col.addEventListener('dragover', (e) => {
      e.preventDefault();
      col.classList.add('deal-col-drop-target');
    });
    col.addEventListener('dragleave', () => {
      col.classList.remove('deal-col-drop-target');
    });
    col.addEventListener('drop', async (e) => {
      e.preventDefault();
      col.classList.remove('deal-col-drop-target');
      const dealId = e.dataTransfer.getData('text/plain');
      const newStage = col.dataset.stage;
      if (!dealId || !newStage) return;
      await updateDealStage(dealId, newStage);
    });
  });
}

async function updateDealStage(dealId, newStage) {
  const deal = state.deals.find(d => d.id === dealId);
  if (!deal || deal.stage === newStage) return;
  const oldStage = deal.stage;

  // If moving to a closing stage, confirm
  if (newStage === 'contracted' || newStage === 'closedlost' || newStage === 'stalled') {
    const label = DEAL_STAGE_LABEL[newStage];
    if (!confirm(`Move "${deal.deal_name}" to ${label}?`)) return;
  }

  let newSection = deal.section;
  if (newStage === 'contracted') newSection = 'active';
  else if (newStage === 'closedlost' || newStage === 'stalled') newSection = 'cold';
  else if (DEAL_OPEN_STAGES.includes(newStage)) newSection = 'hot';

  const { error } = await state.supabase
    .from('deals')
    .update({ stage: newStage, section: newSection })
    .eq('id', dealId);
  if (error) {
    console.error('Stage update failed:', error.message);
    return;
  }

  // Log stage change
  await state.supabase.from('deal_stage_history').insert({
    deal_id: dealId,
    stage: newStage,
    changed_by: state.currentEmployeeId
  });

  // Close previous stage history entry
  const { data: prevEntries } = await state.supabase
    .from('deal_stage_history')
    .select('id')
    .eq('deal_id', dealId)
    .eq('stage', oldStage)
    .is('exited_at', null);
  if (prevEntries?.length) {
    await state.supabase
      .from('deal_stage_history')
      .update({ exited_at: new Date().toISOString() })
      .in('id', prevEntries.map(e => e.id));
  }

  await loadDealsFromSupabase();

  // If contracted, offer to link/create client
  if (newStage === 'contracted') {
    offerClientLinking(deal);
  }
}

function offerClientLinking(deal) {
  const action = prompt(`"${deal.deal_name}" is now Closed Won!\n\nType "new" to create a new Client entry, or "link" to link to an existing one, or press Cancel to skip.`);
  if (!action) return;
  if (action.toLowerCase() === 'new') {
    createClientFromDeal(deal);
  } else if (action.toLowerCase() === 'link') {
    linkDealToExistingClient(deal);
  }
}

async function createClientFromDeal(deal) {
  const { data, error } = await state.supabase
    .from('clients')
    .insert({ name: deal.deal_name, account_owner_employee_id: deal.poc_employee_id, is_active: true })
    .select()
    .single();
  if (error) {
    console.error('Failed to create client:', error.message);
    alert('Failed to create client: ' + error.message);
    return;
  }
  await state.supabase.from('deals').update({ client_id: data.id }).eq('id', deal.id);
  alert(`Client "${deal.deal_name}" created and linked!`);
  loadDealsFromSupabase();
}

async function linkDealToExistingClient(deal) {
  const clientNames = state.clients.filter(c => c.is_active).map(c => c.name).join('\n');
  const chosen = prompt(`Enter client name to link:\n\n${clientNames}`);
  if (!chosen) return;
  const match = state.clients.find(c => c.name.toLowerCase() === chosen.toLowerCase());
  if (!match) {
    alert('Client not found. Please try again.');
    return;
  }
  await state.supabase.from('deals').update({ client_id: match.id }).eq('id', deal.id);
  alert(`Deal linked to "${match.name}"!`);
  loadDealsFromSupabase();
}

// ── List view ──
function renderDealListView(deals) {
  if (!dealListHead || !dealListBody) return;
  const cols = [
    { key: 'deal_name', label: 'Deal' },
    { key: 'stage', label: 'Stage' },
    { key: 'poc', label: 'POC' },
    { key: 'next_steps', label: 'Next Steps' },
    { key: 'deadline', label: 'Deadline' },
    { key: 'engagement_type', label: 'Type' },
    { key: 'business_model', label: 'Model' },
    { key: 'updated_at', label: 'Updated' },
  ];
  dealListHead.innerHTML = '<tr>' + cols.map(c =>
    `<th class="deal-th${dealSortCol === c.key ? ' sorted' : ''}" data-col="${c.key}">${c.label}${dealSortCol === c.key ? (dealSortAsc ? ' ↑' : ' ↓') : ''}</th>`
  ).join('') + '</tr>';

  const sorted = [...deals].sort((a, b) => {
    let va = a[dealSortCol] || '';
    let vb = b[dealSortCol] || '';
    if (dealSortCol === 'poc') {
      const ea = state.employeeDirectory.find(e => e.id === a.poc_employee_id);
      const eb = state.employeeDirectory.find(e => e.id === b.poc_employee_id);
      va = ea?.full_name || '';
      vb = eb?.full_name || '';
    }
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    if (va < vb) return dealSortAsc ? -1 : 1;
    if (va > vb) return dealSortAsc ? 1 : -1;
    return 0;
  });

  dealListBody.innerHTML = sorted.map(d => {
    const poc = d.poc_employee_id ? state.employeeDirectory.find(e => e.id === d.poc_employee_id) : null;
    const deadlineClass = getDealDeadlineClass(d.deadline);
    return `<tr class="deal-list-row" data-deal-id="${d.id}">
      <td class="deal-td-name">${escapeHtml(d.deal_name)}</td>
      <td><span class="deal-stage-pill deal-stage-${d.stage}">${DEAL_STAGE_LABEL[d.stage] || d.stage}</span></td>
      <td>${poc ? escapeHtml(poc.full_name) : '—'}</td>
      <td class="deal-td-next">${d.next_steps ? escapeHtml(d.next_steps).slice(0, 50) : ''}</td>
      <td class="${deadlineClass}">${d.deadline ? formatDealDate(d.deadline) : ''}</td>
      <td>${d.engagement_type || ''}</td>
      <td>${d.business_model || ''}</td>
      <td>${d.updated_at ? formatDealDate(d.updated_at.slice(0, 10)) : ''}</td>
    </tr>`;
  }).join('');
}

// ── Contracted list with Active / Archived grouping ──
function renderContractedListView(deals) {
  if (!dealListHead || !dealListBody) return;
  const EXCLUDED_CLIENTS_LC = ['internal', 'misc', 'pitches/bd'];
  const allClients = (state.clients || []).filter(c => !EXCLUDED_CLIENTS_LC.includes(c.name.toLowerCase()));
  const activeClientIds = new Set(allClients.filter(c => c.is_active).map(c => c.id));
  const active = deals.filter(d => d.client_id && activeClientIds.has(d.client_id));
  const archivedDeals = deals.filter(d => !d.client_id || !activeClientIds.has(d.client_id));

  // Also include archived clients from Clients module that have no deal entry
  const dealClientIds = new Set(deals.map(d => d.client_id).filter(Boolean));
  const archivedClientsWithoutDeals = allClients
    .filter(c => !c.is_active && !dealClientIds.has(c.id))
    .map(c => ({ deal_name: c.name, engagement_type: c.type, business_model: '', updated_at: c.updated_at, _isClientOnly: true }));
  const archived = [...archivedDeals, ...archivedClientsWithoutDeals];

  const cols = ['Deal', 'POC', 'Type', 'Model', 'Updated'];
  dealListHead.innerHTML = '<tr>' + cols.map(c => `<th>${c}</th>`).join('') + '</tr>';

  function rowsHtml(list) {
    return list.map(d => {
      const poc = d.poc_employee_id ? state.employeeDirectory.find(e => e.id === d.poc_employee_id) : null;
      return `<tr class="deal-list-row" data-deal-id="${d.id}">
        <td class="deal-td-name">${escapeHtml(d.deal_name)}</td>
        <td>${poc ? escapeHtml(poc.full_name) : '—'}</td>
        <td>${d.engagement_type || ''}</td>
        <td>${d.business_model || ''}</td>
        <td>${d.updated_at ? formatDealDate(d.updated_at.slice(0, 10)) : ''}</td>
      </tr>`;
    }).join('');
  }

  let html = '';
  if (active.length) {
    html += `<tr class="deal-group-header"><td colspan="${cols.length}">Active Clients (${active.length})</td></tr>`;
    html += rowsHtml(active);
  }
  if (archived.length) {
    html += `<tr class="deal-group-header deal-group-collapsible" data-group="archived"><td colspan="${cols.length}"><span class="deal-group-arrow">▶</span> Archived (${archived.length})</td></tr>`;
    html += rowsHtml(archived).replace(/<tr /g, '<tr data-group-row="archived" style="display:none" ');
  }
  if (!html) {
    html = `<tr><td colspan="${cols.length}" style="text-align:center;color:var(--text-2)">No contracted deals</td></tr>`;
  }
  dealListBody.innerHTML = html;

  // Collapsible archived section
  dealListBody.querySelectorAll('.deal-group-collapsible').forEach(header => {
    header.addEventListener('click', () => {
      const group = header.dataset.group;
      const rows = dealListBody.querySelectorAll(`[data-group-row="${group}"]`);
      const arrow = header.querySelector('.deal-group-arrow');
      const isOpen = rows[0]?.style.display !== 'none';
      rows.forEach(r => r.style.display = isOpen ? 'none' : '');
      if (arrow) arrow.textContent = isOpen ? '▶' : '▼';
    });
  });
}

// ── Section tables (Active / Cold / Completed) ──
function renderDealSectionTable(section) {
  if (!dealSectionHead || !dealSectionBody) return;
  let deals = state.deals.filter(d => d.section === section);

  if (section === 'active') {
    // Pull active clients from the Clients module (same data as sidebar Clients)
    const activeClients = state.clients.filter(c => c.is_active);
    dealSectionHead.innerHTML = '<tr><th>Client</th><th>Type</th><th>Owner</th><th>Status</th></tr>';
    dealSectionBody.innerHTML = activeClients.map(c => {
      return `<tr>
        <td class="deal-td-name">${escapeHtml(c.name)}</td>
        <td>${escapeHtml(c.type || '—')}</td>
        <td>${c.owner_full_name ? escapeHtml(c.owner_full_name) : '—'}</td>
        <td>${escapeHtml(c.status || 'Active')}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--text-2)">No active clients</td></tr>';
  } else if (section === 'cold') {
    dealSectionHead.innerHTML = '<tr><th>Deal</th><th>Stage</th><th>POC</th><th>Last Updated</th><th></th></tr>';
    dealSectionBody.innerHTML = deals.map(d => {
      const poc = d.poc_employee_id ? state.employeeDirectory.find(e => e.id === d.poc_employee_id) : null;
      return `<tr class="deal-list-row" data-deal-id="${d.id}">
        <td class="deal-td-name">${escapeHtml(d.deal_name)}</td>
        <td><span class="deal-stage-pill deal-stage-${d.stage}">${DEAL_STAGE_LABEL[d.stage] || d.stage}</span></td>
        <td>${poc ? escapeHtml(poc.full_name) : '—'}</td>
        <td>${d.updated_at ? formatDealDate(d.updated_at.slice(0, 10)) : ''}</td>
        <td>${isLeadershipRole() ? `<button class="ghost small deal-revive-btn" data-deal-id="${d.id}" type="button">Revive</button>` : ''}</td>
      </tr>`;
    }).join('');
  } else if (section === 'completed') {
    dealSectionHead.innerHTML = '<tr><th>Client</th><th>Engagement Type</th><th>Business Model</th><th>Termination</th></tr>';
    dealSectionBody.innerHTML = deals.map(d => {
      const termClass = d.termination_type === 'Good Termination' ? 'deal-badge-good' : d.termination_type === 'Bad Termination' ? 'deal-badge-bad' : '';
      return `<tr class="deal-list-row" data-deal-id="${d.id}">
        <td class="deal-td-name">${escapeHtml(d.deal_name)}</td>
        <td>${d.engagement_type || '—'}</td>
        <td>${d.business_model || '—'}</td>
        <td>${d.termination_type ? `<span class="deal-badge ${termClass}">${escapeHtml(d.termination_type)}</span>` : '—'}</td>
      </tr>`;
    }).join('');
  }
}

// ── Deal detail panel ──
function openDealDetail(dealId) {
  const deal = state.deals.find(d => d.id === dealId);
  if (!deal || !dealDetailPanel || !dealDetailInner) return;
  const canEdit = isLeadershipRole() || isDealFlowViewer() || deal.poc_employee_id === state.currentEmployeeId;
  const canDelete = isLeadershipRole() || isDealFlowViewer();

  const poc = deal.poc_employee_id ? state.employeeDirectory.find(e => e.id === deal.poc_employee_id) : null;
  const client = deal.client_id ? state.clients.find(c => c.id === deal.client_id) : null;
  const stageOptions = DEAL_STAGES.map(s => `<option value="${s.key}"${deal.stage === s.key ? ' selected' : ''}>${s.label}</option>`).join('');
  const pocOptions = '<option value="">—</option>' + getDealPocEmployees().map(e => `<option value="${e.id}"${deal.poc_employee_id === e.id ? ' selected' : ''}>${escapeHtml(e.full_name)}</option>`).join('');
  const clientOptions = '<option value="">— None —</option>' + state.clients.filter(c => c.is_active).map(c => `<option value="${c.id}"${deal.client_id === c.id ? ' selected' : ''}>${escapeHtml(c.name)}</option>`).join('');

  const readonlyAttr = canEdit ? '' : ' disabled';

  dealDetailInner.innerHTML = `
    <div class="deal-detail-header">
      <h3 class="deal-detail-title">${escapeHtml(deal.deal_name)}</h3>
      <button class="ghost deal-detail-close" type="button">✕</button>
    </div>
    <div class="deal-detail-form">
      <label>Deal Name</label>
      <input type="text" class="deal-field" data-field="deal_name" value="${escapeHtml(deal.deal_name)}"${readonlyAttr} />

      <div class="deal-detail-row">
        <div class="deal-detail-half">
          <label>Stage</label>
          <select class="deal-field" data-field="stage"${readonlyAttr}>${stageOptions}</select>
        </div>
        <div class="deal-detail-half">
          <label>POC</label>
          <select class="deal-field" data-field="poc_employee_id"${readonlyAttr}>${pocOptions}</select>
        </div>
      </div>

      <label>Next Steps</label>
      <input type="text" class="deal-field" data-field="next_steps" value="${escapeHtml(deal.next_steps || '')}"${readonlyAttr} />

      <div class="deal-detail-row">
        <div class="deal-detail-half">
          <label>Deadline</label>
          <input type="date" class="deal-field" data-field="deadline" value="${deal.deadline || ''}"${readonlyAttr} />
        </div>
        <div class="deal-detail-half">
          <label>Amount</label>
          <div class="deal-amount-row">
            <select class="deal-field deal-currency-select" data-field="currency"${readonlyAttr}>
              <option value="INR"${deal.currency === 'INR' || !deal.currency ? ' selected' : ''}>₹</option>
              <option value="USD"${deal.currency === 'USD' ? ' selected' : ''}>$</option>
            </select>
            <input type="text" inputmode="numeric" class="deal-field deal-amount-input" data-field="amount" value="${deal.amount ? Number(deal.amount).toLocaleString('en-IN') : ''}"${readonlyAttr} />
          </div>
        </div>
      </div>

      <label>Notes</label>
      <textarea class="deal-field" data-field="notes" rows="2"${readonlyAttr}>${escapeHtml(deal.notes || '')}</textarea>

      <div class="deal-detail-row">
        <div class="deal-detail-half">
          <label>Engagement Type</label>
          <select class="deal-field" data-field="engagement_type"${readonlyAttr}>
            <option value="">—</option>
            <option value="Retainer"${deal.engagement_type === 'Retainer' ? ' selected' : ''}>Retainer</option>
            <option value="Project"${deal.engagement_type === 'Project' ? ' selected' : ''}>Project</option>
          </select>
        </div>
        <div class="deal-detail-half">
          <label>Business Model</label>
          <select class="deal-field" data-field="business_model"${readonlyAttr}>
            <option value="">—</option>
            <option value="B2B"${deal.business_model === 'B2B' ? ' selected' : ''}>B2B</option>
            <option value="B2C"${deal.business_model === 'B2C' ? ' selected' : ''}>B2C</option>
          </select>
        </div>
      </div>

      <div class="deal-detail-row">
        <div class="deal-detail-half">
          <label>Linked Client</label>
          <select class="deal-field" data-field="client_id"${readonlyAttr}>${clientOptions}</select>
        </div>
        <div class="deal-detail-half">
          <label>Brand</label>
          <select class="deal-field" data-field="company"${readonlyAttr}>
            <option value="Your Agency"${(deal.company || 'Your Agency') === 'Your Agency' ? ' selected' : ''}>Your Agency</option>
            <option value="Brand 2"${deal.company === 'Brand 2' ? ' selected' : ''}>Brand 2</option>
            <option value="Brand 3"${deal.company === 'Brand 3' ? ' selected' : ''}>Brand 3</option>
          </select>
        </div>
      </div>

      ${deal.section === 'active' ? `
      <label>Termination Type</label>
      <select class="deal-field" data-field="termination_type"${readonlyAttr}>
        <option value="">— Active —</option>
        <option value="Active"${deal.termination_type === 'Active' ? ' selected' : ''}>Active</option>
        <option value="Good Termination"${deal.termination_type === 'Good Termination' ? ' selected' : ''}>Good Termination</option>
        <option value="Bad Termination"${deal.termination_type === 'Bad Termination' ? ' selected' : ''}>Bad Termination</option>
      </select>` : ''}

      ${canEdit ? '<button class="primary deal-save-btn" type="button">Save Changes</button>' : ''}
      <div class="deal-detail-actions">
        ${canDelete ? `<button class="ghost small deal-delete-btn" data-deal-id="${deal.id}" type="button">Delete</button>` : ''}
      </div>
    </div>

    <div class="deal-activity-log">
      <h4>Activity</h4>
      <div id="dealActivityLog">Loading…</div>
    </div>
  `;

  dealDetailPanel.classList.add('open');
  dealDetailPanel.dataset.dealId = dealId;
  document.body.classList.add('deal-panel-open');
  loadDealActivity(dealId);

  // Make date inputs open calendar on click anywhere in the field
  dealDetailInner.querySelectorAll('input[type="date"]').forEach(inp => {
    inp.addEventListener('click', () => { try { inp.showPicker(); } catch(e) {} });
  });

  // Format amount with commas on blur
  const amountInput = dealDetailInner.querySelector('.deal-amount-input');
  if (amountInput) {
    amountInput.addEventListener('blur', () => {
      const raw = parseFloat(amountInput.value.replace(/,/g, ''));
      if (!isNaN(raw)) amountInput.value = raw.toLocaleString('en-IN');
    });
    amountInput.addEventListener('focus', () => {
      amountInput.value = amountInput.value.replace(/,/g, '');
    });
  }
}

function closeDealDetail() {
  if (dealDetailPanel) {
    dealDetailPanel.classList.remove('open');
    delete dealDetailPanel.dataset.dealId;
  }
  document.body.classList.remove('deal-panel-open');
}

async function loadDealActivity(dealId) {
  const logEl = document.getElementById('dealActivityLog');
  if (!logEl) return;
  const { data, error } = await state.supabase
    .from('deal_stage_history')
    .select('*')
    .eq('deal_id', dealId)
    .order('entered_at', { ascending: false });
  if (error || !data?.length) {
    logEl.innerHTML = '<p class="muted">No activity yet.</p>';
    return;
  }
  logEl.innerHTML = data.map(entry => {
    const emp = entry.changed_by ? state.employeeDirectory.find(e => e.id === entry.changed_by) : null;
    const who = emp ? escapeHtml(emp.full_name) : 'System';
    const when = new Date(entry.entered_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const stageLabel = DEAL_STAGE_LABEL[entry.stage] || entry.stage;
    return `<div class="deal-activity-entry">
      <span>${escapeHtml(who)} moved to <strong>${stageLabel}</strong></span>
      <span class="deal-activity-meta">${when}</span>
    </div>`;
  }).join('');
}

async function saveDealFromPanel() {
  const dealId = dealDetailPanel?.dataset.dealId;
  if (!dealId) return;
  const fields = dealDetailInner.querySelectorAll('.deal-field');
  const updates = {};
  fields.forEach(f => {
    const key = f.dataset.field;
    let val = f.value.trim();
    if (val === '' || val === '—') val = null;
    if (key === 'amount' && val !== null) val = parseFloat(val.replace(/,/g, ''));
    updates[key] = val;
  });

  // Check if stage changed for history logging
  const deal = state.deals.find(d => d.id === dealId);
  const stageChanged = deal && updates.stage && updates.stage !== deal.stage;
  const oldStage = deal?.stage;

  // If stage changes to a closing stage, update section too
  if (updates.stage === 'contracted') updates.section = 'active';
  else if (updates.stage === 'closedlost' || updates.stage === 'stalled') updates.section = 'cold';
  else if (DEAL_OPEN_STAGES.includes(updates.stage)) updates.section = 'hot';

  // If termination type set to Good/Bad, move to completed
  if (updates.termination_type === 'Good Termination' || updates.termination_type === 'Bad Termination') {
    updates.section = 'completed';
  }

  // Contracted deals MUST have a linked client
  if (updates.stage === 'contracted' && !updates.client_id) {
    alert('Please link this deal to a client before marking it as Contracted.');
    return;
  }

  const { error } = await state.supabase.from('deals').update(updates).eq('id', dealId);
  if (error) {
    console.error('Deal save failed:', error.message);
    alert('Save failed: ' + error.message);
    return;
  }

  if (stageChanged) {
    await state.supabase.from('deal_stage_history').insert({
      deal_id: dealId,
      stage: updates.stage,
      changed_by: state.currentEmployeeId
    });
    if (oldStage) {
      const { data: prev } = await state.supabase
        .from('deal_stage_history')
        .select('id')
        .eq('deal_id', dealId)
        .eq('stage', oldStage)
        .is('exited_at', null);
      if (prev?.length) {
        await state.supabase
          .from('deal_stage_history')
          .update({ exited_at: new Date().toISOString() })
          .in('id', prev.map(e => e.id));
      }
    }
  }

  closeDealDetail();
  await loadDealsFromSupabase();
}

// ── New deal ──
function openNewDealForm() {
  if (!dealDetailPanel || !dealDetailInner) return;
  const pocOptions = '<option value="">—</option>' + getDealPocEmployees().map(e => `<option value="${e.id}">${escapeHtml(e.full_name)}</option>`).join('');

  dealDetailInner.innerHTML = `
    <div class="deal-detail-header">
      <h3 class="deal-detail-title">New Deal</h3>
      <button class="ghost deal-detail-close" type="button">✕</button>
    </div>
    <div class="deal-detail-form">
      <label>Deal Name *</label>
      <input type="text" id="newDealName" />

      <div class="deal-detail-row">
        <div class="deal-detail-half">
          <label>Stage</label>
          <select id="newDealStage">
            ${DEAL_OPEN_STAGES.map(s => `<option value="${s}">${DEAL_STAGE_LABEL[s]}</option>`).join('')}
          </select>
        </div>
        <div class="deal-detail-half">
          <label>POC</label>
          <select id="newDealPoc">${pocOptions}</select>
        </div>
      </div>

      <label>Next Steps</label>
      <input type="text" id="newDealNextSteps" />

      <div class="deal-detail-row">
        <div class="deal-detail-half">
          <label>Deadline</label>
          <input type="date" id="newDealDeadline" />
        </div>
        <div class="deal-detail-half">
          <label>Engagement Type</label>
          <select id="newDealEngType">
            <option value="">—</option>
            <option value="Retainer">Retainer</option>
            <option value="Project">Project</option>
          </select>
        </div>
      </div>

      <div class="deal-detail-row">
        <div class="deal-detail-half">
          <label>Amount</label>
          <div class="deal-amount-input-wrap">
            <select id="newDealCurrency" class="deal-currency-select"><option value="INR">₹</option><option value="USD">$</option></select>
            <input type="text" id="newDealAmount" placeholder="0" inputmode="numeric" />
          </div>
        </div>
        <div class="deal-detail-half">
          <label>Business Model</label>
          <select id="newDealBizModel">
            <option value="">—</option>
            <option value="B2B">B2B</option>
            <option value="B2C">B2C</option>
          </select>
        </div>
      </div>

      <button class="primary" id="newDealSaveBtn" type="button">Create Deal</button>
    </div>
  `;

  dealDetailPanel.classList.add('open');
  dealDetailPanel.dataset.dealId = '';
  document.body.classList.add('deal-panel-open');

  document.getElementById('newDealSaveBtn')?.addEventListener('click', createNewDeal);

  // Make date input open calendar on click anywhere in the field
  dealDetailInner.querySelectorAll('input[type="date"]').forEach(inp => {
    inp.addEventListener('click', () => { try { inp.showPicker(); } catch(e) {} });
  });
}

async function createNewDeal() {
  const name = document.getElementById('newDealName')?.value.trim();
  if (!name) { alert('Deal name is required.'); return; }

  const stage = document.getElementById('newDealStage')?.value || 'qualified';
  const poc = document.getElementById('newDealPoc')?.value || null;
  const nextSteps = document.getElementById('newDealNextSteps')?.value.trim() || null;
  const deadline = document.getElementById('newDealDeadline')?.value || null;
  const engType = document.getElementById('newDealEngType')?.value || null;
  const bizModel = document.getElementById('newDealBizModel')?.value || null;
  const amountRaw = document.getElementById('newDealAmount')?.value.replace(/,/g, '').trim();
  const amount = amountRaw ? parseFloat(amountRaw) : null;
  const currency = document.getElementById('newDealCurrency')?.value || 'INR';

  const { data, error } = await state.supabase
    .from('deals')
    .insert({
      deal_name: name,
      stage: stage,
      poc_employee_id: poc,
      next_steps: nextSteps,
      deadline: deadline,
      engagement_type: engType,
      business_model: bizModel,
      amount: amount,
      currency: currency,
      section: 'hot',
      company: state.dealCompany
    })
    .select()
    .single();

  if (error) {
    console.error('Create deal failed:', error.message);
    alert('Failed to create deal: ' + error.message);
    return;
  }

  // Log initial stage
  await state.supabase.from('deal_stage_history').insert({
    deal_id: data.id,
    stage: stage,
    changed_by: state.currentEmployeeId
  });

  closeDealDetail();
  await loadDealsFromSupabase();
}

// ── Delete deal ──
async function deleteDeal(dealId) {
  if (!confirm('Delete this deal permanently?')) return;
  const { error } = await state.supabase.from('deals').delete().eq('id', dealId);
  if (error) {
    console.error('Delete failed:', error.message);
    return;
  }
  closeDealDetail();
  await loadDealsFromSupabase();
}

// ── Revive cold deal ──
async function reviveDeal(dealId) {
  const stage = prompt('Which stage should this deal move to?\n\nOptions: qualified, pitch, proposal, negotiated');
  if (!stage || !DEAL_OPEN_STAGES.includes(stage)) {
    if (stage) alert('Invalid stage. Use: qualified, pitch, proposal, or negotiated');
    return;
  }
  const { error } = await state.supabase.from('deals').update({ stage, section: 'hot' }).eq('id', dealId);
  if (error) {
    console.error('Revive failed:', error.message);
    return;
  }
  await state.supabase.from('deal_stage_history').insert({
    deal_id: dealId,
    stage,
    changed_by: state.currentEmployeeId
  });
  await loadDealsFromSupabase();
}

// ── Event handlers ──

// Stats bar filter clicks
if (dealStatsBar) {
  dealStatsBar.addEventListener('click', (e) => {
    const stat = e.target.closest('.deal-stat-link');
    if (!stat) return;
    state.dealFilter = stat.dataset.filter;
    renderDealFlow();
  });
}

// View toggle
if (dealViewBoard) {
  dealViewBoard.addEventListener('click', () => {
    state.dealView = 'board';
    dealViewBoard.classList.add('active');
    dealViewList?.classList.remove('active');
    renderDealFlow();
  });
}
if (dealViewList) {
  dealViewList.addEventListener('click', () => {
    state.dealView = 'list';
    dealViewList.classList.add('active');
    dealViewBoard?.classList.remove('active');
    renderDealFlow();
  });
}

// Company switcher
if (dealCompanySelect) {
  dealCompanySelect.addEventListener('change', () => {
    state.dealCompany = dealCompanySelect.value;
    state.dealFilter = 'open'; // reset to default view on company switch
    renderDealFlow();
  });
}

// POC filter
if (dealFilterPoc) {
  dealFilterPoc.addEventListener('change', () => {
    state.dealFilterPoc = dealFilterPoc.value;
    renderDealFlow();
  });
}

// Search
if (dealSearchInput) {
  dealSearchInput.addEventListener('input', () => {
    state.dealSearch = dealSearchInput.value;
    renderDealFlow();
  });
}

// Add button
if (dealAddBtn) {
  dealAddBtn.addEventListener('click', () => openNewDealForm());
}

// Close panel when clicking the backdrop (outside the inner panel)
document.addEventListener('click', (e) => {
  if (!document.body.classList.contains('deal-panel-open')) return;
  if (dealDetailInner && !dealDetailInner.contains(e.target) && !e.target.closest('.deal-card, .deal-list-row, .deal-revive-btn, #dealAddBtn')) {
    closeDealDetail();
  }
});

// Delegated clicks on board, list, detail panel
document.addEventListener('click', (e) => {
  // Deal card click (open detail)
  const card = e.target.closest('.deal-card');
  if (card && !e.target.closest('[draggable]')?.classList.contains('deal-card-dragging')) {
    const dealId = card.dataset.dealId;
    if (dealId) openDealDetail(dealId);
    return;
  }

  // Deal list row click
  const row = e.target.closest('.deal-list-row');
  if (row && row.dataset.dealId) {
    openDealDetail(row.dataset.dealId);
    return;
  }

  // Close detail panel
  if (e.target.closest('.deal-detail-close')) {
    closeDealDetail();
    return;
  }

  // Save deal
  if (e.target.closest('.deal-save-btn')) {
    saveDealFromPanel().catch(console.error);
    return;
  }

  // Delete deal
  const delBtn = e.target.closest('.deal-delete-btn');
  if (delBtn) {
    deleteDeal(delBtn.dataset.dealId).catch(console.error);
    return;
  }

  // Revive cold deal
  const reviveBtn = e.target.closest('.deal-revive-btn');
  if (reviveBtn) {
    reviveDeal(reviveBtn.dataset.dealId).catch(console.error);
    return;
  }

  // Sort headers in list view
  const th = e.target.closest('.deal-th');
  if (th) {
    const col = th.dataset.col;
    if (dealSortCol === col) {
      dealSortAsc = !dealSortAsc;
    } else {
      dealSortCol = col;
      dealSortAsc = true;
    }
    renderDealFlow();
  }
});

// ── End Deal Flow ──────────────────────────────────────────────────────

setAuthenticatedNavigation(false);
updateSidebarIdentityLabels();
updateAllLastEditLabels();
setSelectedEmployee(DEFAULT_EMPLOYEE);
applyRoleAccess();
applyFractionalVisibility();
renderClientOwnerOptions();
resetClientEditor();
setClientFormNotice('');
initializeScreenHistory();

initializeSupabaseAuth().catch((error) => {
  console.error(error);
  setLoginStatus(`Supabase initialization failed: ${error.message}`, 'status error');
});
