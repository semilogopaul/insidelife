/**
 * Social catalog — owned by the social domain: friends, privacy bands, profile badges, leaderboards, owambe parties
 * and spraying, and moderation reasons. Pure and dependency-free; the server is authoritative, the client uses the
 * same rules for previews ("this spray needs whole ₦500/₦1,000 notes").
 */
import { formatNairaCompact } from '../money/money.js';
import type { VenueDefinition, VenueType } from './venues.js';

// ----- Friends -----------------------------------------------------------------------------------------------------

export const FRIEND_LIMITS = {
  maxFriends: 500,
  maxPendingOutgoing: 50,
} as const;

/** Clout from having a real network ("man know man"). Small and capped so alt accounts can't farm it. */
export function socialClout(friendCount: number): number {
  return Math.min(30, Math.floor(Math.max(0, friendCount) / 2));
}

// ----- Privacy & wealth bands --------------------------------------------------------------------------------------

/**
 * Self-made net worth: everything you own minus every naira you didn't earn (birth-lottery cash, Uncle Tunde's
 * starter fund, allowance, gifts, sprays, inheritance, real-money top-ups). Never negative.
 */
export function selfMadeNetWorthOf(netWorth: number, unearnedTotal: number): number {
  return Math.max(0, Math.round(netWorth - unearnedTotal));
}

const WEALTH_BAND_FLOORS = [
  100_000, 500_000, 1_000_000, 5_000_000, 10_000_000, 50_000_000, 100_000_000, 500_000_000, 1_000_000_000,
  5_000_000_000, 10_000_000_000, 50_000_000_000, 100_000_000_000,
] as const;

/** Coarse public label for an amount ("₦10M+"). Exact figures are only shown when the player opts in. */
export function wealthBandLabel(amount: number): string {
  let floor = 0;
  for (const candidate of WEALTH_BAND_FLOORS) if (amount >= candidate) floor = candidate;
  return floor === 0 ? 'Under ₦100k' : `${formatNairaCompact(floor)}+`;
}

// ----- Nepo vs Lapo --------------------------------------------------------------------------------------------------

/** Bank money (cash + savings + dollars at the going rate) from which a player is a "nepo" (gold name). */
export const NEPO_THRESHOLD = 100_000_000;

export const WEALTH_CLASSES = ['nepo', 'lapo'] as const;
export type WealthClass = (typeof WEALTH_CLASSES)[number];

/** Money in the bank: cash + savings + the USD balance (US cents) converted at the game's rate. Pension isn't counted. */
export function bankMoneyOf(balances: { readonly cash: number; readonly savings: number; readonly usdCents: number }, usdRate: number): number {
  return Math.round(balances.cash + balances.savings + (balances.usdCents / 100) * usdRate);
}

/** Over ₦100M in the bank is nepo (gold); anything less is lapo (blue). */
export function wealthClass(amount: number): WealthClass {
  return amount > NEPO_THRESHOLD ? 'nepo' : 'lapo';
}

export const WEALTH_CLASS_COPY: Readonly<Record<WealthClass, { readonly label: string; readonly badge: string; readonly explainer: string }>> = {
  nepo: {
    label: 'Nepo',
    badge: 'Nepo 👑 — over ₦100M in the bank',
    explainer: 'Gold names belong to nepos: players with more than ₦100M in the bank (cash, savings and dollars).',
  },
  lapo: {
    label: 'Lapo',
    badge: 'Lapo — under ₦100M',
    explainer: 'Blue names belong to lapos: players with less than ₦100M in the bank. Grow your money and your name turns gold.',
  },
};

export const PROFILE_LOCATION_VISIBILITY = ['friends', 'nobody'] as const;
export type ProfileLocationVisibility = (typeof PROFILE_LOCATION_VISIBILITY)[number];

/** Titles shown under a name when the player has no job title. */
export const PROFILE_TITLES = {
  corper: 'Corps member (NYSC)',
  student: 'Student',
  graduate: 'Graduate · job hunting',
  hustling: 'Hustling',
} as const;

// ----- Badges ------------------------------------------------------------------------------------------------------

