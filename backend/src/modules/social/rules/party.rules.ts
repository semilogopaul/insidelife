import {
  MINUTES_PER_HOUR,
  PARTY_RULES,
  PARTY_TIERS,
  PARTY_VENUES,
  SPRAY_RULES,
  checkSprayAmount,
  findVenue,
  formatNaira,
  homeLocationId,
  isVenueOpen,
  partyVenueKindOf,
  streetLocationId,
  toDateParts,
  type DistrictId,
  type GameMinute,
  type PartyPhase,
  type PartyTierId,
  type PartyVenueKind,
  type VenueDefinition,
} from '@insidelife/shared';
import { OK, fail, type RuleResult } from './rule-result.js';

/** Where a party happens. Homes are `home:<hostId>`; their canopies spill onto the street of the host's district. */
export interface PartyPlace {
  readonly venueId: string;
  readonly venueKind: PartyVenueKind;
  readonly venueName: string;
  readonly districtId: string;
  readonly venue: VenueDefinition | null;
}

/** The fields of a party the rules need. */
export interface PartyFacts {
  readonly hostId: string;
  readonly venueId: string;
  readonly venueKind: PartyVenueKind;
  readonly districtId: string;
  readonly startsAt: GameMinute;
  readonly endsAt: GameMinute;
  readonly status: 'scheduled' | 'ended' | 'cancelled';
}

/** `home` (or your own `home:<id>`) → street owambe; otherwise a bar, club or event centre from the catalog. */
export function resolvePartyPlace(venueIdInput: string, hostId: string, homeDistrictId: string): PartyPlace | null {
  const ownHome = homeLocationId(hostId);
  if (venueIdInput === 'home' || venueIdInput === ownHome) {
    return { venueId: ownHome, venueKind: 'home', venueName: 'Street owambe', districtId: homeDistrictId, venue: null };
  }
  const venue = findVenue(venueIdInput);
  if (!venue) return null;
  const kind = partyVenueKindOf(venue.type);
  if (!kind) return null;
  return { venueId: venue.id, venueKind: kind, venueName: venue.name, districtId: venue.districtId, venue };
}

export function partyPhase(party: Pick<PartyFacts, 'startsAt' | 'endsAt' | 'status'>, now: GameMinute): PartyPhase {
  if (party.status === 'cancelled') return 'cancelled';
  if (party.status === 'ended' || now >= party.endsAt) return 'ended';
  return now >= party.startsAt ? 'live' : 'upcoming';
}

/** Is someone at `locationId` physically at this party? */
export function isAtParty(party: Pick<PartyFacts, 'venueKind' | 'venueId' | 'districtId'>, locationId: string): boolean {
  if (party.venueKind === 'home') {
    return locationId === party.venueId || locationId === streetLocationId(party.districtId as DistrictId);
  }
  return locationId === party.venueId;
}

/** Socket room that sees the money rain. Venue chat room for venues; the district room for street owambes. */
export function partyRealtimeRoom(party: Pick<PartyFacts, 'venueKind' | 'venueId' | 'districtId'>): string {
  return party.venueKind === 'home' ? `district:${party.districtId}` : `venue:${party.venueId}`;
}

/** True if the venue is open for every hour the party runs. */
export function venueOpenThroughout(venue: VenueDefinition | null, startsAt: GameMinute, endsAt: GameMinute): boolean {
  if (!venue?.hours) return true;
  for (let t = startsAt; t < endsAt; t += MINUTES_PER_HOUR) {
    if (!isVenueOpen(venue, toDateParts(t).hour)) return false;
  }
  return true;
}

export interface HostingCheckInput {
  readonly place: PartyPlace;
  readonly tier: PartyTierId;
  readonly durationHours: number;
  readonly startsInMinutes: number;
  readonly startsAt: GameMinute;
  readonly endsAt: GameMinute;
  readonly hostAge: number;
  readonly hostStatus: number;
  readonly upcomingHosted: number;
  readonly overlapsAnotherParty: boolean;
}

