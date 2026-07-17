// Tests for js/tasks.js — the pure decision logic of the task system (the most
// bug-prone area: carry-forward zombies, done-cascade). Loaded into a vm
// context with utils.js (taskTitleKey dependency).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = vm.createContext({ Intl, Date, Number, String, Math, Object, Set, Array, JSON });
for (const file of ['js/utils.js', 'js/tasks.js']) {
  vm.runInContext(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), ctx, { filename: file });
}
const call = (fn, ...args) => vm.runInContext(fn, ctx)(...args);

const T = (over = {}) => ({
  id: over.id || Math.random().toString(36).slice(2),
  employee_id: 'me',
  task_date: '2026-06-09',
  task_title: 'Edit hero banner',
  status: 'in_progress',
  notes: null, description: null, deadline: null, sort_order: 0,
  updated_at: '2026-06-09T10:00:00Z', created_at: '2026-06-09T09:00:00Z',
  ...over
});
const OPTS = { todayIso: '2026-06-10', weekStartIso: '2026-06-08', dayOfWeek: 3, employeeId: 'me' };

// ── planDailyCleanup ──
test('archives only PAST done dailies — today\'s done stays visible', () => {
  const tasks = [
    T({ id: 'a', status: 'done', task_date: '2026-06-09' }),
    T({ id: 'b', status: 'done', task_date: '2026-06-10', task_title: 'Other' }),
    T({ id: 'c', status: 'done', task_date: null, task_title: 'Weekly thing', updated_at: '2026-06-09T10:00:00Z' })
  ];
  const plan = call('planDailyCleanup', tasks, OPTS);
  assert.deepEqual(plan.pastDoneDaily.map(t => t.id), ['a']);
});

test('carries forward unfinished past tasks, preserving fields', () => {
  const tasks = [T({ id: 'a', status: 'in_progress', notes: 'Sony', description: 'desc', deadline: '2026-06-12', sort_order: 3 })];
  const plan = call('planDailyCleanup', tasks, OPTS);
  assert.deepEqual(plan.carryTasks.map(t => t.id), ['a']);
  // JSON round-trip: vm-realm objects fail deepEqual on prototype identity
  assert.deepEqual(JSON.parse(JSON.stringify(plan.copies)), [{
    employee_id: 'me', task_date: '2026-06-10', task_title: 'Edit hero banner',
    notes: 'Sony', description: 'desc', deadline: '2026-06-12', status: 'in_progress', sort_order: 3, recurring_task_id: null
  }]);
});

test('carry-forward skips: weekly tasks, done/archived, and titles already on today (case-insensitive)', () => {
  const tasks = [
    T({ id: 'w', task_date: null }),                                    // weekly — never carried
    T({ id: 'd', status: 'done' }),                                     // done — archived instead
    T({ id: 'x', status: 'archived' }),                                 // archived
    T({ id: 'dup', task_title: 'EDIT HERO BANNER  ' }),                 // exists today (case/space-insensitive)
    T({ id: 'today-version', task_date: '2026-06-10', task_title: 'edit hero banner', status: 'todo' }),
    T({ id: 'ok', task_title: 'Unique task' })                          // the only legit carry
  ];
  const plan = call('planDailyCleanup', tasks, OPTS);
  assert.deepEqual(plan.carryTasks.map(t => t.id), ['ok']);
});

test('carry-forward dedupes multiple past copies of the same title (zombie prevention)', () => {
  const tasks = [
    T({ id: 'old1', task_date: '2026-06-08' }),
    T({ id: 'old2', task_date: '2026-06-09' })
  ];
  const plan = call('planDailyCleanup', tasks, OPTS);
  assert.equal(plan.carryTasks.length, 1);
  assert.equal(plan.copies.length, 1);
});

test('weekly done: Monday archives all; other days only pre-week completions', () => {
  const tasks = [
    T({ id: 'wk-new', task_date: null, status: 'done', task_title: 'W1', updated_at: '2026-06-09T10:00:00Z' }),
    T({ id: 'wk-old', task_date: null, status: 'done', task_title: 'W2', updated_at: '2026-06-05T10:00:00Z' })
  ];
  const wed = call('planDailyCleanup', tasks, OPTS); // dayOfWeek 3
  assert.deepEqual(wed.weeklyDone.map(t => t.id), ['wk-old']);
  const mon = call('planDailyCleanup', tasks, { ...OPTS, dayOfWeek: 1 });
  assert.deepEqual(mon.weeklyDone.map(t => t.id).sort(), ['wk-new', 'wk-old']);
});

