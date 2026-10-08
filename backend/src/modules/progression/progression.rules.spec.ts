import {
  LIFE_GOALS,
  MINUTES_PER_DAY,
  SKILL_KEYS,
  homeLocationId,
  type LifeGoalDefinition,
  type ProgressionCondition,
  type Skills,
} from '@insidelife/shared';
import type { CredentialsSnapshot } from '../../common/ports/credentials.port.js';
import type { FamilySnapshot } from '../../common/ports/family.port.js';
import {
  addCappedClout,
  aggregateDeltasForFlags,
  achievementMatchesTrigger,
  chapterState,
  counterKeysOf,
  evaluateCondition,
  goalMatchesTrigger,
  goalStatusFor,
  isPromotion,
  jobKeyOf,
  overlapsDailyWindow,
  placeOf,
  presenceFlags,
  probeWeight,
  progressOf,
  rarityPercent,
  renderMomentText,
  satisfiedPathId,
  shouldProbeDay,
  sourcesOf,
  STREET_LATE_WINDOW,
  SUNSET_WINDOW,
  type ProgressionFacts,
} from './progression.rules.js';

const GOALS: readonly LifeGoalDefinition[] = LIFE_GOALS;
const goal = (id: string): LifeGoalDefinition => {
  const found = GOALS.find((candidate) => candidate.id === id);
  expect(found, id).toBeDefined();
  return found as LifeGoalDefinition;
};

const skills = (overrides: Partial<Record<keyof Skills, number>> = {}): Skills =>
  ({ ...Object.fromEntries(SKILL_KEYS.map((key) => [key, 5])), ...overrides }) as Skills;

const credentials = (overrides: Partial<CredentialsSnapshot> = {}): CredentialsSnapshot => ({
  highestLevel: 'ssce',
  waecCredits: 6,
  waecHasMathsEnglish: true,
  degrees: [],
  nysc: 'not-eligible',
  certifications: [],
  enrolled: false,
  jambRegistered: false,
  jambScore: null,
  admitted: false,
  ...overrides,
});

const facts = (overrides: Partial<ProgressionFacts> = {}): ProgressionFacts => ({
  counters: new Map(),
  character: {
    status: 40,
    background: 'working-class',
    age: 17,
    generation: 1,
    skills: skills(),
    fitness: 30,
    lifestyle: 'managing',
    earnedTotal: 0,
  },
  ...overrides,
});