/** In headline priority order: the first matches are shown under the name. */
export const SOCIAL_BADGE_IDS = [
  'self-made-billionaire',
  'self-made-100m',
  'first-class',
  'barrister',
  'doctor',
  'chartered',
  'owambe-host',
  'corper',
  'graduate',
  'married',
  'full-house',
  'parent',
  'heir',
  'social-butterfly',
] as const;
export type SocialBadgeId = (typeof SOCIAL_BADGE_IDS)[number];

export interface SocialBadgeDefinition {
  readonly id: SocialBadgeId;
  readonly label: string;
  readonly emoji: string;
  readonly blurb: string;
}

export const SOCIAL_BADGES: Readonly<Record<SocialBadgeId, SocialBadgeDefinition>> = {
  'self-made-billionaire': { id: 'self-made-billionaire', label: 'Self-made billionaire', emoji: '💎', blurb: '₦1B+ earned the hard way.' },
  'self-made-100m': { id: 'self-made-100m', label: 'Self-made ₦100M+', emoji: '💰', blurb: 'No Uncle Tunde money in this figure.' },
  'first-class': { id: 'first-class', label: 'First Class', emoji: '🎓', blurb: 'Graduated with a First (or Distinction).' },
  barrister: { id: 'barrister', label: 'Barrister', emoji: '⚖️', blurb: 'Called to the Nigerian Bar.' },
  doctor: { id: 'doctor', label: 'Doctor', emoji: '🩺', blurb: 'Licensed by the MDCN.' },
  chartered: { id: 'chartered', label: 'Chartered Accountant', emoji: '📊', blurb: 'ICAN certified.' },
  'owambe-host': { id: 'owambe-host', label: 'Owambe host', emoji: '🎉', blurb: 'Threw a party Lagos is still talking about.' },
  corper: { id: 'corper', label: 'Corper', emoji: '🟩', blurb: 'Serving the fatherland.' },
  graduate: { id: 'graduate', label: 'Graduate', emoji: '📜', blurb: 'Survived ASUU and got the certificate.' },
  married: { id: 'married', label: 'Married', emoji: '💍', blurb: 'Off the market.' },
  'full-house': { id: 'full-house', label: 'Full house', emoji: '👨‍👩‍👧‍👦', blurb: 'Four or more children. School fees warrior.' },
  parent: { id: 'parent', label: 'Parent', emoji: '👶', blurb: 'Raising the next generation.' },
  heir: { id: 'heir', label: 'Heir', emoji: '👑', blurb: 'Carrying on the family name.' },
  'social-butterfly': { id: 'social-butterfly', label: 'Social butterfly', emoji: '🦋', blurb: '25+ friends. Everybody knows you.' },
};

/** How many badges a profile headline shows. */
export const HEADLINE_BADGE_COUNT = 4;

// ----- Leaderboards ------------------------------------------------------------------------------------------------

export const LEADERBOARD_BOARDS = ['self-made', 'earners', 'scholars', 'influence', 'families', 'dynasties'] as const;
export type LeaderboardBoardId = (typeof LEADERBOARD_BOARDS)[number];

export interface LeaderboardDefinition {
  readonly id: LeaderboardBoardId;
  readonly title: string;
  readonly blurb: string;
}

export const LEADERBOARDS: Readonly<Record<LeaderboardBoardId, LeaderboardDefinition>> = {
  'self-made': {
    id: 'self-made',
    title: 'Self-made rich list',
    blurb: 'Net worth minus every naira you didn’t earn — no top-ups, gifts, sprays or inheritance.',
  },
  earners: { id: 'earners', title: 'Top earners', blurb: 'Monthly income from jobs and businesses.' },
  scholars: { id: 'scholars', title: 'Scholars', blurb: 'Best CGPA among graduates.' },
  influence: { id: 'influence', title: 'Influence', blurb: 'Clout: titles, homes, rides, drip and the parties you throw.' },
  families: { id: 'families', title: 'Families', blurb: 'Spouse and children under one roof.' },
  dynasties: { id: 'dynasties', title: 'Dynasties', blurb: 'Self-made wealth summed across every generation of a family line.' },
};

export const LEADERBOARD_SIZE = 100;

// ----- Owambe parties ----------------------------------------------------------------------------------------------

export const PARTY_VENUE_KINDS = ['home', 'bar', 'club', 'event-centre'] as const;
export type PartyVenueKind = (typeof PARTY_VENUE_KINDS)[number];

