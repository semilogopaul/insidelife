import { NIGHT_OUT_ITEMS, NIGHT_OUT_ITEM_IDS, NIGHT_OUT_RULES } from '@insidelife/shared';
import {
  checkNightOutOffer,
  checkNightOutTarget,
  checkNightOutVenue,
  checkShoutoutMessage,
  momentChatLine,
  type NightOutOfferInput,
  type NightOutRecipient,
} from './night-out.rules.js';

const ME = 'mine-0000-4000-8000-000000000001';
const THEM = 'them-0000-4000-8000-000000000002';

const offer = (overrides: Partial<NightOutOfferInput> = {}): NightOutOfferInput => ({
  item: NIGHT_OUT_ITEMS.champagne,
  venueType: 'club',
  nightlife: true,
  senderHere: true,
  open: true,
  senderAge: 24,
  boughtHereTonight: 0,
  momentsTonight: 0,
  vipHolder: null,
  shoutoutsWaiting: 0,
  yoursWaiting: 0,
  price: 350_000,
  senderCash: 5_000_000,
  ...overrides,
});

const offerCode = (overrides: Partial<NightOutOfferInput>) => {
  const result = checkNightOutOffer(offer(overrides));
  return result.ok ? 'OK' : result.code;
};

const them = (overrides: Partial<NightOutRecipient> = {}): NightOutRecipient => ({ id: THEM, age: 25, here: true, blocked: false, bottlesFromYouTonight: 0, ...overrides });

const targetCode = (itemId: keyof typeof NIGHT_OUT_ITEMS, recipient: NightOutRecipient | null) => {
  const result = checkNightOutTarget(NIGHT_OUT_ITEMS[itemId], ME, recipient);
  return result.ok ? 'OK' : result.code;
};

describe('checkNightOutVenue', () => {
  it('opens the panel only inside an open club or bar, for adults', () => {
    const base = { nightlife: true, senderHere: true, open: true, senderAge: 18 };
    expect(checkNightOutVenue(base).ok).toBe(true);
    const code = (overrides: Partial<typeof base>) => {
      const result = checkNightOutVenue({ ...base, ...overrides });
      return result.ok ? 'OK' : result.code;
    };
    expect(code({ nightlife: false })).toBe('NO_NIGHT_OUT_HERE');
    expect(code({ senderHere: false })).toBe('NOT_HERE');
    expect(code({ open: false })).toBe('CLOSED');
    expect(code({ senderAge: 17 })).toBe('UNDER_AGE');
  });
});

describe('checkNightOutOffer', () => {
  it('sells every item at a club to an adult with cash', () => {
    for (const id of NIGHT_OUT_ITEM_IDS) expect(offerCode({ item: NIGHT_OUT_ITEMS[id] }), id).toBe('OK');
  });

  it('keeps parades and champagne showers out of bars', () => {
    expect(offerCode({ item: NIGHT_OUT_ITEMS['bottle-parade'], venueType: 'bar' })).toBe('NOT_SOLD_HERE');
    expect(offerCode({ item: NIGHT_OUT_ITEMS['champagne-shower'], venueType: 'bar' })).toBe('NOT_SOLD_HERE');
    expect(offerCode({ item: NIGHT_OUT_ITEMS.champagne, venueType: 'bar' })).toBe('OK');
  });

  it('caps each item per place per night and every moment per night across Lagos', () => {
    const champagne = NIGHT_OUT_ITEMS.champagne;
    expect(offerCode({ boughtHereTonight: champagne.perNight - 1 })).toBe('OK');
    expect(offerCode({ boughtHereTonight: champagne.perNight })).toBe('NIGHT_LIMIT');
    expect(offerCode({ momentsTonight: NIGHT_OUT_RULES.maxMomentsPerNight })).toBe('NIGHT_OUT_LIMIT');
  });

  it('gives the VIP section to one person a night', () => {
    expect(offerCode({ item: NIGHT_OUT_ITEMS['vip-section'], vipHolder: 'ada' })).toBe('VIP_TAKEN');
    const result = checkNightOutOffer(offer({ item: NIGHT_OUT_ITEMS['vip-section'], vipHolder: 'ada' }));
    expect(result.ok ? '' : result.message).toContain('@ada');
  });

  it('queues shoutouts: one of yours at a time, and a full list means wait', () => {
    const shoutout = NIGHT_OUT_ITEMS['shoutout-big'];
    expect(offerCode({ item: shoutout, shoutoutsWaiting: 3 })).toBe('OK');
    expect(offerCode({ item: shoutout, shoutoutsWaiting: 1, yoursWaiting: 1 })).toBe('SHOUTOUT_QUEUED');
    expect(offerCode({ item: shoutout, shoutoutsWaiting: NIGHT_OUT_RULES.maxQueuedShoutouts })).toBe('QUEUE_FULL');
  });

  it('needs the cash, and checks the venue first', () => {
    expect(offerCode({ senderCash: 349_999 })).toBe('INSUFFICIENT_FUNDS');
    expect(offerCode({ senderAge: 17, senderCash: 0 })).toBe('UNDER_AGE');
  });
});

