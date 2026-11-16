import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PROBLEM_STATUS_META,
  badgeOf,
  currentLabel,
  durationLabel,
  notificationTone,
  recurrenceLabel,
  relativeTime,
} from './notification-view.ts';
import { createInitialDemoState, runDemoOperation } from '../../entities/roadmap/api/roadmapDemoStore.ts';

test('badge counts only active unread items, up to 9', () => {
  assert.equal(badgeOf(undefined), null);
  assert.equal(badgeOf({ unread: 0, activeUnread: 0 }), null);
  assert.deepEqual(badgeOf({ unread: 3, activeUnread: 3 }), { kind: 'count', label: '3' });
  assert.deepEqual(badgeOf({ unread: 9, activeUnread: 9 }), { kind: 'count', label: '9' });
  assert.deepEqual(badgeOf({ unread: 12, activeUnread: 12 }), { kind: 'count', label: '9+' });
});

test('badge falls back to a dot when only resolved items are unread', () => {
  assert.deepEqual(badgeOf({ unread: 2, activeUnread: 0 }), { kind: 'dot' });
});

test('tone follows active state and resolution', () => {
  assert.equal(notificationTone({ active: true, resolution: null }), 'active');
  assert.equal(notificationTone({ active: false, resolution: 'fixed' }), 'fixed');
  assert.equal(notificationTone({ active: false, resolution: 'obsolete' }), 'obsolete');
  assert.deepEqual(
    Object.values(PROBLEM_STATUS_META).map((meta) => meta.label),
    ['Активна', 'Исправлено', 'Больше не актуально'],
  );
});

test('the live count shows only once it differs from the opening count', () => {
  assert.equal(currentLabel({ active: true, current: { count: 1 }, openedCount: 1 }), null);
  assert.equal(currentLabel({ active: true, current: { count: 3 }, openedCount: 1 }), 'сейчас: 3');
  assert.equal(currentLabel({ active: true, current: { count: 2 }, openedCount: null }), 'сейчас: 2');
  assert.equal(currentLabel({ active: true, current: { httpStatus: 401 }, openedCount: null }), null);
  assert.equal(currentLabel({ active: false, current: null, openedCount: 1 }), null);
});

test('duration and recurrence labels', () => {
  const at = (ms) => new Date(Date.UTC(2026, 10, 16) + ms).toISOString();
  const start = at(0);
  assert.equal(durationLabel(start, at(30_000)), '<1 мин');
  assert.equal(durationLabel(start, at(25 * 60_000)), '25 мин');
  assert.equal(durationLabel(start, at(125 * 60_000)), '2 ч 5 мин');
  assert.equal(durationLabel(start, at(3 * 86_400_000)), '3 дн');
  assert.equal(recurrenceLabel(1), null);
  assert.equal(recurrenceLabel(2), '2-й раз за 7 дней');
  assert.equal(recurrenceLabel(5), '5-й раз за 7 дней');
});

test('relative time reads like the spec: minutes, hours, yesterday, date', () => {
  const now = new Date('2026-11-16T12:00:00Z');
  const ago = (ms) => new Date(now.getTime() - ms).toISOString();
  assert.equal(relativeTime(ago(20_000), now), 'только что');
  assert.equal(relativeTime(ago(12 * 60_000), now), '12 мин назад');
  assert.equal(relativeTime(ago(3 * 3_600_000), now), '3 ч назад');
  assert.equal(relativeTime(ago(30 * 3_600_000), now), 'вчера');
  assert.match(relativeTime(ago(5 * 86_400_000), now), /^\d{2}\.\d{2}\.\d{4}$/);
  assert.equal(relativeTime(ago(-60_000), now), 'только что');
});

test('demo mode has no notifications and writes are no-ops', async () => {
  const state = createInitialDemoState();
  assert.deepEqual(await runDemoOperation(state, { method: 'notifications', args: [] }), { items: [], nextCursor: null });
  assert.deepEqual(await runDemoOperation(state, { method: 'notificationSummary', args: [] }), { unread: 0, activeUnread: 0, canViewSyncProblems: true });
  assert.equal(await runDemoOperation(state, { method: 'markNotificationRead', args: ['x'] }), null);
  assert.equal(await runDemoOperation(state, { method: 'markAllNotificationsRead', args: [] }), null);
});