export interface PartyVenueDefinition {
  readonly kind: PartyVenueKind;
  readonly label: string;
  readonly blurb: string;
  /** Base hire per hour (₦, before the world price index). */
  readonly hourlyHire: number;
  /** One-off setup: canopies, decor, generator. */
  readonly setupCost: number;
  readonly capacity: number;
  /** Bars and clubs won't book a table for anyone under 18. */
  readonly minHostAge: number;
}

export const PARTY_VENUES: Readonly<Record<PartyVenueKind, PartyVenueDefinition>> = {
  home: {
    kind: 'home',
    label: 'Street owambe at home',
    blurb: 'Canopies across the street, plastic chairs, generator humming. The neighbours have no choice.',
    hourlyHire: 0,
    setupCost: 150_000,
    capacity: 80,
    minHostAge: 17,
  },
  bar: {
    kind: 'bar',
    label: 'Lounge hangout',
    blurb: 'Reserved corner, suya on rotation, chapman by the jug.',
    hourlyHire: 60_000,
    setupCost: 0,
    capacity: 60,
    minHostAge: 18,
  },
  club: {
    kind: 'club',
    label: 'Club section',
    blurb: 'VIP section, sparklers on every bottle, the DJ shouts your name.',
    hourlyHire: 250_000,
    setupCost: 100_000,
    capacity: 200,
    minHostAge: 18,
  },
  'event-centre': {
    kind: 'event-centre',
    label: 'Event centre',
    blurb: 'Ballroom, chandeliers, ushers in matching gele.',
    hourlyHire: 400_000,
    setupCost: 1_000_000,
    capacity: 1_000,
    minHostAge: 17,
  },
};

/** Which catalog venue types can host a party (homes are handled separately). */
export function partyVenueKindOf(venueType: VenueType): PartyVenueKind | null {
  if (venueType === 'bar' || venueType === 'club' || venueType === 'event-centre') return venueType;
  return null;
}

export const PARTY_DRESS_CODES = ['come-as-you-are', 'aso-ebi', 'all-white', 'ankara', 'traditional', 'black-tie'] as const;
export type PartyDressCode = (typeof PARTY_DRESS_CODES)[number];

export const PARTY_DRESS_CODE_LABELS: Readonly<Record<PartyDressCode, string>> = {
  'come-as-you-are': 'Come as you are',
  'aso-ebi': 'Aso-ebi (buy the family fabric)',
  'all-white': 'All white',
  ankara: 'Ankara',
  traditional: 'Traditional attire',
  'black-tie': 'Black tie',
};

export const PARTY_TIER_IDS = ['small-chops', 'owambe', 'society'] as const;
export type PartyTierId = (typeof PARTY_TIER_IDS)[number];

export interface PartyTierDefinition {
  readonly id: PartyTierId;
  readonly label: string;
  readonly blurb: string;
  /** Food and drinks (₦, before the world price index). */
  readonly catering: number;
  readonly capacity: number;
  /** Clout the host earns when the party ends (plus turnout and spraying). */
  readonly hostClout: number;
  readonly venues: readonly PartyVenueKind[];
  readonly defaultDressCode: PartyDressCode;
}

export const PARTY_TIERS: Readonly<Record<PartyTierId, PartyTierDefinition>> = {
  'small-chops': {
    id: 'small-chops',
    label: 'Small chops & chapman',
    blurb: 'Puff-puff, samosa, spring rolls and a cooler of drinks.',
    catering: 250_000,
    capacity: 40,
    hostClout: 5,
    venues: ['home', 'bar', 'club', 'event-centre'],
    defaultDressCode: 'come-as-you-are',
  },
  owambe: {
    id: 'owambe',
    label: 'Full owambe',
    blurb: 'Party jollof, asun, moin-moin, a live band and an MC who never stops talking.',
    catering: 2_500_000,
    capacity: 200,
    hostClout: 20,
    venues: ['home', 'club', 'event-centre'],
    defaultDressCode: 'aso-ebi',
  },
  society: {
    id: 'society',
    label: 'Society owambe',
    blurb: 'Celebrity MC, DJ and live band, souvenirs, drone shots. Lagos will talk for weeks.',
    catering: 15_000_000,
    capacity: 1_000,
    hostClout: 60,
    venues: ['event-centre'],
    defaultDressCode: 'aso-ebi',
  },
};