describe('checkNightOutTarget', () => {
  it('sends bottles to someone 18+ in the room', () => {
    expect(targetCode('champagne', them())).toBe('OK');
    expect(targetCode('champagne', null)).toBe('TARGET_REQUIRED');
    expect(targetCode('champagne', them({ id: ME }))).toBe('SELF_GIFT');
    expect(targetCode('champagne', them({ here: false }))).toBe('RECIPIENT_NOT_HERE');
    expect(targetCode('champagne', them({ blocked: true }))).toBe('NIGHT_OUT_UNAVAILABLE');
    expect(targetCode('champagne', them({ age: 17 }))).toBe('RECIPIENT_UNDER_AGE');
  });

  it('limits bottles to one person per night', () => {
    expect(targetCode('cognac', them({ bottlesFromYouTonight: NIGHT_OUT_RULES.maxBottlesPerRecipient - 1 }))).toBe('OK');
    expect(targetCode('cognac', them({ bottlesFromYouTonight: NIGHT_OUT_RULES.maxBottlesPerRecipient }))).toBe('RECIPIENT_LIMIT');
  });

  it('lets a birthday be yours or someone else’s, and shoutouts need nobody', () => {
    expect(targetCode('birthday', null)).toBe('OK');
    expect(targetCode('birthday', them({ id: ME }))).toBe('OK');
    expect(targetCode('birthday', them())).toBe('OK');
    expect(targetCode('birthday', them({ here: false }))).toBe('RECIPIENT_NOT_HERE');
    expect(targetCode('shoutout-basic', null)).toBe('OK');
  });
});

const shoutoutCode = (raw: string | null) => {
  const result = checkShoutoutMessage(raw);
  return result.ok ? 'OK' : result.code;
};

describe('checkShoutoutMessage', () => {
  const code = shoutoutCode;

  it('cleans a short message and finds the @mentions', () => {
    const result = checkShoutoutMessage('  Happy   birthday @Femi_B <3  ');
    expect(result).toEqual({ ok: true, message: 'Happy birthday @Femi_B 3', mentions: ['femi_b'] });
    expect(code(null)).toBe('OK');
    expect(code('')).toBe('OK');
  });

  it('refuses long messages, links, phone numbers, bad words and too many mentions', () => {
    expect(code('a'.repeat(NIGHT_OUT_RULES.shoutoutMaxLength))).toBe('OK');
    expect(code('a'.repeat(NIGHT_OUT_RULES.shoutoutMaxLength + 1))).toBe('SHOUTOUT_TOO_LONG');
    expect(code('follow me www.example.com')).toBe('SHOUTOUT_LINK');
    expect(code('visit https://scam.ng now')).toBe('SHOUTOUT_LINK');
    expect(code('cashapp.ng/ada')).toBe('SHOUTOUT_LINK');
    expect(code('call 0803 123 4567')).toBe('SHOUTOUT_PHONE');
    expect(code('+2348031234567 for tables')).toBe('SHOUTOUT_PHONE');
    expect(code('you are a mumu')).toBe('SHOUTOUT_NOT_CLEAN');
    expect(code('double your money tonight')).toBe('SHOUTOUT_NOT_CLEAN');
    expect(code('@ada @femi @tobi')).toBe('SHOUTOUT_MENTIONS');
    expect(code('₦1,000,000 night!')).toBe('OK');
  });
});

describe('momentChatLine', () => {
  it('writes a system line for every kind of moment', () => {
    expect(momentChatLine({ item: NIGHT_OUT_ITEMS['shoutout-odogwu'], from: 'ada', to: null, message: 'Lagos to the world' })).toBe('👑 DJ: Shout out to @ada — “Lagos to the world”');
    expect(momentChatLine({ item: NIGHT_OUT_ITEMS.champagne, from: 'ada', to: 'femi', message: null })).toBe('🍾 @ada sent @femi a bottle of champagne');
    expect(momentChatLine({ item: NIGHT_OUT_ITEMS.birthday, from: 'ada', to: 'femi', message: null })).toContain('Happy birthday @femi');
    expect(momentChatLine({ item: NIGHT_OUT_ITEMS.birthday, from: 'ada', to: null, message: null })).toContain('@ada’s birthday');
    expect(momentChatLine({ item: NIGHT_OUT_ITEMS['vip-section'], from: 'ada', to: null, message: null })).toContain('reserved for @ada');
    expect(momentChatLine({ item: NIGHT_OUT_ITEMS['tip-dj'], from: 'ada', to: null, message: null })).toContain('tipped the DJ');
    for (const id of NIGHT_OUT_ITEM_IDS) expect(momentChatLine({ item: NIGHT_OUT_ITEMS[id], from: 'ada', to: 'femi', message: 'hi' }).length).toBeGreaterThan(5);
  });
});
