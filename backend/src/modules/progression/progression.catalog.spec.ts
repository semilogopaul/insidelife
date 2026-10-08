import {
  ACHIEVEMENTS,
  ACHIEVEMENT_CATEGORIES,
  ACHIEVEMENT_RARITY_IDS,
  ACTIONS,
  CERTIFICATION_LABELS,
  DAILY_WELCOME_FLAVOURS,
  DAILY_WELCOME_MAX_CASH,
  DISTRICT_IDS,
  LIFE_CHAPTERS,
  LIFE_GOALS,
  LIFE_GOAL_CASH_BUDGET,
  MILESTONE_MOMENTS,
  PROGRESSION_CLOUT_CAP,
  PROGRESSION_SIGNALS,
  SKILL_KEYS,
  TRANSPORT_MODES,
  VENUES,
  VENUE_TYPES,
  findMilestoneMoment,
  type AchievementDefinition,
  type ActionDefinition,
  type LifeGoalDefinition,
  type ProgressionCondition,
  type VenueDefinition,
} from '@insidelife/shared';
import { TRACKED_ILLNESSES, chapterState, goalStatusFor } from './progression.rules.js';

const GOALS: readonly LifeGoalDefinition[] = LIFE_GOALS;
const BADGES: readonly AchievementDefinition[] = ACHIEVEMENTS;
const ACTION_LIST: readonly ActionDefinition[] = ACTIONS;
const VENUE_LIST: readonly VenueDefinition[] = VENUES;
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Every leaf of a condition tree. */
function leaves(condition: ProgressionCondition): ProgressionCondition[] {
  return condition.kind === 'all' || condition.kind === 'any' ? condition.of.flatMap(leaves) : [condition];
}

function allConditions(): Array<{ readonly owner: string; readonly condition: ProgressionCondition }> {
  return [
    ...GOALS.flatMap((goal) => [
      { owner: goal.id, condition: goal.condition },
      ...(goal.bonus ? [{ owner: `${goal.id}:bonus`, condition: goal.bonus.condition }] : []),
      ...(goal.paths ?? []).map((path) => ({ owner: `${goal.id}:${path.id}`, condition: path.condition })),
    ]),
    ...BADGES.map((achievement) => ({ owner: achievement.id, condition: achievement.condition })),
  ];
}

const PLAIN_COUNTERS = new Set([
  'trips',
  'venues',
  'districts',
  'regions',
  'outside',
  'street-late',
  'lagoon-crossings',
  'bridge-drives',
  'bridge-sunset',
  'long-trips',
  'detty-club',
  'promotions',
  'salary-months',
  'strike-days',
  'welcome-sunday',
]);

function isKnownCounter(key: string): boolean {
  if (PLAIN_COUNTERS.has(key)) return true;
  const [prefix, ...rest] = key.split(':');
  const value = rest.join(':');
  switch (prefix) {
    case 'action':
      return ACTION_LIST.some((action) => action.id === value);
    case 'trip':
    case 'rain-trip':
      return (TRANSPORT_MODES as readonly string[]).includes(value);
    case 'venue-type':
      return (VENUE_TYPES as readonly string[]).includes(value);
    case 'venue':
      return VENUE_LIST.some((venue) => venue.id === value);
    case 'district':
      return (DISTRICT_IDS as readonly string[]).includes(value);
    case 'signal':
    case 'signal-total':
      return (PROGRESSION_SIGNALS as readonly string[]).includes(value);
    case 'had':
      return TRACKED_ILLNESSES.includes(value);
    default:
      return false;
  }
}

