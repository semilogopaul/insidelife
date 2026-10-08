import {
  NAIRA_ABUSE,
  SPRAY_RULES,
  checkSprayAmount,
  hostCloutFor,
  nairaAbuseCrossings,
  nairaAbuseFine,
  partyBaseCost,
  partyCapacity,
  sprayClout,
  sprayNotes,
  type PartyVenueKind,
} from '@insidelife/shared';
import {
  checkAttendance,
  checkHosting,
  checkSpray,
  isAtParty,
  partyPhase,
  partyRealtimeRoom,
  resolvePartyPlace,
  type HostingCheckInput,
  type SprayCheckInput,
} from './party.rules.js';

const HOST = 'host-0000-4000-8000-000000000001';
const GUEST = 'gues-0000-4000-8000-000000000002';
const OTHER = 'othr-0000-4000-8000-000000000003';

const venueParty = { venueKind: 'event-centre' as PartyVenueKind, venueId: 'eko-hotel', districtId: 'victoria-island' };
const homeParty = { venueKind: 'home' as PartyVenueKind, venueId: `home:${HOST}`, districtId: 'surulere' };

const spray = (overrides: Partial<SprayCheckInput> = {}): SprayCheckInput => ({
  amount: 10_000,
  phase: 'live',
  senderId: GUEST,
  recipientId: OTHER,
  senderAtParty: true,
  senderJoined: true,
  recipientAtParty: true,
  recipientJoined: true,
  blocked: false,
  senderPartyTotal: 0,
  senderCash: 1_000_000,
  ...overrides,
});

describe('spray amounts (whole ₦500 / ₦1,000 notes)', () => {
  it('accepts multiples of ₦500', () => {
    for (const amount of [500, 1_000, 1_500, 20_000, 250_500, SPRAY_RULES.maxPerSpray]) expect(checkSprayAmount(amount)).toEqual({ ok: true });
  });

  it('rejects coins, odd amounts, too small and too large', () => {
    expect(checkSprayAmount(750)).toMatchObject({ ok: false, code: 'NOT_WHOLE_NOTES' });
    expect(checkSprayAmount(1_200)).toMatchObject({ ok: false, code: 'NOT_WHOLE_NOTES' });
    expect(checkSprayAmount(200)).toMatchObject({ ok: false, code: 'TOO_SMALL' });
    expect(checkSprayAmount(0)).toMatchObject({ ok: false, code: 'TOO_SMALL' });
    expect(checkSprayAmount(-500)).toMatchObject({ ok: false, code: 'TOO_SMALL' });
    expect(checkSprayAmount(1_000.5)).toMatchObject({ ok: false });
    expect(checkSprayAmount(SPRAY_RULES.maxPerSpray + 500)).toMatchObject({ ok: false, code: 'TOO_LARGE' });
  });

  it('breaks an amount into notes for the money rain', () => {
    expect(sprayNotes(2_500)).toEqual({ thousands: 2, fiveHundreds: 1 });
    expect(sprayNotes(500)).toEqual({ thousands: 0, fiveHundreds: 1 });
    expect(sprayNotes(100_000)).toEqual({ thousands: 100, fiveHundreds: 0 });
  });
});

describe('checkSpray', () => {
  it('passes for two joined guests at a live party', () => {
    expect(checkSpray(spray())).toEqual({ ok: true });
  });

  it('requires whole notes', () => {
    expect(checkSpray(spray({ amount: 1_250 }))).toMatchObject({ ok: false, code: 'NOT_WHOLE_NOTES' });
  });

  it('requires the sender to be physically present and on the guest list', () => {
    expect(checkSpray(spray({ senderAtParty: false }))).toMatchObject({ ok: false, code: 'NOT_AT_PARTY' });
    expect(checkSpray(spray({ senderJoined: false }))).toMatchObject({ ok: false, code: 'NOT_AT_PARTY' });
  });

  it('requires the recipient to be present and on the guest list', () => {
    expect(checkSpray(spray({ recipientAtParty: false }))).toMatchObject({ ok: false, code: 'RECIPIENT_NOT_HERE' });
    expect(checkSpray(spray({ recipientJoined: false }))).toMatchObject({ ok: false, code: 'RECIPIENT_NOT_HERE' });
  });

  it('only rains while the party is live', () => {
    expect(checkSpray(spray({ phase: 'upcoming' }))).toMatchObject({ ok: false, code: 'PARTY_NOT_LIVE' });
    expect(checkSpray(spray({ phase: 'ended' }))).toMatchObject({ ok: false, code: 'PARTY_NOT_LIVE' });
  });

  it('blocks self-spraying, blocked pairs, the per-party cap and empty pockets', () => {
    expect(checkSpray(spray({ recipientId: GUEST }))).toMatchObject({ ok: false, code: 'SPRAY_SELF' });
    expect(checkSpray(spray({ blocked: true }))).toMatchObject({ ok: false, code: 'SPRAY_UNAVAILABLE' });
    expect(checkSpray(spray({ senderPartyTotal: SPRAY_RULES.maxPerParty - 5_000 }))).toMatchObject({ ok: false, code: 'SPRAY_LIMIT' });
    expect(checkSpray(spray({ senderCash: 9_500 }))).toMatchObject({ ok: false, code: 'INSUFFICIENT_FUNDS' });
  });
});

