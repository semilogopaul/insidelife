import { describe, expect, it } from 'vitest';
import { venueEntrance, type LifeGoalDto, type SuggestionDto } from '@insidelife/shared';
import { currentGoal, doneKeys, formatDistance, goalVenueTypes, newlyDone, nextGoalStep, stepAction, suggestSomething } from './next-step';

const reward = { cash: 0, clout: 0, item: null, bonus: null } as const;
const goal = (over: Partial<LifeGoalDto>): LifeGoalDto => ({
  id: 'g1',
  chapter: 1,
  order: 1,
  title: 'Pass JAMB',
  description: '',
  hint: 'Sit the exam',
  status: 'active',
  optional: false,
  targetVenueTypes: ['cbt-centre'],
  suggestedActionId: null,
  paths: [],
  completedPathId: null,
  progress: null,
  reward,
  celebration: 'toast',
  completedAt: null,
  granted: null,
  ...over,
});

const yaba = venueEntrance('cbt-yaba')!.position;
const far = { x: yaba.x + 300, z: yaba.z };

const suggestion = (over: Partial<SuggestionDto>): SuggestionDto => ({
  id: 's1',
  kind: 'need',
  priority: 50,
  title: 'You’re hungry',
  body: 'Eat something',
  icon: 'utensils',
  actionId: null,
  target: null,
  goalId: null,
  ...over,
});

describe('currentGoal', () => {
  it('prefers a required goal over an optional one, ignoring locked/completed', () => {
    const goals = [goal({ id: 'a', optional: true }), goal({ id: 'b', status: 'locked' }), goal({ id: 'c' })];
    expect(currentGoal(goals)?.id).toBe('c');
    expect(currentGoal([goal({ id: 'a', optional: true })])?.id).toBe('a');
    expect(currentGoal([goal({ status: 'completed' })])).toBeNull();
  });
});

describe('goalVenueTypes', () => {
  it('uses only the open paths of a branching goal', () => {
    const paths = [
      { id: 'p1', label: 'Register', hint: 'h1', targetVenueTypes: ['cbt-centre'] as const, met: true },
      { id: 'p2', label: 'Work', hint: 'h2', targetVenueTypes: ['hospital-public'] as const, met: false },
    ];
    expect(goalVenueTypes(goal({ paths: paths as never }))).toEqual(['hospital-public']);
  });
});

describe('nextGoalStep', () => {
  it('points at the nearest venue with its distance', () => {
    const step = nextGoalStep([goal({})], far, 10);
    expect(step).toMatchObject({ kind: 'goal-place', venueId: 'cbt-yaba', text: expect.stringMatching(/^Go to /) });
    if (step?.kind !== 'goal-place') throw new Error('expected a place');
    expect(step.metres).toBeGreaterThan(250);
    expect(formatDistance(step.metres)).toMatch(/\d+ ?(m|km)$/);
  });

  it('says you are there when at the door', () => {
    const step = nextGoalStep([goal({})], yaba, 10);
    expect(step?.kind === 'goal-place' && step.text).toMatch(/^You’re at /);
  });

  it('falls back to the hint and the Goals app when the step is not a place', () => {
    const step = nextGoalStep([goal({ targetVenueTypes: [], hint: 'Save ₦50k' })], yaba, 10);
    expect(step).toMatchObject({ kind: 'goal-app', text: 'Save ₦50k', app: 'goals' });
  });

  it('is null with no active goal', () => {
    expect(nextGoalStep([], yaba, 10)).toBeNull();
  });
});

describe('suggestSomething', () => {
  const target = { locationId: 'cbt-yaba', name: 'Yaba CBT Centre', venueType: 'cbt-centre', mode: 'walk', etaMinutes: 6, fare: 0, openNow: true } as const;

  it('prefers a suggestion with somewhere to go', () => {
    const step = suggestSomething([suggestion({ id: 'x', priority: 90 }), suggestion({ id: 'y', priority: 20, target })], far);
    expect(step).toMatchObject({ kind: 'suggestion', venueId: 'cbt-yaba', text: 'Yaba CBT Centre · 6 min' });
  });

  it('offers a job or a friend when there is nothing else', () => {
    expect(suggestSomething([], far, 0)).toMatchObject({ app: 'jobs' });
    expect(suggestSomething([], far, 1)).toMatchObject({ app: 'messages' });
  });
});

describe('stepAction', () => {
  it('sets GPS for a place and opens an app otherwise', () => {
    const place = nextGoalStep([goal({})], far, 10)!;
    expect(stepAction(place)).toEqual({ type: 'gps', venueId: 'cbt-yaba', venueName: expect.any(String) });
    expect(stepAction(nextGoalStep([goal({ targetVenueTypes: [] })], far, 10)!)).toEqual({ type: 'app', app: 'goals' });
    expect(stepAction(suggestSomething([], far, 0))).toEqual({ type: 'app', app: 'jobs' });
  });
});

describe('step completion', () => {
  it('spots a goal that finished and a path that got met', () => {
    const path = (met: boolean) => ({ id: 'p', label: 'l', hint: 'h', targetVenueTypes: [], met });
    const before = doneKeys([goal({ paths: [path(false)] }), goal({ id: 'g2' })]);
    const after = doneKeys([goal({ paths: [path(true)] }), goal({ id: 'g2', status: 'completed' })]);
    expect([...newlyDone(before, after)].sort()).toEqual(['goal:g2', 'path:g1:p']);
    expect(newlyDone(after, after)).toEqual([]);
  });
});