describe('Life Goals graph', () => {
  it('has contiguous, uniquely identified chapters', () => {
    expect(LIFE_CHAPTERS.map((chapter) => chapter.number)).toEqual(LIFE_CHAPTERS.map((_, index) => index + 1));
    expect(new Set(LIFE_CHAPTERS.map((chapter) => chapter.id)).size).toBe(LIFE_CHAPTERS.length);
  });

  it('has unique goal ids and orders, every goal in a real chapter, and a required goal per chapter', () => {
    expect(new Set(GOALS.map((goal) => goal.id)).size).toBe(GOALS.length);
    for (const chapter of LIFE_CHAPTERS) {
      const goals = GOALS.filter((goal) => goal.chapter === chapter.number);
      expect(goals.length, `chapter ${chapter.number}`).toBeGreaterThan(0);
      expect(new Set(goals.map((goal) => goal.order)).size).toBe(goals.length);
      expect(goals.some((goal) => !goal.optional && !goal.preCompleted), `chapter ${chapter.number} needs a real required goal`).toBe(true);
    }
    for (const goal of GOALS) expect(LIFE_CHAPTERS.some((chapter) => chapter.number === goal.chapter), goal.id).toBe(true);
  });

  it('starts with "Born in Lagos" already ticked (endowed progress) and nothing else', () => {
    const preCompleted = GOALS.filter((goal) => goal.preCompleted);
    expect(preCompleted.map((goal) => goal.id)).toEqual(['born-in-lagos']);
    expect(preCompleted[0]?.chapter).toBe(1);
    expect(preCompleted[0]?.condition).toEqual({ kind: 'always' });
    // Something unfinished but achievable must always be visible from minute one.
    const completed = new Set(['born-in-lagos']);
    const active = GOALS.filter((goal) => goalStatusFor(goal, completed, chapterState(completed).current) === 'active');
    expect(active.length).toBeGreaterThanOrEqual(3);
  });

  it('only references prerequisites in the same or an earlier chapter, without cycles', () => {
    const byId = new Map(GOALS.map((goal) => [goal.id, goal]));
    for (const goal of GOALS) {
      for (const before of goal.after ?? []) {
        const prerequisite = byId.get(before);
        expect(prerequisite, `${goal.id} → ${before}`).toBeDefined();
        expect(prerequisite!.chapter).toBeLessThanOrEqual(goal.chapter);
      }
    }
    const visiting = new Set<string>();
    const done = new Set<string>();
    const visit = (id: string): void => {
      if (done.has(id)) return;
      expect(visiting.has(id), `cycle through ${id}`).toBe(false);
      visiting.add(id);
      for (const before of byId.get(id)?.after ?? []) visit(before);
      visiting.delete(id);
      done.add(id);
    };
    for (const goal of GOALS) visit(goal.id);
  });

  it('makes every goal reachable by completing whatever is active, chapter by chapter', () => {
    const completed = new Set(GOALS.filter((goal) => goal.preCompleted).map((goal) => goal.id));
    for (let guard = 0; guard < GOALS.length + 1; guard++) {
      const { current } = chapterState(completed);
      const active = GOALS.filter((goal) => goalStatusFor(goal, completed, current) === 'active');
      if (active.length === 0) break;
      for (const goal of active) completed.add(goal.id);
    }
    expect([...completed].toSorted()).toEqual(GOALS.map((goal) => goal.id).toSorted());
    expect(chapterState(completed).legacyComplete).toBe(true);
  });

  it('never lets optional goals block the next chapter', () => {
    const required = GOALS.filter((goal) => goal.chapter === 1 && !goal.optional).map((goal) => goal.id);
    expect(chapterState(new Set(required)).current).toBe(2);
  });

  it('defines branching goals as "any of" their paths', () => {
    for (const goal of GOALS.filter((candidate) => candidate.paths)) {
      const paths = goal.paths ?? [];
      expect(paths.length, goal.id).toBeGreaterThanOrEqual(2);
      expect(new Set(paths.map((path) => path.id)).size).toBe(paths.length);
      expect(goal.condition).toEqual({ kind: 'any', of: paths.map((path) => path.condition) });
    }
    // The design calls for these branches.
    expect(GOALS.find((goal) => goal.id === 'jamb-or-job')?.paths?.map((path) => path.id)).toEqual(['jamb', 'job']);
    expect(GOALS.find((goal) => goal.id === 'find-your-path')?.paths?.map((path) => path.id)).toEqual(['admitted', 'trade', 'tech']);
  });

  it('keeps rewards small and bounded (nudges, not salaries)', () => {
    let total = 0;
    for (const goal of GOALS) {
      const cash = goal.reward.cash + (goal.bonus?.cash ?? 0);
      total += cash;
      if (goal.preCompleted) expect(cash).toBe(0);
      else {
        expect(goal.reward.cash, goal.id).toBeGreaterThanOrEqual(5_000);
        expect(cash, goal.id).toBeLessThanOrEqual(200_000);
      }
      expect(goal.reward.clout + (goal.bonus?.clout ?? 0), goal.id).toBeLessThanOrEqual(20);
      expect(Number.isInteger(goal.reward.cash)).toBe(true);
    }
    expect(total).toBeLessThanOrEqual(LIFE_GOAL_CASH_BUDGET);
    expect(LIFE_GOAL_CASH_BUDGET).toBeLessThanOrEqual(1_500_000);
    // The first session pays pocket change compared with the ₦5M starter fund.
    const chapterOne = GOALS.filter((goal) => goal.chapter === 1).reduce((sum, goal) => sum + goal.reward.cash, 0);
    expect(chapterOne).toBeLessThanOrEqual(100_000);
    const goalClout = GOALS.reduce((sum, goal) => sum + goal.reward.clout + (goal.bonus?.clout ?? 0), 0);
    expect(goalClout).toBeLessThanOrEqual(PROGRESSION_CLOUT_CAP);
  });

  it('points GPS hints at real venue types and one-tap actions at real, player-startable actions', () => {
    const types = GOALS.flatMap((goal) => [...(goal.targetVenueTypes ?? []), ...(goal.paths ?? []).flatMap((path) => path.targetVenueTypes ?? [])]);
    for (const type of types) {
      expect(VENUE_TYPES).toContain(type);
      expect(VENUE_LIST.some((venue) => venue.type === type && (!venue.regionId || venue.regionId === 'lagos')), type).toBe(true);
    }
    for (const goal of GOALS.filter((candidate) => candidate.suggestedActionId)) {
      const action = ACTION_LIST.find((candidate) => candidate.id === goal.suggestedActionId);
      expect(action, goal.id).toBeDefined();
      expect(action?.system).toBeFalsy();
      if (goal.targetVenueTypes && action?.where.venueTypes) {
        expect(goal.targetVenueTypes.some((type) => action.where.venueTypes?.includes(type)), goal.id).toBe(true);
      }
    }
    for (const goal of GOALS) {
      expect(goal.hint.length, goal.id).toBeGreaterThan(10);
      expect(goal.doneText.length, goal.id).toBeGreaterThan(5);
    }
  });
});