export const PARTY_RULES = {
  minDurationHours: 2,
  maxDurationHours: 12,
  /** Parties can be planned up to a game week ahead. */
  maxLeadMinutes: 7 * 24 * 60,
  maxUpcomingPerHost: 3,
  titleMaxLength: 60,
  /** Cancel before it starts and the caterer keeps half. */
  cancelRefundRate: 0.5,
  /** Attending: mood modifier, need boosts and network gain. */
  moodBoost: 10,
  afterglowMinutes: 6 * 60,
  socialBoost: 25,
  funBoost: 20,
  connectionsGain: 1,
  /** Upcoming parties shown in the list (game minutes ahead). */
  listHorizonMinutes: 2 * 24 * 60,
} as const;

export interface PartyCostBreakdown {
  readonly venueHire: number;
  readonly setup: number;
  readonly catering: number;
  readonly total: number;
}

/** Catalog cost before the world price index. */
export function partyBaseCost(kind: PartyVenueKind, tier: PartyTierId, durationHours: number): PartyCostBreakdown {
  const venue = PARTY_VENUES[kind];
  const venueHire = venue.hourlyHire * durationHours;
  const setup = venue.setupCost;
  const catering = PARTY_TIERS[tier].catering;
  return { venueHire, setup, catering, total: venueHire + setup + catering };
}

export function partyCapacity(kind: PartyVenueKind, tier: PartyTierId): number {
  return Math.min(PARTY_VENUES[kind].capacity, PARTY_TIERS[tier].capacity);
}

/** Clout the host earns when the party ends: tier, turnout and how hard the money rained. Nobody came → nothing. */
export function hostCloutFor(tier: PartyTierId, guestCount: number, totalSprayed: number): number {
  if (guestCount <= 0) return 0;
  const turnout = Math.min(40, guestCount);
  const rain = Math.min(40, Math.floor(totalSprayed / 250_000) * 2);
  return PARTY_TIERS[tier].hostClout + turnout + rain;
}

// ----- Spraying ----------------------------------------------------------------------------------------------------

/** Notes that can be sprayed, largest first. */
export const SPRAY_NOTE_VALUES = [1_000, 500] as const;

export const SPRAY_RULES = {
  minAmount: 500,
  /** Ten bundles of ₦1,000 notes in one go. */
  maxPerSpray: 1_000_000,
  /** Per guest per party. */
  maxPerParty: 5_000_000,
  /** Clout for spraying: +1 per ₦100k at a party, capped. */
  cloutStep: 100_000,
  maxCloutPerParty: 20,
  /** Recipient is notified at most once per sender in this window (game minutes); the money rain is live anyway. */
  notifyWindowMinutes: 10,
} as const;

/**
 * Spraying naira is illegal in real life (CBN Act s.21). Every ₦500k a guest sprays at one party rolls for an
 * EFCC "naira abuse" fine — a satirical money sink.
 */
export const NAIRA_ABUSE = {
  threshold: 500_000,
  chance: 0.35,
  /** Share of everything sprayed at the party so far (≈ 5% expected cost at ₦1M, ≈ 19% at the ₦5M cap). */
  fineRate: 0.1,
  minFine: 50_000,
} as const;

export type SprayAmountCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: 'NOT_WHOLE_NOTES' | 'TOO_SMALL' | 'TOO_LARGE'; readonly message: string };

/** Sprays are whole ₦500 / ₦1,000 notes. */
export function checkSprayAmount(amount: number): SprayAmountCheck {
  if (!Number.isSafeInteger(amount) || amount < SPRAY_RULES.minAmount) {
    return { ok: false, code: 'TOO_SMALL', message: 'Spray at least one ₦500 note' };
  }
  if (amount % 500 !== 0) {
    return { ok: false, code: 'NOT_WHOLE_NOTES', message: 'Spray whole ₦500 or ₦1,000 notes — nobody is picking up coins' };
  }
  if (amount > SPRAY_RULES.maxPerSpray) {
    return { ok: false, code: 'TOO_LARGE', message: 'Ten bundles at a time, odogwu — your hand will tire' };
  }
  return { ok: true };
}

/** The notes that rain down (for the 3D effect): as many ₦1,000 notes as possible, then one ₦500. */
export function sprayNotes(amount: number): { readonly thousands: number; readonly fiveHundreds: number } {
  const whole = Math.max(0, Math.floor(amount / 500) * 500);
  const thousands = Math.floor(whole / 1_000);
  return { thousands, fiveHundreds: (whole - thousands * 1_000) / 500 };
}

