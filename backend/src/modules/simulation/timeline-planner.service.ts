import { Injectable } from '@nestjs/common';
import {
  MINUTES_PER_DAY,
  INTERSTATE_BUS,
  MINUTES_PER_HOUR,
  TRANSPORT,
  actionProfile,
  awayProfile,
  AUTOPILOT_TARGET,
  COLLAPSE_TARGET,
  HABIT_TARGET,
  cityOfDistrict,
  cityOfVenue,
  commuteProfile,
  driftNeed,
  HABIT_MIN_ENERGY,
  habitRunsOn,
  findAction,
  findVenue,
  hospitalProfile,
  homeMealProfile,
  idleHomeProfile,
  idleOutProfile,
  isHomeLocation,
  isStreetLocation,
  lectureProfile,
  streetDistrict,
  quoteTrip,
  sleepProfile,
  startOfDay,
  toDateParts,
  workProfile,
  homeLocationId,
  type CityId,
  type DistrictId,
  type GameMinute,
  type NeedDrift,
  type NeedProfile,
  type ProfileContext,
  type TransportMode,
  type TravelMode,
} from '@insidelife/shared';
import type { ActivityState, TravelState } from '../characters/entities/character.entity.js';
import { CharacterEntity } from '../characters/entities/character.entity.js';
import type { Residence, ScheduleBlock, Segment } from './interfaces/simulation-system.interface.js';
import { unmetRequirement } from './action-requirements.js';
import type { SimulationContext } from './simulation-context.js';
import { hookProfiler } from './hook-profiler.js';
import { presentUntil } from './player-presence.js';
import { COLLAPSE_SLEEP_MINUTES, collapseDueAt, restedThrough } from './rest.js';
import { SimulationRegistry } from './simulation-registry.service.js';

/** Sleep window: 23:00 → 06:30. */
const SLEEP_START_MINUTE = 23 * MINUTES_PER_HOUR;
const WAKE_MINUTE = 6 * MINUTES_PER_HOUR + 30;
/** With an early start tomorrow (a 05:00 danfo shift), bedtime moves earlier to protect this much sleep… */
const SLEEP_NEED_MINUTES = 7 * MINUTES_PER_HOUR + 30;
/** …but never before dinner is done. */
const EARLIEST_BEDTIME_MINUTE = 20 * MINUTES_PER_HOUR + 30;
/** Running on empty after the earliest bedtime sends the character to bed (a 12-hour shift ends the evening early). */
const EXHAUSTED_ENERGY = 20;
/** At home and hungrier than this, the character eats — whatever the clock says (late home from a long commute). */
const HUNGRY = 45;
const MEAL_MINUTES = 30;
/** A meal squeezed in before leaving must be at least this long to be worth it. */
const MIN_MEAL_MINUTES = 10;
/** A routine commute never takes longer than this (the character finds a faster way or gives up waiting). */
const MAX_LOCAL_COMMUTE_MINUTES = 75;
/** A shift that covers 01:00–04:00 is a night shift; the worker then sleeps this long once home. */
const NIGHT_SHIFT_CORE_START = 1 * MINUTES_PER_HOUR;
const NIGHT_SHIFT_CORE_END = 4 * MINUTES_PER_HOUR;
const NIGHT_SHIFT_RECOVERY_MINUTES = 8 * MINUTES_PER_HOUR + 30;
/** Autopilot mealtimes at home (minute of day, duration). Out exploring, you feed yourself. */
const MEAL_WINDOWS: ReadonlyArray<{ readonly start: number; readonly minutes: number; readonly label: string }> = [
  { start: 7 * MINUTES_PER_HOUR, minutes: 30, label: 'Breakfast at home' },
  { start: 13 * MINUTES_PER_HOUR, minutes: 30, label: 'Lunch at home' },
  { start: 19 * MINUTES_PER_HOUR + 30, minutes: 30, label: 'Dinner at home' },
];