describe('Conditions in the catalog', () => {
  it('only use known counters, skills, certifications and districts', () => {
    for (const { owner, condition } of allConditions()) {
      for (const leaf of leaves(condition)) {
        if (leaf.kind === 'counter') {
          expect(isKnownCounter(leaf.key), `${owner}: ${leaf.key}`).toBe(true);
          expect(leaf.atLeast, owner).toBeGreaterThan(0);
        }
        if (leaf.kind === 'skill') expect(SKILL_KEYS).toContain(leaf.skill);
        if (leaf.kind === 'certification') for (const code of leaf.anyOf) expect(Object.keys(CERTIFICATION_LABELS), owner).toContain(code);
        if (leaf.kind === 'home') for (const district of leaf.districts ?? []) expect(DISTRICT_IDS).toContain(district);
        if (leaf.kind === 'all' || leaf.kind === 'any') expect(leaf.of.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('Achievements', () => {
  it('has 60+ uniquely identified, well-formed badges', () => {
    expect(BADGES.length).toBeGreaterThanOrEqual(60);
    expect(new Set(BADGES.map((achievement) => achievement.id)).size).toBe(BADGES.length);
    for (const achievement of BADGES) {
      expect(achievement.id, achievement.id).toMatch(KEBAB);
      expect(achievement.icon, achievement.id).toMatch(KEBAB);
      expect(ACHIEVEMENT_RARITY_IDS).toContain(achievement.rarity);
      expect(ACHIEVEMENT_CATEGORIES).toContain(achievement.category);
      expect(achievement.title.length).toBeGreaterThan(2);
      expect(achievement.description.length).toBeGreaterThan(10);
      expect(achievement.condition.kind).not.toBe('always');
    }
  });

  it('spreads across every rarity tier and category, with a few secrets', () => {
    for (const rarity of ACHIEVEMENT_RARITY_IDS) expect(BADGES.some((achievement) => achievement.rarity === rarity), rarity).toBe(true);
    for (const category of ACHIEVEMENT_CATEGORIES) expect(BADGES.some((achievement) => achievement.category === category), category).toBe(true);
    expect(BADGES.filter((achievement) => achievement.secret).length).toBeGreaterThanOrEqual(5);
  });

  it('includes the signature Naija badges', () => {
    const ids = new Set(BADGES.map((achievement) => achievement.id));
    for (const id of ['survived-asuu', 'third-mainland-at-sunset', 'japa-dreams', 'odogwu', 'first-class', 'landlord', 'sprayed-at-an-owambe', 'okada-survivor', 'sapa-graduate', 'nepo-who-worked', 'chowdeck-champion']) {
      expect(ids.has(id), id).toBe(true);
    }
  });
});

describe('Milestone moments', () => {
  it('covers the big life moments with personalised copy', () => {
    const ids = MILESTONE_MOMENTS.map((moment) => moment.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ['first-salary', 'admission', 'graduation', 'first-car', 'wedding', 'first-child', 'first-property', 'promotion', 'heir-takes-over']) {
      expect(ids).toContain(id);
    }
    for (const moment of MILESTONE_MOMENTS) {
      expect(moment.body).toContain('{name}');
      expect(moment.icon).toMatch(KEBAB);
    }
  });

  it('is referenced only by existing ids', () => {
    const referenced = [
      ...GOALS.flatMap((goal) => [goal.milestone, ...(goal.paths ?? []).map((path) => path.milestone)]),
      ...BADGES.map((achievement) => achievement.milestone),
    ].filter((id): id is NonNullable<typeof id> => id !== undefined);
    for (const id of referenced) expect(findMilestoneMoment(id), id).toBeDefined();
  });
});

describe('Daily welcome flavours', () => {
  it('has one flavour per weekday with capped cash and a positive mood boost', () => {
    expect(DAILY_WELCOME_FLAVOURS.map((flavour) => flavour.weekday).toSorted()).toEqual([0, 1, 2, 3, 4, 5, 6]);
    for (const flavour of DAILY_WELCOME_FLAVOURS) {
      expect(flavour.minCash).toBeGreaterThan(0);
      expect(flavour.minCash).toBeLessThanOrEqual(flavour.maxCash);
      expect(flavour.maxCash).toBeLessThanOrEqual(DAILY_WELCOME_MAX_CASH);
      expect(flavour.mood).toBeGreaterThan(0);
      expect(flavour.mood).toBeLessThanOrEqual(15);
    }
    expect(DAILY_WELCOME_MAX_CASH).toBeLessThanOrEqual(20_000);
  });
});
