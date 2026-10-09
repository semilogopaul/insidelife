/**
 * Family & relationships catalog — owned by the family domain.
 *
 * Names by ethnicity, personality traits, relationship kinds, interactions (with their requirements and effects),
 * wedding and traditional-rite costs by culture, naming ceremonies, funerals, children's school tiers, childcare and
 * black-tax requests. Prices are 2026 Lagos base prices in naira (the server applies the world price index).
 */
import type { Rng } from '../random/rng.js';
import type { Gender } from './appearance.js';
import { findState, type BackgroundId, type Ethnicity } from './life.js';
import type { VenueType } from './venues.js';

// ----- Names --------------------------------------------------------------------------------------------------------

export interface NamePool {
  readonly male: readonly string[];
  readonly female: readonly string[];
  readonly surnames: readonly string[];
}

/** Real, everyday first names and surnames by ethnicity. */
export const NAME_POOLS: Readonly<Record<Ethnicity, NamePool>> = {
  yoruba: {
    male: [
      'Adebayo', 'Oluwaseun', 'Babatunde', 'Olumide', 'Ayodeji', 'Damilare', 'Oluwatobi', 'Kayode', 'Gbenga', 'Adewale',
      'Femi', 'Segun', 'Kunle', 'Tunde', 'Lateef', 'Kazeem', 'Akinwale', 'Dapo', 'Bolaji', 'Ifeoluwa',
    ],
    female: [
      'Funmilayo', 'Folake', 'Adeola', 'Bisola', 'Temitope', 'Oluwakemi', 'Yetunde', 'Abimbola', 'Titilayo', 'Morenike',
      'Omolara', 'Adunni', 'Bukola', 'Toyin', 'Ronke', 'Simisola', 'Ayomide', 'Damilola', 'Mosunmola', 'Kehinde',
    ],
    surnames: [
      'Adeyemi', 'Ogunleye', 'Balogun', 'Adebayo', 'Adeleke', 'Ogundipe', 'Bakare', 'Olawale', 'Akinola', 'Oyelaran',
      'Salami', 'Afolabi', 'Ojo', 'Adewumi', 'Oladipo', 'Ogunbiyi', 'Alabi', 'Odunsi', 'Fashola', 'Ajayi',
    ],
  },
  igbo: {
    male: [
      'Chinedu', 'Emeka', 'Obinna', 'Chukwuemeka', 'Ikenna', 'Nnamdi', 'Uche', 'Chidi', 'Kelechi', 'Ifeanyi',
      'Somtochukwu', 'Chibuzor', 'Tochukwu', 'Ebuka', 'Okechukwu', 'Uchenna', 'Chijioke', 'Nonso', 'Obiora', 'Kenechukwu',
    ],
    female: [
      'Chiamaka', 'Ngozi', 'Adaeze', 'Chioma', 'Nneka', 'Ifeoma', 'Amarachi', 'Chinonso', 'Ogechi', 'Uju',
      'Nkechi', 'Obiageli', 'Chidinma', 'Kosisochukwu', 'Ebele', 'Ifunanya', 'Adaora', 'Onyinye', 'Chinwe', 'Nwakaego',
    ],
    surnames: [
      'Okafor', 'Okeke', 'Nwosu', 'Eze', 'Obi', 'Okonkwo', 'Nwachukwu', 'Okoro', 'Anyanwu', 'Nwankwo',
      'Udeh', 'Chukwu', 'Ibe', 'Ogbonna', 'Ugwu', 'Mbah', 'Nnaji', 'Agu', 'Onyeka', 'Ezeani',
    ],
  },
  hausa: {
    male: [
      'Abubakar', 'Musa', 'Ibrahim', 'Aminu', 'Sani', 'Usman', 'Yusuf', 'Bashir', 'Ahmad', 'Umar',
      'Nasiru', 'Kabiru', 'Haruna', 'Lawal', 'Shehu', 'Abdullahi', 'Mustapha', 'Garba', 'Isa', 'Bello',
    ],
    female: [
      'Aisha', 'Fatima', 'Zainab', 'Hauwa', 'Maryam', 'Hadiza', 'Amina', 'Khadija', 'Rabi', 'Halima',
      'Safiya', 'Bilkisu', 'Asma’u', 'Hafsat', 'Jamila', 'Salamatu', 'Ummi', 'Zulai', 'Rukayya', 'Habiba',
    ],
    surnames: [
      'Abubakar', 'Bello', 'Danjuma', 'Sani', 'Musa', 'Lawal', 'Garba', 'Usman', 'Aliyu', 'Yakubu',
      'Ibrahim', 'Suleiman', 'Shehu', 'Umar', 'Mohammed', 'Haruna', 'Tanko', 'Gambo', 'Idris', 'Dikko',
    ],
  },
  edo: {
    male: ['Osagie', 'Osaro', 'Efosa', 'Eghosa', 'Osas', 'Nosa', 'Ehis', 'Omoregie', 'Uyi', 'Idemudia', 'Osamudiamen', 'Ekhator'],
    female: ['Osayuki', 'Eki', 'Itohan', 'Efe', 'Ivie', 'Osarugue', 'Ewere', 'Uyiosa', 'Isoken', 'Ofure', 'Imuetinyan', 'Adesuwa'],
    surnames: ['Igbinedion', 'Osagie', 'Omoregie', 'Ogbebor', 'Edosomwan', 'Uwaifo', 'Aigbe', 'Iyamu', 'Erhabor', 'Idahosa', 'Ehigiator', 'Osunde'],
  },
  ijaw: {
    male: ['Tari', 'Timipre', 'Ebikabowei', 'Diepreye', 'Tonye', 'Boma', 'Ebiye', 'Ayibatonye', 'Douye', 'Seiyefa'],
    female: ['Ebiere', 'Tamara', 'Ineba', 'Ebiwari', 'Tarila', 'Preye', 'Ayebaemi', 'Boma', 'Ebimotimi', 'Ibiso'],
    surnames: ['Amakiri', 'Dikibo', 'Alagoa', 'Brisibe', 'Ekpebu', 'Tamuno', 'Pondei', 'Ebiowei', 'Okara', 'Bozimo'],
  },
  efik: {
    male: ['Effiong', 'Okon', 'Bassey', 'Asuquo', 'Edet', 'Etim', 'Ekpenyong', 'Archibong', 'Eyo', 'Ita', 'Nsikak', 'Ubong'],
    female: ['Arit', 'Affiong', 'Ekaete', 'Eno', 'Imaobong', 'Uduak', 'Nkoyo', 'Ima', 'Ekemini', 'Mfon', 'Iquo', 'Edidiong'],
    surnames: ['Bassey', 'Effiong', 'Asuquo', 'Edet', 'Etim', 'Ekpenyong', 'Archibong', 'Eyo', 'Ita', 'Henshaw', 'Duke', 'Ekpo'],
  },
  urhobo: {
    male: ['Ovie', 'Oghenekaro', 'Mudiaga', 'Akpo', 'Tega', 'Efe', 'Oghenero', 'Onoriode', 'Ogaga', 'Ejiro'],
    female: ['Ufuoma', 'Onome', 'Rukevwe', 'Ese', 'Tejiri', 'Oghenefejiro', 'Avwerosuo', 'Edirin', 'Ejiroghene', 'Oghenetega'],
    surnames: ['Okpako', 'Edewor', 'Ighoyota', 'Akpobome', 'Emuobo', 'Oweh', 'Tobrise', 'Onobrakpeya', 'Okumagba', 'Majoroh'],
  },
  tiv: {
    male: ['Terver', 'Aondona', 'Msughter', 'Tersoo', 'Iorwuese', 'Terhemba', 'Orduen', 'Aondofa', 'Torkuma', 'Sesugh'],
    female: ['Mwuese', 'Doosuur', 'Nguavese', 'Mnena', 'Seember', 'Ngodoo', 'Kumawuese', 'Wuese', 'Dooshima', 'Sewuese'],
    surnames: ['Iorhemen', 'Akaa', 'Tarka', 'Gemade', 'Agbo', 'Ugondo', 'Iyorchia', 'Orkar', 'Tor', 'Ayua'],
  },
  other: {
    male: ['Daniel', 'Samuel', 'David', 'Joseph', 'Emmanuel', 'Gyang', 'Dauda', 'Pam', 'Bitrus', 'Yohanna'],
    female: ['Grace', 'Esther', 'Mary', 'Ruth', 'Blessing', 'Mercy', 'Lydia', 'Rifkatu', 'Kaneng', 'Patience'],
    surnames: ['Gyang', 'Pam', 'Dung', 'Bot', 'Davou', 'Jang', 'Lar', 'Dakum', 'Choji', 'Mang'],
  },
};