/** The mutable bits of a character the planner reasons about (lets us dry-run the future without side effects). */
export interface PlanState {
  locationId: string;
  cityId: CityId;
  travel: TravelState | null;
  activity: ActivityState | null;
  /** Energy and hunger at the planning instant (exhaustion → bed, hunger → a meal at home). */
  energy: number;
  hunger: number;
  /** End of the last real sleep: ten game days past it the character collapses (see `rest.ts`). */
  lastSleptAt: GameMinute;
  /**
   * First game minute the player is no longer at the controls (`player-presence.ts`). Before it the autopilot starts
   * nothing: no routine sleep, meals, habits or trips; the player decides. +∞ in a dry run for a player who's present.
   */
  presentUntil: GameMinute;
}

export type PlanStep =
  | { readonly type: 'segment'; readonly segment: Segment }
  | { readonly type: 'depart'; readonly travel: TravelState; readonly reason: string }
  /**
   * Start an autopilot activity: sleep (until the alarm), a meal or a habit session, or a collapse. Running them as
   * activities means a decision sticks until it's done (no waking up because energy recovered mid-sleep). Players can
   * replace the routine ones; a collapse can't be cut short.
   */
  | { readonly type: 'begin'; readonly activity: ActivityState };

/** A habit window with less than this left isn't worth starting. */
const MIN_HABIT_SESSION_MINUTES = 15;

export interface Place {
  readonly districtId: DistrictId;
  readonly cityId: CityId;
}

export interface CommuteQuote {
  readonly mode: TravelMode;
  readonly minutes: number;
  readonly fare: number;
  readonly intercity: boolean;
}

/**
 * Decides what the character is doing at any moment: an explicit action, a trip, a routine block (work, lectures,
 * hospital, trip abroad), sleep, or idling — and when a routine commute must start.
 *
 * Two modes, by `PlanState.presentUntil`: while the player is at the controls nothing starts on its own and the
 * character never moves by itself (they work a shift only if they're at the workplace); once they're away the
 * autopilot runs the routine (commutes, meals, bed, habits). In both, ten game days without a real sleep end in a
 * collapse (`rest.ts`). Every decision depends only on the state and `t`, and every segment ends at the next moment a
 * decision could change, so settling a span in one go or in chunks gives the same result.
 */
@Injectable()
export class TimelinePlanner {
  constructor(private readonly registry: SimulationRegistry) {}

  stateOf(ctx: SimulationContext): PlanState {
    const character = ctx.character;
    return {
      locationId: character.locationId,
      cityId: character.cityId,
      travel: character.travel,
      activity: character.activity,
      energy: character.needs.energy,
      hunger: character.needs.hunger,
      lastSleptAt: character.lastSleptAt ?? character.settledAt,
      presentUntil: presentUntil(character, ctx.world.clock),
    };
  }

