import assert from 'node:assert/strict';
import test from 'node:test';
import { getRoadmapIterationVisibility, getRoadmapSummary, roadmapIterationContains } from '@tracker/shared';

const Q4 = 'P\\2026\\Q4';
const item = (id, type, iterationPath, parentExternalId = null, options = {}) => ({
  id, externalId: id, type, parentExternalId, iterationPath, title: id, state: null, url: null,
  actualHours: null, azureCustomFields: {}, allocations: [], ...options,
});
const visibility = (items, active = [], path = Q4) => getRoadmapIterationVisibility(items, path, new Set(active));

test('a quarter path contains itself and its sub-iterations only', () => {
  for (const path of ['P\\2026\\Q4', 'P\\2026\\Q4\\Sprint 1', '\\p\\2026\\q4']) assert.equal(roadmapIterationContains(Q4, path), true, path);
  for (const path of ['P\\2026\\Q40', 'P\\2026\\Q4x', 'P\\2026\\Q3', 'P', null, '']) assert.equal(roadmapIterationContains(Q4, path), false, String(path));
});

test('no quarter path means no filtering', () => {
  const items = [item('e', 'Epic', 'P\\2026\\Q3'), item('f', 'Feature', 'P\\2026\\Q3', 'e')];
  const result = visibility(items, [], null);
  assert.equal(result.filtered, false);
  assert.deepEqual([...result.visibleIds].sort(), ['e', 'f']);
  assert.equal(result.outsideIds.size, 0);
});

test('a project without stored iterations is not filtered', () => {
  const result = visibility([item('e', 'Epic', null), item('f', 'Feature', null, 'e')]);
  assert.equal(result.filtered, false);
  assert.deepEqual([...result.visibleIds].sort(), ['e', 'f']);
});

test('a feature in a sub-iteration of the quarter is visible without a badge', () => {
  const result = visibility([item('f', 'Feature', 'P\\2026\\Q4\\Sprint 1')]);
  assert.equal(result.filtered, true);
  assert.equal(result.visibleIds.has('f'), true);
  assert.equal(result.outsideIds.has('f'), false);
});

test('a feature outside the iteration is visible only with period activity, marked outside', () => {
  const items = [item('active', 'Feature', 'P\\2026\\Q3'), item('idle', 'Feature', 'P\\2026\\Q3')];
  const result = visibility(items, ['active']);
  assert.equal(result.visibleIds.has('active'), true);
  assert.equal(result.outsideIds.has('active'), true);
  assert.equal(result.visibleIds.has('idle'), false);
});

test('a feature at the project root counts as outside the iteration', () => {
  const result = visibility([item('f', 'Feature', 'P'), item('g', 'Feature', Q4)], ['f']);
  assert.equal(result.visibleIds.has('f'), true);
  assert.equal(result.outsideIds.has('f'), true);
});

test('an epic shown only through a visible feature carries no badge', () => {
  const result = visibility([item('e', 'Epic', 'P\\2026\\Q3'), item('f', 'Feature', Q4, 'e')]);
  assert.equal(result.visibleIds.has('e'), true);
  assert.equal(result.outsideIds.has('e'), false);
});

test('an active epic outside the iteration is visible and marked', () => {
  const result = visibility([item('e', 'Epic', 'P\\2026\\Q3'), item('g', 'Feature', Q4)], ['e']);
  assert.equal(result.visibleIds.has('e'), true);
  assert.equal(result.outsideIds.has('e'), true);
});

test('an idle epic outside the iteration with only hidden features is hidden', () => {
  const result = visibility([item('e', 'Epic', 'P\\2026\\Q3'), item('f', 'Feature', 'P\\2026\\Q3', 'e'), item('g', 'Feature', Q4)]);
  assert.equal(result.visibleIds.has('e'), false);
  assert.equal(result.visibleIds.has('f'), false);
});

test('tasks never take part', () => {
  const result = visibility([item('t', 'Task', Q4), item('f', 'Feature', Q4)], ['t']);
  assert.equal(result.visibleIds.has('t'), false);
});

test('the summary reports which cards carry plan or fact in the period', () => {
  const allocation = { id: 'a', roleId: 'r', personExternalId: 'p', personName: 'p', personEmail: null, estimatedHours: 8, quarterKey: '2026-Q4', periods: [] };
  const plan = {
    workItems: [item('e', 'Epic', Q4), item('f', 'Feature', Q4, 'e', { allocations: [allocation] }), item('idle', 'Feature', Q4), item('t', 'Task', Q4, 'f')],
    roles: [{ id: 'r', name: 'r', color: '#000000', members: [] }],
  };
  const summary = getRoadmapSummary(plan, { quarterKey: '2026-Q4' });
  assert.deepEqual([...summary.activeItemIds].sort(), ['e', 'f']);
});

test('an epic active only through an outside feature is marked through the feature, not itself', () => {
  const result = visibility([item('e', 'Epic', 'P\\2026\\Q3'), item('f', 'Feature', 'P\\2026\\Q3', 'e'), item('g', 'Feature', Q4)], ['e', 'f']);
  assert.equal(result.visibleIds.has('e'), true);
  assert.equal(result.outsideIds.has('e'), false);
  assert.equal(result.outsideIds.has('f'), true);
});
