import {
  BLUEPRINTS,
  DAYS_PER_YEAR,
  DISTRICTS,
  DISTRICT_IDS,
  HOUSING_TYPES,
  HOUSING_TYPE_IDS,
  LAND_DISTRICT_IDS,
  LAND_TITLES,
  LAND_TITLE_IDS,
  RENT_NOISE,
  SCAM_PRICE_THRESHOLD,
  availableTitles,
  dailyChance,
  findListing,
  generateListings,
  generatorLitresPerDay,
  homePrestige,
  landPricePerPlot,
  landPurchaseCosts,
  landQuote,
  marketRent,
  monthlyLandGrowth,
  nepaComfortPenalty,
  parseListingId,
  renewalAmount,
  rentQuote,
  rentUpfront,
  serviceChargeFor,
  type LandTitleId,
} from '@insidelife/shared';

const SEED = 'eko-o-ni-baje';

/** Largest rounding step used for rents (₦100k above ₦10m). */
const halfStep = (amount: number): number => (amount < 1_000_000 ? 5_000 : amount < 10_000_000 ? 25_000 : 50_000);

describe('rental listings', () => {
  it('are deterministic per district × type × week', () => {
    const first = generateListings(SEED, 'surulere', 'three-bed', 412);
    const again = generateListings(SEED, 'surulere', 'three-bed', 412);
    expect(again).toEqual(first);
    expect(first.length).toBe(HOUSING_TYPES['three-bed'].listingsPerWeek);
    expect(generateListings(SEED, 'surulere', 'three-bed', 413)).not.toEqual(first);
    expect(generateListings('another-world', 'surulere', 'three-bed', 412)).not.toEqual(first);
  });

  it('round-trips listing ids and re-derives the same listing', () => {
    for (const listing of generateListings(SEED, 'lekki', 'duplex', 7)) {
      expect(parseListingId(listing.id)).toEqual({ districtId: 'lekki', typeId: 'duplex', weekIndex: 7, n: expect.any(Number) });
      expect(findListing(SEED, listing.id)).toEqual(listing);
    }
    expect(findListing(SEED, 'lekki.duplex.7.99')).toBeNull();
    expect(parseListingId('atlantis.duplex.7.1')).toBeNull();
    expect(parseListingId('lekki.castle.7.1')).toBeNull();
    expect(parseListingId('lekki.duplex.x.1')).toBeNull();
  });

  it('price within ±15% of base × district multiplier (plus rounding)', () => {
    for (const districtId of DISTRICT_IDS) {
      for (const typeId of HOUSING_TYPE_IDS) {
        for (let week = 0; week < 30; week++) {
          for (const listing of generateListings(SEED, districtId, typeId, week)) {
            const centre = HOUSING_TYPES[typeId].baseAnnualRent * DISTRICTS[districtId].rentMultiplier;
            expect(listing.annualRent).toBeGreaterThanOrEqual(centre * (1 - RENT_NOISE) - halfStep(listing.annualRent));
            expect(listing.annualRent).toBeLessThanOrEqual(centre * (1 + RENT_NOISE) + halfStep(listing.annualRent));
            expect(listing.marketRent).toBe(marketRent(districtId, typeId));
            // Only "too good to be true" prices carry scam risk.
            const discount = listing.annualRent / centre - 1;
            const rounding = halfStep(listing.annualRent) / centre + 1e-9;
            if (listing.scamRisk > 0) expect(discount).toBeLessThanOrEqual(SCAM_PRICE_THRESHOLD + rounding);
            if (discount > SCAM_PRICE_THRESHOLD + rounding) expect(listing.scamRisk).toBe(0);
          }
        }
      }
    }
  });

  it('respects where each type exists', () => {
    expect(generateListings(SEED, 'ikoyi', 'face-me', 1)).toEqual([]);
    expect(generateListings(SEED, 'banana-island', 'face-me', 1)).toEqual([]);
    for (const districtId of DISTRICT_IDS) {
      const mansions = generateListings(SEED, districtId, 'mansion', 1);
      if (DISTRICTS[districtId].side !== 'island') expect(mansions).toEqual([]);
    }
    expect(generateListings(SEED, 'mushin', 'face-me', 1).length).toBeGreaterThan(0);
  });

  it('is calibrated to 2026 Lagos rents', () => {
    expect(marketRent('ikorodu', 'self-contain')).toBeGreaterThanOrEqual(200_000);
    expect(marketRent('ikorodu', 'self-contain')).toBeLessThanOrEqual(400_000);
    expect(marketRent('surulere', 'three-bed')).toBeGreaterThanOrEqual(2_500_000);
    expect(marketRent('surulere', 'three-bed')).toBeLessThanOrEqual(5_000_000);
    expect(marketRent('ikoyi', 'three-bed')).toBeGreaterThanOrEqual(10_000_000);
    expect(marketRent('ikoyi', 'three-bed')).toBeLessThanOrEqual(25_000_000);
    expect(marketRent('banana-island', 'mansion')).toBeGreaterThanOrEqual(120_000_000);
  });

  it('charges service charge on the Island only (and never for face-me rooms)', () => {
    expect(serviceChargeFor('ikoyi', 'three-bed', 20_000_000)).toBe(3_000_000);
    expect(serviceChargeFor('lekki', 'mini-flat', 4_000_000)).toBe(480_000);
    expect(serviceChargeFor('surulere', 'three-bed', 3_500_000)).toBe(0);
    expect(serviceChargeFor('ajah', 'face-me', 300_000)).toBe(0);
  });
});

