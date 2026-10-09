/**
 * Social catalog — owned by the social domain: friends, privacy bands, profile badges, leaderboards, owambe parties
 * and spraying, and moderation reasons. Pure and dependency-free; the server is authoritative, the client uses the
 * same rules for previews ("this spray needs whole ₦500/₦1,000 notes").
 */
import { formatNairaCompact } from '../money/money.js';
import type { VenueType } from './venues.js';

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
 * starter fund, allowance, gifts, sprays, inheritance, Paystack top-ups). Never negative.
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