  async next(ctx: SimulationContext, state: PlanState, t: GameMinute, horizon: GameMinute): Promise<PlanStep> {
    const profiles = await this.profileContext(ctx, t);

    if (state.travel && state.travel.arriveAt > t) {
      const destination = await this.placeLabel(ctx, state.travel.toLocationId);
      if (state.travel.mode === 'flight' || state.travel.mode === 'coach') {
        const label = state.travel.mode === 'flight' ? `In the air to ${destination}` : `On the coach to ${destination}`;
        return this.segment('flight', t, Math.min(state.travel.arriveAt, horizon), state.travel.toLocationId, label, true, commuteProfile(profiles, state.travel.mode));
      }
      return this.segment('commute', t, Math.min(state.travel.arriveAt, horizon), state.travel.toLocationId, `Heading to ${destination}`, true, commuteProfile(profiles, state.travel.mode));
    }

    // Ten days without a real sleep: the body takes over, indoors, as soon as nothing you chose is running.
    const collapseAt = collapseDueAt(state.lastSleptAt);
    if (t >= collapseAt && this.canCollapse(state, t) && !(await this.restingBlockAt(ctx, t))) {
      return { type: 'begin', activity: { actionId: 'sleep', startedAt: t, endsAt: t + COLLAPSE_SLEEP_MINUTES, locationId: state.locationId, targetId: COLLAPSE_TARGET, cost: 0 } };
    }
    /** Segments a collapse may cut short end when it's due. */
    const collapseBoundary = collapseAt > t ? collapseAt : Number.POSITIVE_INFINITY;

    if (state.activity && state.activity.endsAt > t) {
      const activity = state.activity;
      const action = findAction(activity.actionId);
      const end = Math.min(activity.endsAt, horizon);
      if (action && activity.targetId === COLLAPSE_TARGET) {
        return this.segment('sleep', t, end, activity.locationId, 'Collapsed from exhaustion', false, sleepProfile(profiles));
      }
      if (action && activity.targetId === AUTOPILOT_TARGET) {
        if (action.id === 'sleep') {
          const afterNightShift = this.nightShiftRecovery(await this.blocksAround(ctx, t), t) !== null;
          return this.segment('sleep', t, end, activity.locationId, afterNightShift ? 'Sleeping after the night shift' : 'Sleeping', false, sleepProfile(profiles));
        }
        return this.segment('action', t, end, activity.locationId, 'Eating at home', false, homeMealProfile(profiles), action.id);
      }
      if (action?.id === 'hang-around') {
        // Just arrived somewhere: a shift or lecture here takes over (you came to work), and a collapse cuts it short.
        const blocks = await this.blocksAround(ctx, t);
        const here = blocks.filter((block) => block.commute && block.locationId === state.locationId && block.endsAt > t);
        const running = here.find((block) => block.startsAt <= t);
        if (running) return this.routineSegment(running, blocks, t, Math.min(horizon, activity.endsAt, collapseBoundary), profiles);
        const nextHere = Math.min(...here.map((block) => block.startsAt));
        const atHome = state.locationId === (await this.localResidence(ctx, state, t)).locationId;
        return this.segment('action', t, Math.min(end, nextHere, collapseBoundary), activity.locationId, action.verb, true, actionProfile(action, atHome, profiles), action.id);
      }
      if (action) {
        const atHome = state.locationId === (await this.localResidence(ctx, state, t)).locationId;
        return this.segment('action', t, end, activity.locationId, action.verb, true, actionProfile(action, atHome, profiles), action.id);
      }
    }

    const residence = await this.localResidence(ctx, state, t);
    const blocks = await this.blocksAround(ctx, t);
    const current = this.blockAt(blocks, t);

    // Trips abroad and hospital admissions place the character directly (no commute).
    if (current && !current.commute) {
      return this.segment(current.kind, t, Math.min(current.endsAt, horizon), current.locationId, current.label, false, current.kind === 'hospital' ? hospitalProfile() : awayProfile(profiles));
    }

    // Heading to (or already at) the next routine block. A player at the controls makes their own way there.
    const present = t < state.presentUntil;
    const upcoming = blocks.find((block) => block.commute && block.endsAt > t);
    if (upcoming) {
      if (state.locationId !== upcoming.locationId) {
        if (!present) {
          const quote = await this.quote(ctx, state.locationId, upcoming.locationId, ctx.character.defaultTransport, t);
          const leaveAt = upcoming.startsAt - quote.minutes;
          // The autopilot never crosses between cities: a shift in the other city is missed, the player decides.
          if (!quote.intercity && t >= leaveAt) return this.depart(state, upcoming.locationId, quote, t, `Commute to ${upcoming.label}`);
        }
      } else if (upcoming.startsAt <= t) {
        return this.routineSegment(upcoming, blocks, t, Math.min(horizon, collapseBoundary), profiles);
      }
    }

    const atHome = state.locationId === residence.locationId;
    if (present) {
      // At the controls: nothing starts on its own and nobody moves you — no bed, meals, habits or trips. Needs keep
      // drifting and the HUD nudges; the autopilot picks up from the moment the player is away.
      const profile = atHome ? idleHomeProfile(profiles) : idleOutProfile(profiles);
      const end = Math.max(t + 1, Math.min(horizon, state.presentUntil, collapseBoundary, this.nextBlockBoundary(blocks, t)));
      return this.segment('idle', t, end, state.locationId, atHome ? 'Chilling at home' : 'Hanging around', false, profile);
    }

    const dayStart = startOfDay(t);
    const minuteOfDay = t - dayStart;
    const nextLeave = upcoming && state.locationId !== upcoming.locationId
      ? await this.nextLeaveFor(ctx, state, upcoming, t)
      : upcoming && upcoming.startsAt > t
        ? upcoming.startsAt
        : Number.POSITIVE_INFINITY;
    const wakeToday = dayStart + this.wakeMinute(ctx.character, dayStart);
    const wakeTomorrow = dayStart + MINUTES_PER_DAY + this.wakeMinute(ctx.character, dayStart + MINUTES_PER_DAY);
    const bedtime = this.bedtime(dayStart, Math.min(nextLeave, wakeTomorrow));
    const earliestBedtime = dayStart + EARLIEST_BEDTIME_MINUTE;
    const exhausted = t >= earliestBedtime && state.energy < EXHAUSTED_ENERGY;
    const recoveryUntil = this.nightShiftRecovery(blocks, t);
    const sleeping = t >= bedtime || exhausted || t < wakeToday || recoveryUntil !== null;

    // Done with the routine for now: go home from the workplace/campus, or go home at bedtime.
    const atRoutinePlace = blocks.some((block) => block.commute && block.locationId === state.locationId && block.endsAt <= t);
    const nextHereSoon =
      upcoming !== undefined && upcoming.locationId === state.locationId && upcoming.startsAt - t <= 3 * MINUTES_PER_HOUR;
    if (state.locationId !== residence.locationId && (sleeping || atRoutinePlace) && !nextHereSoon) {
      const quote = await this.quote(ctx, state.locationId, residence.locationId, ctx.character.defaultTransport, t);
      if (!quote.intercity) return this.depart(state, residence.locationId, quote, t, 'Going home');
    }

    // Home and hungry: eat first — breakfast before an early commute, dinner after a late one, a bite before bed.
    if (atHome && state.hunger < HUNGRY) {
      const endsAt = Math.min(t + MEAL_MINUTES, nextLeave);
      if (endsAt - t >= MIN_MEAL_MINUTES) return this.autopilot('home-meal', t, endsAt, residence.locationId);
    }

    if (sleeping && atHome) {
      const alarm = recoveryUntil ?? (t < wakeToday ? wakeToday : wakeTomorrow);
      return this.autopilot('sleep', t, Math.max(t + 1, Math.min(alarm, nextLeave)), residence.locationId);
    }

    if (atHome) {
      const meal = MEAL_WINDOWS.find((window) => minuteOfDay >= window.start && minuteOfDay < window.start + window.minutes);
      if (meal) {
        const mealEnd = startOfDay(t) + meal.start + meal.minutes;
        return this.segment('action', t, Math.min(mealEnd, horizon, nextLeave, collapseBoundary), residence.locationId, meal.label, false, homeMealProfile(profiles), 'home-meal');
      }
      const habit = await this.habitSession(ctx, state, t, Math.min(bedtime, nextLeave));
      if (habit) return { type: 'begin', activity: habit };
    }
    const nextMeal = atHome
      ? MEAL_WINDOWS.map((window) => startOfDay(t) + window.start).find((start) => start > t) ?? Number.POSITIVE_INFINITY
      : Number.POSITIVE_INFINITY;
    const profile = atHome ? idleHomeProfile(profiles) : idleOutProfile(profiles);
    const exhaustion = this.crossesBelow(state.energy, profile.energy, EXHAUSTED_ENERGY, Math.max(t, earliestBedtime));
    const nextBedtime = Math.min(t < bedtime ? bedtime : Number.POSITIVE_INFINITY, exhaustion > t ? exhaustion : Number.POSITIVE_INFINITY);
    const nextHabit = atHome ? this.nextHabitStart(ctx.character, t) : Number.POSITIVE_INFINITY;
    const hungry = atHome ? this.crossesBelow(state.hunger, profile.hunger, HUNGRY, t) : Number.POSITIVE_INFINITY;
    const nextHunger = hungry > t ? hungry : Number.POSITIVE_INFINITY;
    const end = Math.max(t + 1, Math.min(horizon, nextLeave, nextBedtime, nextMeal, nextHabit, nextHunger, collapseBoundary, this.nextBlockBoundary(blocks, t)));
    return this.segment('idle', t, end, state.locationId, atHome ? 'Chilling at home' : 'Hanging around', false, profile);
  }

