import type { NeedDrift, NeedKey, NeedProfile } from '../needs/needs.js';
import type { ActionDefinition } from '../catalog/actions.js';
import { TRANSPORT, type TransportMode } from '../catalog/transport.js';
import { ACTION_PACE } from './pacing.js';

/**
 * Need-drift profiles for every kind of activity. The server builds timeline segments with these; the client
 * receives them inside each segment and never needs this table directly (it is shared for tools and tests).
 */

export interface ProfileContext {
  /** Comfort equilibrium for idling at home (lifestyle + home + furniture + power), 0-100. */
  readonly comfort: number;
  /** 0-1: bed quality, speeds up sleep recovery. */
  readonly bedQuality: number;
  /** 0-1: job stress, drains energy and fun faster at work. */
  readonly jobStress: number;
  /** Mood/health conditions can cap energy (e.g. malaria): max energy target. */
  readonly energyCap: number;
  /** How full a meal at home leaves you (100; ~55 when completely broke — garri and sugar). */
  readonly mealTarget?: number;
}

export const DEFAULT_PROFILE_CONTEXT: ProfileContext = { comfort: 55, bedQuality: 0.3, jobStress: 0.4, energyCap: 100 };

const d = (target: number, rate: number): NeedDrift => ({ target, rate });
/** An action's own drift runs at `ACTION_PACE` (it lasts half the game minutes it did at ×120, same effect). */
const paced = (drift: NeedDrift): NeedDrift => ({ target: drift.target, rate: drift.rate * ACTION_PACE });

function capEnergy(profile: NeedProfile, cap: number): NeedProfile {
  if (cap >= 100) return profile;
  return { ...profile, energy: { target: Math.min(profile.energy.target, cap), rate: profile.energy.rate } };
}

/**
 * Idle at home. Hunger and energy run down steadily while awake — you have to eat and sleep; the lifestyle tier and
 * home comfort hold hygiene, fun and social near the household equilibrium.
 */
export function idleHomeProfile(ctx: ProfileContext): NeedProfile {
  const eq = ctx.comfort;
  return capEnergy(
    {
      energy: d(0, 3.6),
      hunger: d(0, 4.5),
      hygiene: d(Math.max(20, eq - 10), 2),
      fun: d(eq, 3),
      social: d(Math.max(0, eq - 12), 2),
    },
    ctx.energyCap,
  );
}

/** Idle out and about (at a venue, not doing anything in particular). */
export function idleOutProfile(ctx: ProfileContext): NeedProfile {
  return capEnergy(
    {
      energy: d(0, 4.2),
      hunger: d(0, 5),
      hygiene: d(35, 2.5),
      fun: d(50, 2),
      social: d(55, 2.5),
    },
    ctx.energyCap,
  );
}

/** A full rest is 3 game hours: from empty to full on a mat (34/h), faster on a good bed. */
export function sleepProfile(ctx: ProfileContext): NeedProfile {
  const recovery = 34 + ctx.bedQuality * 16;
  return capEnergy(
    {
      energy: d(100, recovery),
      hunger: d(0, 2),
      hygiene: d(35, 1.5),
      fun: d(50, 0.5),
      social: d(40, 0.5),
    },
    Math.max(ctx.energyCap, 60),
  );
}

export function workProfile(ctx: ProfileContext): NeedProfile {
  return capEnergy(
    {
      energy: d(15, 4 + ctx.jobStress * 4),
      hunger: d(35, 4),
      hygiene: d(40, 2.5),
      fun: d(25 - ctx.jobStress * 15, 2 + ctx.jobStress * 3),
      social: d(65, 3),
    },
    ctx.energyCap,
  );
}

export function lectureProfile(ctx: ProfileContext): NeedProfile {
  return capEnergy(
    {
      energy: d(25, 4.5),
      hunger: d(30, 4.5),
      hygiene: d(45, 2),
      fun: d(35, 2.5),
      social: d(70, 4),
    },
    ctx.energyCap,
  );
}

/** On the road. Rides take half the game minutes they did at ×120 (`pacedTripMinutes`), so they drift at the pace. */
export function commuteProfile(ctx: ProfileContext, mode: TransportMode): NeedProfile {
  const transport = TRANSPORT[mode];
  const energy = transport.energyPerHour < 0 ? d(0, -transport.energyPerHour) : d(100, transport.energyPerHour);
  const fun = transport.funPerHour < 0 ? d(0, -transport.funPerHour) : d(80, transport.funPerHour);
  return capEnergy(
    {
      energy: paced(energy),
      hunger: paced(d(20, 4)),
      hygiene: paced(d(30, mode === 'walk' || mode === 'okada' ? 6 : 3)),
      fun: paced(fun),
      social: paced(d(45, 1)),
    },
    ctx.energyCap,
  );
}

/** A routine meal at home (autopilot eats when idle at mealtimes; paid for by the lifestyle budget). */
export function homeMealProfile(ctx: ProfileContext): NeedProfile {
  return { ...idleHomeProfile(ctx), hunger: d(ctx.mealTarget ?? 100, 130), fun: d(Math.max(ctx.comfort, 55), 6) };
}

/** Away on a trip (vacation): everything trends high. */
export function awayProfile(ctx: ProfileContext): NeedProfile {
  return capEnergy({ energy: d(70, 4), hunger: d(80, 6), hygiene: d(80, 4), fun: d(95, 6), social: d(85, 4) }, ctx.energyCap);
}

export function hospitalProfile(): NeedProfile {
  return { energy: d(60, 4), hunger: d(55, 4), hygiene: d(60, 3), fun: d(15, 3), social: d(30, 2) };
}

/**
 * Action profile: start from the location's idle profile and apply the action's overrides, at `ACTION_PACE`. Sleep and
 * naps recover at the sleep rate; eating at home is the lifestyle budget's meal (broke: garri and sugar).
 */
export function actionProfile(action: ActionDefinition, atHome: boolean, ctx: ProfileContext): NeedProfile {
  if (action.id === 'sleep' || action.id === 'nap') {
    const base = sleepProfile(ctx);
    if (action.id === 'sleep') return base;
    return { ...idleHomeProfile(ctx), energy: base.energy };
  }
  if (action.id === 'home-meal') {
    const meal = homeMealProfile(ctx);
    return { ...meal, hunger: paced(meal.hunger), fun: paced(meal.fun) };
  }
  const base = atHome ? idleHomeProfile(ctx) : idleOutProfile(ctx);
  const pick = (key: NeedKey): NeedDrift => {
    const own = action.drift[key];
    return own ? paced(own) : base[key];
  };
  return capEnergy(
    { energy: pick('energy'), hunger: pick('hunger'), hygiene: pick('hygiene'), fun: pick('fun'), social: pick('social') },
    ctx.energyCap,
  );
}