/** Church-English first names every Nigerian family has at least one of. */
export const COMMON_FIRST_NAMES: Readonly<Record<Gender, readonly string[]>> = {
  male: ['Emmanuel', 'Victor', 'Samuel', 'Godwin', 'Daniel', 'Michael', 'Favour', 'Precious', 'Godspower', 'Kingsley'],
  female: ['Blessing', 'Precious', 'Faith', 'Joy', 'Peace', 'Favour', 'Gift', 'Mercy', 'Esther', 'Grace'],
};

/** Chance a non-Hausa NPC goes by an English first name instead of a native one. */
export const COMMON_NAME_CHANCE = 0.15;

/** Ethnic mix of NPCs you meet around Lagos (weights). */
export const LAGOS_ETHNIC_MIX: ReadonlyArray<{ readonly value: Ethnicity; readonly weight: number }> = [
  { value: 'yoruba', weight: 45 },
  { value: 'igbo', weight: 25 },
  { value: 'edo', weight: 6 },
  { value: 'hausa', weight: 6 },
  { value: 'urhobo', weight: 5 },
  { value: 'ijaw', weight: 4 },
  { value: 'efik', weight: 4 },
  { value: 'tiv', weight: 2 },
  { value: 'other', weight: 3 },
];

export function ethnicityOfState(stateId: string): Ethnicity {
  return findState(stateId)?.ethnicity ?? 'other';
}

export interface PersonName {
  readonly firstName: string;
  readonly lastName: string;
}

/**
 * Deterministic name for an NPC: same RNG state → same name. Pass `surname` to keep a family name (siblings, children).
 * `avoid` holds first names already used in the family (no two siblings called Tunde).
 */
export function generateName(
  rng: Rng,
  ethnicity: Ethnicity,
  gender: Gender,
  options: { readonly surname?: string; readonly avoid?: ReadonlySet<string> } = {},
): PersonName {
  const pool = NAME_POOLS[ethnicity];
  let firstName = '';
  for (let attempt = 0; attempt < 6; attempt++) {
    const useCommon = ethnicity !== 'hausa' && rng.chance(COMMON_NAME_CHANCE);
    firstName = rng.pick(useCommon ? COMMON_FIRST_NAMES[gender] : pool[gender]);
    if (!options.avoid?.has(firstName)) break;
  }
  return { firstName, lastName: options.surname ?? rng.pick(pool.surnames) };
}

// ----- Traits & wealth -----------------------------------------------------------------------------------------------

export const PERSON_TRAITS = [
  'ambitious',
  'family-oriented',
  'party-lover',
  'religious',
  'funny',
  'stingy',
  'generous',
  'hustler',
  'bookworm',
  'romantic',
] as const;
export type PersonTrait = (typeof PERSON_TRAITS)[number];

export const WEALTH_TIERS = ['sapa', 'managing', 'comfortable', 'wealthy', 'loaded'] as const;
export type WealthTier = (typeof WEALTH_TIERS)[number];

export interface WealthTierDefinition {
  readonly id: WealthTier;
  readonly label: string;
  /** What a gift has to cost to impress them (₦). */
  readonly giftExpectation: number;
  /** Share of wedding costs their family chips in. */
  readonly weddingContribution: number;
}

export const WEALTH: Readonly<Record<WealthTier, WealthTierDefinition>> = {
  sapa: { id: 'sapa', label: 'Struggling', giftExpectation: 5_000, weddingContribution: 0 },
  managing: { id: 'managing', label: 'Managing', giftExpectation: 15_000, weddingContribution: 0.1 },
  comfortable: { id: 'comfortable', label: 'Comfortable', giftExpectation: 40_000, weddingContribution: 0.2 },
  wealthy: { id: 'wealthy', label: 'Wealthy', giftExpectation: 150_000, weddingContribution: 0.35 },
  loaded: { id: 'loaded', label: 'Loaded', giftExpectation: 500_000, weddingContribution: 0.5 },
};

// ----- Relationships -------------------------------------------------------------------------------------------------

export const RELATIONSHIP_KINDS = [
  'father',
  'mother',
  'sibling',
  'child',
  'grandparent',
  'friend',
  'acquaintance',
  'partner',
  'fiance',
  'spouse',
  'ex',
] as const;
export type RelationshipKind = (typeof RELATIONSHIP_KINDS)[number];

export const FAMILY_KINDS: readonly RelationshipKind[] = ['father', 'mother', 'sibling', 'child', 'grandparent'];
export const ROMANTIC_KINDS: readonly RelationshipKind[] = ['partner', 'fiance', 'spouse'];

export function isFamilyKind(kind: RelationshipKind): boolean {
  return FAMILY_KINDS.includes(kind);
}

export function isRomanticKind(kind: RelationshipKind): boolean {
  return ROMANTIC_KINDS.includes(kind);
}

export const RELATIONSHIP_KIND_LABELS: Readonly<Record<RelationshipKind, string>> = {
  father: 'Father',
  mother: 'Mother',
  sibling: 'Sibling',
  child: 'Child',
  grandparent: 'Grandparent',
  friend: 'Friend',
  acquaintance: 'Acquaintance',
  partner: 'Partner',
  fiance: 'Fiancé(e)',
  spouse: 'Spouse',
  ex: 'Ex',
};

export const RELATIONSHIP_STATUSES = ['single', 'dating', 'engaged', 'married', 'widowed', 'divorced'] as const;
export type RelationshipStatus = (typeof RELATIONSHIP_STATUSES)[number];

