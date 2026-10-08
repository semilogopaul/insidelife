import { CHILD_LIVING_COST_SHARE, NANNY_EXTRA_CHILD, NANNY_MONTHLY, WORKING_SPOUSE_LIVING_MULTIPLIER } from '@insidelife/shared';

/** A working spouse shares the bills (×0.8); every dependent child adds 12% to daily living costs. */
export function householdLivingMultiplier(spouseWorking: boolean, dependants: number): number {
  const spouse = spouseWorking ? WORKING_SPOUSE_LIVING_MULTIPLIER : 1;
  return spouse * (1 + CHILD_LIVING_COST_SHARE * Math.max(0, dependants));
}

/** Nanny cost per month (₦, before the price index) for children under 5, unless a parent stays home. */
export function childcareMonthlyBase(childrenUnderFive: number, someoneStaysHome: boolean): number {
  if (childrenUnderFive <= 0 || someoneStaysHome) return 0;
  return NANNY_MONTHLY + NANNY_EXTRA_CHILD * (childrenUnderFive - 1);
}
