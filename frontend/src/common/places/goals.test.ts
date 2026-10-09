import { appendFileSync } from 'node:fs';
import { LIFE_GOALS, type LifeGoalDto, type VenueType } from '@insidelife/shared';
import { describe, expect, it } from 'vitest';
import { goalHere, goalStepFor, servicesWithGoal, type GoalStep } from './goals';
import { actionsAt, isPlaceAction } from './place-actions';
import { servicesAt } from './services';

/** A goal as the server sends it: active, every path still open. */
function dto(id: string): LifeGoalDto {
  const goal = LIFE_GOALS.find((candidate) => candidate.id === id);
  if (!goal) throw new Error(id);
  const paths = 'paths' in goal ? goal.paths : [];
  return {
    id: goal.id,
    chapter: goal.chapter,
    order: goal.order,
    title: goal.title,
    description: goal.description,
    hint: goal.hint,
    status: 'active',
    optional: 'optional' in goal ? (goal.optional ?? false) : false,
    targetVenueTypes: [
      ...('targetVenueTypes' in goal ? (goal.targetVenueTypes ?? []) : []),
      ...paths.flatMap((path) => ('targetVenueTypes' in path ? (path.targetVenueTypes ?? []) : [])),
    ],
    suggestedActionId: 'suggestedActionId' in goal ? (goal.suggestedActionId ?? null) : null,
    paths: paths.map((path) => ({
      id: path.id,
      label: path.label,
      hint: path.hint,
      targetVenueTypes: 'targetVenueTypes' in path ? (path.targetVenueTypes ?? []) : [],
      met: false,
    })),
    completedPathId: null,
    progress: null,
    reward: { cash: 0, clout: 0, item: null, bonus: null },
    celebration: 'toast',
    completedAt: null,
    granted: null,
  } as unknown as LifeGoalDto;
}

const at = (venueType: VenueType) => ({
  venueType,
  actions: actionsAt({ kind: 'venue', venueType }).filter(isPlaceAction),
  services: servicesAt({ kind: 'venue', venueType }),
});

const describeStep = (step: GoalStep | null): string =>
  !step
    ? 'NOTHING'
    : step.kind === 'action'
      ? `action ${step.actionId}`
      : step.kind === 'here'
        ? 'arriving counts'
        : `${step.service.label} (${'app' in step.service.opens ? `${step.service.opens.app}${step.service.opens.param ? `/${step.service.opens.param}` : ''}` : step.service.opens.panel})`;

describe('what completes a life goal where it sends you', () => {
  const goals = LIFE_GOALS.filter((goal) => dto(goal.id).targetVenueTypes.length > 0);

  it('has something to do (or arriving counts) at every place a goal sends you', () => {
    const table: string[] = [];
    for (const goal of goals) {
      const goalDto = dto(goal.id);
      for (const venueType of new Set(goalDto.targetVenueTypes)) {
        const step = goalStepFor(goalDto, at(venueType));
        table.push(`${goal.id} @ ${venueType}: ${describeStep(step)}`);
        expect.soft(step, `${goal.id} at ${venueType}`).not.toBeNull();
      }
    }
    if (process.env.GOAL_TABLE) appendFileSync(process.env.GOAL_TABLE, `${table.join('\n')}\n`);
  });

  it('maps each kind of goal to the right thing', () => {
    expect(goalStepFor(dto('eat-at-a-buka'), at('buka'))).toEqual({ kind: 'action', actionId: 'eat-buka' });
    expect(goalStepFor(dto('make-a-friend'), at('bar'))).toEqual({ kind: 'action', actionId: 'meet-people' });
    expect(goalStepFor(dto('visit-cbt-centre'), at('cbt-centre'))).toEqual({ kind: 'here' });
    expect(goalStepFor(dto('find-your-path'), at('market'))).toEqual({
      kind: 'action',
      actionId: 'practice-craft',
    });
    expect(goalStepFor(dto('find-your-path'), at('office'))).toEqual({
      kind: 'action',
      actionId: 'learn-code',
    });
    const laptop = goalStepFor(dto('buy-a-laptop'), at('mall'));
    expect(laptop?.kind === 'service' && laptop.service.opens).toEqual({ app: 'shop', param: 'computers' });
    const car = goalStepFor(dto('get-a-ride'), at('car-dealer'));
    expect(car?.kind === 'service' && car.service.opens).toEqual({ app: 'motors', param: 'dealer' });
    const rent = goalStepFor(dto('move-out'), at('estate-agency'));
    expect(rent?.kind === 'service' && rent.service.opens).toEqual({ app: 'homes', param: 'rent' });
    const house = goalStepFor(dto('own-a-house'), at('estate-agency'));
    expect(house?.kind === 'service' && house.service.opens).toEqual({ app: 'homes', param: 'houses' });
    const land = goalStepFor(dto('buy-land'), at('estate-agency'));
    expect(land?.kind === 'service' && land.service.opens).toEqual({ app: 'homes', param: 'land' });
    const licence = goalStepFor(dto('drivers-licence'), at('government'));
    expect(licence?.kind === 'service' && licence.service.opens).toEqual({ app: 'motors', param: 'licence' });
    const wedding = goalStepFor(dto('get-married'), at('church'));
    expect(wedding?.kind === 'service' && wedding.service.opens).toEqual({ app: 'family' });
  });

  it('picks the open path that points here, and skips goals already done or with nothing to do here', () => {
    const path = dto('find-your-path');
    const tradeDone = {
      ...path,
      paths: path.paths.map((candidate) =>
        candidate.id === 'trade' ? { ...candidate, met: true } : candidate,
      ),
    };
    expect(goalStepFor(tradeDone, at('market'))).toBeNull();
    expect(goalStepFor(tradeDone, at('office'))).toEqual({ kind: 'action', actionId: 'learn-code' });
    const { actions, services } = at('cbt-centre');
    // Visiting the CBT centre completes on arrival: the next goal that has something to do here is offered.
    const here = goalHere([dto('visit-cbt-centre'), dto('jamb-or-job')], 'cbt-centre', actions, services);
    expect(here).toMatchObject({
      goalId: 'jamb-or-job',
      serviceId: 'exam-desk',
      label: 'Register for exams',
    });
    expect(
      goalHere([{ ...dto('eat-at-a-buka'), status: 'completed' }], 'buka', at('buka').actions, []),
    ).toBeNull();
  });

  it('puts a goal-specific service where the place’s own one is', () => {
    const { actions, services } = at('mall');
    const laptop = goalHere([dto('buy-a-laptop')], 'mall', actions, services);
    const merged = servicesWithGoal(services, laptop);
    expect(merged).toHaveLength(services.length);
    expect(merged[0]).toMatchObject({
      label: 'Shop for a laptop',
      at: 'counter',
      opens: { app: 'shop', param: 'computers' },
    });
    const church = at('church');
    const wedding = goalHere([dto('get-married')], 'church', church.actions, church.services);
    expect(servicesWithGoal(church.services, wedding).at(-1)).toMatchObject({ opens: { app: 'family' } });
  });
});