describe('rent upfront maths', () => {
  it('is a year plus 10% agency, 10% legal and 10% caution', () => {
    expect(rentUpfront(1_000_000)).toEqual({ rent: 1_000_000, agency: 100_000, legal: 100_000, caution: 100_000, total: 1_300_000 });
  });

  it('adds service charge and the inspection fee on top', () => {
    const quote = rentQuote({ annualRent: 2_500_000, serviceCharge: 300_000, inspectionFee: 25_000 });
    expect(quote).toEqual({ rent: 2_500_000, agency: 250_000, legal: 250_000, caution: 250_000, serviceCharge: 300_000, inspectionFee: 25_000, total: 3_575_000 });
    expect(quote.total).toBe(quote.rent + quote.agency + quote.legal + quote.caution + quote.serviceCharge + quote.inspectionFee);
  });

  it('every generated listing quotes consistently', () => {
    for (const listing of generateListings(SEED, 'victoria-island', 'three-bed', 3)) {
      const quote = rentQuote(listing);
      expect(quote.total).toBe(Math.round(listing.annualRent * 1.3) + listing.serviceCharge + listing.inspectionFee);
      expect(listing.inspectionFee).toBeGreaterThanOrEqual(5_000);
      expect(listing.inspectionFee).toBeLessThanOrEqual(100_000);
    }
  });

  it('renewals are rent (+ service charge) per year, no agency or legal', () => {
    expect(renewalAmount(1_000_000, 0, 1)).toBe(1_000_000);
    expect(renewalAmount(1_000_000, 150_000, 2)).toBe(2_300_000);
  });
});

describe('land titles', () => {
  it('price titles from C of O down to survey-only', () => {
    expect(LAND_TITLE_IDS.map((id) => LAND_TITLES[id].priceMultiplier)).toEqual([1, 0.95, 0.75, 0.5]);
  });

  it('weaker paper means more wahala and worse odds in court', () => {
    const ordered = LAND_TITLE_IDS.map((id) => LAND_TITLES[id]);
    for (let i = 1; i < ordered.length; i++) {
      const stronger = ordered[i - 1]!;
      const weaker = ordered[i]!;
      expect(weaker.disputePerYear).toBeGreaterThan(stronger.disputePerYear);
      expect(weaker.demolitionPerYear).toBeGreaterThanOrEqual(stronger.demolitionPerYear);
      expect(weaker.courtWinChance).toBeLessThan(stronger.courtWinChance);
    }
    expect(LAND_TITLES['c-of-o'].demolitionPerYear).toBe(0);
    expect(LAND_TITLES['governors-consent'].demolitionPerYear).toBe(0);
    expect(LAND_TITLES.survey.demolitionPerYear).toBeGreaterThan(0);
  });

  it('perfection climbs one step at a time to C of O', () => {
    let title: LandTitleId = 'survey';
    const path: LandTitleId[] = [title];
    for (let step = 0; step < 5; step++) {
      const next: LandTitleId | undefined = LAND_TITLES[title].perfection?.to;
      if (!next) break;
      title = next;
      path.push(title);
    }
    expect(path).toEqual(['survey', 'excision', 'governors-consent', 'c-of-o']);
    expect(LAND_TITLES['c-of-o'].perfection).toBeNull();
  });

  it('converts yearly incident risk into a daily chance that compounds back', () => {
    for (const id of LAND_TITLE_IDS) {
      const yearly = LAND_TITLES[id].disputePerYear;
      const daily = dailyChance(yearly);
      expect(1 - Math.pow(1 - daily, DAYS_PER_YEAR)).toBeCloseTo(yearly, 10);
    }
    expect(dailyChance(0)).toBe(0);
    expect(dailyChance(1)).toBe(1);
  });

  it('prime areas only sell strong titles', () => {
    expect(availableTitles('banana-island')).toEqual(['c-of-o', 'governors-consent']);
    expect(availableTitles('ikoyi')).toEqual(['c-of-o', 'governors-consent']);
    expect(availableTitles('lekki')).not.toContain('survey');
    expect(availableTitles('epe')).toEqual(LAND_TITLE_IDS);
  });

  it('quotes land as plots × weekly price × title multiplier plus 9% costs', () => {
    const perPlot = landPricePerPlot(SEED, 'epe', 10);
    expect(perPlot).not.toBeNull();
    const quote = landQuote(SEED, 'epe', 'survey', 2, 10);
    expect(quote?.marketValue).toBe((perPlot ?? 0) * 2);
    expect(quote?.price).toBe(Math.round((perPlot ?? 0) * 2 * 0.5));
    expect(quote?.costs.total).toBe(landPurchaseCosts(quote?.price ?? 0).total);
    expect((quote?.costs.total ?? 0) / (quote?.price ?? 1)).toBeCloseTo(0.09, 3);
    expect(landQuote(SEED, 'surulere', 'c-of-o', 1, 10)).toBeNull();
    expect(landQuote(SEED, 'banana-island', 'survey', 1, 10)).toBeNull();
  });

  it('weekly land prices stay near the district table', () => {
    for (const districtId of LAND_DISTRICT_IDS) {
      const base = DISTRICTS[districtId].landPricePerPlot ?? 0;
      for (let week = 0; week < 50; week++) {
        const price = landPricePerPlot(SEED, districtId, week) ?? 0;
        expect(price).toBe(landPricePerPlot(SEED, districtId, week));
        expect(price).toBeGreaterThanOrEqual(base * 0.94 - 50_000);
        expect(price).toBeLessThanOrEqual(base * 1.06 + 50_000);
      }
    }
  });
});

