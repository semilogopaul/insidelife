import { describe, expect, it } from 'vitest';
import { rentQuote, type HousingOverviewDto } from '@insidelife/shared';
import {
  comfortRows,
  constructionMilestones,
  filterHouses,
  filterListings,
  homeNextStep,
  houseAge,
  houseCondition,
  houseLines,
  isBareHome,
  landLines,
  looksSuspicious,
  marketLabel,
  oddsPerYear,
  upfrontLines,
} from '../services/homes-rules';

describe('rent upfront breakdown', () => {
  it('itemises rent + agency + legal + caution and sums to the quote total', () => {
    const quote = rentQuote({ annualRent: 1_200_000, serviceCharge: 0, inspectionFee: 10_000 });
    const { lines, total } = upfrontLines(quote);
    expect(lines.map((line) => line.label)).toEqual([
      'Rent (1 year upfront)',
      'Agency fee (10%)',
      'Legal fee (10%)',
      'Caution deposit (10%)',
      'Inspection fee',
    ]);
    expect(lines.reduce((sum, line) => sum + line.amount, 0)).toBe(total);
    expect(total).toBe(1_200_000 * 1.3 + 10_000);
  });

  it('adds the service charge in serviced estates', () => {
    const quote = rentQuote({ annualRent: 5_000_000, serviceCharge: 750_000, inspectionFee: 50_000 });
    const { lines, total } = upfrontLines(quote);
    expect(lines.some((line) => line.label === 'Service charge')).toBe(true);
    expect(lines.reduce((sum, line) => sum + line.amount, 0)).toBe(total);
  });
});

describe('scam hints and market comparison', () => {
  it('flags listings at least 10% under market', () => {
    expect(looksSuspicious({ annualRent: 90_000, marketRent: 100_000 })).toBe(true);
    expect(looksSuspicious({ annualRent: 91_000, marketRent: 100_000 })).toBe(false);
    expect(marketLabel({ annualRent: 88_000, marketRent: 100_000 })).toBe('12% below market');
    expect(marketLabel({ annualRent: 105_000, marketRent: 100_000 })).toBe('5% above market');
    expect(marketLabel({ annualRent: 100_000, marketRent: 100_000 })).toBe('At market rate');
  });

  it('filters by district/type/budget and sorts by day-one cost', () => {
    const listing = (
      id: string,
      districtId: 'yaba' | 'lekki',
      type: 'face-me' | 'mini-flat',
      total: number,
      affordable: boolean,
    ) => ({
      id,
      districtId,
      type,
      affordable,
      upfront: { rent: 0, agency: 0, legal: 0, caution: 0, serviceCharge: 0, inspectionFee: 0, total },
    });
    const all = [
      listing('a', 'yaba', 'mini-flat', 900_000, true),
      listing('b', 'yaba', 'face-me', 300_000, true),
      listing('c', 'lekki', 'mini-flat', 4_000_000, false),
    ];
    expect(
      filterListings(all, { district: 'all', type: 'all', affordableOnly: true }).map((entry) => entry.id),
    ).toEqual(['b', 'a']);
    expect(
      filterListings(all, { district: 'lekki', type: 'all', affordableOnly: false }).map((entry) => entry.id),
    ).toEqual(['c']);
    expect(
      filterListings(all, { district: 'all', type: 'mini-flat', affordableOnly: false }).map(
        (entry) => entry.id,
      ),
    ).toEqual(['a', 'c']);
  });
});

describe('land', () => {
  it('multiplies price and fees by plots and matches the per-plot total', () => {
    const offer = {
      pricePerPlot: 10_000_000,
      costsPerPlot: { agency: 500_000, legal: 250_000, survey: 150_000, total: 900_000 },
      totalPerPlot: 10_900_000,
    };
    const { lines, total } = landLines(offer, 3);
    expect(total).toBe(32_700_000);
    expect(lines.reduce((sum, line) => sum + line.amount, 0)).toBe(total);
    expect(lines[0]?.label).toBe('Land (3 plots)');
  });

  it('says risk in plain odds', () => {
    expect(oddsPerYear(0)).toBe('No known risk');
    expect(oddsPerYear(0.01)).toBe('About 1 in 100 a year');
    expect(oddsPerYear(0.18)).toBe('About 1 in 6 a year');
  });
});

