import {
  GENDERS,
  LAGOS_ETHNIC_MIX,
  NPC_OCCUPATIONS,
  PARENT_OCCUPATIONS,
  VENUE_AGE_RANGES,
  VENUE_TRAITS,
  generateName,
  pickTraits,
  type BackgroundId,
  type Ethnicity,
  type Gender,
  type NpcOccupationDefinition,
  type OccupationDefinition,
  type PersonName,
  type PersonTrait,
  type Rng,
  type VenueType,
} from '@insidelife/shared';

export interface StrangerProfile {
  readonly age: number;
  readonly gender: Gender;
  readonly ethnicity: Ethnicity;
  readonly name: PersonName;
  readonly occupation: OccupationDefinition;
  readonly traits: readonly PersonTrait[];
  /** Single and looking. */
  readonly available: boolean;
}

/** Youngest anyone you meet out and about can be. */
export const MIN_STRANGER_AGE = 17;

/**
 * Age-appropriate age range for someone you meet: the venue's crowd, narrowed around your own age (a few years
 * younger to a few more years older). Falls back to the venue's crowd when the two don't overlap.
 */
export function strangerAgeRange(venueType: VenueType, selfAge: number): readonly [number, number] {
  const [low, high] = VENUE_AGE_RANGES[venueType] ?? [18, 50];
  const min = Math.max(MIN_STRANGER_AGE, low, selfAge - 5);
  const max = Math.min(high, selfAge + 8);
  if (min <= max) return [min, max];
  const fallbackMin = Math.max(MIN_STRANGER_AGE, low);
  return [fallbackMin, Math.max(fallbackMin, high)];
}

const STUDENT: NpcOccupationDefinition = NPC_OCCUPATIONS[0] ?? {
  id: 'student',
  title: 'Undergraduate',
  wealth: 'sapa',
  monthlyIncome: 0,
  minAge: 17,
  maxAge: 26,
  venueTypes: [],
};

/** Occupation for someone of this age, preferring jobs whose people hang out at this kind of venue. */
export function occupationFor(rng: Rng, age: number, venueType: VenueType | null): OccupationDefinition {
  const fitting = NPC_OCCUPATIONS.filter((occupation) => age >= occupation.minAge && age <= occupation.maxAge);
  const local = venueType ? fitting.filter((occupation) => occupation.venueTypes.includes(venueType)) : [];
  const pool = local.length > 0 && rng.chance(0.75) ? local : fitting;
  return pool.length > 0 ? rng.pick(pool) : STUDENT;
}

/** Chance someone is single and looking, by age. */
export function availabilityChance(age: number): number {
  if (age < 26) return 0.85;
  if (age < 35) return 0.6;
  return 0.35;
}

/** A person you meet at a venue: deterministic for a given RNG. */
export function strangerProfile(rng: Rng, venueType: VenueType, selfAge: number, minStatus = 0): StrangerProfile {
  const [min, max] = strangerAgeRange(venueType, selfAge);
  const age = rng.int(min, max);
  const gender = rng.pick(GENDERS);
  const ethnicity = rng.weighted(LAGOS_ETHNIC_MIX);
  const name = generateName(rng, ethnicity, gender);
  let occupation = occupationFor(rng, age, venueType);
  if (minStatus >= 250 && (occupation.wealth === 'sapa' || occupation.wealth === 'managing')) {
    occupation = { ...occupation, wealth: 'comfortable' };
  }
  const nudge = rng.chance(0.6) ? VENUE_TRAITS[venueType] : undefined;
  const traits = pickTraits(rng, rng.int(1, 2), nudge);
  return { age, gender, ethnicity, name, occupation, traits, available: rng.chance(availabilityChance(age)) };
}

/** A parent's job by the family's birth-lottery background. */
export function parentOccupation(rng: Rng, background: BackgroundId, gender: Gender): OccupationDefinition {
  return rng.pick(PARENT_OCCUPATIONS[background][gender]);
}

/** Sibling count weights by background (Sapa households are bigger). */
export const SIBLING_WEIGHTS: Readonly<Record<BackgroundId, readonly number[]>> = {
  'sapa-pikin': [1, 3, 4, 4],
  'working-class': [2, 4, 4, 2],
  ajebota: [2, 4, 3, 1],
  'nepo-baby': [3, 4, 2, 1],
};

export function siblingCount(rng: Rng, background: BackgroundId): number {
  return rng.weighted(SIBLING_WEIGHTS[background].map((weight, count) => ({ value: count, weight })));
}

/** What a sibling does at a given age. */
export function siblingOccupation(rng: Rng, age: number): OccupationDefinition {
  if (age < 12) return { title: 'Primary school pupil', wealth: 'sapa', monthlyIncome: 0 };
  if (age < 17) return { title: 'Secondary school student', wealth: 'sapa', monthlyIncome: 0 };
  return occupationFor(rng, age, null);
}
