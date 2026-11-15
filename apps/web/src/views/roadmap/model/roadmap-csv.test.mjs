import assert from 'node:assert/strict';
import test from 'node:test';
import { toCsv } from './roadmap-csv.ts';

test('numbers use a decimal comma and empty values stay empty', () => {
  assert.equal(toCsv([['План, ч', 'Факт, ч'], [12.5, null], [3, -1.25], [Number.NaN, 0]]), 'План, ч;Факт, ч\r\n12,5;\r\n3;-1,25\r\n;0');
});

test('cells with separators, quotes or line breaks are quoted', () => {
  assert.equal(toCsv([['Проект; А', 'Он сказал "да"', 'две\nстроки']]), '"Проект; А";"Он сказал ""да""";"две\nстроки"');
});

test('text that a spreadsheet could run as a formula is neutralised', () => {
  assert.equal(toCsv([['=SUM(A1:A2)', '+7 999', '-x', '@cmd', 'Обычный']]), "'=SUM(A1:A2);'+7 999;'-x;'@cmd;Обычный");
});
