import { Injectable } from '@nestjs/common';
import {
  VENUES,
  findVenue,
  formatClock,
  formatNaira,
  isVenueOpen,
  toDateParts,
  type ActionId,
  type NeedKey,
  type SuggestionDto,
  type SuggestionTargetDto,
  type TransportMode,
  type VenueDefinition,
  type VenueType,
} from '@insidelife/shared';
import { COLLAPSE_AFTER_MINUTES, daysWithoutSleep } from '../../simulation/rest.js';
import type { SimulationContext } from '../../simulation/simulation-context.js';
import { TimelinePlanner } from '../../simulation/timeline-planner.service.js';
import { GoalsService } from './goals.service.js';

const MAX_SUGGESTIONS = 3;
/** Look this far ahead for work or lectures (game minutes). */
const SCHEDULE_LOOKAHEAD = 3 * 60;
/** Leave-by margin that makes a schedule suggestion urgent. */
const URGENT_LEAVE_MINUTES = 30;
/** Nag about sleep from this many days without a real sleep (the collapse comes at ten). */
const SLEEP_DEBT_NUDGE_DAYS = 7;

interface NeedRule {
  readonly need: NeedKey;
  readonly below: number;
  readonly title: string;
  readonly icon: string;
  /** Do this at home (null = go out instead). */
  readonly homeAction: ActionId | null;
  /** Places that fix it, and what to do there. Empty = head home. */
  readonly venues: ReadonlyArray<{ readonly type: VenueType; readonly action: ActionId }>;
  readonly flavour: string;
}

const NEED_RULES: readonly NeedRule[] = [
  {
    need: 'hunger',
    below: 30,
    title: 'You’re hungry: grab food',
    icon: 'utensils',
    homeAction: 'home-meal',
    venues: [
      { type: 'buka', action: 'eat-buka' },
      { type: 'market', action: 'street-food' },
    ],
    flavour: 'Hunger no be your mate — eat something before your health starts to drop.',
  },
  {
    need: 'energy',
    below: 25,
    title: 'You’re exhausted: sleep at home',
    icon: 'bed',
    homeAction: 'sleep',
    venues: [],
    flavour: 'Your body is begging for rest. A proper sleep at home puts you right.',
  },
  {
    need: 'hygiene',
    below: 25,
    title: 'Time for a bath',
    icon: 'shower-head',
    homeAction: 'shower',
    venues: [],
    flavour: 'People are starting to notice. Bucket or shower — just bath.',
  },
  {
    need: 'fun',
    below: 25,
    title: 'You’re bored stiff',
    icon: 'party-popper',
    homeAction: null,
    venues: [
      { type: 'beach', action: 'beach-day' },
      { type: 'park', action: 'park-chill' },
      { type: 'cinema', action: 'cinema' },
    ],
    flavour: 'All work and no play. Go and catch some vibes.',
  },
  {
    need: 'social',
    below: 25,
    title: 'You’re feeling lonely',
    icon: 'users',
    homeAction: null,
    venues: [
      { type: 'buka', action: 'meet-people' },
      { type: 'bar', action: 'meet-people' },
      { type: 'church', action: 'meet-people' },
      { type: 'mosque', action: 'meet-people' },
    ],
    flavour: 'Man know man — go and mingle, or at least call your mum.',
  },
];

const LAGOS_VENUES: readonly VenueDefinition[] = (VENUES as readonly VenueDefinition[]).filter((venue) => !venue.regionId || venue.regionId === 'lagos');

interface NearestPlace {
  readonly target: SuggestionTargetDto;
  readonly venueType: VenueType | 'home';
}

const travelPhrase = (mode: TransportMode): string => (mode === 'walk' ? 'on foot' : mode === 'car' ? 'by car' : `by ${mode === 'brt' ? 'BRT' : mode}`);

/**
 * HUD "smart next steps": the most urgent of work/lectures about to start, a need running low, and the next Life
 * Goal — each with the nearest place to go and the ETA. Pure reads (planner quotes are deterministic), no writes.
 */
@Injectable()
export class SuggestionsService {
  constructor(
    private readonly planner: TimelinePlanner,
    private readonly goals: GoalsService,
  ) {}

