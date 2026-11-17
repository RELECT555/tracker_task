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

test('a card just created from the plan stays visible without a badge, and shows its epic', () => {
  const items = [item('e', 'Epic', 'P\\2026\\Q3'), item('new', 'Feature', 'P', 'e'), item('g', 'Feature', Q4)];
  const result = getRoadmapIterationVisibility(items, Q4, new Set(), new Set(['new']));
  assert.equal(result.visibleIds.has('new'), true);
  assert.equal(result.outsideIds.has('new'), false);
  assert.equal(result.visibleIds.has('e'), true);
});

test('show-all keeps every card and marks each one outside the iteration', () => {
  const items = [item('e', 'Epic', 'P\\2026\\Q3'), item('f', 'Feature', 'P\\2026\\Q3', 'e'), item('g', 'Feature', Q4), item('t', 'Task', 'P')];
  const result = getRoadmapIterationVisibility(items, Q4, new Set(), new Set(), true);
  assert.equal(result.filtered, true);
  assert.deepEqual([...result.visibleIds].sort(), ['e', 'f', 'g']);
  assert.deepEqual([...result.outsideIds].sort(), ['e', 'f']);
});

test('show-all without a quarter iteration marks nothing', () => {
  const result = getRoadmapIterationVisibility([item('f', 'Feature', 'P\\2026\\Q3')], null, new Set(), new Set(), true);
  assert.equal(result.filtered, false);
  assert.equal(result.outsideIds.size, 0);
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

// A team planning in monthly sprints has no iteration named after the quarter: the quarter is its sprints.
const Q4_SPRINTS = ['P\\Sprint 26_10', 'P\\Sprint 26_11', 'P\\Sprint 26_12'];
const Q1_SPRINTS = ['P\\Sprint 27_01'];

test('a quarter made of several sprints shows the cards of each of them', () => {
  const items = [
    item('oct', 'Feature', 'P\\Sprint 26_10'),
    item('dec', 'Feature', 'P\\Sprint 26_12\\Week 2'),
    item('jan', 'Feature', 'P\\Sprint 27_01'),
    item('backlog', 'Feature', 'P'),
  ];
  const result = getRoadmapIterationVisibility(items, Q4_SPRINTS, new Set());
  assert.equal(result.filtered, true);
  assert.deepEqual([...result.visibleIds].sort(), ['dec', 'oct']);
  assert.equal(result.outsideIds.size, 0);
});

test('an empty list of sprints means no filtering, like no quarter path', () => {
  const result = getRoadmapIterationVisibility([item('f', 'Feature', 'P\\Sprint 26_10')], [], new Set());
  assert.equal(result.filtered, false);
  assert.equal(result.visibleIds.has('f'), true);
});

const ESTIMATE = 'Custom.DeveloperEstimate';
const withEstimate = (hours) => ({ azureCustomFields: { [ESTIMATE]: hours } });
const sprintPlan = (extra = []) => ({
  roles: [{ id: 'dev', name: 'Developer', color: '#000000', azureEstimateField: ESTIMATE, members: [] }],
  workItems: [
    item('oct', 'Feature', 'P\\Sprint 26_10', null, withEstimate(40)),
    item('jan', 'Feature', 'P\\Sprint 27_01', null, withEstimate(100)),
    item('backlog', 'Feature', 'P', null, withEstimate(10)),
    ...extra,
  ],
});

test('without the quarter sprints every card carries its Azure estimate into every quarter', () => {
  const summary = getRoadmapSummary(sprintPlan(), { quarterKey: '2026-Q4' });
  assert.equal(summary.planHours, 150);
  assert.deepEqual([...summary.activeItemIds].sort(), ['backlog', 'jan', 'oct']);
});

test('with the quarter sprints only the cards in them carry their Azure estimate', () => {
  const q4 = getRoadmapSummary(sprintPlan(), { quarterKey: '2026-Q4', quarterIterations: Q4_SPRINTS });
  assert.equal(q4.planHours, 40);
  assert.deepEqual([...q4.activeItemIds], ['oct']);
  const q1 = getRoadmapSummary(sprintPlan(), { quarterKey: '2027-Q1', quarterIterations: Q1_SPRINTS });
  assert.equal(q1.planHours, 100);
  assert.deepEqual([...q1.activeItemIds], ['jan']);
});

test('a local assignment still counts for a card outside the quarter sprints', () => {
  const allocation = { id: 'a', roleId: 'dev', personExternalId: 'p', personName: 'p', personEmail: null, estimatedHours: 8, quarterKey: '2026-Q4', periods: [] };
  const plan = sprintPlan([item('planned', 'Feature', 'P', null, { allocations: [allocation] })]);
  const summary = getRoadmapSummary(plan, { quarterKey: '2026-Q4', quarterIterations: Q4_SPRINTS });
  assert.equal(summary.planHours, 48);
  assert.deepEqual([...summary.activeItemIds].sort(), ['oct', 'planned']);
});

test('the quarter sprints do not scope anything when no card has an iteration stored', () => {
  const plan = sprintPlan();
  for (const card of plan.workItems) card.iterationPath = null;
  const summary = getRoadmapSummary(plan, { quarterKey: '2026-Q4', quarterIterations: Q4_SPRINTS });
  assert.equal(summary.planHours, 150);
});

test('a month ignores the quarter sprints: Azure estimates never count in a month', () => {
  const summary = getRoadmapSummary(sprintPlan(), {
    quarterKey: '2026-Q4', monthKey: '2026-10', quarterIterations: Q4_SPRINTS,
    monthlyFact: { workItems: {}, allocations: {}, totalHours: 0 },
  });
  assert.equal(summary.planHours, 0);
});

// A quarter with no sprint of its own, in a project that plans by sprint (Q1 2027 of a team whose sprints end in 2026).
const NO_SPRINTS = { paths: [], scoped: true };

test('a scoped quarter without sprints is empty: nothing is shown and no estimate counts', () => {
  const plan = sprintPlan();
  const summary = getRoadmapSummary(plan, { quarterKey: '2027-Q1', quarterIterations: NO_SPRINTS });
  assert.equal(summary.planHours, 0);
  assert.equal(summary.activeItemIds.size, 0);
  const result = getRoadmapIterationVisibility(plan.workItems, NO_SPRINTS, summary.activeItemIds);
  assert.equal(result.filtered, true);
  assert.equal(result.visibleIds.size, 0);
});

test('a scoped quarter without sprints still shows cards through their own plan, and every card with show-all', () => {
  const allocation = { id: 'a', roleId: 'dev', personExternalId: 'p', personName: 'p', personEmail: null, estimatedHours: 8, quarterKey: '2027-Q1', periods: [] };
  const plan = sprintPlan([item('planned', 'Feature', 'P', null, { allocations: [allocation] })]);
  const summary = getRoadmapSummary(plan, { quarterKey: '2027-Q1', quarterIterations: NO_SPRINTS });
  assert.equal(summary.planHours, 8);
  const result = getRoadmapIterationVisibility(plan.workItems, NO_SPRINTS, summary.activeItemIds);
  assert.deepEqual([...result.visibleIds], ['planned']);
  const all = getRoadmapIterationVisibility(plan.workItems, NO_SPRINTS, summary.activeItemIds, new Set(), true);
  assert.equal(all.visibleIds.size, 4);
});

test('an unscoped empty list still means no filtering', () => {
  const plan = sprintPlan();
  const summary = getRoadmapSummary(plan, { quarterKey: '2027-Q1', quarterIterations: { paths: [], scoped: false } });
  assert.equal(summary.planHours, 150);
  assert.equal(getRoadmapIterationVisibility(plan.workItems, { paths: [], scoped: false }, summary.activeItemIds).filtered, false);
});
