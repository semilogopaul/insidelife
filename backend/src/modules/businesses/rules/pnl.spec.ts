import { BUSINESS_TYPES, CIT_RATE, INCOME_MULTIPLIER, createRng, findBusinessType, type BusinessTypeDefinition } from '@insidelife/shared';
import {
  REVENUE_MULTIPLIER_BOUNDS,
  UNIT_SCALING_EXPONENT,
  computeMonthlyPnl,
  locationFit,
  managementFactor,
  nextTraction,
  ownerFactor,
  typicalConditions,
  type PnlConditions,
} from './pnl.js';

const type = (id: string): BusinessTypeDefinition => {
  const definition = findBusinessType(id);
  if (!definition) throw new RangeError(`missing business ${id}`);
  return definition;
};

/** The luckiest possible month: every multiplier at its ceiling. */
const bestCase = (definition: BusinessTypeDefinition, overrides: Partial<PnlConditions> = {}): PnlConditions =>
  typicalConditions(definition, {
    ownerScore: 1,
    managementRatio: 2,
    dettyDecember: 1,
    fuelScarcity: definition.seasonality.fuelScarcity && definition.seasonality.fuelScarcity > 1 ? 1 : 0,
    priceIndex: 1.4,
    fuelPriceRatio: 0.8,
    eventModifier: 1.6,
    traction: definition.growth?.max ?? 1,
    ...overrides,
  });

/** Profit over 12 random months under the given conditions. */
function yearOfProfit(definition: BusinessTypeDefinition, conditions: PnlConditions, seed: string): number {
  const rng = createRng(seed);
  let total = 0;
  for (let month = 0; month < 12; month++) total += computeMonthlyPnl(definition, conditions, rng.normal()).profit;
  return total;
}

