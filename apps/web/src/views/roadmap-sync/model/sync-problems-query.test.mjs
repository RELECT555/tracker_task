import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSyncQuery, serializeSyncQuery } from './sync-problems-query.ts';
import { createInitialDemoState, runDemoOperation } from '../../../entities/roadmap/api/roadmapDemoStore.ts';

test('defaults to active problems of all projects', () => {
  assert.deepEqual(parseSyncQuery(new URLSearchParams('')), { status: 'active', projectId: null });
  assert.deepEqual(parseSyncQuery(new URLSearchParams('status=bogus')), { status: 'active', projectId: null });
});

test('round-trips filters and omits defaults', () => {
  const filter = { status: 'resolved', projectId: 'p-1' };
  assert.equal(serializeSyncQuery(filter), '?status=resolved&project=p-1');
  assert.deepEqual(parseSyncQuery(new URLSearchParams(serializeSyncQuery(filter).slice(1))), filter);
  assert.equal(serializeSyncQuery({ status: 'active', projectId: null }), '');
});

test('demo mode shows an empty page to the admin', async () => {
  const state = createInitialDemoState();
  assert.deepEqual(await runDemoOperation(state, { method: 'syncProblems', args: [{ status: 'active' }] }), {
    items: [],
    nextCursor: null,
    counts: { active: 0 },
    projects: [],
  });
  assert.deepEqual(await runDemoOperation(state, { method: 'syncProblemHistory', args: ['x'] }), { items: [] });
  const summary = await runDemoOperation(state, { method: 'notificationSummary', args: [] });
  assert.equal(summary.canViewSyncProblems, true);
});