describe('naira abuse and spray clout', () => {
  it('rolls once per ₦500k threshold crossed', () => {
    expect(nairaAbuseCrossings(0, 499_500)).toEqual([]);
    expect(nairaAbuseCrossings(0, NAIRA_ABUSE.threshold)).toEqual([1]);
    expect(nairaAbuseCrossings(400_000, 1_100_000)).toEqual([1, 2]);
    expect(nairaAbuseCrossings(500_000, 900_000)).toEqual([]);
  });

  it('fines a share of the party total with a floor', () => {
    expect(nairaAbuseFine(2_000_000)).toBe(200_000);
    expect(nairaAbuseFine(500_000)).toBe(NAIRA_ABUSE.minFine);
    expect(nairaAbuseFine(100_000)).toBe(NAIRA_ABUSE.minFine);
  });

  it('gives +1 clout per ₦100k sprayed, capped per party', () => {
    expect(sprayClout(0, 99_500)).toBe(0);
    expect(sprayClout(50_000, 250_000)).toBe(2);
    expect(sprayClout(0, 10_000_000)).toBe(SPRAY_RULES.maxCloutPerParty);
  });
});

describe('party presence', () => {
  it('a venue party needs you inside the venue', () => {
    expect(isAtParty(venueParty, 'eko-hotel')).toBe(true);
    expect(isAtParty(venueParty, 'street:victoria-island')).toBe(false);
    expect(partyRealtimeRoom(venueParty)).toBe('venue:eko-hotel');
  });

  it('a street owambe spills onto the host’s street', () => {
    expect(isAtParty(homeParty, `home:${HOST}`)).toBe(true);
    expect(isAtParty(homeParty, 'street:surulere')).toBe(true);
    expect(isAtParty(homeParty, 'street:yaba')).toBe(false);
    expect(partyRealtimeRoom(homeParty)).toBe('district:surulere');
  });

  it('derives the phase from game time', () => {
    const party = { startsAt: 1_000, endsAt: 1_240, status: 'scheduled' as const };
    expect(partyPhase(party, 999)).toBe('upcoming');
    expect(partyPhase(party, 1_000)).toBe('live');
    expect(partyPhase(party, 1_240)).toBe('ended');
    expect(partyPhase({ ...party, status: 'cancelled' }, 1_100)).toBe('cancelled');
  });

  it('checks attendance', () => {
    const base = { phase: 'live' as const, startsAt: 0, atParty: true, travelling: false, blocked: false, full: false, isHost: false };
    expect(checkAttendance(base)).toEqual({ ok: true });
    expect(checkAttendance({ ...base, phase: 'upcoming' })).toMatchObject({ code: 'PARTY_NOT_STARTED' });
    expect(checkAttendance({ ...base, atParty: false })).toMatchObject({ code: 'NOT_AT_PARTY' });
    expect(checkAttendance({ ...base, full: true })).toMatchObject({ code: 'PARTY_FULL' });
    expect(checkAttendance({ ...base, full: true, isHost: true })).toEqual({ ok: true });
    expect(checkAttendance({ ...base, blocked: true })).toMatchObject({ code: 'PARTY_UNAVAILABLE' });
  });
});

describe('hosting', () => {
  const place = resolvePartyPlace('eko-hotel', HOST, 'surulere');
  const hosting = (overrides: Partial<HostingCheckInput> = {}): HostingCheckInput => ({
    place: place!,
    tier: 'owambe',
    durationHours: 4,
    startsInMinutes: 60,
    startsAt: 60,
    endsAt: 300,
    hostAge: 20,
    hostStatus: 0,
    upcomingHosted: 0,
    overlapsAnotherParty: false,
    ...overrides,
  });

  it('resolves venues and homes', () => {
    expect(place).toMatchObject({ venueKind: 'event-centre', districtId: 'victoria-island' });
    expect(resolvePartyPlace('home', HOST, 'surulere')).toMatchObject({ venueKind: 'home', venueId: `home:${HOST}`, districtId: 'surulere' });
    expect(resolvePartyPlace('unilag', HOST, 'surulere')).toBeNull();
    expect(resolvePartyPlace(`home:${OTHER}`, HOST, 'surulere')).toBeNull();
  });

  it('enforces tier/venue fit, age, clout, overlap and limits', () => {
    expect(checkHosting(hosting())).toEqual({ ok: true });
    const home = resolvePartyPlace('home', HOST, 'surulere')!;
    expect(checkHosting(hosting({ place: home, tier: 'society' }))).toMatchObject({ code: 'TIER_NOT_ALLOWED' });
    const club = resolvePartyPlace('the-vault', HOST, 'surulere')!;
    expect(checkHosting(hosting({ place: club, tier: 'small-chops', hostAge: 17, hostStatus: 300 }))).toMatchObject({ code: 'TOO_YOUNG' });
    expect(checkHosting(hosting({ place: club, tier: 'small-chops', hostStatus: 10 }))).toMatchObject({ code: 'BOUNCER' });
    expect(checkHosting(hosting({ overlapsAnotherParty: true }))).toMatchObject({ code: 'ALREADY_HOSTING' });
    expect(checkHosting(hosting({ upcomingHosted: 3 }))).toMatchObject({ code: 'TOO_MANY_PARTIES' });
    expect(checkHosting(hosting({ durationHours: 1 }))).toMatchObject({ code: 'INVALID_DURATION' });
  });

  it('prices venue, setup and catering, and caps capacity by the smaller of venue and tier', () => {
    expect(partyBaseCost('home', 'small-chops', 4)).toEqual({ venueHire: 0, setup: 150_000, catering: 250_000, total: 400_000 });
    expect(partyBaseCost('event-centre', 'owambe', 5).venueHire).toBe(2_000_000);
    expect(partyCapacity('home', 'society')).toBe(80);
    expect(partyCapacity('event-centre', 'small-chops')).toBe(40);
  });

  it('rewards hosts for turnout and money rain — nobody came, no clout', () => {
    expect(hostCloutFor('owambe', 0, 5_000_000)).toBe(0);
    expect(hostCloutFor('owambe', 10, 0)).toBe(30);
    expect(hostCloutFor('society', 500, 100_000_000)).toBe(60 + 40 + 40);
  });
});
