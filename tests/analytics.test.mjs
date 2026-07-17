// Tests for js/analytics.js pure helpers (the parsers need XLSX + File APIs —
// they're exercised in-browser; see slice-6 verification).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = vm.createContext({ Intl, Date, Number, String, Math, Object, Array, JSON, Map, Set, Promise, isNaN, parseFloat, isFinite });
for (const file of ['js/utils.js', 'js/analytics.js']) {
  vm.runInContext(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), ctx, { filename: file });
}
const u = (n) => vm.runInContext(n, ctx);

test('fmtAnalytics / pctAnalytics format compactly', () => {
  assert.equal(u('fmtAnalytics')(1500000), '1.5M');
  assert.equal(u('fmtAnalytics')(2300), '2.3K');
  assert.equal(u('fmtAnalytics')(42), '42');
  assert.equal(u('pctAnalytics')(0.034), '3.4%'); // input is a fraction
});

test('normalizeDateStr handles slash dates', () => {
  assert.equal(u('normalizeDateStr')('6/9/2026'), '2026-06-09');
  assert.equal(u('normalizeDateStr')('2026-06-09'), '2026-06-09');
});

test('mergeByKey: idempotent re-upload semantics (incoming wins, no dupes)', () => {
  const f = u('mergeByKey');
  const merged = f([{ k: 'a', v: 1 }, { k: 'b', v: 2 }], [{ k: 'b', v: 99 }, { k: 'c', v: 3 }], vm.runInContext('(r) => r.k', ctx));
  assert.equal(merged.length, 3);
  assert.equal(merged.find(r => r.k === 'b').v, 99);
});

test('aggregateWeeklyToMonthly groups weeks into months', () => {
  const monthly = u('aggregateWeeklyToMonthly')([
    { week: '2026-05-04', 'Impressions (total)': 10, 'Clicks (total)': 1, 'Reactions (total)': 0, 'Comments (total)': 0, 'Reposts (total)': 0, 'New followers (total)': 2, 'Engagement rate (total)': 1, 'Posts': 1 },
    { week: '2026-05-11', 'Impressions (total)': 20, 'Clicks (total)': 2, 'Reactions (total)': 0, 'Comments (total)': 0, 'Reposts (total)': 0, 'New followers (total)': 3, 'Engagement rate (total)': 2, 'Posts': 1 },
    { week: '2026-06-01', 'Impressions (total)': 5, 'Clicks (total)': 1, 'Reactions (total)': 0, 'Comments (total)': 0, 'Reposts (total)': 0, 'New followers (total)': 1, 'Engagement rate (total)': 3, 'Posts': 1 }
  ]);
  assert.equal(monthly.length, 2);
  const may = monthly.find(m => String(m.month || m.week || '').startsWith('2026-05'));
  assert.ok(may, JSON.stringify(monthly[0]));
  assert.equal(may['Impressions (total)'], 30);
});

test('trendArrow: up/down/flat/empty-on-zero', () => {
  const f = u('trendArrow');
  assert.match(f(10, 5), /trend-up/);
  assert.match(f(5, 10), /trend-down/);
  assert.equal(f(5, 5), '');
  assert.equal(f(0, 0), '');
});

test('weekLabelAnalytics normalizes slash dates and labels day-month', () => {
  const f = u('weekLabelAnalytics');
  assert.equal(f('2026-06-08'), f('6/8/2026'));
  assert.match(f('2026-06-08'), /08|8/);
  assert.equal(f('garbage'), 'garbage');
});

