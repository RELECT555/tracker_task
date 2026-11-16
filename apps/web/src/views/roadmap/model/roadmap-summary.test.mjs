import assert from 'node:assert/strict';
import test from 'node:test';
import { getRoadmapSummary, aggregateRoadmapSummaries } from '@tracker/shared';

const member = (id, personIsActive = true) => ({ personExternalId: id, personName: id, personEmail: null, personIsActive });
const role = (id, members = [], name = id) => ({ id, name, color: '#000000', azureEstimateField: `Custom.${id}`, members });
const allocation = (id, roleId, personExternalId, estimatedHours, quarterKey = '2026-Q4', periods = []) => ({
  id, roleId, personExternalId, personName: personExternalId, personEmail: null, estimatedHours, quarterKey, periods, role: role(roleId),
});
const item = (id, type, parentExternalId = null, options = {}) => ({
  id, externalId: id, type, parentExternalId, title: id, state: null, url: null,
  actualHours: null, azureCustomFields: {}, allocations: [], ...options,
});
const project = (workItems = [], roles = []) => ({ id: 'project', externalId: 'project', name: 'Project', url: null, syncedAt: null, workItems, roles });
const quarter = { quarterKey: '2026-Q4' };

test('summary counts Epic and Feature cards separately and never repeats rolled-up hierarchy totals', () => {
  const plan = project([
    item('epic', 'Epic', null, { actualHours: 30, azureCustomFields: { 'Custom.BA': 100 } }),
    item('feature', 'Feature', 'epic', { actualHours: 30, azureCustomFields: { 'Custom.BA': 40 } }),
    item('story', 'User Story', 'feature'),
    item('nested', 'Feature', 'story', { actualHours: 20, azureCustomFields: { 'Custom.BA': 12 } }),
    item('task', 'Task', 'nested', { actualHours: 20 }),
    item('standalone', 'Feature', null, { actualHours: 5, azureCustomFields: { 'Custom.BA': 8 } }),
  ], [role('BA')]);
  const summary = getRoadmapSummary(plan, quarter);
  assert.equal(summary.epics, 1);
  assert.equal(summary.features, 3);
  assert.equal(summary.planHours, 20);
  assert.equal(summary.actualHours, 35);
  assert.equal(summary.rolePlan.byItem.get('epic').get('BA'), 12);
});

test('quarter changes local hours and participants without counting legacy Epic assignments', () => {
  const plan = project([
    item('epic', 'Epic', null, { allocations: [allocation('legacy', 'BA', 'legacy', 999)] }),
    item('feature', 'Feature', 'epic', { allocations: [
      allocation('current', 'BA', 'alice', 12),
      allocation('later', 'DEV', 'bob', 7, '2027-Q1'),
    ] }),
  ], [role('BA', [member('lead')]), role('DEV', [member('developer')])]);
  const current = getRoadmapSummary(plan, { ...quarter, plannedRolesOnly: true });
  const later = getRoadmapSummary(plan, { quarterKey: '2027-Q1', plannedRolesOnly: true });
  assert.equal(current.planHours, 12);
  assert.equal(current.roles, 1);
  assert.deepEqual(new Set(current.participantIds), new Set(['lead', 'alice']));
  assert.equal(later.planHours, 7);
  assert.deepEqual(new Set(later.participantIds), new Set(['developer', 'bob']));
  assert.equal(plan.workItems[0].allocations.length, 1, 'projection does not mutate the API cache');
});

test('role filter includes active members and deduplicates people with several roles or allocations', () => {
  const plan = project([
    item('feature', 'Feature', null, { allocations: [
      allocation('a1', 'BA', 'alice', 8), allocation('a2', 'BA', 'alice', 2),
      allocation('orphan', 'removed-role', 'orphan', 50),
    ] }),
  ], [role('BA', [member('alice'), member('lead'), member('inactive', false)]), role('DEV', [member('lead'), member('bob')])]);
  const filtered = getRoadmapSummary(plan, { ...quarter, plannedRolesOnly: true });
  const all = getRoadmapSummary(plan, { ...quarter, plannedRolesOnly: false });
  assert.equal(filtered.roles, 1);
  assert.equal(filtered.participants, 2);
  assert.equal(all.roles, 2);
  assert.equal(all.participants, 3);
  assert.equal(filtered.planHours, 10);
});

