'use client';

import { useCallback } from 'react';
import {
  NEED_KEYS,
  SKILL_LABELS,
  findVenue,
  formatNaira,
  isVenueOpen,
  toDateParts,
  type ActionDefinition,
  type CharacterSnapshotDto,
  type SkillKey,
  type Skills,
  type VenueDefinition,
} from '@insidelife/shared';
import { useGameMinute, useWorldState } from '@/common/game/use-game-clock';
import { actionPrice, actionPriceNote, isBusy } from './place-actions';
import type { PlaceService } from './services';

/**
 * Can the player do an action here, right now — and if not, why not? The same rules the server applies when an action
 * starts (open hours, age, skills, money, one thing at a time) plus clout where a place asks for it, so the venue
 * sheet and the world's hotspots grey out the same things with the same reasons. Items you need (a TV, a laptop) are
 * left to the server, which knows your shop items and businesses. Pure apart from the hook.
 */

export interface ActionContext {
  readonly balance: number;
  readonly age: number;
  readonly status: number;
  readonly skills: Skills | null;
  /** The venue you're in (null at home or on a visit). */
  readonly venue: VenueDefinition | null;
  /** Hour of day (0-23). */
  readonly hour: number;
  readonly priceIndex: number;
  readonly pantryMeals: number;
  /** Something you chose is running. */
  readonly busy: boolean;
}

export interface ActionAvailability {
  readonly available: boolean;
  /** Why not, in a few words ("Closed now · opens 2 PM", "18+ only", "Not enough money"). */
  readonly reason: string | null;
  /** ₦ per run now. */
  readonly price: number;
  /** "₦18,000", "from your kitchen", "" when free. */
  readonly priceNote: string;
}

/** Previews without a session: everything allowed, prices at the base index. */
export const OPEN_CONTEXT: ActionContext = {
  balance: Number.POSITIVE_INFINITY,
  age: 30,
  status: 100,
  skills: null,
  venue: null,
  hour: 12,
  priceIndex: 1,
  pantryMeals: 0,
  busy: false,
};

/** "2 PM", "midnight", "2 AM" for an hour that may run past 24 (late-night closing). */
export function formatHour(hour: number): string {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  if (h === 0) return 'midnight';
  if (h === 12) return 'noon';
  return `${h % 12} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Clout a place or an action asks for (VIP tables, members' clubs), when the catalog sets one. */
function minStatusOf(action: ActionDefinition, venue: VenueDefinition | null): number {
  const forAction = (action.requires as { readonly minStatus?: number } | undefined)?.minStatus ?? 0;
  const forVenue = (venue as { readonly minStatus?: number } | null)?.minStatus ?? 0;
  return Math.max(forAction, forVenue);
}

export function actionAvailability(action: ActionDefinition, context: ActionContext): ActionAvailability {
  const price = actionPrice(action, context.priceIndex);
  const priceNote = actionPriceNote(action, context.priceIndex, context.pantryMeals);
  const no = (reason: string): ActionAvailability => ({ available: false, reason, price, priceNote });
  if (context.busy) return no('Finish what you’re doing first');
  // Do-anywhere actions (scrolling, calling family) don't care where you are: a closed venue's hours and door
  // policy are not theirs (the server skips the place checks for them too).
  const anywhere = action.where.anywhere === true;
  const venue = anywhere ? null : context.venue;
  if (venue?.hours && !isVenueOpen(venue, context.hour))
    return no(`Closed now · opens ${formatHour(venue.hours[0])}`);
  const status = minStatusOf(action, venue);
  if (context.status < status) return no(`Needs status ${status}+`);
  const requires = action.requires;
  if (requires?.minAge !== undefined && context.age < requires.minAge) return no(`${requires.minAge}+ only`);
  if (context.skills) {
    for (const [skill, minimum] of Object.entries(requires?.minSkill ?? {}) as Array<[SkillKey, number]>) {
      if (context.skills[skill] < minimum)
        return no(`Needs ${SKILL_LABELS[skill].toLowerCase()} ${minimum}+`);
    }
  }
  const paidFromKitchen = action.usesPantry === true && context.pantryMeals > 0;
  if (!paidFromKitchen && price > context.balance) return no(`Not enough money (${formatNaira(price)})`);
  return { available: true, reason: null, price, priceNote };
}

/**
 * Can the player use a place service (browse cars, see a doctor…) now? Services follow the venue's opening hours like
 * actions do: shown, but greyed out with "Closed now · opens 8 AM" rather than hidden. Nothing is charged by a service
 * itself (the app it opens handles money), so hours are the only rule.
 */
export function serviceAvailability(
  _service: PlaceService,
  context: Pick<ActionContext, 'venue' | 'hour'>,
): ActionAvailability {
  const { venue, hour } = context;
  if (venue?.hours && !isVenueOpen(venue, hour))
    return { available: false, reason: `Closed now · opens ${formatHour(venue.hours[0])}`, price: 0, priceNote: '' };
  return { available: true, reason: null, price: 0, priceNote: '' };
}

/** The context for the player's snapshot (or the open preview context without one). */
export function actionContextOf(
  snapshot: CharacterSnapshotDto | undefined,
  minute: number,
  priceIndex: number,
): ActionContext {
  if (!snapshot) return { ...OPEN_CONTEXT, priceIndex };
  const { character } = snapshot;
  return {
    balance: snapshot.wallet.balance,
    age: character.age,
    status: character.status,
    skills: character.skills,
    venue: findVenue(character.locationId) ?? null,
    hour: toDateParts(minute).hour,
    priceIndex,
    pantryMeals: snapshot.summary.pantryMeals,
    busy: isBusy(snapshot, minute),
  };
}

/** `actionAvailability` for the player where they are now (re-evaluated as the game clock moves). */
export function useActionAvailability(
  snapshot: CharacterSnapshotDto | undefined,
): (entry: ActionDefinition | PlaceService) => ActionAvailability {
  const minute = useGameMinute(5000);
  const priceIndex = useWorldState().data?.economy.priceIndex ?? 1;
  return useCallback(
    (entry: ActionDefinition | PlaceService) => {
      const context = actionContextOf(snapshot, minute, priceIndex);
      return 'opens' in entry ? serviceAvailability(entry, context) : actionAvailability(entry, context);
    },
    [snapshot, minute, priceIndex],
  );
}

const NEED_WORDS: Readonly<Record<(typeof NEED_KEYS)[number], string>> = {
  energy: 'Energy',
  hunger: 'Food',
  hygiene: 'Hygiene',
  fun: 'Fun',
  social: 'Social',
};

/**
 * What an action does to you, in a few words for its card: needs it fills or drains ("Fun ↑", "Energy ↓"), skills it
 * trains, fitness and status. At most `max` items, needs first.
 */
export function actionEffects(action: ActionDefinition, max = 4): string[] {
  const effects: string[] = [];
  for (const need of NEED_KEYS) {
    const drift = action.drift[need];
    if (drift) effects.push(`${NEED_WORDS[need]} ${drift.target >= 50 ? '↑' : '↓'}`);
  }
  for (const skill of Object.keys(action.skillXpPerHour ?? {}) as SkillKey[])
    effects.push(`${SKILL_LABELS[skill]} +`);
  if (action.fitnessPerHour) effects.push('Fitness +');
  if (action.statusOnComplete) effects.push(`Status +${action.statusOnComplete}`);
  return effects.slice(0, max);
}