describe('houses for sale', () => {
  it('itemises price, agency, legal and survey and sums to the total', () => {
    const listing = {
      price: 40_000_000,
      costs: { agency: 2_000_000, legal: 1_000_000, survey: 600_000, total: 3_600_000 },
      total: 43_600_000,
    };
    const { lines, total } = houseLines(listing);
    expect(lines.map((line) => line.label)).toEqual([
      'House & land',
      'Agency fee',
      'Legal fee',
      'Survey plan',
    ]);
    expect(lines.reduce((sum, line) => sum + line.amount, 0)).toBe(total);
    expect(total).toBe(43_600_000);
  });

  it('describes condition and age in words', () => {
    expect(houseCondition(100)).toEqual({ label: 'Brand new', tone: 'good' });
    expect(houseCondition(92).label).toBe('Excellent');
    expect(houseCondition(84).label).toBe('Good');
    expect(houseCondition(71)).toEqual({ label: 'Needs touch-ups', tone: 'warn' });
    expect(houseAge(0)).toBe('Never lived in');
    expect(houseAge(1)).toBe('1 year old');
    expect(houseAge(9)).toBe('9 years old');
  });

  it('filters by district, kind and budget, cheapest all-in first', () => {
    const house = (
      id: string,
      districtId: 'ikorodu' | 'lekki',
      blueprintId: 'bungalow' | 'duplex',
      total: number,
      affordable: boolean,
    ) => ({ id, districtId, blueprintId, total, affordable });
    const all = [
      house('a', 'lekki', 'duplex', 800_000_000, false),
      house('b', 'ikorodu', 'bungalow', 40_000_000, true),
      house('c', 'ikorodu', 'duplex', 70_000_000, false),
    ];
    expect(
      filterHouses(all, { district: 'all', blueprint: 'all', affordableOnly: false }).map((h) => h.id),
    ).toEqual(['b', 'c', 'a']);
    expect(
      filterHouses(all, { district: 'all', blueprint: 'all', affordableOnly: true }).map((h) => h.id),
    ).toEqual(['b']);
    expect(
      filterHouses(all, { district: 'ikorodu', blueprint: 'duplex', affordableOnly: false }).map((h) => h.id),
    ).toEqual(['c']);
  });
});

describe('construction and comfort', () => {
  it('ticks milestones as the build progresses', () => {
    expect(constructionMilestones(0.5).map((milestone) => milestone.done)).toEqual([
      true,
      true,
      false,
      false,
    ]);
    expect(constructionMilestones(1).every((milestone) => milestone.done)).toBe(true);
  });

  it('lists comfort parts with NEPA last', () => {
    expect(
      comfortRows({ home: 2, area: 1, furniture: 1.9, power: -8.4, total: -3.5 }).map((row) => row.key),
    ).toEqual(['home', 'area', 'furniture', 'power']);
  });
});

describe('home next step', () => {
  const overview = (patch: Partial<HousingOverviewDto>) =>
    ({
      home: { ownership: 'family' },
      lease: null,
      power: { backup: 'none', comfortPenalty: 8 },
      ...patch,
    }) as unknown as HousingOverviewDto;

  it('nudges moving out of the family house first', () => {
    expect(homeNextStep(overview({}), 0)).toEqual({ kind: 'move-out' });
  });

  it('raises overdue rent and quit notices above everything', () => {
    const lease = { status: 'grace', endAt: 0, nonRenewing: false };
    expect(homeNextStep(overview({ lease: lease as HousingOverviewDto['lease'] }), 0)).toEqual({
      kind: 'rent-overdue',
    });
    expect(
      homeNextStep(overview({ lease: { ...lease, status: 'notice' } as HousingOverviewDto['lease'] }), 0),
    ).toEqual({ kind: 'quit-notice' });
  });

  it('suggests power backup when renting in the dark', () => {
    const lease = { status: 'active', endAt: 10_000_000, nonRenewing: false } as HousingOverviewDto['lease'];
    expect(
      homeNextStep(overview({ home: { ownership: 'rented' } as HousingOverviewDto['home'], lease }), 0),
    ).toEqual({ kind: 'power' });
  });

  it('nudges furnishing a bare place you rent or own (before power)', () => {
    const lease = { status: 'active', endAt: 10_000_000, nonRenewing: false } as HousingOverviewDto['lease'];
    const rented = overview({ home: { ownership: 'rented' } as HousingOverviewDto['home'], lease });
    expect(homeNextStep(rented, 0, ['bed-foam-mattress', 'phone-tecno-spark'])).toEqual({ kind: 'furnish' });
    expect(homeNextStep(rented, 0, ['bed-foam-mattress', 'fan-standing'])).toEqual({ kind: 'power' });
    expect(homeNextStep(overview({ home: { ownership: 'owned' } as HousingOverviewDto['home'] }), 0, [])).toEqual({ kind: 'furnish' });
    // The family house comes furnished.
    expect(homeNextStep(overview({}), 0, [])).toEqual({ kind: 'move-out' });
  });

  it('calls a home bare until something beyond a bed furnishes it', () => {
    expect(isBareHome('rented', [])).toBe(true);
    expect(isBareHome('rented', ['bed-spring', 'lantern-rechargeable', 'laptop-hp-uk'])).toBe(true);
    expect(isBareHome('owned', ['chairs-plastic'])).toBe(false);
    expect(isBareHome('owned', ['microwave'])).toBe(false);
    expect(isBareHome('family', [])).toBe(false);
  });
});