export function checkHosting(input: HostingCheckInput): RuleResult {
  const { place, tier } = input;
  const tierDef = PARTY_TIERS[tier];
  if (!tierDef.venues.includes(place.venueKind)) {
    const where = tierDef.venues.map((kind) => PARTY_VENUES[kind].label.toLowerCase()).join(', ');
    return fail('TIER_NOT_ALLOWED', `${tierDef.label} needs a bigger space (${where})`);
  }
  if (!Number.isInteger(input.durationHours) || input.durationHours < PARTY_RULES.minDurationHours || input.durationHours > PARTY_RULES.maxDurationHours) {
    return fail('INVALID_DURATION', `Parties run ${PARTY_RULES.minDurationHours}–${PARTY_RULES.maxDurationHours} hours`);
  }
  if (!Number.isInteger(input.startsInMinutes) || input.startsInMinutes < 0 || input.startsInMinutes > PARTY_RULES.maxLeadMinutes) {
    return fail('INVALID_START', 'Plan your party within the next game week');
  }
  if (input.hostAge < PARTY_VENUES[place.venueKind].minHostAge) {
    return fail('TOO_YOUNG', `You must be ${PARTY_VENUES[place.venueKind].minHostAge}+ to book ${place.venueName}`);
  }
  if (place.venue?.minStatus && input.hostStatus < place.venue.minStatus) {
    return fail('BOUNCER', `${place.venueName} doesn’t take bookings from just anybody. Build your clout first.`);
  }
  if (!venueOpenThroughout(place.venue, input.startsAt, input.endsAt)) {
    const [open, close] = place.venue?.hours ?? [0, 24];
    return fail('VENUE_CLOSED', `${place.venueName} is only open ${open}:00–${close % 24}:00. Pick another time.`);
  }
  if (input.overlapsAnotherParty) return fail('ALREADY_HOSTING', 'You already have a party at that time');
  if (input.upcomingHosted >= PARTY_RULES.maxUpcomingPerHost) {
    return fail('TOO_MANY_PARTIES', `You already have ${PARTY_RULES.maxUpcomingPerHost} parties coming up. Rest small.`);
  }
  return OK;
}

export interface AttendanceCheckInput {
  readonly phase: PartyPhase;
  readonly startsAt: GameMinute;
  readonly atParty: boolean;
  readonly travelling: boolean;
  readonly blocked: boolean;
  readonly full: boolean;
  readonly isHost: boolean;
}

export function checkAttendance(input: AttendanceCheckInput): RuleResult {
  if (input.phase === 'upcoming') return fail('PARTY_NOT_STARTED', 'The DJ is still testing the mic — come back when the party starts');
  if (input.phase !== 'live') return fail('PARTY_OVER', 'This party is over. Only the cleaners and leftover jollof remain.');
  if (input.blocked) return fail('PARTY_UNAVAILABLE', 'The ushers can’t find your name on the list');
  if (input.travelling) return fail('TRAVELLING', 'You’re still on the road — arrive first');
  if (!input.atParty) return fail('NOT_AT_PARTY', 'You need to be at the party to join it');
  if (input.full && !input.isHost) return fail('PARTY_FULL', 'The hall is full. Security has locked the gate.');
  return OK;
}

export interface SprayCheckInput {
  readonly amount: number;
  readonly phase: PartyPhase;
  readonly senderId: string;
  readonly recipientId: string;
  readonly senderAtParty: boolean;
  readonly senderJoined: boolean;
  readonly recipientAtParty: boolean;
  readonly recipientJoined: boolean;
  readonly blocked: boolean;
  /** What the sender has already sprayed at this party. */
  readonly senderPartyTotal: number;
  readonly senderCash: number;
}

/** Everything that must hold for a spray: whole notes, a live party, both people actually there, cash in hand. */
export function checkSpray(input: SprayCheckInput): RuleResult {
  const amount = checkSprayAmount(input.amount);
  if (!amount.ok) return fail(amount.code === 'NOT_WHOLE_NOTES' ? 'NOT_WHOLE_NOTES' : 'INVALID_AMOUNT', amount.message);
  if (input.senderId === input.recipientId) return fail('SPRAY_SELF', 'Spraying yourself is just counting money in public');
  if (input.phase !== 'live') return fail('PARTY_NOT_LIVE', 'The money rain only falls while the party is on');
  if (!input.senderAtParty || !input.senderJoined) return fail('NOT_AT_PARTY', 'You have to be at the party (and join it) to spray');
  if (!input.recipientAtParty || !input.recipientJoined) return fail('RECIPIENT_NOT_HERE', 'They’re not on the dance floor right now');
  if (input.blocked) return fail('SPRAY_UNAVAILABLE', 'You can’t spray this player');
  if (input.senderPartyTotal + input.amount > SPRAY_RULES.maxPerParty) {
    const left = Math.max(0, SPRAY_RULES.maxPerParty - input.senderPartyTotal);
    return fail('SPRAY_LIMIT', `Odogwu, calm down — you can spray ${formatNaira(left)} more at this party`);
  }
  if (input.senderCash < input.amount) return fail('INSUFFICIENT_FUNDS', `You don’t have ${formatNaira(input.amount)} cash on you`);
  return OK;
}