/** Where people were met, besides venue ids. */
export const MET_AT_LABELS: Readonly<Record<string, string>> = {
  family: 'Family',
  online: 'Online',
  arranged: 'Introduced by family',
  owambe: 'At an owambe',
};

// ----- Interactions --------------------------------------------------------------------------------------------------

export const INTERACTION_TYPES = [
  'chat',
  'call',
  'hang-out',
  'gift',
  'hug',
  'flirt',
  'kiss',
  'ask-out',
  'date',
  'propose',
  'introduction',
  'traditional-wedding',
  'white-wedding',
  'break-up',
  'divorce',
  'try-for-baby',
] as const;
export type InteractionType = (typeof INTERACTION_TYPES)[number];

/** How an interaction works when the other person is a real player. */
export type PlayerInteractionMode = 'direct' | 'proposal';

export interface InteractionEffects {
  readonly closeness?: number;
  readonly romance?: number;
  /** Mood modifier for a day (or `moodDays`). */
  readonly mood?: number;
  readonly moodDays?: number;
  readonly social?: number;
  readonly fun?: number;
  readonly status?: number;
}

export interface InteractionDefinition {
  readonly id: InteractionType;
  readonly label: string;
  readonly emoji: string;
  readonly blurb: string;
  /** Relationship kinds this interaction can target. */
  readonly kinds: readonly RelationshipKind[];
  /** Romantic interactions need both people 18+ and never target family. */
  readonly romantic: boolean;
  readonly minCloseness?: number;
  readonly minRomance?: number;
  /** Game days the couple must have been dating. */
  readonly minDatingDays?: number;
  /** Must be at one of these venue types (NPCs meet you there; players must be at the same venue). */
  readonly venueTypes?: readonly VenueType[];
  /** Base cost (₦) before the price index. Gifts, rings and weddings are priced separately. */
  readonly baseCost: number;
  readonly cooldownHours: number;
  /** Base odds the other person says yes (omitted = always works). */
  readonly odds?: number;
  readonly effects: InteractionEffects;
  readonly failure?: InteractionEffects;
  readonly withPlayers: PlayerInteractionMode;
  /** With a real player you must be in the same place (a venue or a home — a visit counts). */
  readonly inPerson?: boolean;
  /** Plays a two-person 3D moment for both of you. */
  readonly moment?: 'hug' | 'kiss';
  /** Needs a `tier` in the request (white wedding tier). */
  readonly needsTier?: boolean;
  /** Needs an `amount` in the request (gift value, ring value). */
  readonly needsAmount?: { readonly min: number; readonly max: number };
}

export const DATE_VENUE_TYPES: readonly VenueType[] = ['restaurant', 'bar', 'cinema', 'beach', 'park', 'club', 'mall', 'event-centre'];

/** What a date costs by venue type (₦, before the price index). */
export const DATE_COSTS: Readonly<Partial<Record<VenueType, number>>> = {
  restaurant: 60_000,
  club: 50_000,
  'event-centre': 30_000,
  bar: 20_000,
  cinema: 15_000,
  mall: 15_000,
  beach: 12_000,
  park: 8_000,
};

export const GIFT_LIMITS = { min: 1_000, max: 5_000_000 } as const;
export const RING_LIMITS = { min: 150_000, max: 5_000_000 } as const;

const ALL_KINDS = RELATIONSHIP_KINDS;
const NON_EX = RELATIONSHIP_KINDS.filter((kind) => kind !== 'ex');

