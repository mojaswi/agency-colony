// Tests for js/access.js role/permission predicates. Loaded into a vm context
// alongside config.js + utils.js (their globals are dependencies). The access
// functions read a global `state` and two app.js helpers
// (currentUserDepartmentName, employeeReportsToManager) — we inject a mutable
// `state` and stub those two, then drive each predicate by mutating state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = vm.createContext({ Intl, Date, Number, String, Math, Object, RegExp, Boolean, Array });
for (const file of ['js/config.js', 'js/utils.js', 'js/access.js']) {
  vm.runInContext(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), ctx, { filename: file });
}
// App-level deps the access module calls at runtime — stub them.
vm.runInContext(`
  var __dept = '';
  function currentUserDepartmentName() { return __dept; }
  function employeeReportsToManager(emp, mgrEmail) { return emp && emp.manager === mgrEmail; }
  var state = {};
`, ctx);

const call = (expr) => vm.runInContext(expr, ctx);
const setState = (s) => { ctx.state = s; vm.runInContext('null', ctx); };
const setDept = (d) => vm.runInContext(`__dept = ${JSON.stringify(d)}`, ctx);

// ── superadmin (SUPERADMIN_EMAIL = admin@youragency.com from config) ──
test('isSuperadminEmail matches only the superadmin', () => {
  assert.equal(call(`isSuperadminEmail('ADMIN@youragency.com')`), true); // case-insensitive
  assert.equal(call(`isSuperadminEmail('strategy-lead@youragency.com')`), false);
  assert.equal(call(`isSuperadminEmail('')`), false);
});

test('isSuperadminUser reads from profile then session', () => {
  setState({ employeeProfile: { email: 'admin@youragency.com' } });
  assert.equal(call('isSuperadminUser()'), true);
  setState({ session: { user: { email: 'admin@youragency.com' } } });
  assert.equal(call('isSuperadminUser()'), true);
  setState({ employeeProfile: { email: 'strategy-lead@youragency.com' } });
  assert.equal(call('isSuperadminUser()'), false);
  assert.equal(call('canManageAccessRoles()'), false);
});

// ── role / dept ──
test('normalizeAccessLevel clamps unknowns to employee', () => {
  assert.equal(call(`normalizeAccessLevel('admin')`), 'admin');
  assert.equal(call(`normalizeAccessLevel('leadership')`), 'leadership');
  assert.equal(call(`normalizeAccessLevel('superhero')`), 'employee');
  assert.equal(call(`normalizeAccessLevel(undefined)`), 'employee');
});

test('getEnforcedAccessLevel falls back to the hardcoded map when no DB overrides', () => {
  setState({ accessOverrides: null });
  assert.equal(call(`getEnforcedAccessLevel('admin@youragency.com')`), 'admin');
  assert.equal(call(`getEnforcedAccessLevel('creative-lead@youragency.com')`), 'leadership');
  assert.equal(call(`getEnforcedAccessLevel('nobody@youragency.com')`), null);
});

test('getEnforcedAccessMap prefers DB overrides, falls back when empty', () => {
  // empty object → fallback to hardcoded constant
  setState({ accessOverrides: {} });
  assert.equal(call(`getEnforcedAccessLevel('admin@youragency.com')`), 'admin'); // from fallback
  // populated → DB overrides win (and can differ from the constant)
  setState({ accessOverrides: { 'newlead@youragency.com': 'leadership', 'admin@youragency.com': 'admin' } });
  assert.equal(call(`getEnforcedAccessLevel('newlead@youragency.com')`), 'leadership'); // DB-only entry
  assert.equal(call(`getEnforcedAccessLevel('creative-lead@youragency.com')`), null); // not in DB map, fallback NOT used since map non-empty
});

test('isLeadershipRole true for leadership and admin only', () => {
  setState({ role: 'leadership' }); assert.equal(call('isLeadershipRole()'), true);
  setState({ role: 'admin' }); assert.equal(call('isLeadershipRole()'), true);
  setState({ role: 'employee' }); assert.equal(call('isLeadershipRole()'), false);
});

test('isLeadershipOrAM covers leadership OR an AM-department employee', () => {
  setState({ role: 'employee', employeeProfile: { department: { name: 'AM' } } });
  assert.equal(call('isLeadershipOrAM()'), true);
  setState({ role: 'employee', employeeProfile: { department: { name: 'Account Management' } } });
  assert.equal(call('isLeadershipOrAM()'), true);
  setState({ role: 'employee', employeeProfile: { department: { name: 'Art' } } });
  assert.equal(call('isLeadershipOrAM()'), false);
  setState({ role: 'leadership', employeeProfile: { department: { name: 'Art' } } });
  assert.equal(call('isLeadershipOrAM()'), true);
  // canEditScopeCoverage + canUploadAnalytics delegate to it
  assert.equal(call('canEditScopeCoverage()'), call('isLeadershipOrAM()'));
  assert.equal(call('canUploadAnalytics()'), true);
});

