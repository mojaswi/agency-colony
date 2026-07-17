/* ── Colony access control: role & permission predicates ──
   Classic script — loads after config.js + utils.js, before app.js. Shares the
   global scope. These functions read the global `state` object and a couple of
   app.js helpers (currentUserDepartmentName, employeeReportsToManager); since
   they're only CALLED at runtime (after every script has loaded), those
   references resolve fine even though app.js loads later.

   IMPORTANT: client-side role here is UX-only. RLS is the
   real security boundary. Never use these predicates to decide whether to add
   an employee_id filter on own-data DB queries — always filter regardless. */

// ── Superadmin ──
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

// ── Role / department ──
function normalizeAccessLevel(role) {
  if (role === 'admin' || role === 'leadership' || role === 'employee') return role;
  return 'employee';
}

// Effective enforced-access map: the DB-loaded overrides (state.accessOverrides,
// editable in Admin Settings) if present, else the in-code ENFORCED_ACCESS_BY_EMAIL
// constant as a failsafe. Both are { normalizedEmail: role } objects.
function getEnforcedAccessMap() {
  return (state.accessOverrides && Object.keys(state.accessOverrides).length)
    ? state.accessOverrides
    : ENFORCED_ACCESS_BY_EMAIL;
}

function getEnforcedAccessLevel(email) {
  return getEnforcedAccessMap()[normalizeEmail(email)] || null;
}

// Operational config accessors: prefer the DB-loaded app_config (state.appConfig,
// editable in Admin Settings) per key, else the in-code constant for that key.
// loadAppConfig() (app.js) populates state.appConfig on login.
function getConfigList(key, fallback) {
  const v = state.appConfig && state.appConfig[key];
  return (Array.isArray(v) && v.length) ? v.map(normalizeEmail) : fallback;
}
function getConfigMap(key, fallback) {
  const v = state.appConfig && state.appConfig[key];
  return (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length) ? v : fallback;
}
function getInvoiceViewerEmails()  { return getConfigList('invoice_viewer_emails',  INVOICE_VIEWER_EMAILS); }
function getInvoiceExcludedEmails(){ return getConfigList('invoice_excluded_emails', INVOICE_EXCLUDED_EMAILS); }
function getHiddenEmployeeEmails() { return getConfigList('hidden_employee_emails',  HIDDEN_EMPLOYEE_EMAILS); }
function getDealFlowExtraEmails()  { return getConfigList('deal_flow_extra_emails',   DEAL_FLOW_EXTRA_EMAILS); }
function getTeamManagerMap()       { return getConfigMap('team_manager_by_team',      TEAM_MANAGER_BY_TEAM); }
function getDirectManagerMap()     { return getConfigMap('direct_manager_by_email',   DIRECT_MANAGER_BY_EMAIL); }

function isLeadershipRole() {
  return state.role === 'leadership' || state.role === 'admin';
}

// Shared rule: leadership/admin OR anyone in Account Management.
// Used by Scope & Coverage editing and analytics uploads.
function isLeadershipOrAM() {
  if (isLeadershipRole()) return true;
  const dept = (state.employeeProfile?.department?.name || '').toLowerCase();
  return dept === 'am' || dept === 'account management' || dept.startsWith('account mgmt');
}

// ── Finance / per-feature viewers ──
function isFinanceUser() {
  return currentUserDepartmentName().toLowerCase() === 'finance';
}

function isInvoiceViewer() {
  const email = normalizeEmail(state.session?.user?.email || '');
  return getInvoiceViewerEmails().includes(email);
}

function isDealFlowViewer() {
  if (isLeadershipRole()) return true;
  const email = normalizeEmail(state.employeeProfile?.email || state.session?.user?.email || '');
  return getDealFlowExtraEmails().includes(email);
}

function canAccessTeamDashboard() {
  return state.isAuthenticated && (isLeadershipRole() || isFinanceUser());
}

// ── Employees ──
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

// ── Tasks ──
function canManageTask(task) {
  if (!task) return false;
  if (isLeadershipRole()) return true;
  return Boolean(state.currentEmployeeId && task.employee_id === state.currentEmployeeId);
}

function canManageTaskView(taskEmployeeId) {
  if (isLeadershipRole()) return true;
  return Boolean(state.currentEmployeeId && taskEmployeeId && state.currentEmployeeId === taskEmployeeId);
}

// ── Scope & Coverage / Analytics ──
function canEditScopeCoverage() {
  return isLeadershipOrAM();
}

function canUploadAnalytics() {
  // Analytics uploads: same audience as Scope & Coverage (leadership/admin + AM)
  return isLeadershipOrAM();
}

// ── Clients ──
function canAddClients() {
  // Manual client creation is restricted to the superadmin. Everyone else must
  // bring clients in via the deal flow (closed deals auto-create clients).
  return isSuperadminUser();
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
