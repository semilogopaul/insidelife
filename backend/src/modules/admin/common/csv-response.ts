import type { Response } from 'express';
import { csvFilename } from '../../../common/utils/csv.js';

/** Send a CSV download (never cached: exports hold personal data). */
export function sendCsv(res: Response, subject: string, csv: string): string {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${csvFilename(subject)}"`);
  res.setHeader('Cache-Control', 'no-store');
  return csv;
}

/** The filters an export used, kept in its audit entry (without empty values). */
export function exportFilters(query: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(query).filter(([, value]) => value !== undefined && value !== null && value !== ''));
}
