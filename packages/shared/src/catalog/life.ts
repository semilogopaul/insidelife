/**
 * Core life catalog: skills, lifestyle tiers, birth-lottery backgrounds, states of origin and status tiers.
 */

export const SKILL_KEYS = [
  'intellect',
  'tech',
  'finance',
  'medicine',
  'law',
  'engineering',
  'business',
  'creative',
  'charisma',
  'fitness',
  'cooking',
  'trade',
  'hustle',
] as const;
export type SkillKey = (typeof SKILL_KEYS)[number];
export type Skills = Readonly<Record<SkillKey, number>>;

export const SKILL_LABELS: Readonly<Record<SkillKey, string>> = {
  intellect: 'Book sense',
  tech: 'Tech',
  finance: 'Finance',
  medicine: 'Medicine',
  law: 'Law',
  engineering: 'Engineering',
  business: 'Business',
  creative: 'Creative',
  charisma: 'Charisma',
  fitness: 'Fitness',
  cooking: 'Cooking',
  trade: 'Handiwork',
  hustle: 'Street smarts',
};

export const SKILL_MAX = 100;

/**
 * Skill gain with diminishing returns: each point is harder than the last.
 * `xp` is the raw effort (e.g. hours × intensity × mood multiplier).
 */
export function applySkillXp(current: number, xp: number): number {
  if (xp <= 0) return current;
  const headroom = SKILL_MAX - current;
  const gain = xp * (0.35 + 0.65 * (headroom / SKILL_MAX));
  return Math.min(SKILL_MAX, current + gain);
}

export const LIFESTYLE_TIERS = ['sapa', 'managing', 'comfortable', 'soft-life', 'odogwu'] as const;
export type LifestyleTier = (typeof LIFESTYLE_TIERS)[number];

export interface LifestyleDefinition {
  readonly id: LifestyleTier;
  readonly label: string;
  readonly blurb: string;
  /** Base cost per game day before the world price index (₦). */
  readonly dailyCost: number;
  /** Needs equilibrium when idle at home (before home comfort bonus). */
  readonly comfort: number;
  /** Daily health drift contribution. */
  readonly healthDrift: number;
  /** Status points while maintained. */
  readonly status: number;
}

export const LIFESTYLES: Readonly<Record<LifestyleTier, LifestyleDefinition>> = {
  sapa: {
    id: 'sapa',
    label: 'Sapa mode',
    blurb: 'Garri, sachet water and prayers.',
    dailyCost: 2_500,
    comfort: 40,
    healthDrift: -0.4,
    status: 0,
  },
  managing: {
    id: 'managing',
    label: 'Managing',
    blurb: 'Rice on Sunday, bread on weekdays.',
    dailyCost: 6_000,
    comfort: 55,
    healthDrift: 0,
    status: 5,
  },
  comfortable: {
    id: 'comfortable',
    label: 'Comfortable',
    blurb: 'Groceries from Shoprite, Bolt when it rains.',
    dailyCost: 15_000,
    comfort: 68,
    healthDrift: 0.15,
    status: 20,
  },
  'soft-life': {
    id: 'soft-life',
    label: 'Soft life',
    blurb: 'Brunch, pilates and imported cereal.',
    dailyCost: 40_000,
    comfort: 80,
    healthDrift: 0.25,
    status: 60,
  },
  odogwu: {
    id: 'odogwu',
    label: 'Odogwu',
    blurb: 'Personal chef, driver and a generator that never sleeps.',
    dailyCost: 120_000,
    comfort: 88,
    healthDrift: 0.3,
    status: 140,
  },
};

/**
 * Every new character gets a one-off starter fund — enough for a Naija-used first car (or a keke business, or school
 * fees, or savings). It is unearned money, so it never counts toward the self-made rich list.
 */
export const STARTER_FUND = 4_000_000;

export const BACKGROUND_IDS = ['sapa-pikin', 'working-class', 'ajebota', 'nepo-baby'] as const;
export type BackgroundId = (typeof BACKGROUND_IDS)[number];

export interface BackgroundDefinition {
  readonly id: BackgroundId;
  readonly label: string;
  readonly blurb: string;
  /** Relative weight in the birth lottery. */
  readonly weight: number;
  readonly startingCash: number;
  /** Monthly allowance from parents until age 22 or graduation (₦). */
  readonly allowance: number;
  /** Whether parents pay the first session of public (or private) university fees. */
  readonly sponsorsFees: 'none' | 'public' | 'private';
  readonly homeDistrict: readonly string[];
  readonly homeComfort: number;
  /** Multipliers on skill gains. */
  readonly hustleGain: number;
  readonly studyGain: number;
  /** Average WAEC credits (out of 9). */
  readonly waecMean: number;
  readonly startingLifestyle: LifestyleTier;
  readonly startsWithCar: boolean;
}

