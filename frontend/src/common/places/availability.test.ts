import { findAction, findVenue, type ActionDefinition } from '@insidelife/shared';
import { describe, expect, it } from 'vitest';
import { OPEN_CONTEXT, actionAvailability, formatHour, type ActionContext } from './availability';

const action = (id: string): ActionDefinition => findAction(id) as ActionDefinition;
const lounge = findVenue('vi-lounge') ?? null;
const at = (patch: Partial<ActionContext>): ActionContext => ({
  ...OPEN_CONTEXT,
  venue: lounge,
  hour: 20,
  balance: 50_000,
  ...patch,
});

describe('action availability (venue sheet and hotspots)', () => {
  it('allows drinks at the lounge when open and affordable, priced with the index', () => {
    expect(actionAvailability(action('lounge'), at({ priceIndex: 1.1 }))).toEqual({
      available: true,
      reason: null,
      price: 19_800,
      priceNote: '₦19,800',
    });
  });

  it('says why not: one thing at a time, closed, too young, skills, money', () => {
    expect(actionAvailability(action('lounge'), at({ busy: true })).reason).toBe(
      'Finish what you’re doing first',
    );
    expect(actionAvailability(action('lounge'), at({ hour: 9 })).reason).toBe('Closed now · opens 2 PM');
    // Things you can do anywhere (on your phone) don't keep the venue's hours.
    expect(actionAvailability(action('scroll'), at({ hour: 9 })).available).toBe(true);
    // Late-night hours run past midnight: still open at 1 AM.
    expect(actionAvailability(action('lounge'), at({ hour: 1 })).available).toBe(true);
    expect(actionAvailability(action('lounge'), at({ balance: 5_000 })).reason).toBe(
      'Not enough money (₦18,000)',
    );
    const freelance = action('freelance');
    expect(
      actionAvailability(freelance, at({ venue: null, skills: { tech: 5 } as ActionContext['skills'] }))
        .reason,
    ).toMatch(/^Needs .+ 20\+$/);
    const adultsOnly = { ...action('lounge'), requires: { minAge: 18 } } as ActionDefinition;
    expect(actionAvailability(adultsOnly, at({ age: 16 })).reason).toBe('18+ only');
  });

  it('asks for clout where the place or the action does', () => {
    const vip = { ...action('lounge'), requires: { minStatus: 40 } } as unknown as ActionDefinition;
    expect(actionAvailability(vip, at({ status: 12 })).reason).toBe('Needs status 40+');
    const gated = { ...lounge, minStatus: 30 } as unknown as NonNullable<ActionContext['venue']>;
    expect(actionAvailability(action('meet-people'), at({ venue: gated, status: 10 })).reason).toBe(
      'Needs status 30+',
    );
    expect(actionAvailability(action('meet-people'), at({ venue: gated, status: 30 })).available).toBe(true);
  });

  it('lets the kitchen pay for cooking even when you’re broke', () => {
    expect(actionAvailability(action('cook'), at({ venue: null, balance: 0, pantryMeals: 2 }))).toMatchObject(
      { available: true, priceNote: 'from your kitchen' },
    );
    expect(actionAvailability(action('cook'), at({ venue: null, balance: 0 })).available).toBe(false);
  });

  it('formats opening hours', () => {
    expect(formatHour(14)).toBe('2 PM');
    expect(formatHour(26)).toBe('2 AM');
    expect(formatHour(24)).toBe('midnight');
    expect(formatHour(12)).toBe('noon');
  });
});
