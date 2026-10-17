import { boosted } from '../money/income-multiplier.js';
import type { DistrictId } from './geography.js';
import type { SkillKey } from './life.js';

/**
 * Businesses catalog — owned by the businesses domain.
 *
 * Every business is a bounded money machine: monthly revenue is log-normal around a calibrated median, clamped to a
 * hard [min, max] band per unit, then shaped by location, the owner's skills, hands-on management, the season and
 * the world economy. Costs are real (stock, staff, rent, diesel). Most months a POS kiosk makes ₦50-150k — never
 * millions — and a filling station returns ~10-25% a year, not 10×. Success is earned.
 */

export const BUSINESS_CATEGORIES = ['retail', 'food', 'services', 'transport', 'creative', 'tech', 'property', 'agric', 'energy'] as const;
export type BusinessCategory = (typeof BUSINESS_CATEGORIES)[number];

export const BUSINESS_RISKS = ['low', 'medium', 'high', 'very-high'] as const;
export type BusinessRisk = (typeof BUSINESS_RISKS)[number];

/** Owner traits that drive results: skills plus "man know man" connections. */
export type BusinessTrait = SkillKey | 'connections';

export interface BusinessExpansion {
  /** "Add another bus", "Open a second branch". */
  readonly label: string;
  /** Cost per extra unit (₦, before the world price index). */
  readonly cost: number;
  /** Maximum units including the first. */
  readonly maxUnits: number;
}

export interface BusinessRevenueModel {
  /** Typical monthly revenue per unit at neutral conditions (₦). */
  readonly median: number;
  /** Month-to-month log-normal volatility. */
  readonly sigma: number;
  /** Hard floor and ceiling per unit before multipliers (₦). */
  readonly min: number;
  readonly max: number;
}

export interface BusinessCostModel {
  /** Share of revenue spent on stock, ingredients, commissions and platform fees. */
  readonly variableShare: number;
  /** Fixed monthly overhead per unit: staff, rent, power, levies (₦, before the price index). */
  readonly fixedMonthly: number;
  /** Share of the fixed overhead that is rent (scales with the district's rent level). */
  readonly rentShare: number;
  /** Share of the fixed overhead that is petrol/diesel (scales with the pump price). */
  readonly fuelShare: number;
}

export interface BusinessSeasonality {
  /** Revenue multiplier during Detty December. */
  readonly dettyDecember?: number;
  /** Revenue multiplier during fuel scarcity (transport loses trips; stations with stock cash out). */
  readonly fuelScarcity?: number;
  /** Revenue multiplier in the rainy season. */
  readonly rainy?: number;
}

/** Startups only: traction follows a random walk; revenue scales with it. */
export interface BusinessGrowthModel {
  /** Base monthly log-drift (before the founder's skill). */
  readonly drift: number;
  readonly volatility: number;
  readonly min: number;
  readonly max: number;
}

export interface BusinessTypeDefinition {
  readonly id: string;
  readonly label: string;
  readonly emoji: string;
  readonly category: BusinessCategory;
  readonly blurb: string;
  /** Start-up capital (₦, before the world price index). */
  readonly capital: number;
  readonly expansion: BusinessExpansion;
  readonly revenue: BusinessRevenueModel;
  readonly costs: BusinessCostModel;
  /** -1 (mass market, loves Mushin) … +1 (premium, loves Ikoyi). */
  readonly affluence: number;
  /** 0-1: how much street foot traffic matters. */
  readonly footTraffic: number;
  /** Districts where this business can be set up (omitted = anywhere in Lagos). */
  readonly allowedDistricts?: readonly DistrictId[];
  /** Owner traits that matter (weights sum to 1). */
  readonly ownerWeights: Partial<Record<BusinessTrait, number>>;
  readonly seasonality: BusinessSeasonality;
  readonly risk: BusinessRisk;
  /** Hours of hands-on management per month (the `manage-business` action) for the full owner bonus. */
  readonly managementHours: number;
  /** Share of invested capital recoverable from assets when selling or closing. */
  readonly assetShare: number;
  /** Yearly loss of asset value. */
  readonly depreciationPerYear: number;
  /** Clout for owning one. */
  readonly status: number;
  readonly minAge: number;
  readonly growth?: BusinessGrowthModel;
}