  /**
   * Plan the next `minutes` without side effects (for the snapshot timeline the client animates). A player at the
   * controls is assumed to keep playing: the client keeps reporting in, and refetches when it stops.
   */
  async plan(ctx: SimulationContext, from: GameMinute, minutes: number): Promise<Segment[]> {
    const state = this.stateOf(ctx);
    if (state.presentUntil > from) state.presentUntil = Number.POSITIVE_INFINITY;
    const until = from + minutes;
    const segments: Segment[] = [];
    let t = from;
    for (let guard = 0; t < until && guard < 96; guard++) {
      const horizon = Math.min(until, startOfDay(t) + MINUTES_PER_DAY);
      const step = await this.next(ctx, state, t, horizon);
      if (step.type === 'depart') {
        state.travel = step.travel;
        state.activity = null;
        continue;
      }
      if (step.type === 'begin') {
        state.activity = step.activity;
        continue;
      }
      const { segment } = step;
      const previous = segments[segments.length - 1];
      if (previous && previous.kind === segment.kind && previous.locationId === segment.locationId && previous.actionId === segment.actionId && previous.endsAt === segment.startsAt) {
        segments[segments.length - 1] = { ...previous, endsAt: segment.endsAt };
      } else {
        segments.push(segment);
      }
      state.lastSleptAt = restedThrough(segment, state.activity, state.lastSleptAt);
      const hours = (segment.endsAt - segment.startsAt) / MINUTES_PER_HOUR;
      state.energy = driftNeed(state.energy, segment.profile.energy, hours);
      state.hunger = driftNeed(state.hunger, segment.profile.hunger, hours);
      t = segment.endsAt;
      if (state.activity && t >= state.activity.endsAt) state.activity = null;
      if (state.travel && t >= state.travel.arriveAt) {
        state.locationId = state.travel.toLocationId;
        state.cityId = (await this.place(ctx, state.locationId)).cityId;
        state.travel = null;
      }
    }
    return segments;
  }

