import { formatNaira, straightDistance, venueEntrance, type LifeGoalDto, type SuggestionDto, type VenueType, type WorldPoint } from '@insidelife/shared';
import type { PhoneApp } from '@/common/game/ui-store';
import { nearestVenueOfTypes } from './directions';

/** Within this many metres of the door you're "there": the step reads "You're at …". */
export const ARRIVED_METRES = 30;

export type NextStep =
  | {
      readonly kind: 'goal-place';
      readonly goalId: string;
      readonly goalTitle: string;
      readonly text: string;
      readonly venueId: string;
      readonly venueName: string;
      readonly point: WorldPoint;
      readonly metres: number;
    }
  | { readonly kind: 'goal-app'; readonly goalId: string; readonly goalTitle: string; readonly text: string; readonly app: PhoneApp }
  | {
      readonly kind: 'suggestion';
      readonly title: string;
      readonly text: string;
      readonly venueId: string | null;
      readonly venueName: string | null;
      readonly point: WorldPoint | null;
      readonly metres: number | null;
      readonly app: PhoneApp | null;
    };

/** "2.1 km" / "340 m" (rounded to 10 m). */
export function formatDistance(metres: number): string {
  return metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.max(10, Math.round(metres / 10) * 10)} m`;
}

/** What the player should aim at: the first required active goal, else the first active one. */
export function currentGoal(goals: readonly LifeGoalDto[]): LifeGoalDto | null {
  const active = goals.filter((goal) => goal.status === 'active');
  return active.find((goal) => !goal.optional) ?? active[0] ?? null;
}

/** Venue types still worth visiting for a goal: its open paths' types, or its own when it has no paths. */
export function goalVenueTypes(goal: LifeGoalDto): readonly VenueType[] {
  if (goal.paths.length === 0) return goal.targetVenueTypes;
  return [...new Set(goal.paths.filter((path) => !path.met).flatMap((path) => path.targetVenueTypes))];
}

/**
 * The next concrete step of the current Life Goal: the nearest open venue that serves it (GPS), or the goal's hint
 * (opens the Goals app) when it isn't a place. Null with no active goal.
 */
export function nextGoalStep(goals: readonly LifeGoalDto[], from: WorldPoint, hour: number): NextStep | null {
  const goal = currentGoal(goals);
  if (!goal) return null;
  const types = goalVenueTypes(goal);
  const nearest = types.length > 0 ? nearestVenueOfTypes(types, from, hour) : null;
  const door = nearest ? venueEntrance(nearest.venue.id) : null;
  if (!nearest || !door) {
    const hint = goal.paths.find((path) => !path.met)?.hint ?? goal.hint;
    return { kind: 'goal-app', goalId: goal.id, goalTitle: goal.title, text: hint, app: 'goals' };
  }
  const metres = straightDistance(from, door.position);
  return {
    kind: 'goal-place',
    goalId: goal.id,
    goalTitle: goal.title,
    text: metres <= ARRIVED_METRES ? `You’re at ${nearest.venue.name}` : `Go to ${nearest.venue.name}`,
    venueId: nearest.venue.id,
    venueName: nearest.venue.name,
    point: door.position,
    metres,
  };
}

const FALLBACK_IDEAS: readonly { readonly title: string; readonly text: string; readonly app: PhoneApp }[] = [
  { title: 'Find work', text: 'Open Jobs for something that pays this week', app: 'jobs' },
  { title: 'Make a friend', text: 'Say hi to someone online in Messages', app: 'messages' },
];

/**
 * With no goal step: the best suggestion the HUD already has (one with a place and travel time first), or a generic
 * nudge (a job, a friend). `index` rotates the generic nudges.
 */
export function suggestSomething(suggestions: readonly SuggestionDto[], from: WorldPoint, index = 0): NextStep {
  const ranked = [...suggestions].sort((a, b) => b.priority - a.priority);
  const pick = ranked.find((s) => s.target && s.target.etaMinutes > 0) ?? ranked[0];
  if (pick) {
    const target = pick.target;
    const door = target ? venueEntrance(target.locationId) : null;
    const eta = target ? (target.etaMinutes <= 0 ? 'here' : `${target.etaMinutes} min`) : '';
    return {
      kind: 'suggestion',
      title: pick.title,
      text: target ? `${target.name} · ${eta}${target.fare > 0 ? ` · ${formatNaira(target.fare)}` : ''}` : pick.body,
      venueId: target && door ? target.locationId : null,
      venueName: target && door ? target.name : null,
      point: door?.position ?? null,
      metres: door ? straightDistance(from, door.position) : null,
      app: target && door ? null : 'goals',
    };
  }
  const idea = FALLBACK_IDEAS[Math.abs(index) % FALLBACK_IDEAS.length] as (typeof FALLBACK_IDEAS)[number];
  return { kind: 'suggestion', title: idea.title, text: idea.text, venueId: null, venueName: null, point: null, metres: null, app: idea.app };
}

export type StepAction = { readonly type: 'gps'; readonly venueId: string; readonly venueName: string } | { readonly type: 'app'; readonly app: PhoneApp };

/** What "Go" does for a step: GPS to its place, or open the phone app it belongs to (Goals by default). */
export function stepAction(step: NextStep): StepAction {
  if (step.kind === 'goal-place') return { type: 'gps', venueId: step.venueId, venueName: step.venueName };
  if (step.kind === 'goal-app') return { type: 'app', app: step.app };
  if (step.venueId && step.venueName) return { type: 'gps', venueId: step.venueId, venueName: step.venueName };
  return { type: 'app', app: step.app ?? 'goals' };
}

/** Finished steps: completed goals and goal paths that are met. */
export function doneKeys(goals: readonly LifeGoalDto[]): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const goal of goals) {
    if (goal.status === 'completed') keys.add(`goal:${goal.id}`);
    for (const path of goal.paths) if (path.met) keys.add(`path:${goal.id}:${path.id}`);
  }
  return keys;
}

/** Steps finished since `before`. */
export function newlyDone(before: ReadonlySet<string>, after: ReadonlySet<string>): readonly string[] {
  return [...after].filter((key) => !before.has(key));
}