export const BACKGROUNDS: Readonly<Record<BackgroundId, BackgroundDefinition>> = {
  'sapa-pikin': {
    id: 'sapa-pikin',
    label: 'Sapa Pikin',
    blurb: 'One room in Mushin, seven people, endless hustle. Family will ask YOU for money.',
    weight: 45,
    startingCash: 25_000,
    allowance: 0,
    sponsorsFees: 'none',
    homeDistrict: ['mushin', 'ikorodu', 'ojo'],
    homeComfort: 0,
    hustleGain: 1.25,
    studyGain: 1,
    waecMean: 5,
    startingLifestyle: 'sapa',
    startsWithCar: false,
  },
  'working-class': {
    id: 'working-class',
    label: 'Working-class Pikin',
    blurb: 'Dad drives danfo, Mum sells provisions. You get small pocket money.',
    weight: 35,
    startingCash: 150_000,
    allowance: 20_000,
    sponsorsFees: 'none',
    homeDistrict: ['surulere', 'ikorodu', 'yaba'],
    homeComfort: 3,
    hustleGain: 1.1,
    studyGain: 1,
    waecMean: 6,
    startingLifestyle: 'managing',
    startsWithCar: false,
  },
  ajebota: {
    id: 'ajebota',
    label: 'Ajebota',
    blurb: 'Civil servant parents, generator at night, public uni fees sorted.',
    weight: 15,
    startingCash: 800_000,
    allowance: 80_000,
    sponsorsFees: 'public',
    homeDistrict: ['ikeja', 'yaba', 'surulere'],
    homeComfort: 6,
    hustleGain: 1,
    studyGain: 1.1,
    waecMean: 7,
    startingLifestyle: 'comfortable',
    startsWithCar: false,
  },
  'nepo-baby': {
    id: 'nepo-baby',
    label: 'Nepo Baby',
    blurb: 'Lekki duplex, a tokunbo Corolla and Daddy’s friends everywhere. Humble yourself.',
    weight: 5,
    startingCash: 5_000_000,
    allowance: 300_000,
    sponsorsFees: 'private',
    homeDistrict: ['lekki', 'ikoyi'],
    homeComfort: 12,
    hustleGain: 0.75,
    studyGain: 1,
    waecMean: 7,
    startingLifestyle: 'soft-life',
    startsWithCar: true,
  },
};

export const ETHNICITIES = ['yoruba', 'igbo', 'hausa', 'edo', 'ijaw', 'efik', 'urhobo', 'tiv', 'other'] as const;
export type Ethnicity = (typeof ETHNICITIES)[number];

export interface StateDefinition {
  readonly id: string;
  readonly name: string;
  readonly ethnicity: Ethnicity;
}

export const STATES_OF_ORIGIN: readonly StateDefinition[] = [
  { id: 'lagos', name: 'Lagos', ethnicity: 'yoruba' },
  { id: 'ogun', name: 'Ogun', ethnicity: 'yoruba' },
  { id: 'oyo', name: 'Oyo', ethnicity: 'yoruba' },
  { id: 'osun', name: 'Osun', ethnicity: 'yoruba' },
  { id: 'ondo', name: 'Ondo', ethnicity: 'yoruba' },
  { id: 'ekiti', name: 'Ekiti', ethnicity: 'yoruba' },
  { id: 'kwara', name: 'Kwara', ethnicity: 'yoruba' },
  { id: 'anambra', name: 'Anambra', ethnicity: 'igbo' },
  { id: 'enugu', name: 'Enugu', ethnicity: 'igbo' },
  { id: 'imo', name: 'Imo', ethnicity: 'igbo' },
  { id: 'abia', name: 'Abia', ethnicity: 'igbo' },
  { id: 'ebonyi', name: 'Ebonyi', ethnicity: 'igbo' },
  { id: 'edo', name: 'Edo', ethnicity: 'edo' },
  { id: 'delta', name: 'Delta', ethnicity: 'urhobo' },
  { id: 'rivers', name: 'Rivers', ethnicity: 'ijaw' },
  { id: 'bayelsa', name: 'Bayelsa', ethnicity: 'ijaw' },
  { id: 'akwa-ibom', name: 'Akwa Ibom', ethnicity: 'efik' },
  { id: 'cross-river', name: 'Cross River', ethnicity: 'efik' },
  { id: 'benue', name: 'Benue', ethnicity: 'tiv' },
  { id: 'kano', name: 'Kano', ethnicity: 'hausa' },
  { id: 'kaduna', name: 'Kaduna', ethnicity: 'hausa' },
  { id: 'sokoto', name: 'Sokoto', ethnicity: 'hausa' },
  { id: 'katsina', name: 'Katsina', ethnicity: 'hausa' },
  { id: 'plateau', name: 'Plateau', ethnicity: 'other' },
  { id: 'fct', name: 'FCT Abuja', ethnicity: 'other' },
];

export function findState(id: string): StateDefinition | undefined {
  return STATES_OF_ORIGIN.find((state) => state.id === id);
}

export const STATUS_TIERS = [
  { min: 900, id: 'royalty', label: 'Lagos Royalty' },
  { min: 700, id: 'odogwu', label: 'Odogwu' },
  { min: 450, id: 'big-man', label: 'Big Man / Big Woman' },
  { min: 250, id: 'respected', label: 'Respected' },
  { min: 100, id: 'known', label: 'Known in the area' },
  { min: 0, id: 'nobody', label: 'Nobody (yet)' },
] as const;
export type StatusTierId = (typeof STATUS_TIERS)[number]['id'];

export function statusTier(status: number): (typeof STATUS_TIERS)[number] {
  return STATUS_TIERS.find((tier) => status >= tier.min) ?? STATUS_TIERS[STATUS_TIERS.length - 1]!;
}

export const MAX_STATUS = 1000;
