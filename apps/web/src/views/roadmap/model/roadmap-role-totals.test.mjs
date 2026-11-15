import assert from 'node:assert/strict';
import test from 'node:test';
import { getRoadmapRolePlan } from '@tracker/shared';
import { getRoadmapRoleFact } from './roadmap-role-fact.ts';

const member = (id, email = `${id}@example.test`) => ({ personExternalId: id, personEmail: email, personName: id, personIsActive: true });
const role = (id, members = []) => ({ id, name: id, color: '#000000', azureEstimateField: `Custom.${id}`, members });
const item = (id, type, parent = null, options = {}) => ({
  id, externalId: id, type, parentExternalId: parent, title: id, state: null, url: null,
  actualHours: null, azureCustomFields: {}, allocations: [], ...options,
});
const allocation = (roleId, hours, person = 'alice', task = null) => ({
  id: `allocation-${roleId}-${person}`, roleId, estimatedHours: hours, personExternalId: person,
  personEmail: `${person}@example.test`, azureTaskId: task,
});
const sum = (values) => [...values.values()].reduce((total, hours) => total + hours, 0);

test('imported role estimates roll up to the collapsed epic and project without repeating parent estimates', () => {
  const roles = [role('BA'), role('DEV'), role('EMPTY')];
  const result = getRoadmapRolePlan([
    item('epic', 'Epic', null, { azureCustomFields: { 'Custom.BA': 100 } }),
    item('feature1', 'Feature', 'epic', { azureCustomFields: { 'Custom.BA': '12.5', 'Custom.DEV': 8 } }),
    item('feature2', 'Feature', 'epic', { azureCustomFields: { 'Custom.BA': 7.5 } }),
    item('standalone', 'Feature', null, { azureCustomFields: { 'Custom.BA': 5 } }),
  ], roles);
  assert.deepEqual(Object.fromEntries(result.byItem.get('epic')), { BA: 20, DEV: 8 });
  assert.deepEqual(Object.fromEntries(result.byProject), { BA: 25, DEV: 8 });
  assert.equal(sum(result.byProject), 33);
  assert.deepEqual(roles.filter((entry) => (result.byProject.get(entry.id) ?? 0) > 0).map((entry) => entry.id), ['BA', 'DEV']);
});

test('local estimates, including explicit zero, replace Azure; undated Azure values can be excluded for monthly planning', () => {
  const roles = [role('BA'), role('DEV')];
  const items = [item('feature', 'Feature', null, {
    allocations: [allocation('BA', 0)], azureCustomFields: { 'Custom.BA': 100, 'Custom.DEV': 40 },
  })];
  assert.deepEqual(Object.fromEntries(getRoadmapRolePlan(items, roles).byProject), { BA: 0, DEV: 40 });
  assert.deepEqual(Object.fromEntries(getRoadmapRolePlan(items, roles, false).byProject), { BA: 0 });
});

test('a parent estimate remains visible when children have no plan or only default zero fields', () => {
  const result = getRoadmapRolePlan([
    item('epic', 'Epic', null, { azureCustomFields: { 'Custom.BA': 18 } }),
    item('feature', 'Feature', 'epic'),
    item('zeroFeature', 'Feature', 'epic', { azureCustomFields: { 'Custom.BA': 0 } }),
  ], [role('BA')]);
  assert.equal(result.byItem.get('epic').get('BA'), 18);
  assert.equal(result.byProject.get('BA'), 18);
});

test('an explicit local zero suppresses ancestor Azure estimates through the complete plan hierarchy', () => {
  const result = getRoadmapRolePlan([
    item('epic', 'Epic', null, { azureCustomFields: { 'Custom.BA': 18 } }),
    item('parentFeature', 'Feature', 'epic', { azureCustomFields: { 'Custom.BA': 12 } }),
    item('feature', 'Feature', 'parentFeature', { allocations: [allocation('BA', 0)] }),
  ], [role('BA')]);
  assert.equal(result.byItem.get('feature').get('BA'), 0);
  assert.equal(result.byItem.get('parentFeature').get('BA'), 0);
  assert.equal(result.byItem.get('epic').get('BA'), 0);
  assert.equal(result.byProject.get('BA'), 0);
});

test('task allocations roll up to the nearest visible ancestor, add local hours once, and ignore task custom estimates', () => {
  const result = getRoadmapRolePlan([
    item('epic', 'Epic'),
    item('feature', 'Feature', 'epic', { allocations: [allocation('BA', 3)], azureCustomFields: { 'Custom.BA': 20 } }),
    item('story', 'User Story', 'feature'),
    item('task', 'Task', 'story', { allocations: [allocation('BA', 4)], azureCustomFields: { 'Custom.BA': 100, 'Custom.DEV': 500 } }),
    item('epicTask', 'Task', 'epic', { allocations: [allocation('BA', 2)] }),
  ], [role('BA'), role('DEV')]);
  assert.deepEqual(Object.fromEntries(result.byItem.get('feature')), { BA: 7 });
  assert.deepEqual(Object.fromEntries(result.byItem.get('epic')), { BA: 9 });
  assert.deepEqual(Object.fromEntries(result.byProject), { BA: 9 });
});