// ── linkedTasksFor ──
test('cascade-done from a daily: weekly original + other daily copies, skipping done/archived/self/other-employee', () => {
  const done = T({ id: 'self', status: 'done' });
  const all = [
    done,
    T({ id: 'weekly', task_date: null }),
    T({ id: 'copy', task_date: '2026-06-08' }),
    T({ id: 'already-done', task_date: '2026-06-07', status: 'done' }),
    T({ id: 'archived', task_date: '2026-06-07', status: 'archived' }),
    T({ id: 'someone-else', employee_id: 'other' }),
    T({ id: 'different-title', task_title: 'Unrelated' })
  ];
  const ids = call('linkedTasksFor', done, all, 'cascade-done').map(t => t.id).sort();
  assert.deepEqual(ids, ['copy', 'weekly']);
});

test('cascade-done from a weekly: daily copies only', () => {
  const weekly = T({ id: 'w', task_date: null, status: 'done' });
  const all = [
    weekly,
    T({ id: 'copy1', task_date: '2026-06-08' }),
    T({ id: 'copy2', task_date: '2026-06-10' }),
    T({ id: 'other-weekly', task_date: null, id: 'other-weekly' })
  ];
  const ids = call('linkedTasksFor', weekly, all, 'cascade-done').map(t => t.id).sort();
  assert.deepEqual(ids, ['copy1', 'copy2']);
});

test('sync-status from a daily targets ONLY the weekly original — and unlike cascade can reopen done tasks', () => {
  const daily = T({ id: 'd' });
  const all = [
    daily,
    T({ id: 'weekly-done', task_date: null, status: 'done' }), // done is fair game for sync
    T({ id: 'other-copy', task_date: '2026-06-08' })           // dailies NOT touched by sync
  ];
  const ids = call('linkedTasksFor', daily, all, 'sync-status').map(t => t.id);
  assert.deepEqual(ids, ['weekly-done']);
});

test('title matching uses taskTitleKey semantics (case + trim)', () => {
  const a = T({ id: 'a', task_title: '  Fix The Deck ' });
  const b = T({ id: 'b', task_title: 'fix the deck', task_date: null });
  assert.deepEqual(call('linkedTasksFor', a, [a, b], 'cascade-done').map(t => t.id), ['b']);
});

test('hasDailyCopyToday: title-key match, today only, ignores archived/self/others', () => {
  const f = call.bind(null, 'hasDailyCopyToday');
  const weekly = T({ id: 'w', task_date: null, task_title: 'Helix Content Calendar' });
  const mk = (over) => T({ task_title: 'helix content calendar', task_date: '2026-06-10', ...over });
  assert.equal(f(weekly, [weekly, mk({ id: 'a' })], '2026-06-10'), true);          // copy today
  assert.equal(f(weekly, [weekly, mk({ id: 'b', task_date: '2026-06-09' })], '2026-06-10'), false); // yesterday
  assert.equal(f(weekly, [weekly, mk({ id: 'c', status: 'archived' })], '2026-06-10'), false);      // archived
  assert.equal(f(weekly, [weekly, mk({ id: 'd', employee_id: 'other' })], '2026-06-10'), false);    // someone else
  assert.equal(f(weekly, [weekly], '2026-06-10'), false);                           // no copies
});

test('recurringRuleDueOn: exact day + short-month clamp', () => {
  const f = call.bind(null, 'recurringRuleDueOn');
  assert.equal(f(28, '2026-06-28'), true);
  assert.equal(f(28, '2026-06-27'), false);
  assert.equal(f(31, '2026-06-30'), true);   // June has 30 days → clamp
  assert.equal(f(31, '2026-02-28'), true);   // Feb 2026 → clamp to 28
  assert.equal(f(31, '2026-07-31'), true);
  assert.equal(f(31, '2026-07-30'), false);
});