/** Naira-abuse thresholds (1 = ₦500k, 2 = ₦1M …) crossed when a guest's party total goes from `before` to `after`. */
export function nairaAbuseCrossings(before: number, after: number): number[] {
  const from = Math.floor(Math.max(0, before) / NAIRA_ABUSE.threshold);
  const to = Math.floor(Math.max(0, after) / NAIRA_ABUSE.threshold);
  const crossings: number[] = [];
  for (let index = from + 1; index <= to; index++) crossings.push(index);
  return crossings;
}

/** EFCC fine for a naira-abuse offence: a share of what was sprayed so far, never below the minimum. */
export function nairaAbuseFine(partyTotal: number): number {
  return Math.max(NAIRA_ABUSE.minFine, Math.round((partyTotal * NAIRA_ABUSE.fineRate) / 1_000) * 1_000);
}

/** Clout earned by a spray, given the sender's party total before and after it. */
export function sprayClout(before: number, after: number): number {
  const cap = SPRAY_RULES.maxCloutPerParty;
  const steps = (total: number): number => Math.min(cap, Math.floor(Math.max(0, total) / SPRAY_RULES.cloutStep));
  return steps(after) - steps(before);
}

// ----- Moderation --------------------------------------------------------------------------------------------------

export const PLAYER_REPORT_REASONS = [
  'harassment',
  'hate-speech',
  'scam',
  'spam',
  'impersonation',
  'sexual-content',
  'cheating',
  'offensive-name',
  'other',
] as const;
export type PlayerReportReason = (typeof PLAYER_REPORT_REASONS)[number];

export const PLAYER_REPORT_REASON_LABELS: Readonly<Record<PlayerReportReason, string>> = {
  harassment: 'Harassment or bullying',
  'hate-speech': 'Hate speech or tribalism',
  scam: 'Scam or 419',
  spam: 'Spam',
  impersonation: 'Pretending to be someone else',
  'sexual-content': 'Sexual content',
  cheating: 'Cheating or exploits',
  'offensive-name': 'Offensive name or handle',
  other: 'Something else',
};

export const REPORT_RULES = {
  maxPerDay: 10,
  detailsMaxLength: 500,
} as const;

// ----- Home visits -------------------------------------------------------------------------------------------------

/**
 * Inviting a player over: the invite (and the visit once accepted) lasts `ttlMinutes` of game time — ten game days,
 * about two real hours at the default clock — unless the host or guest ends it. A guest still inside when it ends
 * heads home.
 */
export const VISIT_RULES = {
  ttlMinutes: 10 * 24 * 60,
  maxOpenInvites: 10,
} as const;

// ----- Spraying in clubs and bars (no party needed) ------------------------------------------------------------------

/** Where you can spray without a party: the DJ or anyone in the room. */
export const SPRAY_VENUE_TYPES = ['club', 'bar', 'event-centre'] as const;

/** Nights run 06:00 to 06:00: per-night spray totals (and EFCC thresholds) reset in the morning. */
export function sprayNightIndex(gameMinute: number): number {
  return Math.floor((gameMinute - 6 * 60) / (24 * 60));
}

// ----- Night out: paid moments in clubs and bars (bottles, DJ shoutouts, experiences) --------------------------------

/** Where the Night out panel works: the same rooms that take sprays (clubs, bars and lounges, event centres). */
export const NIGHT_OUT_VENUE_TYPES = SPRAY_VENUE_TYPES;

/** Panel sections (and what a 3D hotspot opens: the bar → bottles, the DJ booth → shoutout). */
export const NIGHT_OUT_SECTIONS = ['bottles', 'shoutout', 'experiences'] as const;
export type NightOutSection = (typeof NIGHT_OUT_SECTIONS)[number];

/** What happened, for the banner and the system line in venue chat. */
export const VENUE_MOMENT_KINDS = ['bottle', 'shoutout', 'birthday', 'champagne-shower', 'confetti-cannon', 'vip-section', 'tip'] as const;
export type VenueMomentKind = (typeof VENUE_MOMENT_KINDS)[number];

