'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';
import {
  ITEMS,
  findLifeGoal,
  type ActionDefinition,
  type LifeGoalDto,
  type ProgressionCondition,
  type ProgressionOverviewDto,
  type VenueType,
} from '@insidelife/shared';
import { api } from '@/common/api/http';
import { queryKeys } from '@/common/api/query-keys';
import { segmentAt, useSnapshot } from '@/common/game/snapshot';
import { useGameMinute } from '@/common/game/use-game-clock';
import type { PlaceService } from './services';

/**
 * The life goal that brought you here, and what completes it here — worked out from the goal's completion rule, not
 * a list per goal: "did eat-buka" → the buka's meal; "Tech 30" → whatever trains Tech here (Learn to code); "owns a
 * laptop" → the shop, on Computers; "owns a car" → the showroom's cars; "rented or owned home" → the agency's listings;
 * "admitted"/"wrote JAMB" → the School app; "married"/"a child" → the Family app. The world highlights that hotspot
 * and says "For your goal: …"; the venue sheet lists it first. Same query as the Goals app (shared cache).
 */

/** What to do at a place for a goal. */
export type GoalStep =
  | { readonly kind: 'action'; readonly actionId: string }
  | { readonly kind: 'service'; readonly service: PlaceService }
  /** Being here is what counts (a visit goal): nothing more to do. */
  | { readonly kind: 'here' };

export interface GoalHere {
  readonly goalId: string;
  readonly title: string;
  /** What to do here for it: a place action, or a service (opens the app where it happens). */
  readonly actionId: string | null;
  readonly serviceId: string | null;
  /** The service, when that's what completes it (it may be a goal-specific one: the shop on Computers). */
  readonly service: PlaceService | null;
  /** That thing's name ("Eat at the buka", "Shop for a laptop"). */
  readonly label: string;
}

interface Here {
  readonly venueType: VenueType;
  readonly actions: readonly ActionDefinition[];
  readonly services: readonly PlaceService[];
}

const byApp = (here: Here, app: string, param?: string): PlaceService | undefined =>
  here.services.find(
    (service) =>
      'app' in service.opens &&
      service.opens.app === app &&
      (param === undefined || service.opens.param === param),
  );

/** A place's service pointed at a particular tab ("See listings" → Houses for sale). */
function retarget(service: PlaceService, param: string, label: string, emoji = service.emoji): PlaceService {
  if (!('app' in service.opens)) return service;
  return { ...service, id: `${service.id}:${param}`, label, emoji, opens: { app: service.opens.app, param } };
}

/** Something only an app can do for this goal (propose, start a family), at the desk or wherever people talk. */
function appStep(
  id: string,
  label: string,
  emoji: string,
  app: 'family' | 'jobs' | 'school',
  blurb: string,
): GoalStep {
  return { kind: 'service', service: { id: `goal-${id}`, label, emoji, blurb, opens: { app }, at: 'desk' } };
}

