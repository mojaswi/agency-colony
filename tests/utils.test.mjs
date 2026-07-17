// First tests in the project. js/utils.js and js/config.js are classic
// browser scripts (no exports), so we load them into a Node vm context and
// test the globals they define. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = vm.createContext({ Intl, Date, Number, String, Math, Object });
for (const file of ['js/config.js', 'js/utils.js']) {
  vm.runInContext(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), ctx, { filename: file });
}
const u = (name) => vm.runInContext(name, ctx);

// ── taskTitleKey — must mirror the DB's lower(task_title) unique index ──
test('taskTitleKey lowercases and trims', () => {
  assert.equal(u('taskTitleKey')('  Fix The Deck  '), 'fix the deck');
  assert.equal(u('taskTitleKey')('ALL CAPS'), 'all caps');
});

test('taskTitleKey handles null/undefined/empty', () => {
  assert.equal(u('taskTitleKey')(null), '');
  assert.equal(u('taskTitleKey')(undefined), '');
  assert.equal(u('taskTitleKey')(''), '');
});

// ── date round-trips ──
test('toISODateLocal/parseIsoDateLocal round-trip', () => {
  const iso = '2026-06-10';
  const d = u('parseIsoDateLocal')(iso);
  assert.equal(u('toISODateLocal')(d), iso);
});

test('parseIsoDateLocal rejects junk', () => {
  assert.equal(u('parseIsoDateLocal')('not a date'), null);
  assert.equal(u('parseIsoDateLocal')(''), null);
  assert.equal(u('parseIsoDateLocal')('2026-6-1'), null); // unpadded not accepted
});

test('formatTimestamp/parseTimestamp round-trip', () => {
  const d = new Date(2026, 5, 10, 14, 30, 0, 0); // 10 Jun 2026 2:30 PM
  const text = u('formatTimestamp')(d);
  assert.equal(text, '10 Jun 2026, 02:30 PM');
  assert.equal(u('parseTimestamp')(text).getTime(), d.getTime());
});

test('parseTimestamp midnight/noon meridiem edges', () => {
  assert.equal(u('parseTimestamp')('01 Jan 2026, 12:00 AM').getHours(), 0);
  assert.equal(u('parseTimestamp')('01 Jan 2026, 12:00 PM').getHours(), 12);
});

// ── ISO weeks ──
test('isoWeekMetaFromDate handles year boundaries', () => {
  // (field-wise asserts: vm-realm objects fail strict deepEqual on prototype)
  // 2026-01-01 is a Thursday → ISO week 1 of 2026
  const a = u('isoWeekMetaFromDate')(new Date(2026, 0, 1));
  assert.equal(a.year, 2026);
  assert.equal(a.week, 1);
  // 2027-01-01 is a Friday → ISO week 53 of 2026
  const b = u('isoWeekMetaFromDate')(new Date(2027, 0, 1));
  assert.equal(b.year, 2026);
  assert.equal(b.week, 53);
});

test('weekIdentifierFromIsoDate formats year-week', () => {
  assert.equal(u('weekIdentifierFromIsoDate')('2026-06-10'), '2026-W24');
  assert.equal(u('weekIdentifierFromIsoDate')('garbage'), '');
});

// ── percent formatting ──
test('formatPercent clamps to 0..100', () => {
  assert.equal(u('formatPercent')(150), '100%');
  assert.equal(u('formatPercent')(-5), '0%');
  assert.equal(u('formatPercent')(33.333), '33.33%');
  assert.equal(u('formatPercent')('nonsense'), '0%');
});

test('formatPercentRaw does not clamp', () => {
  assert.equal(u('formatPercentRaw')(150), '150%');
});

// ── escapeHtml — the XSS line of defense ──
test('escapeHtml escapes all five dangerous chars', () => {
  assert.equal(
    u('escapeHtml')(`<img src=x onerror="alert('&')">`),
    '&lt;img src=x onerror=&quot;alert(&#39;&amp;&#39;)&quot;&gt;'
  );
  assert.equal(u('escapeHtml')(null), '');
});

