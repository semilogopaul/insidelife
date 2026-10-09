import { formatNaira, koboToNaira, type IsoDate } from '@insidelife/shared';
import { PriceChangedException, PromotionRuleException } from '../promotions.errors.js';

/**
 * The buyer saw a price before paying; if ops re-priced it since, stop rather than charge a different amount (the
 * error carries the new quote; the app shows it again).
 */
export function assertExpectedPrice(expectedKobo: number | undefined, quote: { readonly weekPriceKobo: number; readonly totalKobo: number }, unit: 'week' | 'song'): void {
  if (expectedKobo === undefined || expectedKobo === quote.totalKobo) return;
  const now = formatNaira(koboToNaira(quote.totalKobo));
  const per = unit === 'week' ? ` (${formatNaira(koboToNaira(quote.weekPriceKobo))} a week)` : '';
  throw new PriceChangedException(`The price just changed to ${now}${per}. Check it and pay again`, quote.weekPriceKobo, quote.totalKobo);
}

const SHORT_DATE = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/** "Fri 9 Oct" for a Lagos calendar date. */
export const formatShortDate = (date: IsoDate): string => SHORT_DATE.format(new Date(`${date}T00:00:00.000Z`));

/**
 * The buyer saw a start date before paying; if the slot filled up meanwhile and the run would now start later, stop
 * rather than charge for dates they never saw (the response tells them the new start, the app shows it again).
 */
export function assertExpectedStart(expected: IsoDate | undefined, actual: IsoDate, where: string): void {
  if (expected === undefined || expected === actual) return;
  throw new PromotionRuleException('DATES_CHANGED', `${where} filled up a moment ago: the next free start is now ${formatShortDate(actual)}. Check the dates and pay again`);
}