export const INTERACTIONS: Readonly<Record<InteractionType, InteractionDefinition>> = {
  chat: {
    id: 'chat',
    label: 'Chat on WhatsApp',
    emoji: '💬',
    blurb: 'Voice notes, memes and “how far?”.',
    kinds: ALL_KINDS,
    romantic: false,
    baseCost: 0,
    cooldownHours: 2,
    effects: { closeness: 3, social: 6 },
    withPlayers: 'direct',
  },
  call: {
    id: 'call',
    label: 'Call',
    emoji: '📞',
    blurb: 'A proper phone call. Airtime no be water.',
    kinds: ALL_KINDS,
    romantic: false,
    baseCost: 300,
    cooldownHours: 6,
    effects: { closeness: 4, social: 10 },
    withPlayers: 'direct',
  },
  'hang-out': {
    id: 'hang-out',
    label: 'Hang out',
    emoji: '🍻',
    blurb: 'Suya, small chops and gist.',
    kinds: NON_EX,
    romantic: false,
    minCloseness: 10,
    baseCost: 8_000,
    cooldownHours: 12,
    effects: { closeness: 7, social: 18, fun: 12 },
    withPlayers: 'direct',
    inPerson: true,
  },
  gift: {
    id: 'gift',
    label: 'Send a gift',
    emoji: '🎁',
    blurb: 'Nothing says “I value you” like money spent.',
    kinds: ALL_KINDS,
    romantic: false,
    baseCost: 0,
    cooldownHours: 24,
    effects: {},
    withPlayers: 'direct',
    needsAmount: GIFT_LIMITS,
  },
  flirt: {
    id: 'flirt',
    label: 'Flirt',
    emoji: '😉',
    blurb: 'Shoot your shot. Respectfully.',
    kinds: ['acquaintance', 'friend', 'partner', 'fiance', 'spouse'],
    romantic: true,
    minCloseness: 15,
    baseCost: 0,
    cooldownHours: 4,
    odds: 0.55,
    effects: { romance: 6, closeness: 1, mood: 3 },
    failure: { closeness: -2, mood: -2 },
    withPlayers: 'direct',
  },
  'ask-out': {
    id: 'ask-out',
    label: 'Ask them out',
    emoji: '🌹',
    blurb: 'Make it official. “Will you be my bae?”',
    kinds: ['acquaintance', 'friend', 'ex'],
    romantic: true,
    minCloseness: 25,
    minRomance: 30,
    baseCost: 0,
    cooldownHours: 72,
    odds: 0.5,
    effects: { romance: 10, closeness: 5, mood: 8, moodDays: 3 },
    failure: { romance: -8, mood: -5 },
    withPlayers: 'proposal',
  },
  date: {
    id: 'date',
    label: 'Go on a date',
    emoji: '🥂',
    blurb: 'Dinner, a movie or suya by the beach. Pay attention.',
    kinds: ['partner', 'fiance', 'spouse'],
    romantic: true,
    minRomance: 30,
    venueTypes: DATE_VENUE_TYPES,
    baseCost: 25_000,
    cooldownHours: 20,
    effects: { romance: 8, closeness: 5, mood: 5, social: 20, fun: 15 },
    withPlayers: 'direct',
    inPerson: true,
  },
  hug: {
    id: 'hug',
    label: 'Hug',
    emoji: '🤗',
    blurb: 'A proper warm hug. No side-hug, no church hug.',
    kinds: NON_EX,
    romantic: false,
    minCloseness: 25,
    baseCost: 0,
    cooldownHours: 3,
    effects: { closeness: 2, mood: 3, social: 6 },
    withPlayers: 'direct',
    inPerson: true,
    moment: 'hug',
  },
  kiss: {
    id: 'kiss',
    label: 'Kiss',
    emoji: '😘',
    blurb: 'Small peck or a proper one — read the room.',
    kinds: ['partner', 'fiance', 'spouse'],
    romantic: true,
    minRomance: 15,
    baseCost: 0,
    cooldownHours: 3,
    effects: { romance: 4, closeness: 1, mood: 4 },
    withPlayers: 'direct',
    inPerson: true,
    moment: 'kiss',
  },
  propose: {
    id: 'propose',
    label: 'Propose',
    emoji: '💍',
    blurb: 'On one knee. Pray they say yes in front of everybody.',
    kinds: ['partner'],
    romantic: true,
    minRomance: 70,
    minDatingDays: 30,
    baseCost: 0,
    cooldownHours: 14 * 24,
    odds: 0.6,
    effects: { romance: 10, mood: 15, moodDays: 7 },
    failure: { romance: -15, mood: -15, moodDays: 5 },
    withPlayers: 'proposal',
    needsAmount: RING_LIMITS,
  },
  introduction: {
    id: 'introduction',
    label: 'Introduction',
    emoji: '🤝',
    blurb: 'Both families meet. Kola, drinks and many questions about your “prospects”.',
    kinds: ['fiance'],
    romantic: true,
    baseCost: 0,
    cooldownHours: 0,
    effects: { closeness: 5, romance: 4, status: 5 },
    withPlayers: 'direct',
  },
  'traditional-wedding': {
    id: 'traditional-wedding',
    label: 'Traditional wedding',
    emoji: '🥁',
    blurb: 'Customs of the bride’s people: the list, the dance, the prostrating.',
    kinds: ['fiance', 'spouse'],
    romantic: true,
    baseCost: 0,
    cooldownHours: 0,
    effects: { romance: 10, closeness: 10, mood: 20, moodDays: 14, status: 30 },
    withPlayers: 'direct',
  },
  'white-wedding': {
    id: 'white-wedding',
    label: 'White wedding',
    emoji: '💒',
    blurb: 'Registry, church, mosque or a full owambe. Aso-ebi committee assembling.',
    kinds: ['fiance', 'spouse'],
    romantic: true,
    baseCost: 0,
    cooldownHours: 0,
    effects: { romance: 10, closeness: 10, mood: 20, moodDays: 14 },
    withPlayers: 'direct',
    needsTier: true,
  },
  'break-up': {
    id: 'break-up',
    label: 'Break up',
    emoji: '💔',
    blurb: 'It’s not you, it’s Lagos.',
    kinds: ['partner', 'fiance'],
    romantic: false,
    baseCost: 0,
    cooldownHours: 0,
    effects: { closeness: -25, mood: -10, moodDays: 10 },
    withPlayers: 'direct',
  },
  divorce: {
    id: 'divorce',
    label: 'Divorce',
    emoji: '⚖️',
    blurb: 'Lawyers, family meetings and the aunties’ verdict.',
    kinds: ['spouse'],
    romantic: false,
    baseCost: 750_000,
    cooldownHours: 0,
    effects: { closeness: -40, mood: -20, moodDays: 30, status: -15 },
    withPlayers: 'direct',
  },
  'try-for-baby': {
    id: 'try-for-baby',
    label: 'Try for a baby',
    emoji: '👶',
    blurb: 'Mummy has been praying for grandchildren since your wedding day.',
    kinds: ['partner', 'fiance', 'spouse'],
    romantic: true,
    baseCost: 0,
    cooldownHours: 72,
    odds: 0.3,
    effects: { romance: 3, mood: 4 },
    withPlayers: 'proposal',
  },
};

// ----- Weddings & rites ----------------------------------------------------------------------------------------------

export const WEDDING_TIERS = ['registry', 'modest', 'owambe', 'society'] as const;
export type WeddingTier = (typeof WEDDING_TIERS)[number];

export interface WeddingTierDefinition {
  readonly id: WeddingTier;
  readonly label: string;
  readonly blurb: string;
  readonly cost: number;
  readonly guests: number;
  /** One-off clout for hosting. */
  readonly status: number;
}

export const WEDDINGS: Readonly<Record<WeddingTier, WeddingTierDefinition>> = {
  registry: {
    id: 'registry',
    label: 'Registry wedding',
    blurb: 'Ikoyi Registry, two witnesses, small chops after. Legally married, financially intact.',
    cost: 150_000,
    guests: 20,
    status: 10,
  },
  modest: {
    id: 'modest',
    label: 'Church / mosque wedding',
    blurb: 'Solemnisation, a modest hall reception, jollof for 150 and one MC who won’t stop talking.',
    cost: 3_000_000,
    guests: 150,
    status: 40,
  },
  owambe: {
    id: 'owambe',
    label: 'Owambe',
    blurb: 'Aso-ebi committee, live band, small chops on rotation, gele to the ceiling.',
    cost: 13_000_000,
    guests: 500,
    status: 90,
  },
  society: {
    id: 'society',
    label: 'Society wedding',
    blurb: 'Eko Hotel ballroom, drone shots, a celebrity MC and a hashtag that trends for three days.',
    cost: 50_000_000,
    guests: 1_500,
    status: 200,
  },
};

export interface TraditionalRites {
  readonly ethnicity: Ethnicity;
  /** Name of the introduction / knocking ceremony. */
  readonly introductionLabel: string;
  readonly introductionCost: number;
  readonly ceremonyLabel: string;
  /** Bride price proper (often symbolic). */
  readonly bridePrice: number;
  /** Items on the bride's family's list (yams, drinks, wrappers, goats, boxes…). */
  readonly listCost: number;
  /** Feast, venue, music and souvenirs for the ceremony. */
  readonly feastCost: number;
  readonly blurb: string;
}

