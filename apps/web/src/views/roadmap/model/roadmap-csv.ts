export type CsvCell = string | number | null;

/** Semicolons and decimal commas are what Russian-locale Excel expects from a CSV file. */
const SEPARATOR = ';';

function csvCell(value: CsvCell) {
  if (value === null || (typeof value === 'number' && !Number.isFinite(value))) return '';
  if (typeof value === 'number') return String(Number(value.toFixed(2))).replace('.', ',');
  // Spreadsheet apps run text starting with these characters as a formula.
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: CsvCell[][]) {
  return rows.map((row) => row.map(csvCell).join(SEPARATOR)).join('\r\n');
}

export function downloadCsv(filename: string, rows: CsvCell[][]) {
  // The BOM makes Excel read the file as UTF-8 instead of the system code page.
  const url = URL.createObjectURL(new Blob(['﻿', toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
