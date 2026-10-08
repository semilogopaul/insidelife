'use client';

import { createContext, useContext } from 'react';
import type { ExamKind } from '@insidelife/shared';

/** Sheets any part of the School app can open (register, apply, accept, pay fees, enrol in a programme). */
export type SchoolSheet =
  | { readonly kind: 'register'; readonly exam: ExamKind }
  | { readonly kind: 'apply' }
  | { readonly kind: 'accept'; readonly applicationId: string }
  | { readonly kind: 'fees' }
  | { readonly kind: 'programme'; readonly programmeId: string };

export const SchoolSheetsContext = createContext<(sheet: SchoolSheet) => void>(() => undefined);

export function useOpenSchoolSheet(): (sheet: SchoolSheet) => void {
  return useContext(SchoolSheetsContext);
}