/** What the room shows in 3D (the client draws it; reduced motion gets a calm version). */
export const VENUE_MOMENT_EFFECTS = ['sparkler', 'parade', 'spotlight', 'confetti', 'fireworks', 'cake', 'shower', 'vip-sign', 'glow'] as const;
export type VenueMomentEffect = (typeof VENUE_MOMENT_EFFECTS)[number];

export const NIGHT_OUT_ITEM_IDS = [
  'premium-vodka',
  'champagne',
  'cognac',
  'bottle-parade',
  'shoutout-basic',
  'shoutout-big',
  'shoutout-odogwu',
  'tip-bartender',
  'tip-dj',
  'confetti-cannon',
  'birthday',
  'champagne-shower',
  'vip-section',
] as const;
export type NightOutItemId = (typeof NIGHT_OUT_ITEM_IDS)[number];

/** `required`: someone else in the room; `optional`: someone in the room or yourself; `none`: just you. */
export type NightOutTarget = 'required' | 'optional' | 'none';

export interface NightOutItemDefinition {
  readonly id: NightOutItemId;
  readonly section: NightOutSection;
  readonly kind: VenueMomentKind;
  readonly label: string;
  readonly emoji: string;
  readonly blurb: string;
  /** What everyone in the room sees (one line for the menu). */
  readonly shows: string;
  /** Price at a regular club (₦), before the venue's price band and the world price index. */
  readonly basePrice: number;
  /** Clout for the buyer (within the nightly cap). */
  readonly clout: number;
  /** How long it plays for the room (real ms). The VIP section lasts until closing instead. */
  readonly durationMs: number;
  readonly target: NightOutTarget;
  readonly effect: VenueMomentEffect;
  /** How many one person can buy at one place per night. */
  readonly perNight: number;
  /** Only these venue types (default: every night-out venue). */
  readonly venueTypes?: readonly VenueType[];
  /** Mood lift for the person it's for (bottles, birthdays), applied in their own next settle. */
  readonly recipientMood?: number;
}

const SECOND = 1_000;