// ── operational config accessors (app_config with per-key fallback) ──
test('getConfigList: DB value wins (normalized), else fallback constant', () => {
  setState({ appConfig: null });
  // fallback to INVOICE_VIEWER_EMAILS from config.js
  assert.deepEqual(call(`getInvoiceViewerEmails()`), call('INVOICE_VIEWER_EMAILS'));
  // DB override wins and is lowercased
  setState({ appConfig: { invoice_viewer_emails: ['NEW@youragency.com', 'two@youragency.com'] } });
  assert.deepEqual(call(`getInvoiceViewerEmails()`), ['new@youragency.com', 'two@youragency.com']);
  // empty array in DB → fallback (don't let a wipe silently empty the list)
  setState({ appConfig: { invoice_viewer_emails: [] } });
  assert.deepEqual(call(`getInvoiceViewerEmails()`), call('INVOICE_VIEWER_EMAILS'));
});

test('getConfigMap: DB value wins, else fallback constant', () => {
  setState({ appConfig: null });
  assert.deepEqual(call(`getTeamManagerMap()`), call('TEAM_MANAGER_BY_TEAM'));
  setState({ appConfig: { team_manager_by_team: { AM: 'x@youragency.com' } } });
  assert.deepEqual(call(`getTeamManagerMap()`), { AM: 'x@youragency.com' });
  setState({ appConfig: { team_manager_by_team: {} } }); // empty → fallback
  assert.deepEqual(call(`getTeamManagerMap()`), call('TEAM_MANAGER_BY_TEAM'));
});

// ── viewers ──
test('isInvoiceViewer checks the email allowlist', () => {
  setState({ session: { user: { email: 'finance@youragency.com' } } });
  assert.equal(call('isInvoiceViewer()'), true);
  setState({ session: { user: { email: 'random@youragency.com' } } });
  assert.equal(call('isInvoiceViewer()'), false);
});

test('isDealFlowViewer = leadership OR configured viewer', () => {
  setState({ role: 'employee', employeeProfile: { email: 'bd@youragency.com' } });
  assert.equal(call('isDealFlowViewer()'), true);
  setState({ role: 'employee', employeeProfile: { email: 'random@youragency.com' } });
  assert.equal(call('isDealFlowViewer()'), false);
  setState({ role: 'leadership', employeeProfile: { email: 'random@youragency.com' } });
  assert.equal(call('isDealFlowViewer()'), true);
});

test('isFinanceUser / canAccessTeamDashboard', () => {
  setDept('Finance');
  setState({ isAuthenticated: true, role: 'employee' });
  assert.equal(call('isFinanceUser()'), true);
  assert.equal(call('canAccessTeamDashboard()'), true); // finance gets in
  setDept('Art');
  setState({ isAuthenticated: true, role: 'employee' });
  assert.equal(call('canAccessTeamDashboard()'), false);
  setState({ isAuthenticated: true, role: 'leadership' });
  assert.equal(call('canAccessTeamDashboard()'), true); // leadership gets in
});

// ── tasks ──
test('canManageTask: leadership always, else own task only', () => {
  setState({ role: 'leadership', currentEmployeeId: 'me' });
  assert.equal(call(`canManageTask({ employee_id: 'someone' })`), true);
  setState({ role: 'employee', currentEmployeeId: 'me' });
  assert.equal(call(`canManageTask({ employee_id: 'me' })`), true);
  assert.equal(call(`canManageTask({ employee_id: 'someone' })`), false);
  assert.equal(call('canManageTask(null)'), false);
});

// ── clients ──
test('client permissions key off superadmin/leadership', () => {
  setState({ employeeProfile: { email: 'admin@youragency.com', full_name: 'Alex Founder' }, role: 'admin' });
  assert.equal(call('canAddClients()'), true);   // superadmin
  assert.equal(call('canDeleteClients()'), true); // superadmin
  assert.equal(call('canEditClients()'), true);
  setState({ employeeProfile: { email: 'strategy-lead@youragency.com', full_name: 'Sam Strategy' }, role: 'leadership' });
  assert.equal(call('canAddClients()'), false);   // leadership is not superadmin
  assert.equal(call('canDeleteClients()'), false); // not superadmin
  assert.equal(call('canEditClients()'), true);   // leadership can edit
});

test('canArchiveClient: leadership OR the owning AM', () => {
  setState({ role: 'employee', currentEmployeeId: 'amY', employeeProfile: { email: 'x@youragency.com' } });
  assert.equal(call(`canArchiveClient({ owner_employee_id: 'amY' })`), true);  // owner
  assert.equal(call(`canArchiveClient({ owner_employee_id: 'other' })`), false);
  setState({ role: 'leadership', currentEmployeeId: 'amY', employeeProfile: { email: 'x@youragency.com' } });
  assert.equal(call(`canArchiveClient({ owner_employee_id: 'other' })`), true); // leadership
});
