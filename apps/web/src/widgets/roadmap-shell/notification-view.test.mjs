import assert from 'node:assert/strict';
import test from 'node:test';
import { badgeOf, currentLabel, relativeTime, statusLabel } from './notification-view.ts';
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

test('active items have no status label; closed ones say why', () => {
  const base = { active: true, resolution: null };
  assert.equal(statusLabel(base), null);
  assert.equal(statusLabel({ active: false, resolution: 'fixed' }), 'исправлено');
  assert.equal(statusLabel({ active: false, resolution: 'obsolete' }), 'больше не актуально');
  assert.equal(statusLabel({ active: false, resolution: null }), null);
});

test('active items with a live count show the current figure', () => {
  assert.equal(currentLabel({ active: true, current: { count: 4 } }), 'сейчас: 4');
  assert.equal(currentLabel({ active: true, current: { httpStatus: 401 } }), null);
  assert.equal(currentLabel({ active: true, current: null }), null);
  assert.equal(currentLabel({ active: false, current: null }), null);
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
  assert.deepEqual(await runDemoOperation(state, { method: 'notificationSummary', args: [] }), { unread: 0, activeUnread: 0 });
  assert.equal(await runDemoOperation(state, { method: 'markNotificationRead', args: ['x'] }), null);
  assert.equal(await runDemoOperation(state, { method: 'markAllNotificationsRead', args: [] }), null);
});