test('computeOverviewKpis: week-on-week + 7-day windows + sparse-data guards', () => {
  const f = u('computeOverviewKpis');
  const day = (total) => ({ total, overview_unique: total });
  const full = f(
    { metrics_data: [
        { week: '2026-06-01', 'Impressions (organic)': 100, 'Engagement rate (total)': 0.05 },
        { week: '2026-06-08', 'Impressions (organic)': 250, 'Engagement rate (total)': 0.04 }
      ] },
    { metrics_data: Array.from({ length: 14 }, (_, i) => day(i < 7 ? 1 : 3)) },   // prev 7×1, recent 7×3
    { visitor_metrics: Array.from({ length: 14 }, (_, i) => day(i < 7 ? 5 : 2)) } // prev 35, recent 14
  );
  assert.equal(full.kpis[0].value, '250');           // latest week impressions
  assert.match(full.kpis[0].arrow, /trend-up/);      // 250 > 100
  assert.match(full.kpis[1].arrow, /trend-down/);    // 0.04 < 0.05
  assert.equal(full.kpis[2].value, '+21');           // recent followers 7×3
  assert.match(full.kpis[2].arrow, /trend-up/);      // 21 > 7
  assert.match(full.kpis[3].arrow, /trend-down/);    // 14 < 35
  assert.equal(full.hasPrevWeek, true);
  assert.match(full.kpiPeriod, /^Week of /);

  const sparse = f({ metrics_data: [] }, { metrics_data: [day(1), day(2)] }, { visitor_metrics: [] });
  assert.equal(sparse.kpis[0].value, '0');
  assert.equal(sparse.kpis[2].value, '–');           // <7 days of follower data
  assert.equal(sparse.kpis[2].arrow, '');            // <14 days → no trend
  assert.equal(sparse.hasPrevWeek, false);
  assert.equal(sparse.kpiPeriod, 'Last week');
});

test('excelSerialToIso: serials, serial-strings, ISO strings, junk', () => {
  const f = u('excelSerialToIso');
  assert.equal(f(45947), '2025-10-17');            // real send date from the GA workbook
  assert.equal(f('46164'), '2026-05-22');          // serial as string
  assert.equal(f('2026-06-03T01:38:33-04:00'), '2026-06-03'); // LeadConnector ISO
  assert.equal(f(''), '');
  assert.equal(f('Total clicks: 1219'), '');       // footnote rows must not parse
});

test('parseCommunityPulseRows: sends parsed, footnotes dropped, summary computed', () => {
  const f = u('parseCommunityPulseRows');
  const parsed = f(JSON.parse(JSON.stringify({
    sends: [
      { 'Date': 45947, 'Email Name': 'GA Newsletter', 'Type': 'Newsletter', 'Delivered (#)': 1000, 'Delivered (%)': 0.97, 'Opened (#)': 480, 'Open Rate (%)': 0.48, 'Clicked (#)': 30, 'Click Rate (%)': 0.03, 'Unsubscribed (#)': 5, 'Hard Bounce (#)': 10, 'Skipped (#)': 20 },
      { 'Date': 46147, 'Email Name': 'Dispatches', 'Type': 'Dispatches', 'Delivered (#)': 1000, 'Delivered (%)': 0.96, 'Opened (#)': 540, 'Open Rate (%)': 0.54, 'Clicked (#)': 200, 'Click Rate (%)': 0.20, 'Unsubscribed (#)': 1, 'Hard Bounce (#)': 8, 'Skipped (#)': 30 },
      { 'Date': 'Total clicks: 99 | Unique clicks: 50' } // hand-typed footnote row
    ],
    subscribers: [
      { 'Created': '2026-05-01T10:00:00-04:00', 'Region': 'Africa', 'Country': 'Kenya' },
      { 'Created': '2026-06-02T10:00:00-04:00', 'Region': 'Asia', 'Country': 'India' }
    ],
    forum: [
      { 'Created On': 46128, 'Region': 'Europe', 'Country': 'Iceland', 'Gender': '', 'Domain of Work': 'Art & Culture,Activism', 'Source': 'Artivism_Forum_Sign_Up' },
      { 'Created On': 45773, 'Region': 'Africa', 'Country': 'N/A​', 'Gender': 'Female', 'Domain of Work': 'Artist', 'Source': '' }
    ]
  })));
  assert.equal(parsed.metrics_data.length, 2);            // footnote dropped
  assert.equal(parsed.metrics_data[0].date, '2025-10-17');
  assert.equal(parsed.summary.total_sends, 2);
  assert.equal(parsed.summary.subscribers, 2);
  assert.equal(parsed.summary.forum_members, 2);
  // weighted rates: (480+540)/2000, (30+200)/2000
  assert.equal(parsed.summary.open_rate, 0.51);
  assert.equal(parsed.summary.click_rate, 0.115);
  assert.equal(parsed.summary.by_type.Dispatches.click_rate, 0.2);
  // demographics: domain splitting + N/A cleaning
  const domains = parsed.demographics_data.forum.by_domain.map(d => d.name);
  assert.ok(domains.includes('Activism') && domains.includes('Artist'));
  const countries = parsed.demographics_data.forum.by_country.map(c => c.name);
  assert.ok(!countries.some(c => /n\/?a/i.test(c)));      // N/A + zero-width space stripped
  assert.equal(parsed.demographics_data.subscribers.growth_by_month.length, 2);
});

