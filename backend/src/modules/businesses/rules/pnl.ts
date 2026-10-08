import {
  CIT_RATE,
  CIT_TURNOVER_THRESHOLD,
  DISTRICTS,
  DISTRICT_FOOT_TRAFFIC,
  type BusinessTrait,
  type BusinessTypeDefinition,
  type DistrictId,
  type SkillKey,
  type Skills,
} from '@insidelife/shared';

/** Combined revenue multipliers (location × owner × management × season × events × prices) stay in this band. */
export const REVENUE_MULTIPLIER_BOUNDS = { min: 0.3, max: 1.8 } as const;
/** More units, slightly less each (the market saturates). */
export const UNIT_SCALING_EXPONENT = 0.9;
/** Pump price the fuel share of costs is calibrated at (₦/litre). */
export const BASE_FUEL_PRICE = 1_350;
/** Commercial rent follows residential rent levels, damped (shops in Ikoyi cost more, not 5.5× more). */
export const COMMERCIAL_RENT_ELASTICITY = 0.6;
/** Startup overhead grows with traction (bigger team), but slower than revenue. */
export const STARTUP_COST_ELASTICITY = 0.3;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export interface PnlConditions {
  readonly units: number;
  readonly districtId: DistrictId;
  /** 0-1 owner fit (weighted skills and connections). */
  readonly ownerScore: number;
  /** Management hours done ÷ target (0 = absentee owner). */
  readonly managementRatio: number;
  /** 0-1 share of the month the business was open. */
  readonly operatingShare: number;
  /** 0-1 share of the month in Detty December. */
  readonly dettyDecember: number;
  /** 0-1 share of the month under fuel scarcity. */
  readonly fuelScarcity: number;
  readonly rainy: boolean;
  /** Average world price index over the month. */
  readonly priceIndex: number;
  /** Average pump price ÷ BASE_FUEL_PRICE. */
  readonly fuelPriceRatio: number;
  /** Revenue multiplier from this month's life events (viral review, task force…). */
  readonly eventModifier: number;
  /** One-off costs from this month's life events (theft, repairs, levies). */
  readonly eventCosts: number;
  /** Startup traction (1 for everything else). */
  readonly traction: number;
}

export interface PnlResult {
  readonly revenue: number;
  readonly variableCosts: number;
  readonly fixedCosts: number;
  readonly eventCosts: number;
  readonly profitBeforeTax: number;
  readonly tax: number;
  /** After tax; negative = loss. */
  readonly profit: number;
  /** The clamped revenue multiplier actually applied. */
  readonly multiplier: number;
}

/** Owner fit from skills and connections (weights sum to 1). */
export function ownerScore(type: BusinessTypeDefinition, skills: Skills, connections: number): number {
  let score = 0;
  let weights = 0;
  for (const [trait, weight] of Object.entries(type.ownerWeights) as Array<[BusinessTrait, number]>) {
    const value = trait === 'connections' ? connections : skills[trait as SkillKey];
    score += weight * clamp(value / 100, 0, 1);
    weights += weight;
  }
  return weights > 0 ? score / weights : 0.5;
}

/** 0.6-1.3: premium businesses love rich districts, mass-market ones love busy streets. */
export function locationFit(type: BusinessTypeDefinition, districtId: DistrictId): number {
  const district = DISTRICTS[districtId];
  const affluence = 1 + type.affluence * ((district.prestige - 40) / 120);
  const traffic = DISTRICT_FOOT_TRAFFIC[districtId] ** type.footTraffic;
  return clamp(affluence * traffic, 0.6, 1.3);
}

/** 0.8-1.25 from the owner's fit. */
export function ownerFactor(score: number): number {
  return 0.8 + 0.45 * clamp(score, 0, 1);
}

/** 0.85 (absentee) to 1.10 (hands-on). */
export function managementFactor(ratio: number): number {
  return 0.85 + 0.25 * clamp(ratio, 0, 1);
}

/** Blend a seasonal multiplier by the share of the month it applied. */
const blend = (multiplier: number | undefined, share: number): number => 1 + ((multiplier ?? 1) - 1) * clamp(share, 0, 1);

export function seasonalFactor(type: BusinessTypeDefinition, conditions: Pick<PnlConditions, 'dettyDecember' | 'fuelScarcity' | 'rainy'>): number {
  return blend(type.seasonality.dettyDecember, conditions.dettyDecember) * blend(type.seasonality.fuelScarcity, conditions.fuelScarcity) * (conditions.rainy ? (type.seasonality.rainy ?? 1) : 1);
}