/** Introduction and traditional wedding costs by the bride's family's culture. */
export const TRADITIONAL_RITES: Readonly<Record<Ethnicity, TraditionalRites>> = {
  yoruba: {
    ethnicity: 'yoruba',
    introductionLabel: 'Introduction (Mo mi n mo e)',
    introductionCost: 350_000,
    ceremonyLabel: 'Engagement ceremony (Idana)',
    bridePrice: 10_000,
    listCost: 600_000,
    feastCost: 2_600_000,
    blurb: 'The bride price is symbolic — often handed back: “we are not selling our daughter”. The alaga will still collect her own fee.',
  },
  igbo: {
    ethnicity: 'igbo',
    introductionLabel: 'Knocking on the door (Iku aka)',
    introductionCost: 400_000,
    ceremonyLabel: 'Wine carrying (Igba nkwu)',
    bridePrice: 150_000,
    listCost: 2_500_000,
    feastCost: 3_000_000,
    blurb: 'The umunna will read the list slowly. Twice. Your bride searches the crowd to hand you the palm wine.',
  },
  hausa: {
    ethnicity: 'hausa',
    introductionLabel: 'Gaisuwa (formal greeting)',
    introductionCost: 300_000,
    ceremonyLabel: 'Fatiha with sadaki',
    bridePrice: 250_000,
    listCost: 1_200_000,
    feastCost: 1_500_000,
    blurb: 'The sadaki (mahr) is agreed by the elders, the lefe boxes are counted, and the walima feeds the whole street.',
  },
  edo: {
    ethnicity: 'edo',
    introductionLabel: 'Introduction',
    introductionCost: 300_000,
    ceremonyLabel: 'Traditional marriage (Benin rites)',
    bridePrice: 50_000,
    listCost: 800_000,
    feastCost: 2_400_000,
    blurb: 'Coral beads for the bride, a modest bride price and elders who will test your knowledge of Benin history.',
  },
  ijaw: {
    ethnicity: 'ijaw',
    introductionLabel: 'Introduction',
    introductionCost: 300_000,
    ceremonyLabel: 'Traditional marriage (Ijaw rites)',
    bridePrice: 60_000,
    listCost: 1_000_000,
    feastCost: 2_000_000,
    blurb: 'George wrappers, gin for the elders and fresh fish pepper soup. Plenty of it.',
  },
  efik: {
    ethnicity: 'efik',
    introductionLabel: 'Introduction',
    introductionCost: 300_000,
    ceremonyLabel: 'Traditional marriage (Efik rites)',
    bridePrice: 60_000,
    listCost: 1_200_000,
    feastCost: 2_200_000,
    blurb: 'Your bride arrives in her onyonyo gown; the afang and edikang ikong will be legendary.',
  },
  urhobo: {
    ethnicity: 'urhobo',
    introductionLabel: 'Introduction',
    introductionCost: 300_000,
    ceremonyLabel: 'Traditional marriage (Urhobo rites)',
    bridePrice: 50_000,
    listCost: 900_000,
    feastCost: 2_000_000,
    blurb: 'Starch and banga soup for everybody, and a dance-floor spraying session the elders pretend not to enjoy.',
  },
  tiv: {
    ethnicity: 'tiv',
    introductionLabel: 'Introduction',
    introductionCost: 250_000,
    ceremonyLabel: 'Traditional marriage (Tiv rites)',
    bridePrice: 40_000,
    listCost: 700_000,
    feastCost: 1_500_000,
    blurb: 'A’nger cloth in black and white stripes, yams by the barnful and swange dancing into the night.',
  },
  other: {
    ethnicity: 'other',
    introductionLabel: 'Introduction',
    introductionCost: 250_000,
    ceremonyLabel: 'Traditional marriage',
    bridePrice: 50_000,
    listCost: 800_000,
    feastCost: 2_000_000,
    blurb: 'Two families, one feast and a lot of advice from uncles you have never met.',
  },
};

/** Who pays which part of the traditional wedding: the groom's side brings the bride price and list. */
export type RitesSide = 'groom' | 'bride';

export function traditionalWeddingCost(rites: TraditionalRites, side: RitesSide): number {
  return side === 'groom' ? rites.bridePrice + rites.listCost + Math.round(rites.feastCost * 0.4) : Math.round(rites.feastCost * 0.6);
}

// ----- Ceremonies ----------------------------------------------------------------------------------------------------

export const NAMING_CEREMONY_TIERS = ['prayers', 'intimate', 'standard', 'grand'] as const;
export type NamingCeremonyTier = (typeof NAMING_CEREMONY_TIERS)[number];

export interface CeremonyTierDefinition<T extends string> {
  readonly id: T;
  readonly label: string;
  readonly blurb: string;
  readonly cost: number;
  readonly status: number;
}

export const NAMING_CEREMONIES: Readonly<Record<NamingCeremonyTier, CeremonyTierDefinition<NamingCeremonyTier>>> = {
  prayers: { id: 'prayers', label: 'Prayers at home', blurb: 'Pastor or imam, honey, kola and bitter kola. Family only.', cost: 50_000, status: 0 },
  intimate: { id: 'intimate', label: 'Intimate naming', blurb: 'Canopy outside the house, small chops and the neighbours.', cost: 500_000, status: 5 },
  standard: { id: 'standard', label: 'Proper naming ceremony', blurb: 'Hall, caterer, DJ and souvenirs with the baby’s face on them.', cost: 1_500_000, status: 15 },
  grand: { id: 'grand', label: 'Grand naming ceremony', blurb: 'Live band, aso-ebi and a cake shaped like a cradle.', cost: 3_000_000, status: 35 },
};

export const FUNERAL_TIERS = ['simple', 'befitting', 'lagos-burial', 'celebration'] as const;
export type FuneralTier = (typeof FUNERAL_TIERS)[number];

export const FUNERALS: Readonly<Record<FuneralTier, CeremonyTierDefinition<FuneralTier>>> = {
  simple: { id: 'simple', label: 'Simple burial', blurb: 'Service, interment and a quiet reception.', cost: 1_500_000, status: 0 },
  befitting: { id: 'befitting', label: 'Befitting burial', blurb: 'Programme booklets, canopies and rice for the whole street.', cost: 6_000_000, status: 10 },
  'lagos-burial': { id: 'lagos-burial', label: 'Lagos burial', blurb: 'Lying-in-state, aso-ebi, live band. The deceased would have approved.', cost: 15_000_000, status: 25 },
  celebration: { id: 'celebration', label: 'Celebration of life', blurb: 'Three days, two venues, one fleet of SUVs. Lagos will talk about it.', cost: 35_000_000, status: 60 },
};

/** Share of a parent's funeral the family expects from each adult child. */
export const FUNERAL_CHILD_SHARE = 0.3;

/** Funeral tier the family expects for a parent, by background. */
export const PARENT_FUNERAL_TIER: Readonly<Record<BackgroundId, FuneralTier>> = {
  'sapa-pikin': 'simple',
  'working-class': 'befitting',
  ajebota: 'lagos-burial',
  'nepo-baby': 'celebration',
};

// ----- Children ------------------------------------------------------------------------------------------------------

export const CHILD_SCHOOL_TIERS = ['none', 'public', 'mid-private', 'elite', 'international'] as const;
export type ChildSchoolTier = (typeof CHILD_SCHOOL_TIERS)[number];

export interface ChildSchoolTierDefinition {
  readonly id: ChildSchoolTier;
  readonly label: string;
  readonly blurb: string;
  /** Fee per term (3 terms a year), ₦ before the price index. */
  readonly feePerTerm: number;
  /** Target school performance 0-1 the child drifts toward. */
  readonly performance: number;
  /** Clout per child enrolled. */
  readonly status: number;
}