test('month uses exact periods across legacy quarters, excludes undated estimates and awaits fact data', () => {
  const plan = project([
    item('feature', 'Feature', null, { actualHours: 500, azureCustomFields: { 'Custom.BA': 999 }, allocations: [
      allocation('legacy', 'BA', 'alice', 100, '2026-Q3', [{ monthKey: '2026-11', hours: '4.5' }]),
      allocation('other-month', 'BA', 'bob', 80, '2026-Q4', [{ monthKey: '2026-10', hours: 80 }]),
    ] }),
    item('task', 'Task', 'feature', { allocations: [allocation('task-plan', 'BA', 'carol', 10, '2026-Q4', [{ monthKey: '2026-11', hours: 3 }])] }),
  ], [role('BA')]);
  const pending = getRoadmapSummary(plan, { ...quarter, monthKey: '2026-11', plannedRolesOnly: true });
  assert.equal(pending.planHours, 7.5);
  assert.equal(pending.actualHours, null);
  assert.equal(pending.items[0].actualHours, null);
  assert.deepEqual(new Set(pending.participantIds), new Set(['alice', 'carol']));
  const loaded = getRoadmapSummary(plan, { ...quarter, monthKey: '2026-11', monthlyFact: {
    workItems: { feature: -2 }, allocations: { 'other-month': -2 }, totalHours: -2,
  } });
  assert.equal(loaded.actualHours, -2, 'negative corrections remain signed');
  assert.equal(loaded.items[0].actualHours, -2);
  assert.equal(loaded.items[0].allocations.find((entry) => entry.id === 'other-month').actualHours, -2);
});

test('all-project summary adds project work even when IDs overlap and deduplicates role names and people', () => {
  const first = getRoadmapSummary(project([
    item('epic', 'Epic', null, { actualHours: 7 }),
    item('feature', 'Feature', 'epic', { allocations: [allocation('one', 'BA', 'alice', 10)] }),
  ], [role('BA', [member('lead')], ' Business  Analyst ')]), quarter);
  const second = getRoadmapSummary(project([
    item('epic', 'Epic', null, { actualHours: 3 }),
    item('feature', 'Feature', 'epic', { allocations: [allocation('one', 'BA-2', 'bob', 20)] }),
  ], [role('BA-2', [member('lead')], 'business analyst')]), quarter);
  const all = aggregateRoadmapSummaries([first, second]);
  assert.equal(all.epics, 2);
  assert.equal(all.features, 2);
  assert.equal(all.planHours, 30);
  assert.equal(all.actualHours, 10);
  assert.equal(all.roles, 1);
  assert.equal(all.participants, 3);
  assert.equal(aggregateRoadmapSummaries([first, { ...second, actualHours: null }]).actualHours, null);
  assert.deepEqual(aggregateRoadmapSummaries([]), {
    epics: 0, features: 0, planHours: 0, actualHours: 0, roles: 0, participants: 0, roleKeys: [], participantIds: [],
  });
});