  /**
   * Where the character beds down tonight: their residence, unless it is in the other city. Then they stay put wherever
   * they are (a hotel by the airport, a friend's sofa): there is no autopilot trip between cities, so a traveller still
   * sleeps and eats instead of idling until they collapse.
   */
  async localResidence(ctx: SimulationContext, state: Pick<PlanState, 'locationId' | 'cityId' | 'travel'>, t: GameMinute): Promise<Residence> {
    const base = await this.residence(ctx, t);
    if (base.cityId === state.cityId || state.travel || isStreetLocation(state.locationId)) return base;
    return { ...base, locationId: state.locationId, cityId: state.cityId, label: 'Staying here' };
  }

  /** When the autopilot must leave for a routine block (∞ when it is in the other city: it never travels between cities). */
  private async nextLeaveFor(ctx: SimulationContext, state: PlanState, upcoming: ScheduleBlock, t: GameMinute): Promise<GameMinute> {
    const quote = await this.quote(ctx, state.locationId, upcoming.locationId, ctx.character.defaultTransport, t);
    return quote.intercity ? Number.POSITIVE_INFINITY : upcoming.startsAt - quote.minutes;
  }

  async residence(ctx: SimulationContext, t: GameMinute): Promise<Residence> {
    const day = Math.floor(t / MINUTES_PER_DAY);
    return ctx.memo(`residence:${day}`, async () => {
      let best: Residence | null = null;
      for (const system of this.registry.all) {
        const offer = system.residence ? await hookProfiler.time(`${system.key}.residence`, () => system.residence!(ctx, t)) : null;
        if (offer && (best === null || (offer.priority ?? 10) >= (best.priority ?? 10))) best = offer;
      }
      if (best) return best;
      return {
        locationId: homeLocationId(ctx.character.id),
        districtId: ctx.character.homeDistrictId,
        cityId: cityOfDistrict(ctx.character.homeDistrictId),
        label: 'Home',
      };
    });
  }

  async profileContext(ctx: SimulationContext, t: GameMinute): Promise<ProfileContext> {
    const day = Math.floor(t / MINUTES_PER_DAY);
    return ctx.memo(`profile-context:${day}`, async () => {
      let profile: ProfileContext = { comfort: 50, bedQuality: 0.2, jobStress: 0, energyCap: 100 };
      for (const system of this.registry.all) {
        if (system.profileContext) profile = await hookProfiler.time(`${system.key}.profileContext`, () => system.profileContext!(ctx, profile));
      }
      return { ...profile, comfort: Math.max(5, Math.min(95, profile.comfort)) };
    });
  }