  async suggest(ctx: SimulationContext): Promise<SuggestionDto[]> {
    const suggestions: SuggestionDto[] = [];
    const schedule = await this.scheduleSuggestion(ctx);
    if (schedule) suggestions.push(schedule);
    const sleepDebt = await this.sleepDebtSuggestion(ctx);
    if (sleepDebt) suggestions.push(sleepDebt);
    const need = await this.needSuggestion(ctx);
    if (need && !(sleepDebt && need.id === 'need:energy')) suggestions.push(need);
    const goal = await this.goalSuggestion(ctx);
    if (goal) suggestions.push(goal);
    return suggestions.toSorted((a, b) => b.priority - a.priority || a.id.localeCompare(b.id)).slice(0, MAX_SUGGESTIONS);
  }

  private async scheduleSuggestion(ctx: SimulationContext): Promise<SuggestionDto | null> {
    const character = ctx.character;
    const t = ctx.time;
    const blocks = await this.planner.blocksAround(ctx, t);
    const next = blocks.find(
      (block) => (block.kind === 'work' || block.kind === 'lecture') && block.commute && block.endsAt > t && block.startsAt - t <= SCHEDULE_LOOKAHEAD,
    );
    if (!next || character.locationId === next.locationId || character.travel?.toLocationId === next.locationId) return null;

    const target = await this.targetFor(ctx, next.locationId, 'home');
    if (!target) return null;
    const late = t >= next.startsAt;
    const leaveIn = next.startsAt - target.target.etaMinutes - t;
    const what = next.kind === 'work' ? 'Work' : 'Lectures';
    const title = late ? `You’re late — ${what.toLowerCase()} started at ${formatClock(next.startsAt)}` : `${what} at ${formatClock(next.startsAt)}`;
    const route = `${target.target.name} is ${target.target.etaMinutes} min away ${travelPhrase(target.target.mode)}${target.target.fare > 0 ? ` (${formatNaira(target.target.fare)})` : ''}.`;
    const advice = late ? ' Go now — the boss is counting.' : leaveIn <= 0 ? ' Leave now to make it.' : ` Leave within ${leaveIn} min.`;
    return {
      id: `schedule:${next.kind}:${next.startsAt}`,
      kind: 'schedule',
      priority: late ? 98 : leaveIn <= URGENT_LEAVE_MINUTES ? 92 : 65,
      title,
      body: `${route}${advice}`,
      icon: next.kind === 'work' ? 'briefcase' : 'graduation-cap',
      actionId: null,
      target: target.target,
      goalId: null,
      schedule: { kind: next.kind === 'work' ? 'work' : 'lecture', startsAt: next.startsAt },
    };
  }

  private async needSuggestion(ctx: SimulationContext): Promise<SuggestionDto | null> {
    const needs = ctx.character.needs;
    const urgent = NEED_RULES.filter((rule) => needs[rule.need] < rule.below).toSorted(
      (a, b) => (b.below - needs[b.need]) / b.below - (a.below - needs[a.need]) / a.below,
    )[0];
    if (!urgent) return null;

    const residence = await this.planner.residence(ctx, ctx.time);
    const atHome = ctx.character.locationId === residence.locationId;
    const severity = (urgent.below - needs[urgent.need]) / urgent.below;
    const priority = Math.min(95, Math.round(70 + severity * 25));
    const base = { id: `need:${urgent.need}`, kind: 'need' as const, priority, title: urgent.title, icon: urgent.icon, goalId: null };

    if (urgent.homeAction && (atHome || urgent.venues.length === 0)) {
      if (atHome) return { ...base, body: urgent.flavour, actionId: urgent.homeAction, target: null };
      const home = await this.targetFor(ctx, residence.locationId, 'home', residence.label);
      return { ...base, body: `${urgent.flavour} Home is ${home?.target.etaMinutes ?? '?'} min away.`, actionId: urgent.homeAction, target: home?.target ?? null };
    }

    const nearest = await this.nearest(ctx, urgent.venues.map((venue) => venue.type));
    if (!nearest) return { ...base, body: urgent.flavour, actionId: urgent.homeAction, target: null };
    const action = urgent.venues.find((venue) => venue.type === nearest.venueType)?.action ?? null;
    const { target } = nearest;
    const where = target.etaMinutes === 0 ? `You’re at ${target.name} already.` : `${target.name} is ${target.etaMinutes} min away ${travelPhrase(target.mode)}.`;
    return { ...base, body: `${where} ${urgent.flavour}${target.openNow ? '' : ' (It may be closed when you arrive.)'}`, actionId: action, target };
  }