const b = (definition: BusinessTypeDefinition): BusinessTypeDefinition => definition;

/** Takings and overheads as in real Lagos; `BUSINESS_TYPES` (below) is what the game runs: × INCOME_MULTIPLIER. */
const LAGOS_BUSINESS_TYPES: readonly BusinessTypeDefinition[] = [
  b({
    id: 'pos-kiosk',
    label: 'POS kiosk',
    emoji: '💳',
    category: 'services',
    blurb: 'Umbrella, table, two POS machines and an attendant. Small money, every day — the market is saturated.',
    capital: 350_000,
    expansion: { label: 'Add another kiosk', cost: 350_000, maxUnits: 5 },
    revenue: { median: 220_000, sigma: 0.25, min: 100_000, max: 400_000 },
    costs: { variableShare: 0.3, fixedMonthly: 100_000, rentShare: 0.15, fuelShare: 0 },
    affluence: -0.5,
    footTraffic: 0.9,
    ownerWeights: { hustle: 0.6, finance: 0.2, charisma: 0.2 },
    seasonality: { dettyDecember: 1.15 },
    risk: 'medium',
    managementHours: 8,
    assetShare: 0.3,
    depreciationPerYear: 0.25,
    status: 4,
    minAge: 17,
  }),
  b({
    id: 'provision-store',
    label: 'Provision store',
    emoji: '🏪',
    category: 'retail',
    blurb: 'Indomie, Peak milk, sachet water and “sell to me on credit”. Thin margins, loyal customers.',
    capital: 1_500_000,
    expansion: { label: 'Open another branch', cost: 1_500_000, maxUnits: 3 },
    revenue: { median: 900_000, sigma: 0.25, min: 400_000, max: 1_600_000 },
    costs: { variableShare: 0.8, fixedMonthly: 90_000, rentShare: 0.45, fuelShare: 0.1 },
    affluence: -0.3,
    footTraffic: 0.8,
    ownerWeights: { business: 0.4, hustle: 0.4, charisma: 0.2 },
    seasonality: { dettyDecember: 1.2 },
    risk: 'low',
    managementHours: 12,
    assetShare: 0.55,
    depreciationPerYear: 0.1,
    status: 6,
    minAge: 17,
  }),
  b({
    id: 'buka',
    label: 'Buka (local restaurant)',
    emoji: '🍲',
    category: 'food',
    blurb: 'Amala, ofada, pepper soup. Great food fills the benches; bad food empties them in a week.',
    capital: 3_000_000,
    expansion: { label: 'Open a second outlet', cost: 3_000_000, maxUnits: 3 },
    revenue: { median: 1_600_000, sigma: 0.3, min: 700_000, max: 3_500_000 },
    costs: { variableShare: 0.58, fixedMonthly: 560_000, rentShare: 0.2, fuelShare: 0.25 },
    affluence: -0.2,
    footTraffic: 0.7,
    ownerWeights: { cooking: 0.5, business: 0.3, charisma: 0.2 },
    seasonality: { dettyDecember: 1.3 },
    risk: 'medium',
    managementHours: 20,
    assetShare: 0.35,
    depreciationPerYear: 0.12,
    status: 10,
    minAge: 17,
  }),
  b({
    id: 'salon',
    label: 'Barbing & hair salon',
    emoji: '💈',
    category: 'services',
    blurb: 'Chairs, clippers, a big generator and a stylist who can do knotless in four hours.',
    capital: 2_500_000,
    expansion: { label: 'Add more chairs and stylists', cost: 1_500_000, maxUnits: 3 },
    revenue: { median: 800_000, sigma: 0.3, min: 350_000, max: 2_000_000 },
    costs: { variableShare: 0.45, fixedMonthly: 330_000, rentShare: 0.35, fuelShare: 0.35 },
    affluence: 0.1,
    footTraffic: 0.5,
    ownerWeights: { trade: 0.4, charisma: 0.3, business: 0.3 },
    seasonality: { dettyDecember: 1.35 },
    risk: 'medium',
    managementHours: 15,
    assetShare: 0.4,
    depreciationPerYear: 0.12,
    status: 10,
    minAge: 17,
  }),
  b({
    id: 'fashion-label',
    label: 'Fashion label',
    emoji: '👗',
    category: 'creative',
    blurb: 'Ankara, adire and asoebi orders. One celebrity in your outfit and the DMs explode.',
    capital: 5_000_000,
    expansion: { label: 'Open a flagship studio', cost: 6_000_000, maxUnits: 3 },
    revenue: { median: 1_400_000, sigma: 0.55, min: 250_000, max: 5_000_000 },
    costs: { variableShare: 0.5, fixedMonthly: 600_000, rentShare: 0.25, fuelShare: 0.15 },
    affluence: 0.6,
    footTraffic: 0.3,
    ownerWeights: { creative: 0.5, business: 0.3, charisma: 0.2 },
    seasonality: { dettyDecember: 1.8 },
    risk: 'high',
    managementHours: 20,
    assetShare: 0.3,
    depreciationPerYear: 0.15,
    status: 25,
    minAge: 17,
  }),
  b({
    id: 'dispatch-logistics',
    label: 'Dispatch & logistics (3 bikes)',
    emoji: '📦',
    category: 'transport',
    blurb: 'Three bikes, three riders, endless Instagram vendors who need same-day delivery.',
    capital: 6_000_000,
    expansion: { label: 'Add three more bikes', cost: 5_000_000, maxUnits: 5 },
    revenue: { median: 1_800_000, sigma: 0.25, min: 900_000, max: 3_400_000 },
    costs: { variableShare: 0.12, fixedMonthly: 1_250_000, rentShare: 0.1, fuelShare: 0.45 },
    affluence: 0.2,
    footTraffic: 0.2,
    ownerWeights: { business: 0.5, hustle: 0.3, tech: 0.2 },
    seasonality: { dettyDecember: 1.3, fuelScarcity: 1.1, rainy: 0.9 },
    risk: 'medium',
    managementHours: 15,
    assetShare: 0.45,
    depreciationPerYear: 0.2,
    status: 15,
    minAge: 18,
  }),
  b({
    id: 'event-planning',
    label: 'Event planning',
    emoji: '🎉',
    category: 'services',
    blurb: 'Owambes, weddings and corporate dinners. December pays for the whole year — if the rain doesn’t spoil it.',
    capital: 4_000_000,
    expansion: { label: 'Buy your own canopies, chairs and sound', cost: 5_000_000, maxUnits: 3 },
    revenue: { median: 1_000_000, sigma: 0.5, min: 150_000, max: 4_500_000 },
    costs: { variableShare: 0.55, fixedMonthly: 350_000, rentShare: 0.2, fuelShare: 0.2 },
    affluence: 0.5,
    footTraffic: 0.1,
    ownerWeights: { charisma: 0.4, business: 0.3, connections: 0.3 },
    seasonality: { dettyDecember: 2.4, rainy: 0.85 },
    risk: 'high',
    managementHours: 20,
    assetShare: 0.35,
    depreciationPerYear: 0.15,
    status: 20,
    minAge: 18,
  }),
  b({
    id: 'danfo-transport',
    label: 'Danfo transport',
    emoji: '🚌',
    category: 'transport',
    blurb: 'Buy a bus, hire a driver, collect weekly returns. Agberos, task force and spare parts eat into it.',
    capital: 18_000_000,
    expansion: { label: 'Add another bus', cost: 18_000_000, maxUnits: 10 },
    revenue: { median: 950_000, sigma: 0.2, min: 450_000, max: 1_500_000 },
    costs: { variableShare: 0.05, fixedMonthly: 450_000, rentShare: 0, fuelShare: 0 },
    affluence: -0.4,
    footTraffic: 0.6,
    allowedDistricts: ['ikeja', 'ikorodu', 'mushin', 'surulere', 'yaba', 'ojo', 'lagos-island', 'ajah', 'epe'],
    ownerWeights: { hustle: 0.4, business: 0.3, connections: 0.3 },
    seasonality: { dettyDecember: 1.15, fuelScarcity: 0.75 },
    risk: 'medium',
    managementHours: 8,
    assetShare: 0.6,
    depreciationPerYear: 0.12,
    status: 15,
    minAge: 18,
  }),
  b({
    id: 'tech-startup',
    label: 'Tech startup',
    emoji: '🚀',
    category: 'tech',
    blurb: 'Three engineers, cloud bills in dollars and a pitch deck. Most die; a few become unicorns.',
    capital: 20_000_000,
    expansion: { label: 'Raise a bigger team', cost: 15_000_000, maxUnits: 3 },
    revenue: { median: 600_000, sigma: 0.8, min: 0, max: 25_000_000 },
    costs: { variableShare: 0.25, fixedMonthly: 1_800_000, rentShare: 0.1, fuelShare: 0.08 },
    affluence: 0.3,
    footTraffic: 0,
    allowedDistricts: ['yaba', 'ikeja', 'lekki', 'victoria-island', 'ikoyi', 'surulere', 'lagos-island'],
    ownerWeights: { tech: 0.5, business: 0.4, charisma: 0.1 },
    seasonality: {},
    risk: 'very-high',
    managementHours: 40,
    assetShare: 0.1,
    depreciationPerYear: 0.3,
    status: 35,
    minAge: 17,
    growth: { drift: -0.03, volatility: 0.3, min: 0.2, max: 30 },
  }),
  b({
    id: 'real-estate-agency',
    label: 'Real estate agency',
    emoji: '🏘️',
    category: 'property',
    blurb: 'Show flats, close deals, collect 10% agency fees. Lumpy money; your connections are your pipeline.',
    capital: 8_000_000,
    expansion: { label: 'Open a second office', cost: 6_000_000, maxUnits: 3 },
    revenue: { median: 1_200_000, sigma: 0.6, min: 0, max: 7_000_000 },
    costs: { variableShare: 0.3, fixedMonthly: 700_000, rentShare: 0.4, fuelShare: 0.15 },
    affluence: 0.8,
    footTraffic: 0,
    ownerWeights: { charisma: 0.35, business: 0.3, connections: 0.35 },
    seasonality: { dettyDecember: 1.2 },
    risk: 'high',
    managementHours: 20,
    assetShare: 0.2,
    depreciationPerYear: 0.15,
    status: 25,
    minAge: 18,
  }),
  b({
    id: 'poultry-farm',
    label: 'Poultry farm',
    emoji: '🐔',
    category: 'agric',
    blurb: 'Two thousand birds in Epe. Feed prices, diesel and bird flu are your enemies; Christmas is your friend.',
    capital: 12_000_000,
    expansion: { label: 'Build another pen (2,000 birds)', cost: 9_000_000, maxUnits: 4 },
    revenue: { median: 2_800_000, sigma: 0.3, min: 1_000_000, max: 5_000_000 },
    costs: { variableShare: 0.62, fixedMonthly: 650_000, rentShare: 0, fuelShare: 0.4 },
    affluence: 0,
    footTraffic: 0,
    allowedDistricts: ['epe', 'ikorodu', 'ojo'],
    ownerWeights: { business: 0.5, hustle: 0.3, trade: 0.2 },
    seasonality: { dettyDecember: 1.3 },
    risk: 'medium',
    managementHours: 20,
    assetShare: 0.5,
    depreciationPerYear: 0.08,
    status: 18,
    minAge: 18,
  }),
  b({
    id: 'supermarket',
    label: 'Supermarket',
    emoji: '🛍️',
    category: 'retail',
    blurb: 'Twenty-five staff, imported cereal and a diesel bill that will make you cry. Volume is everything.',
    capital: 80_000_000,
    expansion: { label: 'Open another branch', cost: 70_000_000, maxUnits: 3 },
    revenue: { median: 32_000_000, sigma: 0.2, min: 15_000_000, max: 50_000_000 },
    costs: { variableShare: 0.8, fixedMonthly: 4_200_000, rentShare: 0.3, fuelShare: 0.2 },
    affluence: 0.5,
    footTraffic: 0.4,
    ownerWeights: { business: 0.6, finance: 0.2, charisma: 0.2 },
    seasonality: { dettyDecember: 1.25 },
    risk: 'low',
    managementHours: 30,
    assetShare: 0.6,
    depreciationPerYear: 0.06,
    status: 60,
    minAge: 21,
  }),
  b({
    id: 'filling-station',
    label: 'Filling station',
    emoji: '⛽',
    category: 'energy',
    blurb: 'Pumps, tanks and a DPR licence. Steady margins, and when scarcity hits, the queue is yours.',
    capital: 300_000_000,
    expansion: { label: 'Open a second station', cost: 280_000_000, maxUnits: 3 },
    revenue: { median: 9_500_000, sigma: 0.2, min: 4_000_000, max: 15_000_000 },
    costs: { variableShare: 0.05, fixedMonthly: 4_000_000, rentShare: 0, fuelShare: 0.15 },
    affluence: 0,
    footTraffic: 0.3,
    allowedDistricts: ['ikeja', 'ikorodu', 'mushin', 'surulere', 'yaba', 'ojo', 'lagos-island', 'lekki', 'ajah', 'epe', 'victoria-island'],
    ownerWeights: { business: 0.5, finance: 0.2, connections: 0.3 },
    seasonality: { fuelScarcity: 1.35 },
    risk: 'low',
    managementHours: 20,
    assetShare: 0.7,
    depreciationPerYear: 0.04,
    status: 90,
    minAge: 21,
  }),
];