  async place(ctx: SimulationContext, locationId: string): Promise<Place> {
    const street = streetDistrict(locationId);
    if (street) return { districtId: street, cityId: cityOfDistrict(street) };
    if (isHomeLocation(locationId)) {
      const ownerId = locationId.slice('home:'.length);
      if (ownerId === ctx.character.id) return { districtId: ctx.character.homeDistrictId, cityId: cityOfDistrict(ctx.character.homeDistrictId) };
      return ctx.memo(`home-district:${ownerId}`, async () => {
        const owner = await ctx.manager.findOne(CharacterEntity, { where: { id: ownerId }, select: { id: true, homeDistrictId: true } });
        const districtId = owner?.homeDistrictId ?? 'yaba';
        return { districtId, cityId: cityOfDistrict(districtId) };
      });
    }
    const venue = findVenue(locationId);
    const districtId = venue?.districtId ?? ctx.character.homeDistrictId;
    return { districtId, cityId: venue ? cityOfVenue(venue) : cityOfDistrict(districtId) };
  }

  async placeLabel(ctx: SimulationContext, locationId: string): Promise<string> {
    const street = streetDistrict(locationId);
    if (street) return 'the streets';
    if (isHomeLocation(locationId)) return locationId === homeLocationId(ctx.character.id) ? 'home' : 'a friend’s place';
    return findVenue(locationId)?.name ?? 'somewhere';
  }

  /** Quote a trip between two locations at time `t`, falling back to danfo when the preferred mode can't do it. */
  async quote(ctx: SimulationContext, from: string, to: string, preferred: TransportMode, t: GameMinute): Promise<CommuteQuote> {
    // One at a time: these share the session's transaction connection (pg runs one query at a time).
    const a = await this.place(ctx, from);
    const b = await this.place(ctx, to);
    const economy = ctx.world.economy(t);
    if (a.cityId !== b.cityId) {
      // Between cities there are no roads: only the interstate coach (or a flight) goes. The autopilot never takes it.
      const fare = INTERSTATE_BUS.fare * economy.priceIndex * economy.fareMultiplier;
      return { mode: 'coach', minutes: Math.round(INTERSTATE_BUS.hours * MINUTES_PER_HOUR + 30), fare: Math.round(fare / 50) * 50, intercity: true };
    }

    const parts = toDateParts(t);
    const conditions = {
      hour: parts.hour,
      weekend: parts.weekday >= 5,
      raining: ctx.world.weather(t).raining,
      priceIndex: economy.priceIndex,
      fareMultiplier: economy.fareMultiplier,
    };
    const tags = await this.itemTags(ctx);
    const candidates: TransportMode[] = [preferred === 'car' && !tags.includes('car') ? 'danfo' : preferred, 'danfo', 'walk'];
    for (const mode of candidates) {
      if (TRANSPORT[mode].requiresVehicle && !tags.includes('car')) continue;
      const trip = quoteTrip(a.districtId, b.districtId, mode, conditions);
      if (trip.allowed) return { mode, minutes: Math.min(trip.minutes, MAX_LOCAL_COMMUTE_MINUTES), fare: trip.fare, intercity: false };
    }
    return { mode: 'walk', minutes: 15, fare: 0, intercity: false };
  }

  async itemTags(ctx: SimulationContext): Promise<readonly string[]> {
    return ctx.memo('item-tags', async () => {
      const tags = new Set<string>();
      for (const system of this.registry.all) {
        if (!system.itemTags) continue;
        for (const tag of await hookProfiler.time(`${system.key}.itemTags`, () => system.itemTags!(ctx))) tags.add(tag);
      }
      return [...tags];
    });
  }