  /** A week without a real sleep: say so before the body collapses on its own (the autopilot won't put you to bed). */
  private async sleepDebtSuggestion(ctx: SimulationContext): Promise<SuggestionDto | null> {
    const character = ctx.character;
    const lastSleptAt = character.lastSleptAt ?? character.settledAt;
    const days = daysWithoutSleep(lastSleptAt, ctx.time);
    if (days < SLEEP_DEBT_NUDGE_DAYS) return null;
    const left = Math.max(0, Math.ceil((lastSleptAt + COLLAPSE_AFTER_MINUTES - ctx.time) / 1440));
    const residence = await this.planner.residence(ctx, ctx.time);
    const atHome = character.locationId === residence.locationId;
    const home = atHome ? null : await this.targetFor(ctx, residence.locationId, 'home', residence.label);
    const warning = left <= 1 ? 'You’ll collapse within a day' : `You’ll collapse wherever you are in ${left} days`;
    return {
      id: 'need:sleep-debt',
      kind: 'need',
      priority: 97,
      title: `No proper sleep in ${days} days`,
      body: `${warning} unless you sleep at home.${home ? ` Home is ${home.target.etaMinutes} min away.` : ''}`,
      icon: 'bed',
      actionId: 'sleep',
      target: home?.target ?? null,
      goalId: null,
    };
  }

  private async goalSuggestion(ctx: SimulationContext): Promise<SuggestionDto | null> {
    const goal = this.goals.nextGoal(await this.goals.rows(ctx));
    if (!goal) return null;
    const types = [...new Set([...(goal.targetVenueTypes ?? []), ...(goal.paths ?? []).flatMap((path) => path.targetVenueTypes ?? [])])];
    const nearest = types.length > 0 ? await this.nearest(ctx, types) : null;
    const where = nearest
      ? nearest.target.etaMinutes === 0
        ? ` You’re at ${nearest.target.name}.`
        : ` Nearest: ${nearest.target.name}, ${nearest.target.etaMinutes} min ${travelPhrase(nearest.target.mode)}.`
      : '';
    return {
      id: `goal:${goal.id}`,
      kind: 'goal',
      priority: goal.chapter === 1 ? 60 : 50,
      title: `Life Goal: ${goal.title}`,
      body: `${goal.hint}${where}`,
      icon: 'target',
      actionId: goal.suggestedActionId ?? null,
      target: nearest?.target ?? null,
      goalId: goal.id,
    };
  }

  /** Nearest Lagos venue of the given types: open on arrival first, then fastest, then id (deterministic). */
  private async nearest(ctx: SimulationContext, types: readonly VenueType[]): Promise<NearestPlace | null> {
    const places: NearestPlace[] = [];
    for (const venue of LAGOS_VENUES) {
      if (!types.includes(venue.type)) continue;
      const place = await this.targetFor(ctx, venue.id, venue.type, venue.name);
      if (place) places.push(place);
    }
    places.sort(
      (a, b) => Number(b.target.openNow) - Number(a.target.openNow) || a.target.etaMinutes - b.target.etaMinutes || a.target.locationId.localeCompare(b.target.locationId),
    );
    return places[0] ?? null;
  }

  private async targetFor(ctx: SimulationContext, locationId: string, fallbackType: VenueType | 'home', name?: string): Promise<NearestPlace | null> {
    const venue = findVenue(locationId);
    const here = ctx.character.locationId === locationId;
    const quote = here ? null : await this.planner.quote(ctx, ctx.character.locationId, locationId, ctx.character.defaultTransport, ctx.time);
    const etaMinutes = quote?.minutes ?? 0;
    const venueType = venue?.type ?? fallbackType;
    return {
      venueType,
      target: {
        locationId,
        name: name ?? venue?.name ?? 'Home',
        venueType,
        mode: quote?.mode ?? 'walk',
        etaMinutes,
        fare: quote?.fare ?? 0,
        openNow: venue ? isVenueOpen(venue, toDateParts(ctx.time + etaMinutes).hour) : true,
      },
    };
  }
}