test('local task plans without a visible ancestor remain in project totals and a separate unattached row', () => {
  const result = getRoadmapRolePlan([
    item('feature', 'Feature', null, { allocations: [allocation('BA', 3)] }),
    item('orphan', 'Task', null, { allocations: [allocation('BA', 4)], azureCustomFields: { 'Custom.DEV': 100 } }),
    item('missingParent', 'Task', 'unknown', { allocations: [allocation('DEV', 2)] }),
  ], [role('BA'), role('DEV')]);
  assert.deepEqual(Object.fromEntries(result.byUnattached), { BA: 4, DEV: 2 });
  assert.deepEqual(Object.fromEntries(result.byProject), { BA: 7, DEV: 2 });
  assert.equal(sum(result.byProject), sum(result.byItem.get('feature')) + sum(result.byUnattached));
});

test('facts use current project members for all Azure tasks, including tasks without local allocations', () => {
  const roles = [role('BA', [member('alice')]), role('DEV', [member('bob')])];
  const result = getRoadmapRoleFact([
    item('epic', 'Epic', null, { actualHours: 20, ownActualHours: 2, azureCustomFields: { 'System.AssignedTo': { descriptor: 'alice' } } }),
    item('feature', 'Feature', 'epic', { actualHours: 18, ownActualHours: 0 }),
    item('story', 'User Story', 'feature'),
    item('task1', 'Task', 'story', { actualHours: 7, azureCustomFields: { 'System.AssignedTo': { descriptor: 'alice' } } }),
    item('task2', 'Task', 'feature', { actualHours: 11, azureCustomFields: { 'System.AssignedTo': { uniqueName: 'BOB@example.test' } } }),
    item('orphan', 'Task', null, { actualHours: 99, azureCustomFields: { 'System.AssignedTo': { descriptor: 'alice' } } }),
  ], roles);
  assert.deepEqual(Object.fromEntries(result.byItem.get('feature')), { BA: 7, DEV: 11 });
  assert.deepEqual(Object.fromEntries(result.byItem.get('epic')), { BA: 9, DEV: 11 });
  assert.deepEqual(Object.fromEntries(result.byProject), { BA: 9, DEV: 11 });
});

test('current assignee overrides an outdated allocation and unassigned tasks stay unattributed', () => {
  const roles = [role('BA', [member('alice')]), role('DEV', [member('bob')])];
  const feature = item('feature', 'Feature', null, { allocations: [allocation('BA', 20, 'alice', 'task')] });
  const task = item('task', 'Task', 'feature', { actualHours: 9, azureCustomFields: { 'System.AssignedTo': { descriptor: 'bob' } } });
  assert.deepEqual(Object.fromEntries(getRoadmapRoleFact([feature, task], roles).byProject), { DEV: 9 });
  assert.equal(getRoadmapRoleFact([feature, { ...task, azureCustomFields: { 'System.AssignedTo': null } }], roles).byProject.size, 0);
  assert.equal(getRoadmapRoleFact([feature, { ...task, azureCustomFields: {} }], [role('BA', [])]).byProject.size, 0);
});

test('ambiguous membership is not counted twice; a matching explicit allocation resolves it', () => {
  const roles = [role('BA', [member('alice')]), role('DEV', [member('alice')])];
  const feature = item('feature', 'Feature');
  const task = item('task', 'Task', 'feature', { actualHours: 9, azureCustomFields: { 'System.AssignedTo': { descriptor: 'alice' } } });
  assert.equal(getRoadmapRoleFact([feature, task], roles).byProject.size, 0);
  feature.allocations = [allocation('BA', 20, 'alice', 'task'), { ...allocation('BA', 10, 'alice', 'task'), id: 'another-quarter' }];
  assert.deepEqual(Object.fromEntries(getRoadmapRoleFact([feature, task], roles).byProject), { BA: 9 });
});

test('monthly facts use source deltas and the current task hierarchy, not cumulative values or allocation owners', () => {
  const roles = [role('BA', [member('alice')])];
  const items = [
    item('old', 'Feature', null, { allocations: [allocation('BA', 10, 'alice', 'task')] }),
    item('new', 'Feature'),
    item('task', 'Task', 'new', { actualHours: 100, azureCustomFields: { 'System.AssignedTo': { descriptor: 'alice' } } }),
  ];
  const result = getRoadmapRoleFact(items, roles, { workItems: { new: -2 }, allocations: {}, totalHours: -2, sourceHours: { task: -2 } });
  assert.equal(result.byItem.has('old'), false);
  assert.equal(result.byItem.get('new').get('BA'), -2);
  assert.equal(result.byProject.get('BA'), -2);
});