  /** Routine blocks touching the day of `t` (yesterday's overnight blocks included). */
  async blocksAround(ctx: SimulationContext, t: GameMinute): Promise<readonly ScheduleBlock[]> {
    const day = Math.floor(t / MINUTES_PER_DAY);
    // One at a time: these share the session's transaction connection (pg runs one query at a time).
    const yesterday = await this.blocksForDay(ctx, day - 1);
    const today = await this.blocksForDay(ctx, day);
    const tomorrow = await this.blocksForDay(ctx, day + 1);
    return [...yesterday, ...today, ...tomorrow]
      .filter((block) => block.endsAt > t - MINUTES_PER_DAY && block.startsAt < t + MINUTES_PER_DAY)
      .toSorted((a, b) => a.startsAt - b.startsAt || b.priority - a.priority);
  }

  private async blocksForDay(ctx: SimulationContext, day: number): Promise<readonly ScheduleBlock[]> {
    return ctx.memo(`schedule:${day}`, async () => {
      const blocks: ScheduleBlock[] = [];
      for (const system of this.registry.all) {
        if (system.scheduleForDay) blocks.push(...(await hookProfiler.time(`${system.key}.scheduleForDay`, () => system.scheduleForDay!(ctx, day))));
      }
      return blocks;
    });
  }

  /**
   * Tonight's bedtime: 23:00 normally, earlier when tomorrow's commute leaves before the usual wake-up so an early
   * shift still gets a proper night's sleep.
   */
  private bedtime(dayStart: GameMinute, nextLeave: GameMinute): GameMinute {
    const usual = dayStart + SLEEP_START_MINUTE;
    const usualWake = dayStart + MINUTES_PER_DAY + WAKE_MINUTE;
    if (nextLeave <= usual || nextLeave >= usualWake) return usual;
    return Math.max(dayStart + EARLIEST_BEDTIME_MINUTE, nextLeave - SLEEP_NEED_MINUTES);
  }

  /** The habit session due at `t`, if the character can do it now (home, awake, energy to spare, requirements met). */
  private async habitSession(ctx: SimulationContext, state: PlanState, t: GameMinute, latestEnd: GameMinute): Promise<ActivityState | null> {
    const character = ctx.character;
    if (character.habits.length === 0 || state.energy < HABIT_MIN_ENERGY) return null;
    if (character.habitsPausedUntil !== null && t < character.habitsPausedUntil) return null;
    const dayStart = startOfDay(t);
    const weekday = toDateParts(t).weekday;
    for (const habit of character.habits) {
      if (!habitRunsOn(habit, weekday)) continue;
      const start = dayStart + habit.startMinute;
      const end = Math.min(start + habit.durationMinutes, latestEnd);
      if (t < start || end - t < MIN_HABIT_SESSION_MINUTES) continue;
      const action = findAction(habit.actionId);
      if (!action || unmetRequirement(action, { age: ctx.age, skills: character.skills, itemTags: await this.itemTags(ctx) })) continue;
      return { actionId: action.id, startedAt: t, endsAt: end, locationId: state.locationId, targetId: HABIT_TARGET, cost: 0 };
    }
    return null;
  }

  /** Start of the next habit window later today (so idle time ends exactly when a habit is due). */
  private nextHabitStart(character: CharacterEntity, t: GameMinute): GameMinute {
    const dayStart = startOfDay(t);
    const weekday = toDateParts(t).weekday;
    let next = Number.POSITIVE_INFINITY;
    for (const habit of character.habits) {
      const start = dayStart + habit.startMinute;
      if (start > t && habitRunsOn(habit, weekday)) next = Math.min(next, start);
    }
    return next;
  }

  /** Usual wake-up (06:30), or earlier on days a habit starts before that (a 5:30am workout). */
  private wakeMinute(character: CharacterEntity, dayStart: GameMinute): number {
    const weekday = toDateParts(dayStart).weekday;
    let wake = WAKE_MINUTE;
    for (const habit of character.habits) {
      if (habit.startMinute < wake && habitRunsOn(habit, weekday)) wake = habit.startMinute;
    }
    return wake;
  }

  /** When a need drifting under `drift` (from `from`) falls below `threshold` (∞ if it never does). */
  private crossesBelow(value: number, drift: NeedDrift, threshold: number, from: GameMinute): GameMinute {
    if (drift.target >= threshold || drift.rate <= 0) return Number.POSITIVE_INFINITY;
    if (value < threshold) return from;
    return from + Math.ceil(((value - threshold) / drift.rate) * MINUTES_PER_HOUR) + 1;
  }