test('parseInstagramMetricsRows: real Meta Insights CSV shape (title, Date/Primary, serial dates)', () => {
  const f = u('parseInstagramMetricsRows');
  const parsed = f(JSON.parse(JSON.stringify([
    ['Instagram follows', ''],
    ['Date', 'Primary'],
    [46143, 3],
    [46144, 4],
    [46148, 248],
    ['', '']            // trailing empty row from the export
  ])));
  assert.equal(parsed.metric, 'follows');
  assert.equal(parsed.metricLabel, 'follows');
  assert.equal(parsed.daily.length, 3);
  assert.equal(parsed.daily[0].date, '2026-05-01');   // serial 46143
  assert.equal(parsed.daily[2].value, 248);
  // multi-word metric names normalize to safe keys
  const visits = f(JSON.parse(JSON.stringify([['Instagram profile visits', ''], ['Date', 'Primary'], [46143, 10]])));
  assert.equal(visits.metric, 'profile_visits');
  // real-export title variants WITHOUT the "Instagram" prefix (Reach.csv,
  // Views.csv, Interactions.csv all ship bare titles)
  assert.equal(f(JSON.parse(JSON.stringify([['Reach', ''], ['Date', 'Primary'], [46143, 113]]))).metric, 'reach');
  assert.equal(f(JSON.parse(JSON.stringify([['Views', ''], ['Date', 'Primary'], [46143, 444]]))).metric, 'views');
  assert.equal(f(JSON.parse(JSON.stringify([['Content interactions', ''], ['Date', 'Primary'], [46143, 25]]))).metric, 'content_interactions');
  assert.equal(f(JSON.parse(JSON.stringify([['Instagram link clicks', ''], ['Date', 'Primary'], [46143, 0]]))).metric, 'link_clicks');
  // structure is the gate: no Date/Primary header, or no/absurd title → null
  assert.equal(f(JSON.parse(JSON.stringify([['Reach', ''], ['Day', 'Value'], [46143, 1]]))), null);
  assert.equal(f(JSON.parse(JSON.stringify([['', ''], ['Date', 'Primary'], [46143, 1]]))), null);
  assert.equal(f(JSON.parse(JSON.stringify([['x'.repeat(80), ''], ['Date', 'Primary'], [46143, 1]]))), null);
});

test('computeDataThrough: coverage end per report type, both date formats', () => {
  const f = u('computeDataThrough');
  // content: weekly rows cover through week END (+6 days)
  assert.equal(f('content', { metricsData: [{ week: '2026-06-28' }, { week: '2026-07-05' }] }), '2026-07-11');
  // followers/visitors: last daily date, incl. legacy MM/DD/YYYY rows
  assert.equal(f('followers', { metricsData: [{ date: '03/01/2026' }, { date: '02/15/2026' }] }), '2026-03-01');
  assert.equal(f('visitors', { visitorMetrics: [{ date: '2026-07-06' }] }), '2026-07-06');
  // instagram: max of post dates and daily-metric dates
  assert.equal(f('instagram', {
    postsData: [{ publish_time: '2026-06-25T10:00:00' }, { date: '2026-06-29' }],
    metricsData: [{ date: '2026-06-30' }]
  }), '2026-06-30');
  // community: last send
  assert.equal(f('community_pulse', { summary: { date_to: '2026-05-28' } }), '2026-05-28');
  // empties → null
  assert.equal(f('content', { metricsData: [] }), null);
  assert.equal(f('instagram', {}), null);
});
