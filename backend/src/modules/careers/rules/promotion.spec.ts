import { MINUTES_PER_DAY, MINUTES_PER_YEAR, findJob, type JobDefinition } from '@insidelife/shared';
import { PROMOTION_COOLDOWN_DAYS, promotionChance, promotionOutlook, type PromotionState } from './promotion.js';
import { graduate, profile, skills } from './fixtures-spec.js';

const job = (id: string): JobDefinition => {
  const definition = findJob(id);
  if (!definition) throw new RangeError(`missing job ${id}`);
  return definition;
};

const state = (overrides: Partial<PromotionState> = {}): PromotionState => ({
  level: 0,
  levelStartedAt: 0,
  performance: 0.75,
  goodwill: 0,
  lastPromotionRequestAt: null,
  ...overrides,
});

describe('promotion rules', () => {
  const swe = job('software-engineer');
  const ready = profile({ skills: skills({ tech: 50 }), credentials: graduate() });

  it('waits for time in level', () => {
    expect(promotionOutlook(swe, state(), ready, MINUTES_PER_YEAR / 2).blockedReason).toMatch(/time/);
    expect(promotionOutlook(swe, state(), ready, MINUTES_PER_YEAR).blockedReason).toBeNull();
  });

  it('checks the next level’s skill gates', () => {
    const outlook = promotionOutlook(swe, state(), profile({ skills: skills({ tech: 40 }) }), MINUTES_PER_YEAR);
    expect(outlook.blockedReason).toMatch(/requirements/);
    expect(outlook.gates.find((gate) => gate.key === 'gate:skill:tech')?.met).toBe(false);
  });

  it('refuses poor performers and respects the appraisal cooldown', () => {
    expect(promotionOutlook(swe, state({ performance: 0.4 }), ready, MINUTES_PER_YEAR).blockedReason).toMatch(/performance/);
    const asked = MINUTES_PER_YEAR;
    expect(promotionOutlook(swe, state({ lastPromotionRequestAt: asked }), ready, asked + MINUTES_PER_DAY).blockedReason).toMatch(/next appraisal/);
    expect(promotionOutlook(swe, state({ lastPromotionRequestAt: asked }), ready, asked + PROMOTION_COOLDOWN_DAYS * MINUTES_PER_DAY).blockedReason).toBeNull();
  });

  it('only lets breakout moments promote creatives past the breakout levels', () => {
    const musician = job('afrobeats-musician');
    const outlook = promotionOutlook(musician, state({ level: 1 }), profile({ skills: skills({ creative: 90, charisma: 90 }) }), 10 * MINUTES_PER_YEAR);
    expect(outlook.breakout).toBe(true);
    expect(outlook.blockedReason).toMatch(/breakout/);
  });

  it('stops at the top of the ladder', () => {
    const top = swe.levels.length - 1;
    expect(promotionOutlook(swe, state({ level: top }), ready, 50 * MINUTES_PER_YEAR).next).toBeNull();
  });

  it('gives better odds to strong performers with goodwill and connections', () => {
    expect(promotionChance(0.9, 0.1, 60)).toBeGreaterThan(promotionChance(0.6, 0, 5));
    expect(promotionChance(1, 0.3, 100)).toBeLessThanOrEqual(0.95);
    expect(promotionChance(0, -0.3, 0)).toBeGreaterThanOrEqual(0.1);
  });

  it('makes the ladder long: an executive director needs years, not days', () => {
    const bank = job('bank-graduate-trainee');
    const years = bank.levels.slice(0, -1).reduce((sum, level) => sum + level.minYears, 0);
    expect(years).toBeGreaterThanOrEqual(15);
  });
});
