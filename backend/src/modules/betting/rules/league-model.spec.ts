import { describe, expect, it } from 'vitest';
import {
  BET_MARKETS,
  BET_SELECTION_IDS,
  BETTING_CLUBS,
  BETTING_RULES,
  createRng,
  selectionWins,
} from '@insidelife/shared';
import {
  drawMatch,
  expectedGoals,
  goalDistribution,
  houseOdds,
  priceSelections,
  roundRobin,
  seasonStrength,
  selectionProbabilities,
} from './league-model.js';

describe('the match model', () => {
  it('gives home advantage and rewards the stronger side', () => {
    const even = expectedGoals(70, 70);
    expect(even.home).toBeGreaterThan(even.away);
    const mismatch = expectedGoals(85, 60);
    expect(mismatch.home).toBeGreaterThan(2);
    expect(mismatch.away).toBeLessThan(0.6);
  });

  it('uses proper probability distributions', () => {
    const pmf = goalDistribution(1.4);
    expect(pmf.reduce((sum, p) => sum + p, 0)).toBeCloseTo(1, 12);
    const probabilities = selectionProbabilities(expectedGoals(72, 68));
    for (const market of Object.values(BET_MARKETS)) {
      const total = market.selections.reduce((sum, id) => sum + probabilities[id], 0);
      expect(total).toBeCloseTo(market.id === 'dc' ? 2 : 1, 9);
    }
  });
});

describe('odds and the house margin', () => {
  it('prices every selection at (1 − 7%) / p, rounded down to 0.01', () => {
    expect(houseOdds(0.5)).toBe(186); // 0.93 / 0.5 = 1.86
    expect(houseOdds(0.25)).toBe(372);
    expect(houseOdds(1 / 3)).toBe(279);
    expect(houseOdds(0.3)).toBe(310);
    expect(houseOdds(0.29)).toBe(320); // 3.2068… rounds down: never in the player's favour
  });

  it('takes near-certain and freak selections off the board instead of mispricing them', () => {
    expect(houseOdds(0.95)).toBeNull();
    expect(houseOdds(0)).toBeNull();
    expect(houseOdds(0.0001)).toBeNull();
    expect(houseOdds(0.93 / BETTING_RULES.maxOdds)).toBe(BETTING_RULES.maxOdds * 100);
  });

  it('keeps an overround of about 7% on each market', () => {
    const odds = priceSelections(expectedGoals(74, 70));
    for (const market of Object.values(BET_MARKETS)) {
      if (market.id === 'dc') continue;
      const book = market.selections.reduce(
        (sum, id) => sum + 100 / (odds[id] ?? Number.POSITIVE_INFINITY),
        0,
      );
      expect(book).toBeGreaterThan(1.07);
      expect(book).toBeLessThan(1.09);
    }
  });

  it('returns at most 93% of the stake on average on any priced selection, whatever the clubs', () => {
    for (const [home, away] of [
      [60, 85],
      [70, 70],
      [82, 63],
      [95, 45],
    ] as const) {
      const expectation = expectedGoals(home, away);
      const probabilities = selectionProbabilities(expectation);
      const odds = priceSelections(expectation);
      for (const id of BET_SELECTION_IDS) {
        const price = odds[id];
        if (price === null) continue;
        const expectedReturn = (probabilities[id] * price) / 100;
        expect(expectedReturn).toBeLessThanOrEqual(1 - BETTING_RULES.houseEdge + 1e-9);
        expect(expectedReturn).toBeGreaterThan(0.85);
      }
    }
  });
});

describe('results are drawn from the priced distribution (statistical fairness)', () => {
  const N = 40_000;
  const expectation = expectedGoals(76, 69);
  const probabilities = selectionProbabilities(expectation);
  const odds = priceSelections(expectation);
  const rng = createRng(0x5eed);
  const wins = Object.fromEntries(BET_SELECTION_IDS.map((id) => [id, 0])) as Record<
    (typeof BET_SELECTION_IDS)[number],
    number
  >;
  let returned = 0;
  let staked = 0;
  for (let i = 0; i < N; i++) {
    const match = drawMatch(expectation, rng);
    expect(match.goals).toHaveLength(match.home + match.away);
    for (const id of BET_SELECTION_IDS) {
      if (!selectionWins(id, match.home, match.away)) continue;
      wins[id] += 1;
    }
    // A ₦100 single on every priced selection of every match.
    for (const id of BET_SELECTION_IDS) {
      const price = odds[id];
      if (price === null) continue;
      staked += 100;
      if (selectionWins(id, match.home, match.away)) returned += price;
    }
  }

  it.each(BET_SELECTION_IDS)(
    '%s comes in as often as its fair probability says (within 4 standard errors)',
    (id) => {
      const p = probabilities[id];
      const sigma = Math.sqrt((p * (1 - p)) / N);
      expect(Math.abs(wins[id] / N - p)).toBeLessThan(4 * sigma + 1e-9);
    },
  );

  it('leaves the house about 7% of everything staked', () => {
    const edge = 1 - returned / staked;
    expect(edge).toBeGreaterThan(0.055);
    expect(edge).toBeLessThan(0.09);
  });

  it('puts every goal in a real minute, in order', () => {
    const match = drawMatch(expectedGoals(80, 60), createRng(7));
    const minutes = match.goals.map((goal) => goal.minute);
    expect(minutes).toEqual(minutes.toSorted((a, b) => a - b));
    for (const minute of minutes) expect(minute).toBeGreaterThanOrEqual(1);
    for (const minute of minutes) expect(minute).toBeLessThanOrEqual(90);
  });
});

describe('seasons', () => {
  it('drifts strengths around each club’s base, within bounds', () => {
    expect(seasonStrength(70, 0, 0)).toBe(70);
    expect(seasonStrength(70, 1, 0)).toBeCloseTo(74.2, 5);
    expect(seasonStrength(90, 5, 5)).toBe(95);
    expect(seasonStrength(50, -5, -5)).toBe(45);
  });

  it('builds a double round robin: everyone plays everyone home and away, once a week', () => {
    const ids = BETTING_CLUBS.map((club) => club.id);
    const weeks = roundRobin(ids);
    expect(weeks).toHaveLength(30);
    const pairings = new Set<string>();
    for (const week of weeks) {
      expect(week).toHaveLength(8);
      expect(new Set(week.flat()).size).toBe(16);
      for (const [home, away] of week) pairings.add(`${home}>${away}`);
    }
    expect(pairings.size).toBe(16 * 15);
    for (const id of ids) {
      const homeGames = weeks.flat().filter(([home]) => home === id).length;
      expect(homeGames).toBe(15);
    }
  });
});