describe('evaluateCondition', () => {
  it('counts toward counter targets with progress', () => {
    const condition: ProgressionCondition = { kind: 'counter', key: 'action:order-food', atLeast: 20 };
    const partial = evaluateCondition(condition, facts({ counters: new Map([['action:order-food', 7]]) }));
    expect(partial).toEqual({ met: false, current: 7, target: 20, unit: 'count' });
    expect(progressOf(partial)).toEqual({ current: 7, target: 20, unit: 'count' });
    const done = evaluateCondition(condition, facts({ counters: new Map([['action:order-food', 25]]) }));
    expect(done.met).toBe(true);
    expect(progressOf(done)).toBeNull();
  });

  it('reports naira totals for signal totals', () => {
    const result = evaluateCondition({ kind: 'counter', key: 'signal-total:owambe-sprayed', atLeast: 1_000_000 }, facts({ counters: new Map([['signal-total:owambe-sprayed', 250_000]]) }));
    expect(result).toMatchObject({ met: false, current: 250_000, unit: 'naira' });
  });

  it('combines with any (best branch) and all (weakest branch)', () => {
    const any: ProgressionCondition = {
      kind: 'any',
      of: [
        { kind: 'counter', key: 'trip:danfo', atLeast: 10 },
        { kind: 'counter', key: 'trip:brt', atLeast: 4 },
      ],
    };
    const counters = new Map([
      ['trip:danfo', 2],
      ['trip:brt', 3],
    ]);
    expect(evaluateCondition(any, facts({ counters }))).toMatchObject({ met: false, current: 3, target: 4 });
    const all: ProgressionCondition = { kind: 'all', of: any.kind === 'any' ? any.of : [] };
    expect(evaluateCondition(all, facts({ counters }))).toMatchObject({ met: false, current: 2, target: 10 });
    expect(evaluateCondition(any, facts({ counters: new Map([['trip:brt', 4]]) })).met).toBe(true);
  });

  it('reads the character for status, skills, background and earnings', () => {
    const base = facts();
    expect(evaluateCondition({ kind: 'status', atLeast: 450 }, base)).toMatchObject({ met: false, current: 40, target: 450, unit: 'points' });
    expect(evaluateCondition({ kind: 'skill', skill: 'tech', atLeast: 30 }, facts({ character: { ...base.character, skills: skills({ tech: 31.4 }) } })).met).toBe(true);
    expect(evaluateCondition({ kind: 'background', in: ['sapa-pikin'] }, base).met).toBe(false);
    expect(evaluateCondition({ kind: 'earned', atLeast: 1_000_000 }, facts({ character: { ...base.character, earnedTotal: 1_000_000 } })).met).toBe(true);
  });

  it('never satisfies a leaf whose source was not gathered', () => {
    const base = facts();
    expect(evaluateCondition({ kind: 'admitted' }, base).met).toBe(false);
    expect(evaluateCondition({ kind: 'employed' }, base).met).toBe(false);
    expect(evaluateCondition({ kind: 'item-tag', tag: 'car' }, base).met).toBe(false);
    expect(evaluateCondition({ kind: 'home', ownership: ['rented'] }, base).met).toBe(false);
    expect(evaluateCondition({ kind: 'not-ill', conditionId: 'malaria' }, base).met).toBe(false);
    expect(evaluateCondition({ kind: 'power-backup' }, base).met).toBe(false);
  });

  it('understands JAMB, admission, degrees and certifications', () => {
    const before = facts({ credentials: credentials({ jambRegistered: true }) });
    expect(evaluateCondition({ kind: 'jamb-registered' }, before).met).toBe(true);
    expect(evaluateCondition({ kind: 'jamb-written' }, before).met).toBe(false);
    const scored = facts({ credentials: credentials({ jambScore: 212 }) });
    expect(evaluateCondition({ kind: 'jamb-written' }, scored).met).toBe(true);
    expect(evaluateCondition({ kind: 'jamb-score', atLeast: 180 }, scored)).toMatchObject({ met: true });
    expect(evaluateCondition({ kind: 'jamb-score', atLeast: 300 }, scored)).toMatchObject({ met: false, current: 212, target: 300, unit: 'score' });
    expect(evaluateCondition({ kind: 'admitted' }, facts({ credentials: credentials({ enrolled: true }) })).met).toBe(true);

    const degree = { level: 'bachelors' as const, courseId: 'cs', field: 'computer-science', institutionId: 'unilag', prestige: 80, grade: 'first' as const, cgpa: 4.6, completedAt: 1 };
    const graduate = facts({ credentials: credentials({ degrees: [degree], certifications: ['ielts'] }) });
    expect(evaluateCondition({ kind: 'degree' }, graduate).met).toBe(true);
    expect(evaluateCondition({ kind: 'degree', grades: ['first', 'distinction'] }, graduate).met).toBe(true);
    expect(evaluateCondition({ kind: 'degree', grades: ['third'] }, graduate).met).toBe(false);
    expect(evaluateCondition({ kind: 'certification', anyOf: ['ielts'] }, graduate).met).toBe(true);
  });

  it('distinguishes unemployed (null) from unknown (undefined)', () => {
    expect(evaluateCondition({ kind: 'employed' }, facts({ employment: null })).met).toBe(false);
    const job = { jobId: 'pos', title: 'POS attendant', employer: 'Moniepoint agent', industry: 'retail', monthlyPayNaira: 90_000, yearsInRole: 0, performance: 0.8, workplaceId: 'yaba-market' };
    expect(evaluateCondition({ kind: 'employed' }, facts({ employment: job })).met).toBe(true);
    expect(evaluateCondition({ kind: 'monthly-pay', atLeast: 1_000_000 }, facts({ employment: job }))).toMatchObject({ met: false, current: 90_000 });
  });

  it('checks homes by ownership and district, and children by age', () => {
    const home = { ownership: 'rented' as const, label: 'Mini flat', districtId: 'lekki' as const, comfort: 10, annualRent: 3_000_000, bedrooms: 1 };
    expect(evaluateCondition({ kind: 'home', ownership: ['rented', 'owned'] }, facts({ home })).met).toBe(true);
    expect(evaluateCondition({ kind: 'home', ownership: ['owned'] }, facts({ home })).met).toBe(false);
    expect(evaluateCondition({ kind: 'home', ownership: ['rented'], districts: ['banana-island'] }, facts({ home })).met).toBe(false);

    const family: FamilySnapshot = {
      members: [],
      relationship: 'married',
      partner: null,
      children: [
        { id: 'a', name: 'Tobi', relation: 'child', age: 18, alive: true, characterId: null },
        { id: 'b', name: 'Ada', relation: 'child', age: 3, alive: true, characterId: null },
      ],
    };
    expect(evaluateCondition({ kind: 'children', atLeast: 1, minAge: 17 }, facts({ family })).met).toBe(true);
    expect(evaluateCondition({ kind: 'children', atLeast: 4 }, facts({ family }))).toMatchObject({ met: false, current: 2, target: 4 });
    expect(evaluateCondition({ kind: 'relationship', in: ['married'] }, facts({ family })).met).toBe(true);
  });

  it('treats "not ill" as met only when health was checked and the illness is gone', () => {
    const condition: ProgressionCondition = { kind: 'not-ill', conditionId: 'malaria' };
    expect(evaluateCondition(condition, facts({ illnesses: new Set(['malaria']) })).met).toBe(false);
    expect(evaluateCondition(condition, facts({ illnesses: new Set() })).met).toBe(true);
  });
});

