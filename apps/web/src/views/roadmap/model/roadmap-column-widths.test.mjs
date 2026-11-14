import assert from 'node:assert/strict';
import test from 'node:test';
import { columnWidthsStorageKey, parseColumnWidths, readColumnWidths, resolveColumnWidth } from './roadmap-column-widths.ts';

test('different accounts restore independent widths, while anonymous users restore nothing', () => {
  const values = new Map([
    [columnWidthsStorageKey('alice'), JSON.stringify({ name: 620, 'role:developer:plan': 180 })],
    [columnWidthsStorageKey('bob'), JSON.stringify({ name: 320, 'role:developer:plan': 240 })],
    ['roadmap-name-column-width', '900'],
  ]);
  const storage = { getItem: (key) => values.get(key) ?? null };
  assert.deepEqual(readColumnWidths(storage, columnWidthsStorageKey('alice')), { name: 620, 'role:developer:plan': 180 });
  assert.deepEqual(readColumnWidths(storage, columnWidthsStorageKey('bob')), { name: 320, 'role:developer:plan': 240 });
  assert.deepEqual(readColumnWidths(storage, columnWidthsStorageKey('new-user')), {});
  assert.deepEqual(readColumnWidths(storage, columnWidthsStorageKey(null)), {});
});

test('invalid or unavailable browser storage does not break the table', () => {
  for (const value of ['{broken', 'null', '42', '[]', '"text"']) {
    assert.deepEqual(parseColumnWidths(value), {});
  }
  assert.deepEqual(parseColumnWidths('{"name":500,"negative":-2,"zero":0,"string":"500","object":{}}'), { name: 500 });
  assert.deepEqual(readColumnWidths({ getItem() { throw new Error('Storage disabled'); } }, 'user'), {});
  assert.deepEqual(readColumnWidths(null, 'user'), {});
});

test('restored values obey the current column limits and new columns use their defaults', () => {
  const config = { defaultWidth: 440, minWidth: 280, maxWidth: 900 };
  assert.equal(resolveColumnWidth(undefined, config), 440);
  assert.equal(resolveColumnWidth(NaN, config), 440);
  assert.equal(resolveColumnWidth(Infinity, config), 440);
  assert.equal(resolveColumnWidth(40, config), 280);
  assert.equal(resolveColumnWidth(5000, config), 900);
  assert.equal(resolveColumnWidth(530.7, config), 531);
});