export const NIGHT_OUT_ITEMS: Readonly<Record<NightOutItemId, NightOutItemDefinition>> = {
  // Bottles (sent to someone in the room). Lagos 2026 club prices: a bottle of vodka is ₦150-250k, champagne ₦300-500k,
  // a good cognac ₦500k-1M; a parade is half a dozen champagnes, sparklers and the waitresses' little march.
  'premium-vodka': {
    id: 'premium-vodka',
    section: 'bottles',
    kind: 'bottle',
    label: 'Premium vodka',
    emoji: '🍸',
    blurb: 'Frosted bottle, a bucket of ice and mixers for the table.',
    shows: 'A sparkler bottle lands on their table',
    basePrice: 180_000,
    clout: 2,
    durationMs: 9 * SECOND,
    target: 'required',
    effect: 'sparkler',
    perNight: 6,
    recipientMood: 6,
  },
  champagne: {
    id: 'champagne',
    section: 'bottles',
    kind: 'bottle',
    label: 'Champagne',
    emoji: '🍾',
    blurb: 'Gold foil, a sparkler on top and the waitress doing a small dance.',
    shows: 'A sparkler bottle lands on their table',
    basePrice: 350_000,
    clout: 3,
    durationMs: 10 * SECOND,
    target: 'required',
    effect: 'sparkler',
    perNight: 6,
    recipientMood: 8,
  },
  cognac: {
    id: 'cognac',
    section: 'bottles',
    kind: 'bottle',
    label: 'Aged cognac',
    emoji: '🥃',
    blurb: 'The big-man bottle. Served in a glass box with two sparklers.',
    shows: 'A glowing bottle with two sparklers',
    basePrice: 650_000,
    clout: 5,
    durationMs: 12 * SECOND,
    target: 'required',
    effect: 'sparkler',
    perNight: 4,
    recipientMood: 10,
  },
  'bottle-parade': {
    id: 'bottle-parade',
    section: 'bottles',
    kind: 'bottle',
    label: 'Bottle parade with sparklers',
    emoji: '🎆',
    blurb: 'Six champagnes, sparklers, a flag with their name and the whole club filming.',
    shows: 'A parade of sparkler bottles crosses the floor',
    basePrice: 4_500_000,
    clout: 25,
    durationMs: 22 * SECOND,
    target: 'required',
    effect: 'parade',
    perNight: 1,
    venueTypes: ['club', 'event-centre'],
    recipientMood: 15,
  },

  // DJ shoutouts: your name in bold on everyone's screen, one at a time per place.
  'shoutout-basic': {
    id: 'shoutout-basic',
    section: 'shoutout',
    kind: 'shoutout',
    label: 'Shoutout',
    emoji: '🎤',
    blurb: 'The DJ calls your name. Your name and message on every screen in the room.',
    shows: 'Your name and message on screen for 8 seconds',
    basePrice: 50_000,
    clout: 1,
    durationMs: 8 * SECOND,
    target: 'none',
    effect: 'spotlight',
    perNight: 4,
  },
  'shoutout-big': {
    id: 'shoutout-big',
    section: 'shoutout',
    kind: 'shoutout',
    label: 'Big shoutout',
    emoji: '🎉',
    blurb: 'Hype man on the mic, the music drops and confetti rains on the floor.',
    shows: 'Your name on screen for 15 seconds, with confetti',
    basePrice: 250_000,
    clout: 3,
    durationMs: 15 * SECOND,
    target: 'none',
    effect: 'confetti',
    perNight: 3,
  },
  'shoutout-odogwu': {
    id: 'shoutout-odogwu',
    section: 'shoutout',
    kind: 'shoutout',
    label: 'Odogwu shoutout',
    emoji: '👑',
    blurb: 'Lights down, CO2 blast, fireworks and your name on the LED wall. Lagos will hear.',
    shows: 'Your name on the LED wall for 25 seconds, with CO2 and fireworks',
    basePrice: 1_000_000,
    clout: 8,
    durationMs: 25 * SECOND,
    target: 'none',
    effect: 'fireworks',
    perNight: 2,
  },

  // Experiences.
  'tip-bartender': {
    id: 'tip-bartender',
    section: 'experiences',
    kind: 'tip',
    label: 'Tip the bartender',
    emoji: '🍹',
    blurb: 'Your drinks come faster and stronger for the rest of the night.',
    shows: 'A little cheer at the bar',
    basePrice: 10_000,
    clout: 0,
    durationMs: 5 * SECOND,
    target: 'none',
    effect: 'glow',
    perNight: 5,
  },
  'tip-dj': {
    id: 'tip-dj',
    section: 'experiences',
    kind: 'tip',
    label: 'Tip the DJ',
    emoji: '🎧',
    blurb: 'The DJ nods at you. Respect is earned, and sometimes bought.',
    shows: 'The DJ booth lights up',
    basePrice: 20_000,
    clout: 1,
    durationMs: 6 * SECOND,
    target: 'none',
    effect: 'glow',
    perNight: 5,
  },
  'confetti-cannon': {
    id: 'confetti-cannon',
    section: 'experiences',
    kind: 'confetti-cannon',
    label: 'Confetti cannon',
    emoji: '🎊',
    blurb: 'Two cannons by the stage. Boom: the floor turns green and gold.',
    shows: 'Confetti blasts over the dance floor',
    basePrice: 300_000,
    clout: 3,
    durationMs: 10 * SECOND,
    target: 'none',
    effect: 'confetti',
    perNight: 3,
  },
  birthday: {
    id: 'birthday',
    section: 'experiences',
    kind: 'birthday',
    label: 'Birthday package',
    emoji: '🎂',
    blurb: 'Cake with sparklers, the MC on the mic and the whole room singing. For you or someone here.',
    shows: 'A sparkler cake, the MC’s announcement and a crowd cheer',
    basePrice: 750_000,
    clout: 6,
    durationMs: 20 * SECOND,
    target: 'optional',
    effect: 'cake',
    perNight: 1,
    recipientMood: 14,
  },
  'champagne-shower': {
    id: 'champagne-shower',
    section: 'experiences',
    kind: 'champagne-shower',
    label: 'Champagne shower',
    emoji: '🥂',
    blurb: 'Shake it, pop it, spray the dance floor. Somebody’s outfit is finished.',
    shows: 'Champagne sprays over the dance floor',
    basePrice: 1_500_000,
    clout: 8,
    durationMs: 14 * SECOND,
    target: 'none',
    effect: 'shower',
    perNight: 2,
    venueTypes: ['club', 'event-centre'],
  },
  'vip-section': {
    id: 'vip-section',
    section: 'experiences',
    kind: 'vip-section',
    label: 'Reserve the VIP section',
    emoji: '🛋️',
    blurb: 'The section is yours until closing, with your name on the sign. One owner per night.',
    shows: 'Your name on the VIP sign until closing',
    basePrice: 2_500_000,
    clout: 12,
    durationMs: 0,
    target: 'none',
    effect: 'vip-sign',
    perNight: 1,
  },
};

