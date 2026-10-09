import { SPRAY_RULES, SPRAY_VENUE_TYPES, VENUES, sprayNightIndex } from '@insidelife/shared';
import { checkVenueSpray, type VenueSprayCheckInput } from './venue-spray.rules.js';

const ME = 'mine-0000-4000-8000-000000000001';
const THEM = 'them-0000-4000-8000-000000000002';

const input = (overrides: Partial<VenueSprayCheckInput> = {}): VenueSprayCheckInput => ({
  amount: 10_000,
  senderId: ME,
  recipientId: THEM,
  sprayable: true,
  open: true,
  senderHere: true,
  recipientHere: true,
  blocked: false,
  nightTotal: 0,
  senderCash: 1_000_000,
  ...overrides,
});

const codeOf = (overrides: Partial<VenueSprayCheckInput>) => {
  const result = checkVenueSpray(input(overrides));
  return result.ok ? 'OK' : result.code;
};

describe('checkVenueSpray', () => {
  it('lets you spray someone in the room, or the DJ', () => {
    expect(codeOf({})).toBe('OK');
    expect(codeOf({ recipientId: null, recipientHere: false })).toBe('OK');
  });

  it('wants whole notes within one spray', () => {
    expect(codeOf({ amount: 750 })).toBe('NOT_WHOLE_NOTES');
    expect(codeOf({ amount: 0 })).toBe('INVALID_AMOUNT');
    expect(codeOf({ amount: SPRAY_RULES.maxPerSpray + 500 })).toBe('INVALID_AMOUNT');
  });

  it('only happens inside an open club, bar or event centre', () => {
    expect(codeOf({ sprayable: false })).toBe('NO_SPRAYING_HERE');
    expect(codeOf({ senderHere: false })).toBe('NOT_HERE');
    expect(codeOf({ open: false })).toBe('CLOSED');
  });

  it('needs the person there, not you, and not blocked', () => {
    expect(codeOf({ recipientId: ME })).toBe('SPRAY_SELF');
    expect(codeOf({ recipientHere: false })).toBe('RECIPIENT_NOT_HERE');
    expect(codeOf({ blocked: true })).toBe('SPRAY_UNAVAILABLE');
  });

  it('caps a night out and needs the cash', () => {
    expect(codeOf({ nightTotal: SPRAY_RULES.maxPerParty - 5_000 })).toBe('SPRAY_LIMIT');
    expect(codeOf({ nightTotal: SPRAY_RULES.maxPerParty - 10_000 })).toBe('OK');
    expect(codeOf({ senderCash: 9_500 })).toBe('INSUFFICIENT_FUNDS');
  });
});

describe('spray places and nights', () => {
  it('every club and bar takes sprays', () => {
    const nightlife = VENUES.filter((venue) => venue.type === 'club' || venue.type === 'bar');
    expect(nightlife.length).toBeGreaterThan(5);
    for (const venue of nightlife) expect(SPRAY_VENUE_TYPES as readonly string[]).toContain(venue.type);
  });

  it('a night runs from 06:00 to 06:00, so 2am belongs to the evening before', () => {
    const day = 24 * 60;
    expect(sprayNightIndex(3 * day + 22 * 60)).toBe(sprayNightIndex(4 * day + 2 * 60));
    expect(sprayNightIndex(4 * day + 6 * 60)).toBe(sprayNightIndex(3 * day + 22 * 60) + 1);
  });
});
