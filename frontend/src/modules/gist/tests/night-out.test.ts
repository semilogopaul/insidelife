import { describe, expect, it } from 'vitest';
import type { NightOutOfferDto } from '@insidelife/shared';
import { buyBlocker, buyLabel, durationLabel, queueStatus, shoutoutCharsLeft } from '../services/night-out';

const offer =(overrides: Partial<NightOutOfferDto> = {}): NightOutOfferDto => ({
  id: 'champagne',
  section: 'bottles',
  kind: 'bottle',
  label: 'Champagne',
  emoji: '🍾',
  blurb: 'Gold foil and a sparkler.',
  shows: 'A sparkler bottle lands on their table',
  price: 350_000,
  clout: 3,
  durationMs: 10_000,
  target: 'required',
  leftTonight: 6,
  unavailable: null,
  ...overrides,
});

const FEMI = { handle: 'femi', firstName: 'Femi', lastName: 'Bello' };

describe('buyBlocker', () => {
  it('explains why you can’t buy yet, in order', () => {
    expect(buyBlocker(offer(), 1_000_000, FEMI, 'Clubs and bars are 18+. Your time go reach.')).toContain('18+');
    expect(buyBlocker(null, 1_000_000, FEMI, null)).toBe('Pick something from the menu');
    expect(buyBlocker(offer({ unavailable: '@ada has the VIP section tonight' }), 1_000_000, FEMI, null)).toContain('@ada');
    expect(buyBlocker(offer(), 1_000_000, null, null)).toBe('Pick who it’s for');
    expect(buyBlocker(offer(), 100_000, FEMI, null)).toContain('₦350,000');
    expect(buyBlocker(offer(), 1_000_000, FEMI, null)).toBeNull();
    expect(buyBlocker(offer({ target: 'optional', kind: 'birthday' }), 1_000_000, null, null)).toBeNull();
  });
});

describe('labels', () => {
  it('says what the button does and costs', () => {
    expect(buyLabel(offer(), FEMI)).toBe('Send Champagne to Femi · ₦350,000');
    expect(buyLabel(offer({ kind: 'shoutout', price: 50_000 }), null)).toBe('Shout out · ₦50,000');
    expect(buyLabel(offer({ kind: 'birthday', label: 'Birthday package', price: 750_000 }), null)).toBe('My birthday · ₦750,000');
    expect(buyLabel(offer({ kind: 'confetti-cannon', label: 'Confetti cannon', price: 300_000 }), null)).toBe('Book confetti cannon · ₦300,000');
    expect(durationLabel({ kind: 'shoutout', durationMs: 8_000 })).toBe('8 s');
    expect(durationLabel({ kind: 'vip-section', durationMs: 0 })).toBe('Until closing');
    expect(shoutoutCharsLeft('Lagos!')).toBe(54);
  });
});

describe('queueStatus', () => {
  it('counts down to your turn, then says you’re on', () => {
    expect(queueStatus(41_000, 8_000, 0).text).toBe('You’re next: in ~40s');
    expect(queueStatus(7_000, 8_000, 0).text).toBe('You’re next: in ~7s');
    expect(queueStatus(1_500, 8_000, 0).text).toBe('You’re next: any second now');
    expect(queueStatus(1_000, 8_000, 2_000)).toEqual({ state: 'live', text: 'On screen now 🎤' });
    expect(queueStatus(1_000, 8_000, 9_000).state).toBe('done');
  });
});