export const CHILD_SCHOOLS: Readonly<Record<ChildSchoolTier, ChildSchoolTierDefinition>> = {
  none: { id: 'none', label: 'Not in school', blurb: 'Home with family.', feePerTerm: 0, performance: 0.2, status: 0 },
  public: {
    id: 'public',
    label: 'Public school',
    blurb: 'Tuition-free, but PTA levies, uniforms and “exam fees” keep coming.',
    feePerTerm: 2_500,
    performance: 0.45,
    status: 0,
  },
  'mid-private': {
    id: 'mid-private',
    label: 'Private school',
    blurb: 'Neighbourhood private school with a big name: “Royal Excellence Int’l Academy”.',
    feePerTerm: 300_000,
    performance: 0.62,
    status: 3,
  },
  elite: {
    id: 'elite',
    label: 'Elite school',
    blurb: 'Corona, Greensprings-level. Bus service, French lessons and a debate team.',
    feePerTerm: 1_100_000,
    performance: 0.78,
    status: 12,
  },
  international: {
    id: 'international',
    label: 'International school',
    blurb: 'British curriculum, horse riding, IGCSE. Fees in pounds, emotionally.',
    feePerTerm: 8_000_000,
    performance: 0.88,
    status: 30,
  },
};

/** Default school tier for a newborn by the parent's birth-lottery background (changeable any time). */
export const DEFAULT_CHILD_SCHOOL: Readonly<Record<BackgroundId, ChildSchoolTier>> = {
  'sapa-pikin': 'public',
  'working-class': 'mid-private',
  ajebota: 'mid-private',
  'nepo-baby': 'elite',
};

/** Children start nursery at 3 and finish secondary school (WAEC) at 17. */
export const SCHOOL_START_AGE = 3;
export const WAEC_AGE = 17;
/** Months of the game year when terms start: 2nd term (Jan), 3rd term (May), 1st term (Sep). */
export const TERM_START_MONTHS = [1, 5, 9] as const;

export const CHILD_MILESTONES = [
  { id: 'first-word', ageMonths: 12, title: 'First word!', body: '{name} said “Mama”. Or was it “Dada”? Family WhatsApp group is debating.' },
  { id: 'first-steps', ageMonths: 14, title: 'First steps', body: '{name} walked across the parlour and straight into the centre table.' },
  { id: 'starts-school', ageMonths: 36, title: 'First day at school', body: '{name} started nursery school. Cried at the gate, came out singing.' },
  { id: 'primary', ageMonths: 72, title: 'Primary one', body: '{name} is in primary school now. Homework wahala begins.' },
  { id: 'secondary', ageMonths: 132, title: 'JSS1', body: '{name} started secondary school. Sandals and big dreams.' },
  { id: 'waec', ageMonths: 204, title: 'WAEC results are out', body: '{name} sat WAEC and got {credits} credits.' },
] as const;
export type ChildMilestoneId = (typeof CHILD_MILESTONES)[number]['id'];

/** Monthly nanny cost while any child is under 5 and nobody stays home. */
export const NANNY_MONTHLY = 80_000;
/** Extra nanny cost per additional under-5 child. */
export const NANNY_EXTRA_CHILD = 25_000;
export const CHILDCARE_MAX_AGE = 5;

/** Living-cost effects of the household. */
export const WORKING_SPOUSE_LIVING_MULTIPLIER = 0.8;
export const CHILD_LIVING_COST_SHARE = 0.12;

/** Pregnancy length in game days (9 game months). */
export const PREGNANCY_DAYS = 270;

// ----- Black tax -----------------------------------------------------------------------------------------------------

export const BLACK_TAX_REASONS = [
  'mama-hospital',
  'cousin-school-fees',
  'uncle-business',
  'rent-help',
  'sibling-jamb',
  'village-levy',
] as const;
export type BlackTaxReason = (typeof BLACK_TAX_REASONS)[number];

export interface BlackTaxReasonDefinition {
  readonly id: BlackTaxReason;
  readonly title: string;
  readonly body: string;
  readonly art: string;
  /** Base ask (₦) before income scaling. */
  readonly base: number;
  /** Share of monthly income added to the ask. */
  readonly incomeShare: number;
  readonly min: number;
  readonly max: number;
  /** Who in the family must be alive for this request. */
  readonly needs: 'mother' | 'father' | 'parent' | 'young-sibling' | 'none';
  readonly weight: number;
}

export const BLACK_TAX: Readonly<Record<BlackTaxReason, BlackTaxReasonDefinition>> = {
  'mama-hospital': {
    id: 'mama-hospital',
    title: 'Mama’s hospital bill',
    body: '{requester} called: Mama was admitted for “high BP and malaria”. The hospital won’t release her until the bill of {amount} is paid.',
    art: '🏥',
    base: 45_000,
    incomeShare: 0.15,
    min: 20_000,
    max: 1_500_000,
    needs: 'mother',
    weight: 3,
  },
  'cousin-school-fees': {
    id: 'cousin-school-fees',
    title: 'School fees for cousin {relative}',
    body: '{requester} says your cousin {relative} will be sent home on Monday if {amount} isn’t paid. “You are the one God has blessed in this family.”',
    art: '🎒',
    base: 60_000,
    incomeShare: 0.12,
    min: 25_000,
    max: 2_000_000,
    needs: 'parent',
    weight: 3,
  },
  'uncle-business': {
    id: 'uncle-business',
    title: 'Uncle {relative}’s “business idea”',
    body: 'Uncle {relative} has a “sure” plan to import tokunbo generators from Cotonou. He needs {amount} as “seed capital”. He will pay back “by December”.',
    art: '💼',
    base: 100_000,
    incomeShare: 0.2,
    min: 30_000,
    max: 5_000_000,
    needs: 'none',
    weight: 2,
  },
  'rent-help': {
    id: 'rent-help',
    title: 'Daddy’s rent is due',
    body: 'The landlord has given {requester} quit notice. {amount} will settle the balance. “Don’t tell your mother I called you.”',
    art: '🏠',
    base: 80_000,
    incomeShare: 0.15,
    min: 40_000,
    max: 3_000_000,
    needs: 'father',
    weight: 2,
  },
  'sibling-jamb': {
    id: 'sibling-jamb',
    title: '{relative} needs JAMB money',
    body: 'Your sibling {relative} needs {amount} for JAMB form, lesson fees and “textbooks”. They promise to read this time.',
    art: '📚',
    base: 25_000,
    incomeShare: 0.05,
    min: 10_000,
    max: 300_000,
    needs: 'young-sibling',
    weight: 2,
  },
  'village-levy': {
    id: 'village-levy',
    title: 'Village development levy',
    body: 'The town union is building a new hall and every “son and daughter abroad” (Lagos counts) must pay {amount}. Your name will be read out.',
    art: '🏘️',
    base: 20_000,
    incomeShare: 0.05,
    min: 10_000,
    max: 500_000,
    needs: 'none',
    weight: 1,
  },
};

/** Base monthly chance the family asks for money, by background (Sapa families ask most). */
export const BLACK_TAX_BASE_CHANCE: Readonly<Record<BackgroundId, number>> = {
  'sapa-pikin': 0.55,
  'working-class': 0.4,
  ajebota: 0.25,
  'nepo-baby': 0.12,
};

/** Relatives who aren't modelled as people but still call (uncles, aunties, cousins). */
export const EXTENDED_FAMILY_TITLES = ['Uncle', 'Aunty', 'Cousin'] as const;

// ----- Parents & NPC occupations -------------------------------------------------------------------------------------

export interface OccupationDefinition {
  readonly title: string;
  readonly wealth: WealthTier;
  /** Monthly income (₦) — used for a working spouse and black-tax flavour. */
  readonly monthlyIncome: number;
}