test('epic and feature counts follow the selected quarter and month', () => {
  const plan = project([
    item('epic-q4', 'Epic'), item('feature-q4', 'Feature', 'epic-q4', { allocations: [allocation('a', 'BA', 'alice', 5, '2026-Q4', [{ monthKey: '2026-11', hours: 5 }])] }),
    item('epic-q1', 'Epic'), item('feature-q1', 'Feature', 'epic-q1', { allocations: [allocation('b', 'BA', 'bob', 5, '2027-Q1', [{ monthKey: '2027-01', hours: 5 }])] }),
    item('idle', 'Feature'),
  ], [role('BA')]);
  const q4 = getRoadmapSummary(plan, quarter);
  assert.deepEqual([q4.epics, q4.features], [1, 1]);
  assert.deepEqual([getRoadmapSummary(plan, { quarterKey: '2027-Q1' }).epics, getRoadmapSummary(plan, { quarterKey: '2027-Q1' }).features], [1, 1]);
  const oct = getRoadmapSummary(plan, { ...quarter, monthKey: '2026-10' });
  assert.deepEqual([oct.epics, oct.features], [0, 0]);
  const nov = getRoadmapSummary(plan, { ...quarter, monthKey: '2026-11' });
  assert.deepEqual([nov.epics, nov.features], [1, 1]);
});

test('quarter counts cards with fact in any of its months, so it never shows fewer cards than a month', () => {
  const plan = project([
    item('epic', 'Epic'), item('feature', 'Feature', 'epic', { actualHours: 32 }),
    item('old-epic', 'Epic'), item('old-feature', 'Feature', 'old-epic', { actualHours: 8 }),
  ]);
  const nov = { workItems: { feature: 32, epic: 32 }, allocations: {}, totalHours: 32 };
  const empty = { workItems: {}, allocations: {}, totalHours: 0 };
  const month = getRoadmapSummary(plan, { ...quarter, monthKey: '2026-11', monthlyFact: nov });
  assert.deepEqual([month.epics, month.features], [1, 1]);
  const q4 = getRoadmapSummary(plan, { ...quarter, quarterFact: [empty, nov, empty] });
  assert.deepEqual([q4.epics, q4.features], [1, 1]);
  // Cumulative fact from an earlier quarter does not make a card active, and nothing counts while the fact loads.
  assert.deepEqual([getRoadmapSummary(plan, quarter).epics, getRoadmapSummary(plan, quarter).features], [0, 0]);
});

test('a child epic counts on its own unless the table rolls child epics into their parent', () => {
  const plan = project([
    item('archive', 'Epic', null, { actualHours: 2 }),
    item('own', 'Feature', 'archive', { actualHours: 2, azureCustomFields: { 'Custom.BA': 3 } }),
    item('child', 'Epic', 'archive', { actualHours: 5 }),
    item('childFeature', 'Feature', 'child', { actualHours: 5, azureCustomFields: { 'Custom.BA': 10 } }),
  ], [role('BA')]);

  const separate = getRoadmapSummary(plan, quarter);
  assert.equal(separate.rolePlan.byItem.get('archive').get('BA'), 3);
  assert.equal(separate.rolePlan.byItem.get('child').get('BA'), 10);
  assert.equal(separate.planHours, 13);
  assert.equal(separate.actualHours, 7);
  assert.equal(separate.epics, 2);

  // With the setting on the API rolls the child's fact into the parent as well.
  const rolledPlan = { ...plan, workItems: plan.workItems.map((entry) => entry.id === 'archive' ? { ...entry, actualHours: 7 } : entry) };
  const rolled = getRoadmapSummary(rolledPlan, { ...quarter, includeChildEpics: true });
  assert.equal(rolled.rolePlan.byItem.get('archive').get('BA'), 13);
  assert.equal(rolled.planHours, 13);
  assert.equal(rolled.actualHours, 7);
});

test('an epic with only a planned child epic is not active on its own', () => {
  const plan = project([
    item('archive', 'Epic'),
    item('child', 'Epic', 'archive'),
    item('childFeature', 'Feature', 'child', { azureCustomFields: { 'Custom.BA': 4 } }),
  ], [role('BA')]);
  assert.equal(getRoadmapSummary(plan, quarter).epics, 1);
  assert.equal(getRoadmapSummary(plan, { ...quarter, includeChildEpics: true }).epics, 2);
});