/** Monthly revenue per unit before multipliers: log-normal around the median, clamped to the type's band. */
export function baseRevenuePerUnit(type: BusinessTypeDefinition, draw: number, traction: number): number {
  const lucky = type.revenue.median * Math.exp(type.revenue.sigma * draw) * Math.max(0, traction);
  return clamp(lucky, type.revenue.min, type.revenue.max);
}

/**
 * One month of trading. Pure: the caller supplies the standard-normal `draw` from the character's seeded RNG.
 * Revenue is bounded per unit; costs follow the district's rent level and the pump price; Companies Income Tax
 * applies once annualised revenue passes the small-company threshold.
 */
export function computeMonthlyPnl(type: BusinessTypeDefinition, conditions: PnlConditions, draw: number): PnlResult {
  const units = Math.max(1, Math.floor(conditions.units));
  const share = clamp(conditions.operatingShare, 0, 1);
  const multiplier = clamp(
    locationFit(type, conditions.districtId) *
      ownerFactor(conditions.ownerScore) *
      managementFactor(conditions.managementRatio) *
      seasonalFactor(type, conditions) *
      Math.max(0, conditions.eventModifier) *
      conditions.priceIndex,
    REVENUE_MULTIPLIER_BOUNDS.min,
    REVENUE_MULTIPLIER_BOUNDS.max,
  );
  const traction = type.growth ? conditions.traction : 1;
  const revenue = Math.round(baseRevenuePerUnit(type, draw, traction) * units ** UNIT_SCALING_EXPONENT * multiplier * share);
  const variableCosts = Math.round(revenue * type.costs.variableShare);

  const growthCost = type.growth ? Math.max(1, traction) ** STARTUP_COST_ELASTICITY : 1;
  const overhead = type.costs.fixedMonthly * units * share * conditions.priceIndex * growthCost;
  const rent = overhead * type.costs.rentShare * DISTRICTS[conditions.districtId].rentMultiplier ** COMMERCIAL_RENT_ELASTICITY;
  const fuel = overhead * type.costs.fuelShare * Math.max(0, conditions.fuelPriceRatio);
  const other = overhead * Math.max(0, 1 - type.costs.rentShare - type.costs.fuelShare);
  const fixedCosts = Math.round(rent + fuel + other);
  const eventCosts = Math.max(0, Math.round(conditions.eventCosts));

  const profitBeforeTax = revenue - variableCosts - fixedCosts - eventCosts;
  const annualisedRevenue = share > 0 ? (revenue / share) * 12 : 0;
  const tax = profitBeforeTax > 0 && annualisedRevenue > CIT_TURNOVER_THRESHOLD ? Math.round(profitBeforeTax * CIT_RATE) : 0;
  return { revenue, variableCosts, fixedCosts, eventCosts, profitBeforeTax, tax, profit: profitBeforeTax - tax, multiplier };
}

/** Startup traction random walk: the founder's fit and hands-on time push the drift up. */
export function nextTraction(type: BusinessTypeDefinition, traction: number, score: number, managementRatio: number, draw: number): number {
  const growth = type.growth;
  if (!growth) return 1;
  const drift = growth.drift + 0.12 * (clamp(score, 0, 1) - 0.4) + 0.05 * (clamp(managementRatio, 0, 1) - 0.5);
  return clamp(traction * Math.exp(drift + growth.volatility * draw), growth.min, growth.max);
}

/** Neutral conditions for a typical month in a good district (catalogue previews and tests). */
export function typicalConditions(type: BusinessTypeDefinition, overrides: Partial<PnlConditions> = {}): PnlConditions {
  return {
    units: 1,
    districtId: overrides.districtId ?? bestDistrict(type),
    ownerScore: 0.4,
    managementRatio: 0.5,
    operatingShare: 1,
    dettyDecember: 0,
    fuelScarcity: 0,
    rainy: false,
    priceIndex: 1,
    fuelPriceRatio: 1,
    eventModifier: 1,
    eventCosts: 0,
    traction: 1,
    ...overrides,
  };
}

const bestDistrictCache = new Map<string, DistrictId>();

/** The allowed district with the best net location economics for one unit (cached per type). */
export function bestDistrict(type: BusinessTypeDefinition): DistrictId {
  const cached = bestDistrictCache.get(type.id);
  if (cached) return cached;
  const candidates = (type.allowedDistricts ?? (Object.keys(DISTRICTS) as DistrictId[])).slice();
  let best = candidates[0] ?? 'surulere';
  let bestProfit = Number.NEGATIVE_INFINITY;
  for (const districtId of candidates) {
    const result = computeMonthlyPnl(type, typicalConditions(type, { districtId }), 0);
    if (result.profit > bestProfit) {
      best = districtId;
      bestProfit = result.profit;
    }
  }
  bestDistrictCache.set(type.id, best);
  return best;
}
