import {
  BETTING_RULES,
  LEAGUE_CLOCK,
  ageOn,
  formatNaira,
  parseCalendarDate,
  utcCalendarDate,
  type BettingBlock,
  type GameMinute,
} from '@insidelife/shared';

/** Pure betting rules: what may be staked, by whom and when. The service feeds them; the tests pin them. */

export type RuleCheck =
  { readonly ok: true } | { readonly ok: false; readonly code: string; readonly message: string };

const OK: RuleCheck = { ok: true };
const fail = (code: string, message: string): RuleCheck => ({ ok: false, code, message });

/** Lagos is UTC+1 all year: real birthdays turn over at Lagos midnight. */
const LAGOS_OFFSET_MS = 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;

export interface BlockInput {
  /** `users.birth_date` (`YYYY-MM-DD`), null on accounts made before it was asked. */
  readonly birthDate: string | null;
  readonly nowMs: number;
  readonly excludedUntil: Date | null;
  /** The character's game age (heirs can be younger than the player). */
  readonly characterAge: number;
}

/** Why this player can't bet right now (null = they can). Real age comes from the account, never the character. */
export function bettingBlock(
  input: BlockInput,
): { readonly block: BettingBlock; readonly message: string } | null {
  if (input.excludedUntil && input.excludedUntil.getTime() > input.nowMs) {
    return {
      block: 'self-excluded',
      message: 'You’ve taken a break from betting. It ends on its own; it can’t be cut short.',
    };
  }
  if (!input.birthDate) {
    return {
      block: 'confirm-birth-date',
      message: 'Confirm your date of birth first: betting is for players aged 18 and over.',
    };
  }
  const birth = parseCalendarDate(input.birthDate);
  if (!birth || ageOn(birth, utcCalendarDate(input.nowMs + LAGOS_OFFSET_MS)) < BETTING_RULES.minAge) {
    return {
      block: 'under-age',
      message: `Betting is for players aged ${BETTING_RULES.minAge} and over. There’s plenty more to do in Lagos.`,
    };
  }
  if (input.characterAge < BETTING_RULES.minAge) {
    return {
      block: 'character-under-age',
      message: `Your character has to be ${BETTING_RULES.minAge} to bet.`,
    };
  }
  return null;
}

export interface SlipLegInput {
  readonly matchId: string;
  readonly kickoffAt: GameMinute;
  /** House odds in hundredths; null = off the board. */
  readonly odds: number | null;
}

export interface SlipInput {
  readonly legs: readonly SlipLegInput[];
  readonly stake: number;
  /** Server time (game minute). */
  readonly now: GameMinute;
  readonly maxStake: number;
}

/** Legs and stake: 1-10 legs from different matches, all still before kickoff, stake ₦100 up to the maximum. */
export function checkSlip(input: SlipInput): RuleCheck {
  const { legs, stake, now } = input;
  if (legs.length === 0) return fail('EMPTY_SLIP', 'Pick at least one selection.');
  if (legs.length > BETTING_RULES.maxLegs)
    return fail('TOO_MANY_LEGS', `A slip can have at most ${BETTING_RULES.maxLegs} selections.`);
  if (new Set(legs.map((leg) => leg.matchId)).size !== legs.length) {
    return fail('SAME_MATCH', 'One pick per match: two selections from the same match can’t go on one slip.');
  }
  // No bets at or after kickoff (server time), and none before the week's window opens.
  if (legs.some((leg) => now >= leg.kickoffAt))
    return fail('KICKED_OFF', 'Too late: a match on your slip has kicked off. Remove it to place the bet.');
  if (legs.some((leg) => leg.kickoffAt - LEAGUE_CLOCK.openWeeks * LEAGUE_CLOCK.roundMinutes > now))
    return fail('NOT_OPEN', 'Betting on that week isn’t open yet.');
  if (legs.some((leg) => leg.odds === null))
    return fail('OFF_THE_BOARD', 'One of your selections is off the board. Pick another.');
  if (!Number.isSafeInteger(stake) || stake < BETTING_RULES.minStake)
    return fail('STAKE_TOO_LOW', `The smallest stake is ${formatNaira(BETTING_RULES.minStake)}.`);
  if (stake > input.maxStake)
    return fail('STAKE_TOO_HIGH', `The biggest stake on one slip is ${formatNaira(input.maxStake)}.`);
  return OK;
}

/** Net losses today (stakes placed − winnings paid) may not pass the daily limit. Every new stake counts as lost. */
export function checkLossLimit(input: {
  readonly netLossToday: number;
  readonly stake: number;
  readonly limit: number;
}): RuleCheck {
  if (input.netLossToday + input.stake <= input.limit) return OK;
  const left = Math.max(0, input.limit - input.netLossToday);
  return fail(
    'LOSS_LIMIT',
    left > 0
      ? `That would take today’s losses past your daily limit of ${formatNaira(input.limit)}. You can stake ${formatNaira(left)} more today.`
      : `You’ve reached your daily loss limit of ${formatNaira(input.limit)}. It resets tomorrow (game time).`,
  );
}

export interface LossLimitState {
  /** The player's own limit (null = the server's maximum). */
  readonly limit: number | null;
  readonly pending: number | null;
  readonly pendingAt: Date | null;
}

/** The limit in force now: the player's (or the server maximum), with a raise applied once its cooling-off is over. */
export function effectiveLossLimit(state: LossLimitState, nowMs: number, maxLimit: number): number {
  const due = state.pending !== null && state.pendingAt !== null && state.pendingAt.getTime() <= nowMs;
  const limit = due ? state.pending : state.limit;
  return Math.min(maxLimit, limit ?? maxLimit);
}

export type LimitChange =
  | {
      readonly ok: true;
      readonly limit: number;
      readonly pending: number | null;
      readonly pendingAt: Date | null;
    }
  | { readonly ok: false; readonly code: string; readonly message: string };

/** Lowering the limit is immediate; raising it waits `limitRaiseDelayHours` (real time), so a bad night can't undo it. */
export function changeLossLimit(
  state: LossLimitState,
  requested: number,
  nowMs: number,
  maxLimit: number,
): LimitChange {
  if (!Number.isSafeInteger(requested) || requested < BETTING_RULES.minStake) {
    return {
      ok: false,
      code: 'LIMIT_TOO_LOW',
      message: `The lowest daily loss limit is ${formatNaira(BETTING_RULES.minStake)}.`,
    };
  }
  if (requested > maxLimit)
    return {
      ok: false,
      code: 'LIMIT_TOO_HIGH',
      message: `The highest daily loss limit is ${formatNaira(maxLimit)}.`,
    };
  const current = effectiveLossLimit(state, nowMs, maxLimit);
  if (requested <= current) return { ok: true, limit: requested, pending: null, pendingAt: null };
  return {
    ok: true,
    limit: current,
    pending: requested,
    pendingAt: new Date(nowMs + BETTING_RULES.limitRaiseDelayHours * 60 * 60_000),
  };
}

/** A self-exclusion only ever extends: the later of the current end and now + `days` real days. */
export function exclusionEnd(current: Date | null, days: number, nowMs: number): Date {
  const next = nowMs + days * DAY_MS;
  return new Date(Math.max(next, current?.getTime() ?? 0));
}
