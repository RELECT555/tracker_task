import assert from 'node:assert/strict';
import test from 'node:test';
import { capStoredWidths, fitColumns, limitPinnedColumns, pinnedSlack, resizeGroup } from './plan-column-layout.ts';

const column = (id, width, options = {}) => ({ id, label: id, width, minWidth: 80, ...options });
const widths = (columns) => Object.fromEntries(columns.map((entry) => [entry.id, entry.width]));

test('a name width stored in a wider container no longer pushes the totals off screen', () => {
  const columns = [
    column('name', 1229, { minWidth: 280, grow: true, customized: true }),
    column('summary:plan', 177, { customized: true }),
    column('summary:fact', 171, { customized: true }),
  ];
  // The name keeps at most three quarters of the container, so the plan column starts on the first screen.
  const fitted = fitColumns(capStoredWidths(columns, 1108), 1108);
  assert.deepEqual(widths(fitted), { name: 831, 'summary:plan': 177, 'summary:fact': 171 });
  // In a container wider than the stored columns, the hand-sized name still absorbs the leftover width.
  const wide = fitColumns(capStoredWidths([column('name', 600, { grow: true, customized: true }), column('summary:plan', 177)], 1108), 1108);
  assert.deepEqual(widths(wide), { name: 931, 'summary:plan': 177 });
  // Unmeasured containers and widths that already fit are left alone.
  assert.deepEqual(capStoredWidths(columns, 0), columns);
  assert.equal(capStoredWidths([column('name', 500, { customized: true })], 1108)[0].width, 500);
});

test('pinned columns leave room for the columns that scroll', () => {
  const columns = [
    column('name', 831, { minWidth: 280, grow: true, customized: true }),
    column('summary:plan', 177),
    column('summary:fact', 171),
    column('plan:dev', 140),
  ];
  const nameOnly = limitPinnedColumns(columns, ['name'], 1108);
  assert.equal(nameOnly[0].width, 665);
  assert.equal(pinnedSlack(nameOnly, ['name'], 1108), 0);
  // The name gives way first; the totals shrink only once it reaches its minimum.
  const totals = limitPinnedColumns(columns, ['name', 'summary:plan', 'summary:fact'], 1108);
  assert.deepEqual(widths(totals), { name: 317, 'summary:plan': 177, 'summary:fact': 171, 'plan:dev': 140 });
  const narrow = limitPinnedColumns(columns, ['name', 'summary:plan', 'summary:fact'], 800);
  // The totals give up equal amounts: 74px each here.
  assert.deepEqual(widths(narrow), { name: 280, 'summary:plan': 103, 'summary:fact': 97, 'plan:dev': 140 });
  // Nothing pinned, or pinned columns that already fit, keep their widths and may still grow up to the budget.
  assert.deepEqual(limitPinnedColumns(columns, [], 1108), columns);
  const roomy = [column('name', 400, { grow: true }), column('plan:dev', 140)];
  assert.deepEqual(limitPinnedColumns(roomy, ['name'], 1108), roomy);
  assert.equal(pinnedSlack(roomy, ['name'], 1108), 265);
  assert.equal(pinnedSlack(roomy, [], 1108), Infinity);
});

test('a role column drags together with its plan, fact and delta columns', () => {
  const columns = [
    column('name', 440),
    column('plan:dev', 140, { widthGroup: 'role-metric:dev' }),
    column('fact:dev', 140, { widthGroup: 'role-metric:dev' }),
    column('delta:dev', 140, { widthGroup: 'role-metric:dev' }),
    column('fact:unattributed', 100),
  ];
  assert.deepEqual(resizeGroup(columns, 'plan:dev'), { ids: ['plan:dev', 'fact:dev', 'delta:dev'], edgeFactor: 1 });
  // The delta edge moves with all three widths, so it follows the pointer at a third of the width change.
  assert.deepEqual(resizeGroup(columns, 'delta:dev'), { ids: ['plan:dev', 'fact:dev', 'delta:dev'], edgeFactor: 3 });
  assert.deepEqual(resizeGroup(columns, 'name'), { ids: ['name'], edgeFactor: 1 });
  assert.deepEqual(resizeGroup(columns, 'missing'), { ids: [], edgeFactor: 1 });
});