describe('condition indexing', () => {
  const nested: ProgressionCondition = {
    kind: 'any',
    of: [
      { kind: 'item-tag', tag: 'car' },
      { kind: 'all', of: [{ kind: 'counter', key: 'trip:danfo', atLeast: 1 }, { kind: 'admitted' }] },
    ],
  };

  it('collects sources and counter keys through nesting', () => {
    expect([...sourcesOf(nested)].toSorted()).toEqual(['counters', 'credentials', 'tags']);
    expect([...counterKeysOf(nested)]).toEqual(['trip:danfo']);
  });

  it('re-checks only goals that read a changed counter', () => {
    expect(goalMatchesTrigger('eat-at-a-buka', { kind: 'counters', keys: new Set(['action:eat-buka']) })).toBe(true);
    expect(goalMatchesTrigger('eat-at-a-buka', { kind: 'counters', keys: new Set(['trip:danfo']) })).toBe(false);
    expect(goalMatchesTrigger('get-a-ride', { kind: 'counters', keys: new Set(['trip:danfo']) })).toBe(true);
    expect(goalMatchesTrigger('save-a-million', { kind: 'day-end' })).toBe(true);
  });

  it('only evaluates cheap achievements on a refresh', () => {
    expect(achievementMatchesTrigger('chowdeck-champion', { kind: 'refresh' })).toBe(true);
    expect(achievementMatchesTrigger('odogwu', { kind: 'refresh' })).toBe(true);
    expect(achievementMatchesTrigger('landlord', { kind: 'refresh' })).toBe(false);
    expect(achievementMatchesTrigger('landlord', { kind: 'day-end' })).toBe(true);
  });
});

describe('chapter machine', () => {
  const chapterOneRequired = GOALS.filter((candidate) => candidate.chapter === 1 && !candidate.optional).map((candidate) => candidate.id);

  it('starts in chapter 1 with only Born in Lagos done', () => {
    const completed = new Set(['born-in-lagos']);
    expect(chapterState(completed)).toEqual({ current: 1, legacyComplete: false });
    expect(goalStatusFor(goal('step-outside'), completed, 1)).toBe('active');
    expect(goalStatusFor(goal('write-jamb'), completed, 1)).toBe('locked');
  });

  it('opens chapter 2 once chapter 1’s required goals are done', () => {
    const completed = new Set(chapterOneRequired);
    expect(chapterState(completed).current).toBe(2);
    expect(goalStatusFor(goal('write-jamb'), completed, 2)).toBe('active');
  });

  it('keeps prerequisites locked until met', () => {
    const allButHeir = new Set(GOALS.filter((candidate) => candidate.chapter < 4 && !candidate.optional).map((candidate) => candidate.id));
    expect(chapterState(allButHeir).current).toBe(4);
    expect(goalStatusFor(goal('heir-ready'), allButHeir, 4)).toBe('locked');
    allButHeir.add('first-child');
    expect(goalStatusFor(goal('heir-ready'), allButHeir, 4)).toBe('active');
  });

  it('records which branch completed a branching goal', () => {
    const job = { jobId: 'pos', title: 'POS attendant', employer: 'Agent', industry: 'retail', monthlyPayNaira: 90_000, yearsInRole: 0, performance: 1, workplaceId: 'yaba-market' };
    expect(satisfiedPathId(goal('jamb-or-job'), facts({ credentials: credentials(), employment: job }))).toBe('job');
    expect(satisfiedPathId(goal('get-a-ride'), facts({ counters: new Map([['trip:bolt', 1]]), tags: new Set() }))).toBe('ride');
    expect(satisfiedPathId(goal('get-a-ride'), facts({ tags: new Set(['car']) }))).toBe('car');
  });
});