/**
 * What the game runs: monthly takings and fixed overheads × INCOME_MULTIPLIER, so profit grows by the same factor as
 * job pay. What it costs to open a business is a price and stays as in real Lagos, so businesses pay back faster.
 */
export const BUSINESS_TYPES: readonly BusinessTypeDefinition[] = LAGOS_BUSINESS_TYPES.map((type) => ({
  ...type,
  revenue: { ...type.revenue, median: boosted(type.revenue.median), min: boosted(type.revenue.min), max: boosted(type.revenue.max) },
  costs: { ...type.costs, fixedMonthly: boosted(type.costs.fixedMonthly) },
}));

const BUSINESS_INDEX: ReadonlyMap<string, BusinessTypeDefinition> = new Map(BUSINESS_TYPES.map((type) => [type.id, type]));

export function findBusinessType(id: string): BusinessTypeDefinition | undefined {
  return BUSINESS_INDEX.get(id);
}

/** How busy each district's streets are (mass-market businesses care most). */
export const DISTRICT_FOOT_TRAFFIC: Readonly<Record<DistrictId, number>> = {
  ikeja: 1.12,
  ikorodu: 1,
  mushin: 1.08,
  surulere: 1.05,
  yaba: 1.08,
  ojo: 0.95,
  'lagos-island': 1.15,
  ikoyi: 0.9,
  'banana-island': 0.75,
  'victoria-island': 1.02,
  lekki: 1,
  ajah: 1,
  epe: 0.85,
  'abuja-cbd': 1.1,
  maitama: 0.85,
  asokoro: 0.8,
  wuse: 1.12,
  garki: 1.08,
  jabi: 1.04,
  gwarinpa: 1,
  kubwa: 1.02,
  lugbe: 0.92,
};

/** The most businesses one character can run at once. */
export const MAX_BUSINESSES = 5;

/** Annualised revenue above which Companies Income Tax applies (small companies are exempt under the NTA 2025). */
export const CIT_TURNOVER_THRESHOLD = 100_000_000;
export const CIT_RATE = 0.3;

export function businessAllowedIn(type: BusinessTypeDefinition, districtId: DistrictId): boolean {
  return !type.allowedDistricts || type.allowedDistricts.includes(districtId);
}