/** What completes `condition` at this place, if anything does. Pure. */
export function goalStepAt(condition: ProgressionCondition, here: Here): GoalStep | null {
  switch (condition.kind) {
    case 'counter': {
      const { key } = condition;
      if (key === `venue-type:${here.venueType}`) return { kind: 'here' };
      if (key.startsWith('action:')) {
        const id = key.slice('action:'.length);
        return here.actions.some((action) => action.id === id) ? { kind: 'action', actionId: id } : null;
      }
      if (key.startsWith('category:')) {
        const action = here.actions.find((candidate) => `category:${candidate.category}` === key);
        return action ? { kind: 'action', actionId: action.id } : null;
      }
      if (key.startsWith('hook:')) {
        const action = here.actions.find((candidate) =>
          (candidate.hooks ?? []).some((hook) => `hook:${hook}` === key),
        );
        return action ? { kind: 'action', actionId: action.id } : null;
      }
      if (key === 'trip:flight' || key === 'city:abuja') {
        const flights = byApp(here, 'flights');
        return flights ? { kind: 'service', service: flights } : null;
      }
      if (key === 'promotions') {
        const jobs = byApp(here, 'jobs');
        return jobs
          ? { kind: 'service', service: retarget(jobs, 'my-job', 'Ask for a promotion', '📈') }
          : null;
      }
      return null;
    }
    case 'skill': {
      const action = here.actions.find((candidate) => (candidate.skillXpPerHour?.[condition.skill] ?? 0) > 0);
      return action ? { kind: 'action', actionId: action.id } : null;
    }
    case 'fitness': {
      const action = here.actions.find((candidate) => (candidate.fitnessPerHour ?? 0) > 0);
      return action ? { kind: 'action', actionId: action.id } : null;
    }
    case 'item-tag': {
      if (condition.tag === 'aircraft') {
        const desk = byApp(here, 'hangar', 'buy');
        return desk ? { kind: 'service', service: desk } : null;
      }
      if (condition.tag === 'car') {
        const cars = byApp(here, 'motors', 'dealer');
        return cars ? { kind: 'service', service: cars } : null;
      }
      const item = ITEMS.find((candidate) =>
        (candidate.tags as readonly string[] | undefined)?.includes(condition.tag),
      );
      const shop = byApp(here, 'shop');
      return item && shop
        ? {
            kind: 'service',
            service: retarget(shop, item.category, `Shop for a ${condition.tag}`, item.emoji),
          }
        : null;
    }
    case 'certification': {
      if (condition.anyOf.includes('ppl')) {
        const school = byApp(here, 'hangar', 'licence');
        return school ? { kind: 'service', service: school } : null;
      }
      const licence = condition.anyOf.includes('drivers-licence')
        ? byApp(here, 'motors', 'licence')
        : undefined;
      const school = byApp(here, 'school');
      const service = licence ?? school;
      return service ? { kind: 'service', service } : null;
    }
    case 'jamb-registered':
    case 'jamb-written':
    case 'jamb-score':
    case 'admitted':
    case 'degree':
    case 'nysc-completed': {
      const school = byApp(here, 'school');
      return school ? { kind: 'service', service: school } : null;
    }
    case 'employed':
    case 'monthly-pay': {
      const jobs = byApp(here, 'jobs');
      return jobs ? { kind: 'service', service: jobs } : null;
    }
    case 'home': {
      const homes = byApp(here, 'homes');
      if (!homes) return null;
      const renting = condition.ownership.includes('rented');
      return { kind: 'service', service: renting ? homes : retarget(homes, 'houses', 'Houses for sale') };
    }
    case 'property-value': {
      const homes = byApp(here, 'homes');
      return homes ? { kind: 'service', service: retarget(homes, 'land', 'Land for sale', '🗺️') } : null;
    }
    case 'relationship': {
      if (condition.in.includes('dating')) {
        const mingle = here.actions.find((action) => (action.hooks ?? []).includes('meet-people'));
        if (mingle) return { kind: 'action', actionId: mingle.id };
      }
      if (condition.in.includes('married'))
        return appStep(
          'wedding',
          'Propose & plan the wedding',
          '💍',
          'family',
          'Proposal, introduction and the big day — in the Family app.',
        );
      return null;
    }
    case 'children':
      return appStep(
        'family',
        'Start a family',
        '👶',
        'family',
        'Try for a baby with your partner — in the Family app.',
      );
    case 'any':
    case 'all': {
      // Steps doable here first; "being here counts" only if nothing else does.
      const steps = condition.of
        .map((part) => goalStepAt(part, here))
        .filter((step): step is GoalStep => step !== null);
      return steps.find((step) => step.kind !== 'here') ?? steps[0] ?? null;
    }
    default:
      return null;
  }
}

/** Venue types a goal points at, its own and its still-open paths'. */
function goalVenueTypes(goal: LifeGoalDto): ReadonlySet<string> {
  return new Set([
    ...goal.targetVenueTypes,
    ...goal.paths.filter((path) => !path.met).flatMap((path) => path.targetVenueTypes),
  ]);
}