describe('presence and trips', () => {
  const characterId = 'c1';

  it('classifies streets, homes, venues and out-of-town campuses', () => {
    expect(presenceFlags(placeOf('street:yaba', characterId, 'mushin'))).toEqual(['outside', 'district:yaba']);
    expect(presenceFlags(placeOf(homeLocationId(characterId), characterId, 'mushin'))).toEqual(['district:mushin']);
    expect(presenceFlags(placeOf(homeLocationId('someone-else'), characterId, 'mushin'))).toEqual([]);
    expect(presenceFlags(placeOf('cbt-yaba', characterId, 'mushin'))).toEqual(['venue:cbt-yaba', 'district:yaba']);
    expect(presenceFlags(placeOf('ui', characterId, 'mushin'))).toEqual(['venue:ui', 'region:ibadan']);
  });

  it('derives distinct counts from first visits', () => {
    const deltas = aggregateDeltasForFlags(['venue:cbt-yaba', 'venue:cbt-ikeja', 'district:yaba', 'region:ibadan', 'outside']);
    expect(Object.fromEntries(deltas)).toEqual({ venues: 2, 'venue-type:cbt-centre': 2, districts: 1, regions: 1 });
  });

  it('spots a sunset bridge crossing and late-night streets, across midnight too', () => {
    const day = 10 * MINUTES_PER_DAY;
    expect(overlapsDailyWindow(day + 17 * 60 + 30, day + 18 * 60 + 10, SUNSET_WINDOW)).toBe(true);
    expect(overlapsDailyWindow(day + 19 * 60, day + 20 * 60, SUNSET_WINDOW)).toBe(false);
    expect(overlapsDailyWindow(day + 16 * 60, day + 17 * 60 + 59, SUNSET_WINDOW)).toBe(false);
    expect(overlapsDailyWindow(day + 23 * 60, day + MINUTES_PER_DAY + 2 * 60 + 30, STREET_LATE_WINDOW)).toBe(true);
    expect(overlapsDailyWindow(day + 5 * 60, day + 5 * 60, STREET_LATE_WINDOW)).toBe(false);
  });
});

describe('observers and bookkeeping', () => {
  it('detects promotions only within the same job', () => {
    const before = jobKeyOf({ jobId: 'bank', title: 'Analyst' });
    expect(isPromotion(before, { jobId: 'bank', title: 'Senior Analyst' })).toBe(true);
    expect(isPromotion(before, { jobId: 'bank', title: 'Analyst' })).toBe(false);
    expect(isPromotion(before, { jobId: 'big-4', title: 'Associate' })).toBe(false);
    expect(isPromotion(null, { jobId: 'bank', title: 'Analyst' })).toBe(false);
    expect(isPromotion(before, null)).toBe(false);
  });

  it('probes recent days every day and long catch-ups weekly', () => {
    const now = 100 * MINUTES_PER_DAY + 60;
    expect(shouldProbeDay(99, null, now)).toBe(true);
    expect(shouldProbeDay(99, 98, now)).toBe(true);
    expect(shouldProbeDay(99, 99, now)).toBe(false);
    expect(shouldProbeDay(50, 48, now)).toBe(false);
    expect(shouldProbeDay(55, 48, now)).toBe(true);
    expect(probeWeight(55, 48)).toBe(7);
    expect(probeWeight(99, 98)).toBe(1);
    expect(probeWeight(10, null)).toBe(1);
  });

  it('caps progression clout and rounds rarity', () => {
    expect(addCappedClout(140, 7, 150)).toEqual({ total: 147, granted: 7 });
    expect(addCappedClout(147, 7, 150)).toEqual({ total: 150, granted: 3 });
    expect(addCappedClout(150, 12, 150)).toEqual({ total: 150, granted: 0 });
    expect(addCappedClout(10, -5, 150)).toEqual({ total: 10, granted: 0 });
    expect(rarityPercent(1, 3)).toBe(33.3);
    expect(rarityPercent(0, 10)).toBe(0);
    expect(rarityPercent(5, 0)).toBe(0);
  });

  it('fills moment templates', () => {
    expect(renderMomentText('{name} has been promoted{detail}.', { name: 'Tolu', detail: ' to Senior Analyst' })).toBe('Tolu has been promoted to Senior Analyst.');
  });
});
