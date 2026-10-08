import { MINUTES_PER_DAY, MINUTES_PER_MONTH, type ConditionId } from '@insidelife/shared';

/** `ctx.memo` keys for health state loaded within one character transaction. */
export const HEALTH_MEMO = {
  conditions: 'health:conditions',
  profile: 'health:profile',
  admission: 'health:admission',
  pregnancy: 'health:pregnancy',
  hmo: 'health:hmo',
} as const;

/** Prefix of `ActivityState.targetId` for the `treatment` system action. */
export const TREATMENT_TARGET = {
  condition: 'treat:',
  antenatal: 'antenatal:',
  checkUp: 'check-up',
} as const;

/** Chronic medication is bought a month at a time. */
export const MEDICATION_PERIOD = 30 * MINUTES_PER_DAY;

/** Chance per day that neighbours rush a critically ill (watched-over) character to hospital, if a deposit can be raised. */
export const RESCUE_CHANCE = 0.35;

/**
 * Offline safety net ("loss that teaches, not punishes"): while the player isn't watching, the character looks after
 * themselves — mild malaria/typhoid after a couple of days, anything moderate after a day — and anything severe or
 * critical gets them admitted to the nearest public hospital (family pays if they can't, then charity).
 */
export const AUTOPILOT_MILD_AFTER_DAYS = 2;
export const AUTOPILOT_MODERATE_AFTER_DAYS = 1;
/** Mild conditions worth a pharmacy trip on autopilot (the rest usually clear by themselves). */
export const AUTOPILOT_MILD_CONDITIONS: readonly ConditionId[] = ['malaria', 'typhoid'];
/** Family pays for an emergency at most this often; after that, public-hospital charity care waives the bill. */
export const FAMILY_RESCUE_COOLDOWN = MINUTES_PER_MONTH;
/** The sting of a charity ward: mood and "man know man" connections. */
export const CHARITY_MOOD_PENALTY = -8;
export const CHARITY_CONNECTIONS_PENALTY = 3;

/** Critical-stage warnings the player must have seen live before an untreated illness can prove fatal. */
export const MIN_WARNINGS_SEEN = 2;
/** Below this age a natural death never happens while the player is away. */
export const OFFLINE_NATURAL_DEATH_MIN_AGE = 55;

/** Patients are discharged mid-morning. */
export const DISCHARGE_MINUTE_OF_DAY = 10 * 60;

/** Partner age assumed for pregnancy risk when the family domain can't tell us. */
export const DEFAULT_PARTNER_AGE = 30;