/** What completes a goal here: its suggested action if this place has it, else its rule (open paths only). Pure. */
export function goalStepFor(
  goal: Pick<LifeGoalDto, 'id' | 'suggestedActionId' | 'paths'>,
  here: Here,
): GoalStep | null {
  if (goal.suggestedActionId && here.actions.some((action) => action.id === goal.suggestedActionId))
    return { kind: 'action', actionId: goal.suggestedActionId };
  const definition = findLifeGoal(goal.id);
  if (!definition) return null;
  const open = new Set(goal.paths.filter((path) => !path.met).map((path) => path.id));
  const paths = (definition.paths ?? []).filter((path) => goal.paths.length === 0 || open.has(path.id));
  // Paths that point here first ("Get admitted" at a campus), then the goal's own rule.
  const ordered = [...paths.filter((path) => path.targetVenueTypes?.includes(here.venueType)), ...paths];
  if (ordered.length === 0) return goalStepAt(definition.condition, here);
  // A branching goal is done by one of its open paths (a finished path never comes back).
  const steps = ordered
    .map((path) => goalStepAt(path.condition, here))
    .filter((step): step is GoalStep => step !== null);
  return steps.find((step) => step.kind !== 'here') ?? steps[0] ?? null;
}

/** The first active goal that points at this kind of place and has something to do here. Pure. */
export function goalHere(
  goals: readonly LifeGoalDto[],
  venueType: VenueType,
  actions: readonly ActionDefinition[],
  services: readonly PlaceService[],
): GoalHere | null {
  for (const goal of goals) {
    if (goal.status !== 'active' || !goalVenueTypes(goal).has(venueType)) continue;
    const step = goalStepFor(goal, { venueType, actions, services });
    if (!step || step.kind === 'here') continue;
    if (step.kind === 'action') {
      const action = actions.find((candidate) => candidate.id === step.actionId);
      return {
        goalId: goal.id,
        title: goal.title,
        actionId: step.actionId,
        serviceId: null,
        service: null,
        label: action?.label ?? step.actionId,
      };
    }
    return {
      goalId: goal.id,
      title: goal.title,
      actionId: null,
      serviceId: step.service.id,
      service: step.service,
      label: step.service.label,
    };
  }
  return null;
}

/**
 * The place's services with the goal's in them: a goal-specific one (the shop on Computers) takes the place of the
 * place's service for the same app, so it shows where that one would; one only the goal needs (Family app) joins.
 */
export function servicesWithGoal(
  services: readonly PlaceService[],
  goal: GoalHere | null,
): readonly PlaceService[] {
  const extra = goal?.service;
  if (!extra || services.some((service) => service.id === extra.id)) return services;
  const app = 'app' in extra.opens ? extra.opens.app : null;
  const index = services.findIndex((service) => 'app' in service.opens && service.opens.app === app);
  if (index < 0) return [...services, extra];
  const replaced = services[index] as PlaceService;
  return services.map((service, i) => (i === index ? { ...extra, at: replaced.at } : service));
}

/** `goalHere` for the player's active goals (null outside a venue, or with no goal for it). */
export function useGoalHere(
  venueType: VenueType | null,
  actions: readonly ActionDefinition[],
  services: readonly PlaceService[],
): GoalHere | null {
  const progression = useQuery({
    queryKey: queryKeys.domain('progression'),
    queryFn: () => api.get<ProgressionOverviewDto>('/progression'),
    enabled: venueType !== null,
    staleTime: 15_000,
    // A goal done here should stop being pointed at soon after.
    refetchInterval: venueType !== null ? 20_000 : false,
  });
  // When what you're doing changes (the meal is over), the goal may be done: ask again shortly after.
  const client = useQueryClient();
  const { data: snapshot } = useSnapshot();
  const minute = useGameMinute(4000);
  const running = snapshot ? (segmentAt(snapshot, minute)?.actionId ?? null) : null;
  const previous = useRef(running);
  useEffect(() => {
    if (previous.current === running) return;
    previous.current = running;
    const id = window.setTimeout(
      () => void client.invalidateQueries({ queryKey: queryKeys.domain('progression') }),
      1500,
    );
    return () => window.clearTimeout(id);
  }, [running, client]);
  const goals = progression.data?.activeGoals;
  return useMemo(
    () => (goals && venueType ? goalHere(goals, venueType, actions, services) : null),
    [goals, venueType, actions, services],
  );
}