export const NIGHT_OUT_RULES = {
  minAge: 18,
  /** Paid moments one person can buy per night across Lagos (nights run 06:00-06:00). */
  maxMomentsPerNight: 24,
  /** Clout one person can earn from nightlife per night across Lagos. */
  maxCloutPerNight: 40,
  /** Bottles one person can send the same person per night. */
  maxBottlesPerRecipient: 3,
  shoutoutMaxLength: 60,
  /** @mentions a shoutout may carry. */
  shoutoutMaxMentions: 2,
  /** Shoutouts waiting their turn at one place, and how many of those can be yours. */
  maxQueuedShoutouts: 8,
  maxQueuedPerPerson: 1,
  /** Breathing room between shoutouts, and before the first one (ms). */
  shoutoutGapMs: 1_500,
  shoutoutLeadMs: 1_000,
  /** How long a bottle or birthday lifts the mood of the person it's for (game minutes). */
  recipientMoodMinutes: 6 * 60,
  /** How long the VIP announcement banner stays up (the sign stays until closing). */
  vipBannerMs: 8_000,
} as const;

/**
 * Price band of a place: student bars are cheap, the Island's big doors (clout 250+) charge a premium. Applied to the
 * base price before the world price index.
 */
export function nightOutPriceBand(venue: Pick<VenueDefinition, 'type' | 'minStatus'>): number {
  const gate = venue.minStatus ?? 0;
  if (venue.type === 'bar') return gate >= 150 ? 0.8 : 0.6;
  if (venue.type === 'club') return gate >= 250 ? 1.3 : 1;
  return 1;
}

/** Catalog price at this place, before the world price index (rounded to ₦1,000). */
export function nightOutBasePrice(item: Pick<NightOutItemDefinition, 'basePrice'>, venue: Pick<VenueDefinition, 'type' | 'minStatus'>): number {
  return Math.max(1_000, Math.round((item.basePrice * nightOutPriceBand(venue)) / 1_000) * 1_000);
}

/** Whether this item is sold at this kind of place. */
export function nightOutSoldAt(item: Pick<NightOutItemDefinition, 'venueTypes'>, venueType: VenueType): boolean {
  if (!(NIGHT_OUT_VENUE_TYPES as readonly string[]).includes(venueType)) return false;
  return !item.venueTypes || item.venueTypes.includes(venueType);
}

/** Clout the next purchase earns, given what nightlife already earned tonight (capped per night). */
export function nightOutClout(item: Pick<NightOutItemDefinition, 'clout'>, cloutTonight: number): number {
  return Math.max(0, Math.min(item.clout, NIGHT_OUT_RULES.maxCloutPerNight - Math.max(0, cloutTonight)));
}

/** When the next shoutout can go on screen: after the last one queued here ends (plus a gap), never in the past. */
export function nextShoutoutSlot(queueEndsAt: number | null, nowMs: number): number {
  const earliest = nowMs + NIGHT_OUT_RULES.shoutoutLeadMs;
  return queueEndsAt === null ? earliest : Math.max(earliest, queueEndsAt + NIGHT_OUT_RULES.shoutoutGapMs);
}

/**
 * Game minute when tonight ends at this place: its closing time, never past 06:00 (when nights roll over). Places
 * without opening hours (event centres) run until 06:00. "The VIP section is yours until closing."
 */
export function nightOutEndsAt(venue: Pick<VenueDefinition, 'hours'>, t: number): number {
  const day = 24 * 60;
  const nightEnd = (sprayNightIndex(t) + 1) * day + 6 * 60;
  if (!venue.hours) return nightEnd;
  const [open, close] = venue.hours;
  const midnight = Math.floor(t / day) * day;
  let start = midnight + open * 60;
  // In the small hours of a late-night window, tonight's session opened yesterday.
  if (close > 24 && t - midnight < (close - 24) * 60) start -= day;
  return Math.min(start + (close - open) * 60, nightEnd);
}
