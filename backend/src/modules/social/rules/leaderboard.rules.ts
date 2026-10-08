import { formatNaira, formatNairaCompact, statusTier, wealthBandLabel, type LeaderboardBoardId } from '@insidelife/shared';

/**
 * Self-made net worth in SQL — must mirror `selfMadeNetWorthOf` in the shared catalog. Unearned money (birth-lottery
 * cash, starter fund, allowance, gifts, sprays, inheritance) and purchased top-ups are excluded by construction,
 * because every such credit increments `unearned_total`.
 */
export const SELF_MADE_SQL = 'GREATEST(0, c.net_worth - c.unearned_total)';

/** One ranked row as read from SQL, before privacy rules decide what to show. */
export interface LeaderboardRow {
  readonly characterId: string;
  readonly handle: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly status: number;
  readonly value: number;
  readonly showExactWealth: boolean;
  readonly degreeLabel: string | null;
  readonly married: boolean;
  readonly children: number;
  readonly generations: number;
}

export interface PresentedValue {
  readonly value: number | null;
  readonly display: string;
  readonly detail: string | null;
}

const MONEY_BOARDS: ReadonlySet<LeaderboardBoardId> = new Set(['self-made', 'earners', 'dynasties']);

export const isMoneyBoard = (board: LeaderboardBoardId): boolean => MONEY_BOARDS.has(board);

export function familyLabel(married: boolean, children: number): string {
  const kids = children === 0 ? null : children === 1 ? '1 kid' : `${children} kids`;
  return [married ? 'Married' : null, kids].filter((part): part is string => part !== null).join(' · ') || 'Single';
}

/**
 * Privacy for leaderboards: money is shown as a band ("₦10M+") unless the player opted in to exact figures (or it is
 * your own row). Dynasty totals are always banded. CGPA, clout and family size are public facts.
 */
export function presentLeaderboardValue(board: LeaderboardBoardId, row: LeaderboardRow, isSelf: boolean): PresentedValue {
  const exactMoney = isSelf || row.showExactWealth;
  switch (board) {
    case 'self-made':
      return exactMoney
        ? { value: row.value, display: formatNairaCompact(row.value), detail: null }
        : { value: null, display: wealthBandLabel(row.value), detail: null };
    case 'earners':
      return exactMoney
        ? { value: row.value, display: `${formatNaira(row.value)}/month`, detail: null }
        : { value: null, display: `${wealthBandLabel(row.value)}/month`, detail: null };
    case 'scholars':
      return { value: row.value, display: row.value.toFixed(2), detail: row.degreeLabel };
    case 'influence':
      return { value: row.value, display: `${row.value} clout`, detail: statusTier(row.value).label };
    case 'families':
      return { value: row.value, display: familyLabel(row.married, row.children), detail: null };
    case 'dynasties': {
      const generations = row.generations === 1 ? '1 generation' : `${row.generations} generations`;
      return { value: isSelf ? row.value : null, display: isSelf ? formatNairaCompact(row.value) : wealthBandLabel(row.value), detail: `${generations} · The ${row.lastName} dynasty` };
    }
  }
}
