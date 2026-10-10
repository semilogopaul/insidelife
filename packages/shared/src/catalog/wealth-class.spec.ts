import { describe, expect, it } from 'vitest';
import { NEPO_THRESHOLD, bankMoneyOf, wealthClass } from './social.js';
import { FEATURED_PLACES, featuredHeadline, liveFeaturedPlaces } from './onboarding.js';

describe('wealth class', () => {
  it('is nepo above ₦20M and lapo at or under it', () => {
    expect(NEPO_THRESHOLD).toBe(20_000_000);
    expect(wealthClass(20_000_001)).toBe('nepo');
    expect(wealthClass(NEPO_THRESHOLD)).toBe('lapo');
    expect(wealthClass(0)).toBe('lapo');
  });

  it('counts cash, savings and dollars at the rate (not pension)', () => {
    expect(bankMoneyOf({ cash: 5_000_000, savings: 5_000_000, usdCents: 0 }, 1500)).toBe(10_000_000);
    // $5,000 at ₦1,500 = ₦7.5M
    expect(bankMoneyOf({ cash: 0, savings: 0, usdCents: 500_000 }, 1500)).toBe(7_500_000);
    expect(wealthClass(bankMoneyOf({ cash: 10_000_000, savings: 5_000_000, usdCents: 400_000 }, 1500))).toBe('nepo');
  });
});

describe('featured places', () => {
  it('hides places until their venue exists', () => {
    expect(liveFeaturedPlaces(FEATURED_PLACES, () => false)).toEqual([]);
    expect(liveFeaturedPlaces(FEATURED_PLACES, (id) => id === 'obo-mansion').map((p) => p.venueId)).toEqual(['obo-mansion']);
  });

  it('writes the headline', () => {
    expect(featuredHeadline(FEATURED_PLACES)).toBe('OBO Mansion and Dangote Refinery are now live!');
    expect(featuredHeadline([FEATURED_PLACES[0]!])).toBe('OBO Mansion is now live!');
  });
});
