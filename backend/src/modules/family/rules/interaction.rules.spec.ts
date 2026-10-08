import { INTERACTIONS } from '@insidelife/shared';
import { acceptanceChance, checkInteraction, fertility, giftCloseness, type InteractionState } from './interaction.rules.js';

const base: InteractionState = {
  kind: 'acquaintance',
  name: 'Chiamaka',
  alive: true,
  isPlayer: false,
  closeness: 50,
  romance: 50,
  selfAge: 25,
  otherAge: 24,
  selfGender: 'male',
  otherGender: 'female',
  datingDays: 0,
  venueType: 'restaurant',
  together: false,
  cooldownUntil: null,
  now: 1_000_000,
  committedElsewhere: false,
  introductionDone: false,
  traditionalDone: false,
  whiteWeddingDone: false,
  expecting: false,
};
const check = (type: keyof typeof INTERACTIONS, patch: Partial<InteractionState> = {}): string | null =>
  checkInteraction(INTERACTIONS[type], { ...base, ...patch })?.code ?? null;

describe('interaction requirements', () => {
  it('lets anyone chat, but not with the dead', () => {
    expect(check('chat')).toBeNull();
    expect(check('chat', { alive: false })).toBe('DECEASED');
  });

  it('keeps romance to adults and away from family', () => {
    expect(check('flirt', { selfAge: 17 })).toBe('TOO_YOUNG');
    expect(check('flirt', { otherAge: 17 })).toBe('TOO_YOUNG');
    expect(check('flirt', { kind: 'sibling' })).toBe('NOT_ALLOWED');
    expect(check('flirt', { closeness: 10 })).toBe('NOT_CLOSE_ENOUGH');
    expect(check('flirt')).toBeNull();
  });

  it('needs romance ≥ 30 to ask out and to date, and a date needs a date venue', () => {
    expect(check('ask-out', { romance: 29 })).toBe('NO_SPARK');
    expect(check('ask-out', { romance: 30 })).toBeNull();
    expect(check('ask-out', { committedElsewhere: true })).toBe('ALREADY_TAKEN');
    expect(check('date', { kind: 'acquaintance' })).toBe('NOT_ALLOWED');
    expect(check('date', { kind: 'partner', romance: 20 })).toBe('NO_SPARK');
    expect(check('date', { kind: 'partner', venueType: null })).toBe('WRONG_PLACE');
    expect(check('date', { kind: 'partner', venueType: 'office' })).toBe('WRONG_PLACE');
    expect(check('date', { kind: 'partner' })).toBeNull();
    expect(check('date', { kind: 'partner', isPlayer: true, together: false })).toBe('NOT_TOGETHER');
    expect(check('date', { kind: 'partner', isPlayer: true, together: true })).toBeNull();
  });

  it('needs 30 days of dating, romance ≥ 70 and a ₦150k-₦5m ring to propose', () => {
    const dating = { kind: 'partner' as const, romance: 80, datingDays: 30, amount: 500_000 };
    expect(check('propose', dating)).toBeNull();
    expect(check('propose', { ...dating, datingDays: 29 })).toBe('TOO_SOON');
    expect(check('propose', { ...dating, romance: 69 })).toBe('NO_SPARK');
    expect(check('propose', { ...dating, amount: undefined })).toBe('INVALID_AMOUNT');
    expect(check('propose', { ...dating, amount: 100_000 })).toBe('INVALID_AMOUNT');
    expect(check('propose', { ...dating, amount: 6_000_000 })).toBe('INVALID_AMOUNT');
    expect(check('propose', { ...dating, kind: 'friend' })).toBe('NOT_ALLOWED');
  });

  it('follows the wedding order: introduction, then traditional; white wedding needs a tier', () => {
    const engaged = { kind: 'fiance' as const };
    expect(check('traditional-wedding', engaged)).toBe('INTRODUCTION_FIRST');
    expect(check('introduction', engaged)).toBeNull();
    expect(check('introduction', { ...engaged, introductionDone: true })).toBe('ALREADY_DONE');
    expect(check('traditional-wedding', { ...engaged, introductionDone: true })).toBeNull();
    expect(check('traditional-wedding', { kind: 'spouse', introductionDone: true, traditionalDone: true })).toBe('ALREADY_DONE');
    expect(check('white-wedding', engaged)).toBe('INVALID_TIER');
    expect(check('white-wedding', { ...engaged, tier: 'owambe' })).toBeNull();
    expect(check('white-wedding', { kind: 'spouse', tier: 'registry', whiteWeddingDone: true })).toBe('ALREADY_DONE');
  });

  it('needs a partner, biology and no baby on the way to try for a baby', () => {
    expect(check('try-for-baby', { kind: 'friend' })).toBe('NOT_ALLOWED');
    expect(check('try-for-baby', { kind: 'spouse' })).toBeNull();
    expect(check('try-for-baby', { kind: 'spouse', otherGender: 'male' })).toBe('BIOLOGY');
    expect(check('try-for-baby', { kind: 'spouse', otherAge: 52 })).toBe('FERTILITY');
    expect(check('try-for-baby', { kind: 'spouse', expecting: true })).toBe('ALREADY_EXPECTING');
  });

  it('respects cooldowns and gift bounds', () => {
    expect(check('chat', { cooldownUntil: base.now + 60 })).toBe('COOLDOWN');
    expect(check('chat', { cooldownUntil: base.now - 1 })).toBeNull();
    expect(check('gift', { amount: 500 })).toBe('INVALID_AMOUNT');
    expect(check('gift', { amount: 20_000 })).toBeNull();
  });

  it('keeps acceptance odds within 5-95%, rewards chemistry and respects the taken', () => {
    const input = { closeness: 50, romance: 50, charisma: 20, status: 0, traits: [], available: true } as const;
    const askOut = INTERACTIONS['ask-out'];
    const low = acceptanceChance(askOut, { ...input, closeness: 0, romance: 0, charisma: 0 });
    const high = acceptanceChance(askOut, { ...input, closeness: 100, romance: 100, charisma: 100, status: 1000, traits: ['romantic'] });
    expect(low).toBeGreaterThanOrEqual(0.05);
    expect(high).toBeLessThanOrEqual(0.95);
    expect(high).toBeGreaterThan(low);
    expect(acceptanceChance(askOut, { ...input, available: false })).toBe(0);
    expect(acceptanceChance(INTERACTIONS.chat, input)).toBe(1);
    const ring = (ringValue: number): number => acceptanceChance(INTERACTIONS.propose, { ...input, romance: 75, ringValue });
    expect(ring(5_000_000)).toBeGreaterThan(ring(150_000));
  });

  it('scales fertility with age and gift closeness with generosity', () => {
    expect(fertility(25)).toBe(1);
    expect(fertility(42)).toBeLessThan(fertility(33));
    expect(fertility(50)).toBe(0);
    expect(giftCloseness(1_000, 40_000)).toBe(1);
    expect(giftCloseness(40_000, 40_000)).toBe(5);
    expect(giftCloseness(5_000_000, 5_000)).toBe(15);
  });
});