/** Parents' jobs by birth-lottery background and gender. */
export const PARENT_OCCUPATIONS: Readonly<Record<BackgroundId, Readonly<Record<Gender, readonly OccupationDefinition[]>>>> = {
  'sapa-pikin': {
    male: [
      { title: 'Danfo driver', wealth: 'sapa', monthlyIncome: 90_000 },
      { title: 'Okada rider', wealth: 'sapa', monthlyIncome: 70_000 },
      { title: 'Bricklayer', wealth: 'sapa', monthlyIncome: 80_000 },
      { title: 'Night guard (mai-guard)', wealth: 'sapa', monthlyIncome: 50_000 },
      { title: 'Vulcanizer', wealth: 'sapa', monthlyIncome: 60_000 },
    ],
    female: [
      { title: 'Petty trader', wealth: 'sapa', monthlyIncome: 60_000 },
      { title: 'Mama put (food seller)', wealth: 'sapa', monthlyIncome: 75_000 },
      { title: 'Seamstress', wealth: 'sapa', monthlyIncome: 55_000 },
      { title: 'Market woman (pepper & tomatoes)', wealth: 'sapa', monthlyIncome: 65_000 },
      { title: 'Hairdresser', wealth: 'sapa', monthlyIncome: 50_000 },
    ],
  },
  'working-class': {
    male: [
      { title: 'Civil servant (GL 07)', wealth: 'managing', monthlyIncome: 160_000 },
      { title: 'Mechanic', wealth: 'managing', monthlyIncome: 180_000 },
      { title: 'Secondary school teacher', wealth: 'managing', monthlyIncome: 170_000 },
      { title: 'Electrician', wealth: 'managing', monthlyIncome: 150_000 },
      { title: 'Transporter (two danfos)', wealth: 'managing', monthlyIncome: 220_000 },
    ],
    female: [
      { title: 'Provision store owner', wealth: 'managing', monthlyIncome: 150_000 },
      { title: 'Primary school teacher', wealth: 'managing', monthlyIncome: 120_000 },
      { title: 'Nurse', wealth: 'managing', monthlyIncome: 200_000 },
      { title: 'Tailor', wealth: 'managing', monthlyIncome: 110_000 },
      { title: 'Caterer', wealth: 'managing', monthlyIncome: 180_000 },
    ],
  },
  ajebota: {
    male: [
      { title: 'Bank manager', wealth: 'comfortable', monthlyIncome: 1_200_000 },
      { title: 'University lecturer', wealth: 'comfortable', monthlyIncome: 650_000 },
      { title: 'Director, federal civil service', wealth: 'comfortable', monthlyIncome: 700_000 },
      { title: 'Medical doctor', wealth: 'comfortable', monthlyIncome: 900_000 },
      { title: 'Engineer (oil & gas)', wealth: 'comfortable', monthlyIncome: 1_500_000 },
    ],
    female: [
      { title: 'Pharmacist', wealth: 'comfortable', monthlyIncome: 600_000 },
      { title: 'Senior civil servant', wealth: 'comfortable', monthlyIncome: 550_000 },
      { title: 'Lawyer', wealth: 'comfortable', monthlyIncome: 800_000 },
      { title: 'University lecturer', wealth: 'comfortable', monthlyIncome: 650_000 },
      { title: 'Consultant doctor', wealth: 'comfortable', monthlyIncome: 1_100_000 },
    ],
  },
  'nepo-baby': {
    male: [
      { title: 'Senator', wealth: 'loaded', monthlyIncome: 25_000_000 },
      { title: 'Oil & gas executive', wealth: 'loaded', monthlyIncome: 30_000_000 },
      { title: 'Bank MD', wealth: 'loaded', monthlyIncome: 20_000_000 },
      { title: 'Real estate magnate (Chief)', wealth: 'loaded', monthlyIncome: 35_000_000 },
      { title: 'State commissioner', wealth: 'wealthy', monthlyIncome: 8_000_000 },
    ],
    female: [
      { title: 'Company director', wealth: 'wealthy', monthlyIncome: 10_000_000 },
      { title: 'High Court judge', wealth: 'wealthy', monthlyIncome: 6_000_000 },
      { title: 'Fashion house owner', wealth: 'wealthy', monthlyIncome: 9_000_000 },
      { title: 'Real estate mogul', wealth: 'loaded', monthlyIncome: 25_000_000 },
      { title: 'Former minister', wealth: 'loaded', monthlyIncome: 18_000_000 },
    ],
  },
};

export interface NpcOccupationDefinition extends OccupationDefinition {
  readonly id: string;
  readonly minAge: number;
  readonly maxAge: number;
  /** Venues where you're likely to meet them. */
  readonly venueTypes: readonly VenueType[];
}

