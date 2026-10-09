/** A column in a CSV export: header text and how to read the cell from a row. */
export interface CsvColumn<T> {
  readonly header: string;
  readonly value: (row: T) => unknown;
}

/** Spreadsheet apps run cells that start like a formula; prefix them so exported player text can't execute. */
const FORMULA_START = /^[=+\-@\t\r]/;

/** One RFC 4180 cell: quoted when needed, formula-neutralised, dates as ISO strings, objects as JSON. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text: string;
  if (value instanceof Date) text = value.toISOString();
  else if (typeof value === 'object') text = JSON.stringify(value);
  else text = String(value);
  // Numbers stay numbers (a negative amount is not a formula).
  if (typeof value !== 'number' && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * A whole CSV document (CRLF line endings, UTF-8 byte order mark so Excel shows ₦ and accented names correctly).
 */
export function toCsv<T>(columns: readonly CsvColumn<T>[], rows: readonly T[]): string {
  const lines = [columns.map((column) => csvCell(column.header)).join(',')];
  for (const row of rows) lines.push(columns.map((column) => csvCell(column.value(row))).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}

/** `players-2026-10-09T1030.csv`: a safe download name with the export time. */
export function csvFilename(subject: string, at = new Date()): string {
  const stamp = at.toISOString().slice(0, 16).replace(':', '').replace(/[^0-9T-]/g, '');
  return `${subject.replace(/[^a-z0-9-]/gi, '-')}-${stamp}.csv`;
}
