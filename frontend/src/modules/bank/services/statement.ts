import { dayIndexOf, formatDate, MINUTES_PER_DAY, type GameMinute, type LedgerEntryDto, type LedgerKind } from '@insidelife/shared';

export interface StatementDay {
  readonly dayIndex: number;
  readonly label: string;
  readonly entries: readonly LedgerEntryDto[];
  /** Money in minus money out that day. */
  readonly net: number;
}

/** Friendly day heading: "Today", "Yesterday", or "Fri 14 Mar 2031" (game calendar). */
export function dayLabel(dayIndex: number, today: number): string {
  if (dayIndex === today) return 'Today';
  if (dayIndex === today - 1) return 'Yesterday';
  return formatDate(dayIndex * MINUTES_PER_DAY);
}

/** Group newest-first entries by game day, keeping order. */
export function groupByDay(entries: readonly LedgerEntryDto[], now: GameMinute): StatementDay[] {
  const today = dayIndexOf(now);
  const days: Array<{ dayIndex: number; entries: LedgerEntryDto[] }> = [];
  for (const entry of entries) {
    const dayIndex = dayIndexOf(entry.gameMinute);
    const last = days.at(-1);
    if (last && last.dayIndex === dayIndex) last.entries.push(entry);
    else days.push({ dayIndex, entries: [entry] });
  }
  return days.map((day) => ({
    dayIndex: day.dayIndex,
    label: dayLabel(day.dayIndex, today),
    entries: day.entries,
    net: day.entries.reduce((sum, entry) => sum + entry.amount, 0),
  }));
}

/** Plain-words name for each ledger kind (shown under the memo). */
export const LEDGER_KIND_LABELS: Readonly<Record<LedgerKind, string>> = {
  'opening-balance': 'Opening balance',
  allowance: 'Allowance',
  salary: 'Salary',
  hustle: 'Hustle',
  business: 'Business',
  investment: 'Investment',
  interest: 'Interest',
  'rental-income': 'Rent received',
  'event-reward': 'Reward',
  topup: 'Top-up',
  transfer: 'Transfer',
  gift: 'Gift',
  'living-cost': 'Living costs',
  rent: 'Rent',
  'school-fees': 'School fees',
  tax: 'Tax',
  fee: 'Fees & charges',
  purchase: 'Purchase',
  transport: 'Transport',
  health: 'Health',
  ceremony: 'Ceremony',
  'family-support': 'Family support',
  travel: 'Travel',
  fine: 'Fine',
  betting: 'Betting',
  property: 'Property',
  refund: 'Refund',
  sale: 'Sale',
  savings: 'Savings',
  fx: 'Dollars',
  trade: 'Stocks & crypto',
  inheritance: 'Inheritance',
  pension: 'Pension',
  loan: 'Loan',
  adjustment: 'Adjustment',
};

/** Fees whose memo names what they were for ("Car delivery: Toyota Corolla"): the statement shows that instead. */
const NAMED_FEES: readonly string[] = ['Car delivery', 'Delivery'];

/** The line under an entry's memo: its kind, or for a fee named in its memo, what it was for ("Car delivery"). */
export function entryKindLabel(entry: Pick<LedgerEntryDto, 'kind' | 'memo'>): string {
  if (entry.kind === 'fee') {
    const named = NAMED_FEES.find((name) => entry.memo.startsWith(`${name}:`));
    if (named) return named;
  }
  return LEDGER_KIND_LABELS[entry.kind];
}

/** Statement filter: everything, money in, or money out. */
export type StatementFilter = 'all' | 'in' | 'out';

export function filterEntries(entries: readonly LedgerEntryDto[], filter: StatementFilter): LedgerEntryDto[] {
  if (filter === 'all') return [...entries];
  return entries.filter((entry) => (filter === 'in' ? entry.amount > 0 : entry.amount < 0));
}