/** Jobs of people you meet around Lagos. */
export const NPC_OCCUPATIONS: readonly NpcOccupationDefinition[] = [
  { id: 'student', title: 'Undergraduate', wealth: 'sapa', monthlyIncome: 0, minAge: 17, maxAge: 26, venueTypes: ['campus', 'cinema', 'park', 'beach', 'church', 'mosque'] },
  { id: 'banker', title: 'Banker', wealth: 'comfortable', monthlyIncome: 450_000, minAge: 22, maxAge: 55, venueTypes: ['office', 'bar', 'restaurant', 'gym', 'mall'] },
  { id: 'developer', title: 'Software developer', wealth: 'comfortable', monthlyIncome: 900_000, minAge: 19, maxAge: 45, venueTypes: ['office', 'bar', 'gym', 'cinema'] },
  { id: 'nurse', title: 'Nurse', wealth: 'managing', monthlyIncome: 220_000, minAge: 21, maxAge: 55, venueTypes: ['church', 'mosque', 'buka', 'market'] },
  { id: 'doctor', title: 'Medical doctor', wealth: 'comfortable', monthlyIncome: 600_000, minAge: 24, maxAge: 60, venueTypes: ['church', 'restaurant', 'gym'] },
  { id: 'lawyer', title: 'Lawyer', wealth: 'comfortable', monthlyIncome: 500_000, minAge: 23, maxAge: 60, venueTypes: ['office', 'bar', 'restaurant', 'church'] },
  { id: 'trader', title: 'Trader', wealth: 'managing', monthlyIncome: 250_000, minAge: 18, maxAge: 65, venueTypes: ['market', 'buka', 'mosque', 'church'] },
  { id: 'fashion-designer', title: 'Fashion designer', wealth: 'managing', monthlyIncome: 300_000, minAge: 19, maxAge: 50, venueTypes: ['mall', 'event-centre', 'club', 'church'] },
  { id: 'content-creator', title: 'Content creator', wealth: 'managing', monthlyIncome: 200_000, minAge: 17, maxAge: 35, venueTypes: ['club', 'beach', 'mall', 'cinema', 'park'] },
  { id: 'teacher', title: 'Teacher', wealth: 'managing', monthlyIncome: 150_000, minAge: 22, maxAge: 60, venueTypes: ['church', 'mosque', 'market', 'school'] },
  { id: 'civil-servant', title: 'Civil servant', wealth: 'managing', monthlyIncome: 200_000, minAge: 22, maxAge: 60, venueTypes: ['mosque', 'church', 'buka', 'office'] },
  { id: 'bolt-driver', title: 'Bolt driver', wealth: 'sapa', monthlyIncome: 150_000, minAge: 21, maxAge: 55, venueTypes: ['buka', 'bar', 'motor-park'] },
  { id: 'realtor', title: 'Real estate agent', wealth: 'comfortable', monthlyIncome: 400_000, minAge: 22, maxAge: 55, venueTypes: ['bar', 'event-centre', 'church', 'restaurant'] },
  { id: 'event-planner', title: 'Event planner', wealth: 'managing', monthlyIncome: 350_000, minAge: 21, maxAge: 50, venueTypes: ['event-centre', 'club', 'church', 'mall'] },
  { id: 'makeup-artist', title: 'Makeup artist', wealth: 'managing', monthlyIncome: 180_000, minAge: 18, maxAge: 40, venueTypes: ['mall', 'event-centre', 'salon', 'club'] },
  { id: 'accountant', title: 'Accountant', wealth: 'comfortable', monthlyIncome: 400_000, minAge: 22, maxAge: 60, venueTypes: ['office', 'church', 'mosque', 'gym'] },
  { id: 'musician', title: 'Upcoming afrobeats artist', wealth: 'sapa', monthlyIncome: 60_000, minAge: 18, maxAge: 35, venueTypes: ['club', 'bar', 'beach', 'event-centre'] },
  { id: 'fitness-coach', title: 'Fitness coach', wealth: 'managing', monthlyIncome: 200_000, minAge: 20, maxAge: 45, venueTypes: ['gym', 'park', 'beach'] },
  { id: 'pos-agent', title: 'POS agent', wealth: 'sapa', monthlyIncome: 180_000, minAge: 18, maxAge: 50, venueTypes: ['market', 'buka', 'motor-park'] },
  { id: 'entrepreneur', title: 'Entrepreneur', wealth: 'wealthy', monthlyIncome: 2_500_000, minAge: 24, maxAge: 60, venueTypes: ['club', 'restaurant', 'gym', 'event-centre', 'bar'] },
  { id: 'oil-gas', title: 'Oil & gas engineer', wealth: 'wealthy', monthlyIncome: 1_800_000, minAge: 24, maxAge: 60, venueTypes: ['office', 'club', 'restaurant', 'gym'] },
];

/** Age range of people you meet at each kind of venue (before clamping around your own age). */
export const VENUE_AGE_RANGES: Readonly<Partial<Record<VenueType, readonly [number, number]>>> = {
  campus: [17, 27],
  club: [20, 38],
  bar: [21, 50],
  beach: [18, 40],
  park: [17, 45],
  cinema: [17, 40],
  gym: [18, 45],
  office: [22, 55],
  mall: [17, 45],
  church: [17, 65],
  mosque: [17, 65],
  'event-centre': [20, 60],
  buka: [18, 60],
  market: [18, 60],
  restaurant: [24, 60],
};

/** Venue types that nudge which traits people have. */
export const VENUE_TRAITS: Readonly<Partial<Record<VenueType, PersonTrait>>> = {
  church: 'religious',
  mosque: 'religious',
  club: 'party-lover',
  bar: 'party-lover',
  campus: 'bookworm',
  office: 'ambitious',
  market: 'hustler',
  gym: 'ambitious',
  'event-centre': 'party-lover',
  restaurant: 'romantic',
};

export interface TraitDefinition {
  readonly id: PersonTrait;
  readonly label: string;
  readonly emoji: string;
  readonly blurb: string;
  /** Multiplier on closeness gains. */
  readonly closenessGain: number;
  /** Multiplier on romance gains. */
  readonly romanceGain: number;
  /** Added to acceptance odds for these interactions. */
  readonly acceptance: Readonly<Partial<Record<InteractionType, number>>>;
}

export const TRAITS: Readonly<Record<PersonTrait, TraitDefinition>> = {
  ambitious: { id: 'ambitious', label: 'Ambitious', emoji: '📈', blurb: 'Five-year plan, ten-year plan, japa plan.', closenessGain: 1, romanceGain: 1, acceptance: { propose: 0.05, 'ask-out': 0.03 } },
  'family-oriented': {
    id: 'family-oriented',
    label: 'Family-oriented',
    emoji: '👨‍👩‍👧',
    blurb: 'Sunday lunch at Mummy’s is non-negotiable.',
    closenessGain: 1.2,
    romanceGain: 1,
    acceptance: { propose: 0.12, 'try-for-baby': 0.1 },
  },
  'party-lover': { id: 'party-lover', label: 'Party lover', emoji: '🪩', blurb: 'Knows every owambe within 10 km.', closenessGain: 1.1, romanceGain: 1, acceptance: { 'hang-out': 0.1, flirt: 0.05, propose: -0.05 } },
  religious: { id: 'religious', label: 'Religious', emoji: '🙏', blurb: 'Vigil on Friday, service on Sunday, jumu’ah too if you ask.', closenessGain: 1, romanceGain: 0.9, acceptance: { flirt: -0.1, propose: 0.08 } },
  funny: { id: 'funny', label: 'Funny', emoji: '😂', blurb: 'Every story ends with “you won’t believe…”.', closenessGain: 1.2, romanceGain: 1.05, acceptance: { flirt: 0.05 } },
  stingy: { id: 'stingy', label: 'Stingy', emoji: '🪙', blurb: 'Splits a Fanta three ways.', closenessGain: 0.9, romanceGain: 0.95, acceptance: {} },
  generous: { id: 'generous', label: 'Generous', emoji: '🤲', blurb: 'Will pay for everybody’s suya.', closenessGain: 1.1, romanceGain: 1, acceptance: { 'hang-out': 0.05 } },
  hustler: { id: 'hustler', label: 'Hustler', emoji: '💪', blurb: 'Three side businesses and a POS stand.', closenessGain: 1, romanceGain: 1, acceptance: {} },
  bookworm: { id: 'bookworm', label: 'Bookworm', emoji: '📚', blurb: 'Reads on the danfo. Corrects your grammar.', closenessGain: 1, romanceGain: 0.95, acceptance: { 'hang-out': -0.05 } },
  romantic: { id: 'romantic', label: 'Romantic', emoji: '💘', blurb: 'Writes poems. Remembers anniversaries.', closenessGain: 1, romanceGain: 1.3, acceptance: { flirt: 0.1, 'ask-out': 0.08, propose: 0.05 } },
};

/** Up to `count` distinct traits; `nudge` (from the venue) is included first when given. */
export function pickTraits(rng: Rng, count: number, nudge?: PersonTrait): PersonTrait[] {
  const traits: PersonTrait[] = nudge ? [nudge] : [];
  for (const trait of rng.shuffle(PERSON_TRAITS)) {
    if (traits.length >= count) break;
    if (!traits.includes(trait)) traits.push(trait);
  }
  return traits;
}