// ── normalizeEmail ──
test('normalizeEmail trims and lowercases', () => {
  assert.equal(u('normalizeEmail')('  Admin@YourAgency.COM '), 'admin@youragency.com');
});

// ── config sanity ──
test('PUBLIC_HOLIDAYS entries are well-formed and sorted', () => {
  const holidays = u('PUBLIC_HOLIDAYS');
  assert.ok(Array.isArray(holidays) && holidays.length > 0);
  for (const h of holidays) {
    assert.match(h.date, /^\d{4}-\d{2}-\d{2}$/, `bad date: ${h.date}`);
    assert.ok(h.name && typeof h.name === 'string');
  }
  const dates = Array.from(holidays, h => h.date);
  assert.deepEqual(dates, [...dates].sort(), 'holidays must stay sorted by date');
});

test('every enforced-access email is on the configured domain', () => {
  const map = u('ENFORCED_ACCESS_BY_EMAIL');
  for (const [email, role] of Object.entries(map)) {
    assert.ok(email.endsWith(u('ANT_DOMAIN')), email);
    assert.ok(['admin', 'leadership', 'employee'].includes(role), role);
  }
});

// ── cronHealthStatus — scheduled-job health thresholds ──
test('cronHealthStatus: ok / late / dead boundaries per cadence', () => {
  const now = new Date('2026-06-10T12:00:00Z');
  const hoursAgo = (h) => new Date(now - h * 3600000).toISOString();
  const f = u('cronHealthStatus');
  // daily: 26h window
  assert.equal(f(hoursAgo(2), 'daily', now), 'ok');
  assert.equal(f(hoursAgo(25), 'daily', now), 'ok');
  assert.equal(f(hoursAgo(27), 'daily', now), 'late');
  assert.equal(f(hoursAgo(53), 'daily', now), 'dead');
  // weekly: 8d window
  assert.equal(f(hoursAgo(7 * 24), 'weekly', now), 'ok');
  assert.equal(f(hoursAgo(9 * 24), 'weekly', now), 'late');
  assert.equal(f(hoursAgo(17 * 24), 'weekly', now), 'dead');
  // monthly: 32d window
  assert.equal(f(hoursAgo(30 * 24), 'monthly', now), 'ok');
  assert.equal(f(hoursAgo(33 * 24), 'monthly', now), 'late');
  // no heartbeat at all
  assert.equal(f(null, 'daily', now), 'unknown');
  assert.equal(f('garbage', 'daily', now), 'unknown');
});

test('isFreshStamp: TTL boundaries and missing stamps', () => {
  const f = u('isFreshStamp');
  assert.equal(f(1000, 1500, 600), true);    // 500ms old, 600ms TTL
  assert.equal(f(1000, 1601, 600), false);   // 601ms old
  assert.equal(f(0, 1000, 600), false);      // no stamp
  assert.equal(f(undefined, 1000, 600), false);
});

test('taskLinkParts + taskTitleHtml: URL in description makes the TITLE clickable', () => {
  const p = u('taskLinkParts');
  assert.equal(p('plain text').url, null);
  const r = p('brief doc https://docs.google.com/d/abc here');
  assert.equal(r.url, 'https://docs.google.com/d/abc');
  assert.equal(r.displayDesc, 'brief doc here');
  const h = u('taskTitleHtml');
  assert.equal(h({ task_title: 'Edit deck', description: 'no link' }), 'Edit deck');
  const linked = h({ task_title: 'Edit <b>deck</b>', description: 'https://x.co/1' });
  assert.match(linked, /^<a href="https:\/\/x\.co\/1" target="_blank" rel="noopener"/);
  assert.match(linked, /Edit &lt;b&gt;deck&lt;\/b&gt; ↗/);  // title still escaped
});

test('OLD linkify removed', () => {
  assert.equal(vm.runInContext('typeof linkifyText', ctx), 'undefined');
});
