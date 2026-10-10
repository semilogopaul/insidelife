import {
  BET_SELECTION_IDS,
  BETTING_RULES,
  LEAGUE_CLOCK,
  ODDS_SCALE,
  selectionWins,
  type BetSelectionId,
  type Rng,
} from '@insidelife/shared';

/**
 * The Lagos League's match model, pure. Goals for each side are independent Poisson counts (truncated at
 * `MAX_GOALS` and renormalised) whose means come from the two clubs' strengths. The odds are priced from exactly the
 * distribution the results are drawn from, so the published prices are honest: every selection returns
 * `1 − houseEdge` of its stake on average (a little less after rounding down to 0.01).
 */

/** Goals per side are capped here (P(11+) is negligible); the draw and the prices use the same truncation. */
export const MAX_GOALS = 10;

/** Mean goals for two equal clubs: home advantage is ~0.3 goals. */
const HOME_BASE = 1.4;
const AWAY_BASE = 1.1;
/** How hard a strength gap bites: 20 points ≈ ×1.8 goals for the stronger side, ×0.55 for the weaker. */
const STRENGTH_SLOPE = 0.03;

export interface GoalExpectation {
  readonly home: number;
  readonly away: number;
}

export function expectedGoals(homeStrength: number, awayStrength: number): GoalExpectation {
  const gap = homeStrength - awayStrength;
  return {
    home: HOME_BASE * Math.exp(STRENGTH_SLOPE * gap),
    away: AWAY_BASE * Math.exp(-STRENGTH_SLOPE * gap),
  };
}

/** P(0…MAX_GOALS goals) for a Poisson mean, renormalised to sum to 1. */
export function goalDistribution(mean: number): readonly number[] {
  const pmf: number[] = [];
  let term = Math.exp(-mean);
  for (let goals = 0; goals <= MAX_GOALS; goals++) {
    pmf.push(term);
    term = (term * mean) / (goals + 1);
  }
  const total = pmf.reduce((sum, p) => sum + p, 0);
  return pmf.map((p) => p / total);
}

/** Probability of every selection (sums over the exact score grid). */
export function selectionProbabilities(
  expectation: GoalExpectation,
): Readonly<Record<BetSelectionId, number>> {
  const home = goalDistribution(expectation.home);
  const away = goalDistribution(expectation.away);
  const probabilities = Object.fromEntries(BET_SELECTION_IDS.map((id) => [id, 0])) as Record<
    BetSelectionId,
    number
  >;
  for (let h = 0; h <= MAX_GOALS; h++) {
    for (let a = 0; a <= MAX_GOALS; a++) {
      const p = (home[h] ?? 0) * (away[a] ?? 0);
      for (const id of BET_SELECTION_IDS) if (selectionWins(id, h, a)) probabilities[id] += p;
    }
  }
  return probabilities;
}

/**
 * The house price for a selection in hundredths (2.35 → 235): `(1 − edge) / p`, rounded down. Null when it comes off
 * the board: near-certain selections (where the minimum odds would hand back more than the fair share) and
 * vanishingly unlikely ones.
 */
export function houseOdds(probability: number, edge: number = BETTING_RULES.houseEdge): number | null {
  if (!(probability > 0) || probability > BETTING_RULES.maxSelectionProbability) return null;
  const hundredths = Math.floor(((1 - edge) / probability) * ODDS_SCALE + 1e-9);
  // Off the board rather than capped: a capped long shot would quietly pay far less than its fair share.
  if (hundredths < BETTING_RULES.minOdds * ODDS_SCALE || hundredths > BETTING_RULES.maxOdds * ODDS_SCALE)
    return null;
  return hundredths;
}

export function priceSelections(
  expectation: GoalExpectation,
): Readonly<Record<BetSelectionId, number | null>> {
  const probabilities = selectionProbabilities(expectation);
  return Object.fromEntries(BET_SELECTION_IDS.map((id) => [id, houseOdds(probabilities[id])])) as Record<
    BetSelectionId,
    number | null
  >;
}

/** Inverse-CDF draw from a goal distribution with one uniform. */
function drawGoals(distribution: readonly number[], roll: number): number {
  let cumulative = 0;
  for (let goals = 0; goals < distribution.length; goals++) {
    cumulative += distribution[goals] ?? 0;
    if (roll < cumulative) return goals;
  }
  return distribution.length - 1;
}

export interface DrawnGoal {
  readonly side: 'home' | 'away';
  /** Match minute 1-90. */
  readonly minute: number;
}

export interface DrawnMatch {
  readonly home: number;
  readonly away: number;
  /** In match order. */
  readonly goals: readonly DrawnGoal[];
}

/**
 * The full-time score from the distribution the odds were priced on (the first two rolls), then a minute for each
 * goal (later rolls, which can't change the score).
 */
export function drawMatch(expectation: GoalExpectation, rng: Rng): DrawnMatch {
  const home = drawGoals(goalDistribution(expectation.home), rng.next());
  const away = drawGoals(goalDistribution(expectation.away), rng.next());
  const goals: DrawnGoal[] = [];
  for (let i = 0; i < home; i++) goals.push({ side: 'home', minute: rng.int(1, 90) });
  for (let i = 0; i < away; i++) goals.push({ side: 'away', minute: rng.int(1, 90) });
  goals.sort((a, b) => a.minute - b.minute);
  return { home, away, goals };
}

/**
 * A club's strength for a season: its long-run base plus a drift that carries over from last season (each season's
 * shock is shared 70/30 with the next, so form persists but nobody stays on top for ever).
 */
export function seasonStrength(base: number, shock: number, previousShock: number): number {
  const drifted = base + 6 * (0.7 * shock + 0.3 * previousShock);
  return Math.round(Math.min(95, Math.max(45, drifted)) * 10) / 10;
}

/**
 * A double round robin (circle method) for an even number of clubs in the given order: each club plays every other
 * once at home and once away, one match a week, home and away alternating. Returns weeks of [home, away] pairs.
 */
export function roundRobin(
  order: readonly string[],
): ReadonlyArray<ReadonlyArray<readonly [string, string]>> {
  const n = order.length;
  if (n % 2 !== 0 || n < 2) throw new RangeError('A round robin needs an even number of clubs');
  const rotating = order.slice(1);
  const fixed = order[0] as string;
  const firstHalf: Array<Array<readonly [string, string]>> = [];
  for (let week = 0; week < n - 1; week++) {
    const lineup = [fixed, ...rotating];
    const pairs: Array<readonly [string, string]> = [];
    for (let i = 0; i < n / 2; i++) {
      const a = lineup[i] as string;
      const b = lineup[n - 1 - i] as string;
      // Alternate who's at home so nobody plays a long run of home or away games.
      const swap = i === 0 ? week % 2 === 1 : (week + i) % 2 === 1;
      pairs.push(swap ? [b, a] : [a, b]);
    }
    firstHalf.push(pairs);
    rotating.unshift(rotating.pop() as string);
  }
  const secondHalf = firstHalf.map((pairs) => pairs.map(([home, away]) => [away, home] as const));
  return [...firstHalf, ...secondHalf];
}

export const LEAGUE_WEEKS = LEAGUE_CLOCK.weeksPerSeason;