  private autopilot(actionId: 'sleep' | 'home-meal', startedAt: GameMinute, endsAt: GameMinute, locationId: string): PlanStep {
    return { type: 'begin', activity: { actionId, startedAt, endsAt, locationId, targetId: AUTOPILOT_TARGET, cost: 0 } };
  }

  /**
   * Night-shift workers sleep in the day: after a block that ran through the small hours, the character gets a
   * recovery sleep window. Returns the end of that window when `t` falls inside it.
   */
  private nightShiftRecovery(blocks: readonly ScheduleBlock[], t: GameMinute): GameMinute | null {
    for (const block of blocks) {
      if (!block.commute || block.endsAt > t) continue;
      const endDay = startOfDay(block.endsAt);
      const coversSmallHours = block.startsAt < endDay + NIGHT_SHIFT_CORE_END && block.endsAt > endDay + NIGHT_SHIFT_CORE_START;
      if (!coversSmallHours) continue;
      const until = block.endsAt + NIGHT_SHIFT_RECOVERY_MINUTES;
      if (t < until) return until;
    }
    return null;
  }

  /** A collapse needs a place to fall (not the street, where the client drives the avatar) and nothing chosen running. */
  private canCollapse(state: PlanState, t: GameMinute): boolean {
    if (isStreetLocation(state.locationId)) return false;
    const activity = state.activity && state.activity.endsAt > t ? state.activity : null;
    return activity === null || activity.actionId === 'hang-around';
  }

  /** In hospital or away on a trip: resting already (those segments count as sleep). */
  private async restingBlockAt(ctx: SimulationContext, t: GameMinute): Promise<boolean> {
    const current = this.blockAt(await this.blocksAround(ctx, t), t);
    return current !== undefined && !current.commute;
  }

  /** Working the shift (or sitting the lectures) you're at, until it ends, a higher-priority block or `limit`. */
  private routineSegment(block: ScheduleBlock, blocks: readonly ScheduleBlock[], t: GameMinute, limit: GameMinute, profiles: ProfileContext): PlanStep {
    const profile = block.kind === 'work' ? workProfile(profiles) : lectureProfile(profiles);
    const end = Math.min(block.endsAt, limit, this.nextBlockStart(blocks, block, t) ?? Number.POSITIVE_INFINITY);
    return this.segment(block.kind, t, end, block.locationId, block.label, false, profile);
  }

  private blockAt(blocks: readonly ScheduleBlock[], t: GameMinute): ScheduleBlock | undefined {
    return blocks
      .filter((block) => block.startsAt <= t && t < block.endsAt)
      .toSorted((a, b) => b.priority - a.priority)[0];
  }

  private nextBlockStart(blocks: readonly ScheduleBlock[], current: ScheduleBlock, t: GameMinute): number | undefined {
    return blocks.find((block) => block !== current && block.priority > current.priority && block.startsAt > t)?.startsAt;
  }

  private nextBlockBoundary(blocks: readonly ScheduleBlock[], t: GameMinute): number {
    let next = Number.POSITIVE_INFINITY;
    for (const block of blocks) {
      if (block.startsAt > t) next = Math.min(next, block.startsAt);
      if (block.endsAt > t) next = Math.min(next, block.endsAt);
    }
    return next;
  }

  private depart(state: PlanState, to: string, quote: CommuteQuote, t: GameMinute, reason: string): PlanStep {
    return {
      type: 'depart',
      reason,
      travel: {
        fromLocationId: state.locationId,
        toLocationId: to,
        mode: quote.mode,
        departAt: t,
        arriveAt: t + Math.max(10, quote.minutes),
        fare: quote.fare,
      },
    };
  }

  private segment(
    kind: Segment['kind'],
    startsAt: GameMinute,
    endsAt: GameMinute,
    locationId: string,
    label: string,
    explicit: boolean,
    profile: NeedProfile,
    actionId?: string,
  ): PlanStep {
    return { type: 'segment', segment: { kind, startsAt, endsAt: Math.max(startsAt + 1, endsAt), locationId, label, explicit, profile, actionId } };
  }
}