describe('land appreciation', () => {
  it('is deterministic per world seed, district and month', () => {
    expect(monthlyLandGrowth(SEED, 'epe', 40)).toBe(monthlyLandGrowth(SEED, 'epe', 40));
    expect(monthlyLandGrowth(SEED, 'epe', 40)).not.toBe(monthlyLandGrowth(SEED, 'epe', 41));
    expect(monthlyLandGrowth(SEED, 'epe', 40)).not.toBe(monthlyLandGrowth('other-world', 'epe', 40));
  });

  it('stays within ±3% of the district drift each month', () => {
    for (const districtId of LAND_DISTRICT_IDS) {
      const drift = Math.pow(1 + DISTRICTS[districtId].landAppreciation, 1 / 12);
      for (let month = 0; month < 120; month++) {
        const growth = monthlyLandGrowth(SEED, districtId, month);
        expect(growth).toBeGreaterThanOrEqual(drift * 0.97 - 1e-9);
        expect(growth).toBeLessThanOrEqual(drift * 1.03 + 1e-9);
      }
    }
  });

  it('compounds to roughly the district rate over the long run', () => {
    for (const districtId of ['epe', 'lekki', 'ikeja'] as const) {
      let value = 1;
      const years = 20;
      for (let month = 0; month < years * 12; month++) value *= monthlyLandGrowth(SEED, districtId, month);
      const annualised = Math.pow(value, 1 / years) - 1;
      expect(annualised).toBeCloseTo(DISTRICTS[districtId].landAppreciation, 1);
    }
  });
});

describe('power and prestige', () => {
  it('blackouts cost 0.6 comfort per dark hour without backup', () => {
    expect(nepaComfortPenalty({ gridHours: 9, backup: 'none', fuelled: true, gridCollapse: false })).toBe(9);
    expect(nepaComfortPenalty({ gridHours: 0, backup: 'none', fuelled: true, gridCollapse: true })).toBe(14.4);
  });

  it('a fuelled generator removes most of it; a dry one none', () => {
    const fuelled = nepaComfortPenalty({ gridHours: 9, backup: 'generator', fuelled: true, gridCollapse: false });
    expect(fuelled).toBeLessThan(2);
    expect(nepaComfortPenalty({ gridHours: 9, backup: 'generator', fuelled: false, gridCollapse: false })).toBe(9);
    expect(nepaComfortPenalty({ gridHours: 0, backup: 'inverter', fuelled: true, gridCollapse: true })).toBeGreaterThan(
      nepaComfortPenalty({ gridHours: 0, backup: 'solar', fuelled: true, gridCollapse: true }),
    );
  });

  it('generators burn more in darker districts', () => {
    expect(generatorLitresPerDay(8, 0.5)).toBeGreaterThan(generatorLitresPerDay(20, 0.5));
    expect(generatorLitresPerDay(24, 0.5)).toBe(0);
  });

  it('home prestige scales with district, type and ownership', () => {
    expect(homePrestige('banana-island', BLUEPRINTS.mansion.prestige, 'owned')).toBeGreaterThan(homePrestige('banana-island', BLUEPRINTS.mansion.prestige, 'rented'));
    expect(homePrestige('mushin', HOUSING_TYPES['face-me'].prestige, 'rented')).toBeLessThan(homePrestige('lekki', HOUSING_TYPES['two-bed'].prestige, 'rented'));
    expect(homePrestige('lekki', HOUSING_TYPES.duplex.prestige, 'family')).toBeLessThan(homePrestige('lekki', HOUSING_TYPES.duplex.prestige, 'rented'));
  });
});