describe('business P&L', () => {
  it('never lets a POS kiosk make millions', () => {
    const pos = type('pos-kiosk');
    const rng = createRng('pos-bounds');
    for (let i = 0; i < 5_000; i++) {
      const profit = computeMonthlyPnl(pos, bestCase(pos), rng.normal() * 3).profit;
      expect(profit).toBeLessThan(1_000_000 * INCOME_MULTIPLIER);
    }
    expect(computeMonthlyPnl(pos, bestCase(pos), 10).profit).toBeLessThan(500_000 * INCOME_MULTIPLIER);
  });

  it('keeps a typical POS kiosk month around ₦50-200k × the income multiplier', () => {
    const pos = type('pos-kiosk');
    const profit = computeMonthlyPnl(pos, typicalConditions(pos), 0).profit;
    expect(profit).toBeGreaterThan(50_000 * INCOME_MULTIPLIER);
    expect(profit).toBeLessThan(200_000 * INCOME_MULTIPLIER);
  });

  it('never returns 10× a filling station’s capital in a year — not even 1×', () => {
    const station = type('filling-station');
    const luckiest = computeMonthlyPnl(station, bestCase(station), 10).profit * 12;
    expect(luckiest).toBeLessThan(station.capital * INCOME_MULTIPLIER);
    const typical = yearOfProfit(station, typicalConditions(station), 'station');
    expect(typical / station.capital).toBeGreaterThan(0.05 * INCOME_MULTIPLIER);
    expect(typical / station.capital).toBeLessThan(0.4 * INCOME_MULTIPLIER);
  });

  it('bounds every business type: revenue never exceeds its ceiling × size × the multiplier cap', () => {
    for (const definition of BUSINESS_TYPES) {
      const units = definition.expansion.maxUnits;
      const result = computeMonthlyPnl(definition, bestCase(definition, { units }), 10);
      const ceiling = definition.revenue.max * units ** UNIT_SCALING_EXPONENT * REVENUE_MULTIPLIER_BOUNDS.max;
      expect(result.revenue, definition.id).toBeLessThanOrEqual(Math.ceil(ceiling));
    }
  });

  it('keeps even an impossibly lucky year of any big non-startup business below 3× its capital × the income multiplier', () => {
    for (const definition of BUSINESS_TYPES.filter((candidate) => !candidate.growth && candidate.capital >= 10_000_000)) {
      const luckiest = computeMonthlyPnl(definition, bestCase(definition), 10).profit * 12;
      expect(luckiest / definition.capital, definition.id).toBeLessThan(3 * INCOME_MULTIPLIER);
    }
  });

  it('charges Companies Income Tax only above the small-company threshold', () => {
    const pos = computeMonthlyPnl(type('pos-kiosk'), typicalConditions(type('pos-kiosk')), 0);
    expect(pos.tax).toBe(0);
    const supermarket = computeMonthlyPnl(type('supermarket'), typicalConditions(type('supermarket')), 0);
    expect(supermarket.tax).toBe(Math.round(supermarket.profitBeforeTax * CIT_RATE));
  });

  it('makes location matter', () => {
    const pos = type('pos-kiosk');
    expect(locationFit(pos, 'mushin')).toBeGreaterThan(locationFit(pos, 'banana-island'));
    const fashion = type('fashion-label');
    expect(locationFit(fashion, 'ikoyi')).toBeGreaterThan(locationFit(fashion, 'mushin'));
    const inMushin = computeMonthlyPnl(pos, typicalConditions(pos, { districtId: 'mushin' }), 0).profit;
    const inBanana = computeMonthlyPnl(pos, typicalConditions(pos, { districtId: 'banana-island' }), 0).profit;
    expect(inMushin).toBeGreaterThan(inBanana);
  });

  it('rewards owners who show up and know the trade', () => {
    expect(managementFactor(0)).toBeCloseTo(0.85, 5);
    expect(managementFactor(5)).toBeCloseTo(1.1, 5);
    expect(ownerFactor(1)).toBeGreaterThan(ownerFactor(0));
    const buka = type('buka');
    const absentee = computeMonthlyPnl(buka, typicalConditions(buka, { managementRatio: 0, ownerScore: 0.1 }), 0).profit;
    const handsOn = computeMonthlyPnl(buka, typicalConditions(buka, { managementRatio: 1, ownerScore: 0.8 }), 0).profit;
    expect(handsOn).toBeGreaterThan(absentee);
  });

  it('lets fuel scarcity hurt danfo owners and Detty December help event planners', () => {
    const danfo = type('danfo-transport');
    expect(computeMonthlyPnl(danfo, typicalConditions(danfo, { fuelScarcity: 1 }), 0).profit).toBeLessThan(computeMonthlyPnl(danfo, typicalConditions(danfo), 0).profit);
    const events = type('event-planning');
    expect(computeMonthlyPnl(events, typicalConditions(events, { dettyDecember: 1 }), 0).profit).toBeGreaterThan(computeMonthlyPnl(events, typicalConditions(events), 0).profit * 2);
  });

  it('pro-rates a business opened mid-month', () => {
    const salon = type('salon');
    const full = computeMonthlyPnl(salon, typicalConditions(salon), 0);
    const half = computeMonthlyPnl(salon, typicalConditions(salon, { operatingShare: 0.5 }), 0);
    expect(half.revenue).toBeCloseTo(full.revenue / 2, -2);
  });

  it('keeps startup traction within its band and mostly loses money at launch', () => {
    const startup = type('tech-startup');
    const rng = createRng('traction');
    let traction = 1;
    for (let month = 0; month < 500; month++) {
      traction = nextTraction(startup, traction, 0.5, 0.5, rng.normal());
      expect(traction).toBeGreaterThanOrEqual(startup.growth?.min ?? 0);
      expect(traction).toBeLessThanOrEqual(startup.growth?.max ?? 1);
    }
    expect(computeMonthlyPnl(startup, typicalConditions(startup), 0).profit).toBeLessThan(0);
    expect(nextTraction(type('buka'), 5, 1, 1, 3)).toBe(1);
  });
});
