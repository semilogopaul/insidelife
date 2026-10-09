/**
 * Housing & property catalog — owned by the housing domain.
 *
 * Rents, land prices, title risks and build costs are calibrated to Lagos 2026 (docs/research/nigeria-economy-2026.md).
 * Everything here is pure and deterministic: listings are a function of (world seed, district, type, week), land
 * prices of (world seed, district, week), so server and client agree without storing anything.
 */
import { DISTRICTS, DISTRICT_IDS, type DistrictId } from './geography.js';
import type { BackgroundId } from './life.js';
import { rngFor } from '../random/rng.js';
import { rentUpfront } from '../rules/finance.js';
import { DAYS_PER_WEEK, DAYS_PER_YEAR, MINUTES_PER_DAY, type GameMinute } from '../time/calendar.js';
import { economyOn } from '../world/world.js';

// ---------------------------------------------------------------------------------------------------------------
// Housing types (rentals)
// ---------------------------------------------------------------------------------------------------------------

export const HOUSING_TYPE_IDS = ['face-me', 'self-contain', 'mini-flat', 'two-bed', 'three-bed', 'duplex', 'mansion'] as const;
export type HousingTypeId = (typeof HOUSING_TYPE_IDS)[number];

export type GeneratorFuel = 'petrol' | 'diesel';

export interface HousingTypeDefinition {
  readonly id: HousingTypeId;
  readonly label: string;
  /** Prefix used in listing labels: "3-bed flat, 14 Bode Thomas Street". */
  readonly listingLabel: string;
  readonly blurb: string;
  /** Annual rent at Surulere level (district rentMultiplier = 1), ₦. */
  readonly baseAnnualRent: number;
  readonly bedrooms: number;
  /** 0-15 comfort the home itself adds on top of lifestyle. */
  readonly comfort: number;
  /** Multiplier on district prestige for status (2-bed = 1). */
  readonly prestige: number;
  readonly allowedDistricts: readonly DistrictId[];
  /** Listings per district per week. */
  readonly listingsPerWeek: number;
  /** Generator size needed to power the place. */
  readonly generator: { readonly litresPerHour: number; readonly fuel: GeneratorFuel };
}

const ALL_DISTRICTS: readonly DistrictId[] = DISTRICT_IDS;
const except = (...excluded: readonly DistrictId[]): readonly DistrictId[] => ALL_DISTRICTS.filter((id) => !excluded.includes(id));
const PREMIUM_ISLAND: readonly DistrictId[] = ['ikoyi', 'banana-island', 'victoria-island', 'lekki'];

export const HOUSING_TYPES: Readonly<Record<HousingTypeId, HousingTypeDefinition>> = {
  'face-me': {
    id: 'face-me',
    label: 'Face-me-I-face-you room',
    listingLabel: 'Room in a face-me-I-face-you',
    blurb: 'One room, shared toilet, shared kitchen and everybody knows your business.',
    baseAnnualRent: 200_000,
    bedrooms: 1,
    comfort: 0,
    prestige: 0.2,
    allowedDistricts: except(...PREMIUM_ISLAND),
    listingsPerWeek: 3,
    generator: { litresPerHour: 0.35, fuel: 'petrol' },
  },
  'self-contain': {
    id: 'self-contain',
    label: 'Self-contain',
    listingLabel: 'Self-contain',
    blurb: 'Your own room, your own toilet. Freedom.',
    baseAnnualRent: 550_000,
    bedrooms: 1,
    comfort: 3,
    prestige: 0.5,
    allowedDistricts: except('banana-island'),
    listingsPerWeek: 3,
    generator: { litresPerHour: 0.35, fuel: 'petrol' },
  },
  'mini-flat': {
    id: 'mini-flat',
    label: 'Mini flat',
    listingLabel: 'Mini flat',
    blurb: 'Room and parlour — you can finally host people.',
    baseAnnualRent: 1_200_000,
    bedrooms: 1,
    comfort: 5,
    prestige: 0.8,
    allowedDistricts: except('banana-island'),
    listingsPerWeek: 3,
    generator: { litresPerHour: 0.5, fuel: 'petrol' },
  },
  'two-bed': {
    id: 'two-bed',
    label: '2-bedroom flat',
    listingLabel: '2-bed flat',
    blurb: 'Space for a family, or a very serious home office.',
    baseAnnualRent: 1_900_000,
    bedrooms: 2,
    comfort: 7,
    prestige: 1,
    allowedDistricts: ALL_DISTRICTS,
    listingsPerWeek: 3,
    generator: { litresPerHour: 0.7, fuel: 'petrol' },
  },
  'three-bed': {
    id: 'three-bed',
    label: '3-bedroom flat',
    listingLabel: '3-bed flat',
    blurb: 'Master bedroom en-suite, visitors’ toilet, the works.',
    baseAnnualRent: 3_500_000,
    bedrooms: 3,
    comfort: 9,
    prestige: 1.3,
    allowedDistricts: ALL_DISTRICTS,
    listingsPerWeek: 3,
    generator: { litresPerHour: 0.9, fuel: 'petrol' },
  },
  duplex: {
    id: 'duplex',
    label: '4-bedroom duplex',
    listingLabel: '4-bed duplex',
    blurb: 'Upstairs, downstairs and a compound for your car.',
    baseAnnualRent: 6_000_000,
    bedrooms: 4,
    comfort: 12,
    prestige: 1.8,
    allowedDistricts: except('mushin'),
    listingsPerWeek: 2,
    generator: { litresPerHour: 2.2, fuel: 'diesel' },
  },
  mansion: {
    id: 'mansion',
    label: 'Detached mansion',
    listingLabel: '5-bed detached mansion',
    blurb: 'Pool, cinema room, BQ for the staff. Big man things.',
    baseAnnualRent: 17_000_000,
    bedrooms: 5,
    comfort: 15,
    prestige: 2.5,
    allowedDistricts: PREMIUM_ISLAND,
    listingsPerWeek: 2,
    generator: { litresPerHour: 4.5, fuel: 'diesel' },
  },
};

export function isHousingTypeAllowed(districtId: DistrictId, typeId: HousingTypeId): boolean {
  return HOUSING_TYPES[typeId].allowedDistricts.includes(districtId);
}

/** Typical annual rent for a type in a district (before listing noise). */
export function marketRent(districtId: DistrictId, typeId: HousingTypeId): number {
  return roundRent(HOUSING_TYPES[typeId].baseAnnualRent * DISTRICTS[districtId].rentMultiplier);
}

/** Annual estate service charge as a fraction of rent (serviced estates on the Island). */
export const SERVICE_CHARGE_RATES: Readonly<Partial<Record<DistrictId, number>>> = {
  ikoyi: 0.15,
  'banana-island': 0.12,
  'victoria-island': 0.15,
  lekki: 0.12,
  ajah: 0.08,
};

export function serviceChargeFor(districtId: DistrictId, typeId: HousingTypeId, annualRent: number): number {
  if (typeId === 'face-me') return 0;
  const rate = SERVICE_CHARGE_RATES[districtId] ?? 0;
  return rate > 0 ? roundTo(annualRent * rate, 10_000) : 0;
}

/** Rent rounding: ₦10k steps under ₦1m, ₦50k under ₦10m, ₦100k above. */
export function roundRent(amount: number): number {
  if (amount < 1_000_000) return roundTo(amount, 10_000);
  if (amount < 10_000_000) return roundTo(amount, 50_000);
  return roundTo(amount, 100_000);
}

function roundTo(amount: number, step: number): number {
  return Math.max(step, Math.round(amount / step) * step);
}

// ---------------------------------------------------------------------------------------------------------------
// Family homes (birth lottery)
// ---------------------------------------------------------------------------------------------------------------

export interface FamilyHomeDefinition {
  readonly label: string;
  /** Closest rental equivalent (bedrooms, generator size, prestige). */
  readonly typeId: HousingTypeId;
}

export const FAMILY_HOMES: Readonly<Record<BackgroundId, FamilyHomeDefinition>> = {
  'sapa-pikin': { label: 'Family room (face-me-I-face-you)', typeId: 'face-me' },
  'working-class': { label: 'Family flat', typeId: 'two-bed' },
  ajebota: { label: 'Family house', typeId: 'three-bed' },
  'nepo-baby': { label: 'Family duplex', typeId: 'duplex' },
};

/** Parents feed you: living costs while in the family house. */
export const FAMILY_LIVING_COST_MULTIPLIER = 0.5;
/** From this age the family starts dropping hints, and the discount shrinks. */
export const FAMILY_HINT_AGE = 25;
export const FAMILY_LIVING_COST_MULTIPLIER_ADULT = 0.8;

export function familyLivingCostMultiplier(age: number): number {
  return age >= FAMILY_HINT_AGE ? FAMILY_LIVING_COST_MULTIPLIER_ADULT : FAMILY_LIVING_COST_MULTIPLIER;
}

// ---------------------------------------------------------------------------------------------------------------
// Rental listings (deterministic per district × type × week)
// ---------------------------------------------------------------------------------------------------------------

/** ± spread of a listing's price around the market rent. */
export const RENT_NOISE = 0.15;
/** Listings priced this far below market are "too good to be true" — the agent may vanish with the inspection fee. */
export const SCAM_PRICE_THRESHOLD = -0.1;
export const SCAM_CHANCE = 0.45;

export const LAGOS_STREETS: Readonly<Record<DistrictId, readonly string[]>> = {
  ikeja: ['Allen Avenue', 'Opebi Road', 'Toyin Street', 'Adeniyi Jones Avenue', 'Oba Akran Avenue', 'Isaac John Street', 'Joel Ogunnaike Street', 'Kodesoh Street', 'Obafemi Awolowo Way'],
  ikorodu: ['Ijede Road', 'Ebute Road', 'Sagamu Road', 'Ayangburen Road', 'Igbogbo Road', 'Odogunyan Street', 'Agric Road', 'Lagos Road'],
  mushin: ['Ladipo Street', 'Idi-Araba Street', 'Olosha Road', 'Palm Avenue', 'Isolo Road', 'Agege Motor Road', 'Ojuwoye Street', 'Odi-Olowo Road'],
  surulere: ['Bode Thomas Street', 'Adeniran Ogunsanya Street', 'Ogunlana Drive', 'Akerele Street', 'Adelabu Street', 'Masha Road', 'Lawanson Road', 'Aguda Street', 'Shitta Street'],
  yaba: ['Herbert Macaulay Way', 'Akoka Road', 'Alagomeji Street', 'Onike Street', 'Iwaya Road', 'Commercial Avenue', 'Tejuosho Street', 'Sabo Road', 'Jibowu Street'],
  ojo: ['LASU-Isheri Road', 'Iyana-Iba Road', 'Okokomaiko Street', 'Igbo-Elerin Road', 'Ojo Barracks Road', 'Agboju Street', 'Alaba Road'],
  'lagos-island': ['Broad Street', 'Adeniji Adele Road', 'Campbell Street', 'Lafiaji Street', 'Isale Eko Street', 'Obalende Road', 'Tinubu Street', 'Martins Street'],
  ikoyi: ['Bourdillon Road', 'Glover Road', 'Kingsway Road', 'Gerrard Road', 'Alexander Avenue', 'Osborne Road', 'Lugard Avenue', 'Parkview Estate Road', 'Awolowo Road'],
  'banana-island': ['Ocean Parade', 'Banana Island Road', '1st Avenue', '2nd Avenue', '4th Avenue', 'Close C', 'Lagoon Crescent'],
  'victoria-island': ['Adeola Odeku Street', 'Ahmadu Bello Way', 'Akin Adesola Street', 'Ozumba Mbadiwe Avenue', 'Saka Tinubu Street', 'Kofo Abayomi Street', 'Idejo Street', 'Ajose Adeogun Street'],
  lekki: ['Admiralty Way', 'Fola Osibo Road', 'Freedom Way', 'Chevron Drive', 'Ikate Street', 'Agungi Road', 'Osapa London Road', 'Oniru Estate Road', 'Orchid Road'],
  ajah: ['Addo Road', 'Badore Road', 'Abraham Adesanya Road', 'Thomas Estate Road', 'Sangotedo Street', 'Abijo GRA Road', 'Ado Road', 'Lekki Gardens Road'],
  epe: ['Lekki-Epe Expressway', 'Eleko Road', 'Awoyaya Street', 'Lakowe Road', 'Bogije Street', 'Itoikin Road', 'Poka Road', 'Epe Town Road'],
};

const BASIC_FEATURES = ['Prepaid meter', 'Shared toilet', 'Well water', 'Close to the bus stop', 'Landlord lives in the compound', 'Newly painted'];
const MID_FEATURES = ['Prepaid meter', 'POP ceiling', 'Borehole', 'Tiled floors', 'Gated street', 'Fenced compound', 'Close to BRT', 'Wardrobes in every room'];
const PREMIUM_FEATURES = ['Fitted kitchen', 'BQ', '24-hour security', 'Swimming pool', 'Serviced estate', 'Central generator', 'Ocean view', 'Cinema room', 'Smart home'];

function featurePool(typeId: HousingTypeId): readonly string[] {
  if (typeId === 'face-me' || typeId === 'self-contain') return BASIC_FEATURES;
  if (typeId === 'mini-flat' || typeId === 'two-bed') return MID_FEATURES;
  return typeId === 'three-bed' ? [...MID_FEATURES, ...PREMIUM_FEATURES.slice(0, 3)] : PREMIUM_FEATURES;
}

export interface RentalListing {
  /** Deterministic: `<districtId>.<typeId>.<weekIndex>.<n>`. */
  readonly id: string;
  readonly districtId: DistrictId;
  readonly typeId: HousingTypeId;
  readonly weekIndex: number;
  readonly label: string;
  readonly street: string;
  readonly features: readonly string[];
  readonly annualRent: number;
  readonly marketRent: number;
  readonly serviceCharge: number;
  readonly inspectionFee: number;
  /** Chance the agent vanishes with the inspection fee (only for "too good to be true" prices). */
  readonly scamRisk: number;
}

export function weekIndexOf(t: GameMinute): number {
  return Math.floor(Math.floor(t / MINUTES_PER_DAY) / DAYS_PER_WEEK);
}

/** Game minute at which a listing week ends. */
export function weekEndsAt(weekIndex: number): GameMinute {
  return (weekIndex + 1) * DAYS_PER_WEEK * MINUTES_PER_DAY;
}

/** Game minute at which a listing week starts. */
export function weekStartsAt(weekIndex: number): GameMinute {
  return weekIndex * DAYS_PER_WEEK * MINUTES_PER_DAY;
}

export function listingId(districtId: DistrictId, typeId: HousingTypeId, weekIndex: number, n: number): string {
  return `${districtId}.${typeId}.${weekIndex}.${n}`;
}

export function parseListingId(id: string): { districtId: DistrictId; typeId: HousingTypeId; weekIndex: number; n: number } | null {
  const [districtId, typeId, week, n, ...rest] = id.split('.');
  if (rest.length > 0 || !districtId || !typeId || week === undefined || n === undefined) return null;
  if (!(DISTRICT_IDS as readonly string[]).includes(districtId)) return null;
  if (!(HOUSING_TYPE_IDS as readonly string[]).includes(typeId)) return null;
  if (!/^\d+$/.test(week) || !/^\d+$/.test(n)) return null;
  return { districtId: districtId as DistrictId, typeId: typeId as HousingTypeId, weekIndex: Number(week), n: Number(n) };
}

function inspectionFeeFor(annualRent: number): number {
  return Math.min(100_000, Math.max(5_000, roundTo(annualRent * 0.01, 5_000)));
}

/** This week's rentals for one district and type. Pure: same inputs, same flats, same prices. */
export function generateListings(seed: string, districtId: DistrictId, typeId: HousingTypeId, weekIndex: number): RentalListing[] {
  if (!isHousingTypeAllowed(districtId, typeId)) return [];
  const type = HOUSING_TYPES[typeId];
  const market = marketRent(districtId, typeId);
  const streets = LAGOS_STREETS[districtId];
  const listings: RentalListing[] = [];
  for (let n = 1; n <= type.listingsPerWeek; n++) {
    const rng = rngFor(seed, 'rental-listing', districtId, typeId, weekIndex, n);
    const noise = rng.float(-RENT_NOISE, RENT_NOISE);
    const annualRent = roundRent(HOUSING_TYPES[typeId].baseAnnualRent * DISTRICTS[districtId].rentMultiplier * (1 + noise));
    const street = rng.pick(streets);
    const houseNumber = rng.int(1, 48);
    const features = rng.shuffle(featurePool(typeId)).slice(0, rng.int(2, 3));
    listings.push({
      id: listingId(districtId, typeId, weekIndex, n),
      districtId,
      typeId,
      weekIndex,
      label: `${type.listingLabel}, ${houseNumber} ${street}`,
      street,
      features,
      annualRent,
      marketRent: market,
      serviceCharge: serviceChargeFor(districtId, typeId, annualRent),
      inspectionFee: inspectionFeeFor(annualRent),
      scamRisk: noise <= SCAM_PRICE_THRESHOLD ? SCAM_CHANCE : 0,
    });
  }
  return listings;
}

/** Re-derive a listing from its id (null if the id is malformed or the listing doesn't exist). */
export function findListing(seed: string, id: string): RentalListing | null {
  const parsed = parseListingId(id);
  if (!parsed) return null;
  return generateListings(seed, parsed.districtId, parsed.typeId, parsed.weekIndex).find((listing) => listing.id === id) ?? null;
}

export interface RentQuote {
  readonly rent: number;
  readonly agency: number;
  readonly legal: number;
  readonly caution: number;
  readonly serviceCharge: number;
  readonly inspectionFee: number;
  readonly total: number;
}

/** Everything a new tenant pays on day one (Lagos-style: a year upfront + agency + legal + caution). */
export function rentQuote(listing: Pick<RentalListing, 'annualRent' | 'serviceCharge' | 'inspectionFee'>): RentQuote {
  const upfront = rentUpfront(listing.annualRent);
  return {
    rent: upfront.rent,
    agency: upfront.agency,
    legal: upfront.legal,
    caution: upfront.caution,
    serviceCharge: listing.serviceCharge,
    inspectionFee: listing.inspectionFee,
    total: upfront.total + listing.serviceCharge + listing.inspectionFee,
  };
}

/** Renewal: just the rent (and service charge) for the new term — no agency or legal fees. */
export function renewalAmount(annualRent: number, serviceCharge: number, years: number): number {
  return (annualRent + serviceCharge) * years;
}

export const RENT_GRACE_DAYS = 14;
export const QUIT_NOTICE_DAYS = 7;
export const MAX_RENT_INCREASE = 0.3;

// ---------------------------------------------------------------------------------------------------------------
// Land & titles
// ---------------------------------------------------------------------------------------------------------------

export const PLOT_SQM = 600;
export const MAX_PLOTS_PER_PURCHASE = 4;

export const LAND_TITLE_IDS = ['c-of-o', 'governors-consent', 'excision', 'survey'] as const;
export type LandTitleId = (typeof LAND_TITLE_IDS)[number];

export interface TitlePerfection {
  readonly to: LandTitleId;
  /** Fee as a fraction of the plot's C of O market value. */
  readonly feeRate: number;
  readonly days: number;
}

export interface LandTitleDefinition {
  readonly id: LandTitleId;
  readonly label: string;
  readonly shortLabel: string;
  readonly blurb: string;
  /** Price and value relative to a C of O plot. */
  readonly priceMultiplier: number;
  /** Yearly chance of an omonile / ownership dispute. */
  readonly disputePerYear: number;
  /** Yearly chance LASG marks a structure on the plot for demolition (only when something is built). */
  readonly demolitionPerYear: number;
  /** Chance of winning when you fight a dispute in court. */
  readonly courtWinChance: number;
  readonly perfection: TitlePerfection | null;
}

export const LAND_TITLES: Readonly<Record<LandTitleId, LandTitleDefinition>> = {
  'c-of-o': {
    id: 'c-of-o',
    label: 'Certificate of Occupancy',
    shortLabel: 'C of O',
    blurb: 'The gold standard. Government says it’s yours — sleep with both eyes closed.',
    priceMultiplier: 1,
    disputePerYear: 0.01,
    demolitionPerYear: 0,
    courtWinChance: 0.92,
    perfection: null,
  },
  'governors-consent': {
    id: 'governors-consent',
    label: 'Governor’s Consent',
    shortLabel: 'Gov. Consent',
    blurb: 'Registered transfer of a titled plot. Solid — small paperwork left to perfect.',
    priceMultiplier: 0.95,
    disputePerYear: 0.02,
    demolitionPerYear: 0,
    courtWinChance: 0.85,
    perfection: { to: 'c-of-o', feeRate: 0.05, days: 90 },
  },
  excision: {
    id: 'excision',
    label: 'Excision / Gazette',
    shortLabel: 'Excision',
    blurb: 'Government released the land to the family. Good, but family members can still fight over it.',
    priceMultiplier: 0.75,
    disputePerYear: 0.08,
    demolitionPerYear: 0.02,
    courtWinChance: 0.6,
    perfection: { to: 'governors-consent', feeRate: 0.12, days: 180 },
  },
  survey: {
    id: 'survey',
    label: 'Registered Survey only',
    shortLabel: 'Survey',
    blurb: 'Cheap for a reason: omonile wahala and LASG bulldozers love this paper.',
    priceMultiplier: 0.5,
    disputePerYear: 0.18,
    demolitionPerYear: 0.08,
    courtWinChance: 0.3,
    perfection: { to: 'excision', feeRate: 0.2, days: 240 },
  },
};

/** Districts where plots are for sale. */
export const LAND_DISTRICT_IDS: readonly DistrictId[] = DISTRICT_IDS.filter((id) => DISTRICTS[id].landPricePerPlot !== null);

/** Prime areas don't sell dodgy paper: no survey-only plots from prestige 70, only C of O/consent from 85. */
export function availableTitles(districtId: DistrictId): readonly LandTitleId[] {
  const prestige = DISTRICTS[districtId].prestige;
  if (prestige >= 85) return ['c-of-o', 'governors-consent'];
  if (prestige >= 70) return ['c-of-o', 'governors-consent', 'excision'];
  return LAND_TITLE_IDS;
}

export const LAND_AREAS: Readonly<Partial<Record<DistrictId, readonly string[]>>> = {
  ikeja: ['Ikeja GRA', 'Magodo', 'Omole Phase 2', 'Opebi'],
  ikorodu: ['Igbogbo', 'Imota', 'Odogunyan', 'Ijede', 'Agura'],
  ojo: ['Igbo-Elerin', 'Okokomaiko', 'Iba', 'Ijanikin'],
  ikoyi: ['Old Ikoyi', 'Parkview', 'Dolphin Estate', 'Osborne Foreshore'],
  'banana-island': ['Banana Island'],
  lekki: ['Lekki Phase 1', 'Chevron', 'Ikate', 'Osapa London', 'Agungi'],
  ajah: ['Sangotedo', 'Abijo', 'Badore', 'Ogombo', 'Okun Ajah'],
  epe: ['Lakowe', 'Bogije', 'Awoyaya', 'Eleko', 'Akodo', 'Itoikin'],
};

/** Weekly ± wobble on asking prices for land. */
export const LAND_PRICE_NOISE = 0.06;

/** Asking price for one C of O plot in a district this week (null where land isn't sold). */
export function landPricePerPlot(seed: string, districtId: DistrictId, weekIndex: number): number | null {
  const base = DISTRICTS[districtId].landPricePerPlot;
  if (base === null) return null;
  const noise = rngFor(seed, 'land-price', districtId, weekIndex).float(-LAND_PRICE_NOISE, LAND_PRICE_NOISE);
  return roundTo(base * (1 + noise), 100_000);
}

export interface LandCosts {
  readonly agency: number;
  readonly legal: number;
  readonly survey: number;
  readonly total: number;
}

/** Agency 5% + legal 2.5% + survey 1.5% (9% on top of the price). */
export function landPurchaseCosts(price: number): LandCosts {
  const agency = Math.round(price * 0.05);
  const legal = Math.round(price * 0.025);
  const survey = Math.round(price * 0.015);
  return { agency, legal, survey, total: agency + legal + survey };
}

export interface LandQuote {
  readonly districtId: DistrictId;
  readonly title: LandTitleId;
  readonly plots: number;
  /** C of O market value of the land (what appreciation applies to). */
  readonly marketValue: number;
  readonly price: number;
  readonly costs: LandCosts;
  readonly total: number;
}

export function landQuote(seed: string, districtId: DistrictId, title: LandTitleId, plots: number, weekIndex: number): LandQuote | null {
  const perPlot = landPricePerPlot(seed, districtId, weekIndex);
  if (perPlot === null || !availableTitles(districtId).includes(title)) return null;
  const marketValue = perPlot * plots;
  const price = Math.round(marketValue * LAND_TITLES[title].priceMultiplier);
  const costs = landPurchaseCosts(price);
  return { districtId, title, plots, marketValue, price, costs, total: price + costs.total };
}

/** Convert a yearly incident probability into a daily one. */
export function dailyChance(perYear: number): number {
  if (perYear <= 0) return 0;
  if (perYear >= 1) return 1;
  return 1 - Math.pow(1 - perYear, 1 / DAYS_PER_YEAR);
}

/** Land market drift for one month: the district's yearly rate, compounded monthly, ± a seeded shock. */
export function monthlyLandGrowth(seed: string, districtId: DistrictId, monthIndex: number): number {
  const drift = Math.pow(1 + DISTRICTS[districtId].landAppreciation, 1 / 12);
  const shock = Math.max(-0.03, Math.min(0.03, rngFor(seed, 'land-market', districtId, monthIndex).normal(0, 0.012)));
  return drift * (1 + shock);
}

/** Lagos Land Use Charge, yearly, on the property's market value. */
export const LAND_USE_CHARGE_RATE = { ownerOccupied: 0.00076, other: 0.00256 } as const;
/** Upkeep per year as a share of the building's value. */
export const UPKEEP_RATE = 0.01;
/** Estate agent's commission when you sell. */
export const PROPERTY_AGENT_RATE = 0.05;
/** A sale takes this many game days to close. */
export const SALE_DAYS = { min: 30, max: 90 } as const;
/** Final sale price spread around the valuation. */
export const SALE_PRICE_NOISE = 0.1;

// ---------------------------------------------------------------------------------------------------------------
// Blueprints (building on your own land)
// ---------------------------------------------------------------------------------------------------------------

export const BLUEPRINT_IDS = ['bungalow', 'duplex', 'block-of-flats', 'mansion'] as const;
export type BlueprintId = (typeof BLUEPRINT_IDS)[number];

export interface BlueprintDefinition {
  readonly id: BlueprintId;
  readonly label: string;
  readonly blurb: string;
  /** Build cost excluding land (₦, before the world price index). */
  readonly baseCost: number;
  readonly months: number;
  /** Minimum land size. */
  readonly minSqm: number;
  readonly bedrooms: number;
  /** 0-15 comfort when you live in it. */
  readonly comfort: number;
  /** Multiplier on district prestige for status. */
  readonly prestige: number;
  /** Rentable units (a block of flats lets six). */
  readonly units: number;
  /** What each unit rents like. */
  readonly unitType: HousingTypeId;
  readonly generator: { readonly litresPerHour: number; readonly fuel: GeneratorFuel };
}

export const BLUEPRINTS: Readonly<Record<BlueprintId, BlueprintDefinition>> = {
  bungalow: {
    id: 'bungalow',
    label: '3-bedroom bungalow',
    blurb: 'Your first house. Mummy will cry at the house-warming.',
    baseCost: 25_000_000,
    months: 4,
    minSqm: 450,
    bedrooms: 3,
    comfort: 10,
    prestige: 1.4,
    units: 1,
    unitType: 'three-bed',
    generator: { litresPerHour: 0.9, fuel: 'petrol' },
  },
  duplex: {
    id: 'duplex',
    label: '4-bedroom duplex',
    blurb: 'Upstairs-downstairs. The village people are watching.',
    baseCost: 60_000_000,
    months: 6,
    minSqm: 600,
    bedrooms: 4,
    comfort: 13,
    prestige: 2,
    units: 1,
    unitType: 'duplex',
    generator: { litresPerHour: 2.2, fuel: 'diesel' },
  },
  'block-of-flats': {
    id: 'block-of-flats',
    label: 'Block of 6 flats',
    blurb: 'Six 2-bed flats. Landlord life: tenants pay you every year.',
    baseCost: 90_000_000,
    months: 8,
    minSqm: 1_200,
    bedrooms: 2,
    comfort: 8,
    prestige: 1.6,
    units: 6,
    unitType: 'two-bed',
    generator: { litresPerHour: 0.7, fuel: 'petrol' },
  },
  mansion: {
    id: 'mansion',
    label: 'Mansion',
    blurb: 'Pool, gatehouse, cinema room. Your name will ring in Lagos.',
    baseCost: 250_000_000,
    months: 12,
    minSqm: 1_800,
    bedrooms: 6,
    comfort: 15,
    prestige: 3,
    units: 1,
    unitType: 'mansion',
    generator: { litresPerHour: 4.5, fuel: 'diesel' },
  },
};

export const CONSTRUCTION_PAYMENT_PLANS = ['milestones', 'upfront'] as const;
export type ConstructionPaymentPlan = (typeof CONSTRUCTION_PAYMENT_PLANS)[number];
/** Contractors knock this much off when you pay everything upfront. */
export const UPFRONT_BUILD_DISCOUNT = 0.05;
/** Chance per monthly milestone that the contractor comes back for more money. */
export const OVERRUN_CHANCE = 0.22;
export const OVERRUN_RANGE = { min: 0.04, max: 0.12 } as const;

/** What a completed building would collect a year if every unit is let. */
export function annualRentRoll(blueprintId: BlueprintId, districtId: DistrictId): number {
  const blueprint = BLUEPRINTS[blueprintId];
  return blueprint.units * marketRent(districtId, blueprint.unitType);
}

// ---------------------------------------------------------------------------------------------------------------
// Houses for sale (ready-built; deterministic per district × week)
// ---------------------------------------------------------------------------------------------------------------

/** A finished building is valued at what it cost to build plus this premium (construction uses the same rule). */
export const BUILDING_COMPLETION_PREMIUM = 0.1;
/** Finished houses on the market per district per week. */
export const HOUSE_LISTINGS_PER_WEEK = 3;
/** What sellers and developers add on top of the valuation for a house you can move into today. */
export const HOUSE_SELLER_PREMIUM = { min: 0.15, max: 0.35 } as const;
/** Condition (0-100) of houses on the market: nobody lists a ruin, few are brand new. */
export const HOUSE_CONDITION = { min: 70, max: 100 } as const;
/** At or above this condition the house is a new build nobody has lived in. */
export const NEW_BUILD_CONDITION = 97;

/** Which blueprints come up for sale, by district prestige: mansions on the prime Island, bungalows and blocks of flats on the mainland. */
export function houseBlueprintWeights(districtId: DistrictId): Readonly<Record<BlueprintId, number>> {
  const prestige = DISTRICTS[districtId].prestige;
  if (prestige >= 85) return { bungalow: 0, duplex: 3, 'block-of-flats': 1, mansion: 6 };
  if (prestige >= 70) return { bungalow: 0, duplex: 5, 'block-of-flats': 2, mansion: 3 };
  if (prestige >= 40) return { bungalow: 4, duplex: 4, 'block-of-flats': 3, mansion: 0 };
  return { bungalow: 6, duplex: 1, 'block-of-flats': 3, mansion: 0 };
}

/** Finished houses mostly come with good papers; dodgy titles only where the land market sells them. */
const HOUSE_TITLE_WEIGHTS: Readonly<Record<LandTitleId, number>> = { 'c-of-o': 5, 'governors-consent': 4, excision: 2, survey: 1 };

/** Plots a blueprint needs (its minimum size in 600 sqm plots). */
export function minPlotsFor(blueprintId: BlueprintId): number {
  return Math.ceil(BLUEPRINTS[blueprintId].minSqm / PLOT_SQM);
}

/** What a contractor would charge to build a blueprint in a listing week (world price index on its first day). */
export function blueprintBuildCost(seed: string, blueprintId: BlueprintId, weekIndex: number): number {
  const priceIndex = economyOn(seed, weekIndex * DAYS_PER_WEEK).priceIndex;
  return roundTo(BLUEPRINTS[blueprintId].baseCost * priceIndex, 10_000);
}

export interface HouseQuoteInput {
  readonly districtId: DistrictId;
  readonly blueprintId: BlueprintId;
  readonly title: LandTitleId;
  readonly plots: number;
  /** 0-100. */
  readonly condition: number;
  /** Seller's premium over the valuation (0.25 = 25%). */
  readonly premium: number;
  readonly weekIndex: number;
}

export interface HouseQuote {
  /** The land under the house, priced exactly like plots on the land market this week. */
  readonly land: LandQuote;
  /** What a contractor would charge to build the same house this week. */
  readonly buildCost: number;
  /** The structure in perfect condition: build cost + completion premium (what a finished construction is worth). */
  readonly structureValue: number;
  /** Land + structure × condition: what the property is worth on the books the day you buy it. */
  readonly valuation: number;
  readonly premium: number;
  /** Valuation × (1 + premium), rounded to ₦100k. */
  readonly price: number;
  /** The price split between land and building in proportion to their value (sums to `price`). */
  readonly landShare: number;
  readonly buildingShare: number;
  /** Agency 5% + legal 2.5% + survey 1.5%, exactly as for land. */
  readonly costs: LandCosts;
  readonly total: number;
}

/**
 * The asking price of a ready-built house. It is the property's valuation by the same rules that value land and
 * finished buildings — land at this week's land price for its title and plots, plus the structure (build cost at
 * today's prices + the completion premium) discounted by its condition — times the seller's premium:
 *
 *   price = (landPrice + buildCost × (1 + completion premium) × condition / 100) × (1 + premium)
 *
 * Null where that land isn't sold (district or title) or the plots are too small for the blueprint.
 */
export function houseQuote(seed: string, input: HouseQuoteInput): HouseQuote | null {
  if (input.plots * PLOT_SQM < BLUEPRINTS[input.blueprintId].minSqm) return null;
  const land = landQuote(seed, input.districtId, input.title, input.plots, input.weekIndex);
  if (!land) return null;
  const condition = Math.max(0, Math.min(100, input.condition));
  const buildCost = blueprintBuildCost(seed, input.blueprintId, input.weekIndex);
  const structureValue = Math.round(buildCost * (1 + BUILDING_COMPLETION_PREMIUM));
  const valuation = land.price + Math.round((structureValue * condition) / 100);
  const price = roundTo(valuation * (1 + input.premium), 100_000);
  const landShare = Math.round((price * land.price) / valuation);
  const costs = landPurchaseCosts(price);
  return {
    land,
    buildCost,
    structureValue,
    valuation,
    premium: input.premium,
    price,
    landShare,
    buildingShare: price - landShare,
    costs,
    total: price + costs.total,
  };
}

export interface HouseListing {
  /** Deterministic: `house.<districtId>.<weekIndex>.<n>`. */
  readonly id: string;
  readonly districtId: DistrictId;
  readonly weekIndex: number;
  readonly blueprintId: BlueprintId;
  /** Street address — also the property's name once bought: "14 Admiralty Way". */
  readonly label: string;
  readonly street: string;
  readonly title: LandTitleId;
  readonly plots: number;
  /** 0-100. */
  readonly condition: number;
  readonly ageYears: number;
  /** Why it's on the market. */
  readonly story: string;
  readonly features: readonly string[];
  readonly quote: HouseQuote;
}

const NEW_BUILD_STORIES = [
  'Developer’s last unit — never occupied',
  'Newly completed, keys never used',
  'Off-plan buyer pulled out — brand new',
];
const RESALE_STORIES = [
  'Owner is relocating abroad (japa)',
  'Family selling after the old man passed',
  'Owner upgrading to a bigger place',
  'Landlord downsizing — children have left',
  'Distress sale: owner needs cash quick',
  'Returnee moving back to Abuja',
  'Bank sale after a business loan went bad',
];

export function houseListingId(districtId: DistrictId, weekIndex: number, n: number): string {
  return `house.${districtId}.${weekIndex}.${n}`;
}

export function parseHouseListingId(id: string): { districtId: DistrictId; weekIndex: number; n: number } | null {
  const [prefix, districtId, week, n, ...rest] = id.split('.');
  if (prefix !== 'house' || rest.length > 0 || !districtId || week === undefined || n === undefined) return null;
  if (!(DISTRICT_IDS as readonly string[]).includes(districtId)) return null;
  if (!/^\d+$/.test(week) || !/^\d+$/.test(n)) return null;
  return { districtId: districtId as DistrictId, weekIndex: Number(week), n: Number(n) };
}

/** This week's finished houses for sale in one district (only where land is sold). Pure: same inputs, same houses. */
export function generateHouseListings(seed: string, districtId: DistrictId, weekIndex: number): HouseListing[] {
  if (DISTRICTS[districtId].landPricePerPlot === null) return [];
  const weights = houseBlueprintWeights(districtId);
  const blueprints = BLUEPRINT_IDS.filter((id) => weights[id] > 0).map((id) => ({ value: id, weight: weights[id] }));
  const titles = availableTitles(districtId).map((id) => ({ value: id, weight: HOUSE_TITLE_WEIGHTS[id] }));
  const streets = LAGOS_STREETS[districtId];
  const labels = new Set<string>();
  const listings: HouseListing[] = [];
  for (let n = 1; n <= HOUSE_LISTINGS_PER_WEEK; n++) {
    const rng = rngFor(seed, 'house-listing', districtId, weekIndex, n);
    const blueprintId = rng.weighted(blueprints);
    const title = rng.weighted(titles);
    const plots = Math.min(MAX_PLOTS_PER_PURCHASE, minPlotsFor(blueprintId) + (rng.chance(0.25) ? 1 : 0));
    const condition = rng.int(HOUSE_CONDITION.min, HOUSE_CONDITION.max);
    const isNew = condition >= NEW_BUILD_CONDITION;
    const ageYears = isNew ? 0 : Math.max(1, Math.min(15, Math.round((100 - condition) / 2.5) + rng.int(-1, 2)));
    const premium = Math.round(rng.float(HOUSE_SELLER_PREMIUM.min, HOUSE_SELLER_PREMIUM.max) * 100) / 100;
    const street = rng.pick(streets);
    let houseNumber = rng.int(1, 60);
    while (labels.has(`${houseNumber} ${street}`)) houseNumber += 1;
    const label = `${houseNumber} ${street}`;
    labels.add(label);
    const story = rng.pick(isNew ? NEW_BUILD_STORIES : RESALE_STORIES);
    const features = rng.shuffle(featurePool(BLUEPRINTS[blueprintId].unitType)).slice(0, rng.int(2, 4));
    const quote = houseQuote(seed, { districtId, blueprintId, title, plots, condition, premium, weekIndex });
    if (!quote) continue;
    listings.push({
      id: houseListingId(districtId, weekIndex, n),
      districtId,
      weekIndex,
      blueprintId,
      label,
      street,
      title,
      plots,
      condition,
      ageYears,
      story,
      features,
      quote,
    });
  }
  return listings;
}

/** Re-derive a house listing from its id (null if malformed or it doesn't exist). */
export function findHouseListing(seed: string, id: string): HouseListing | null {
  const parsed = parseHouseListingId(id);
  if (!parsed) return null;
  return generateHouseListings(seed, parsed.districtId, parsed.weekIndex).find((listing) => listing.id === id) ?? null;
}

// ---------------------------------------------------------------------------------------------------------------
// Power (NEPA)
// ---------------------------------------------------------------------------------------------------------------

export const HOME_POWER_BACKUPS = ['none', 'generator', 'inverter', 'solar'] as const;
export type HomePowerBackup = (typeof HOME_POWER_BACKUPS)[number];

/** Comfort lost per hour without light. */
export const NEPA_PENALTY_PER_DARK_HOUR = 0.6;
/** Share of the blackout penalty each backup removes. */
export const POWER_BACKUP_RELIEF: Readonly<Record<HomePowerBackup, number>> = { none: 0, generator: 0.85, inverter: 0.7, solar: 0.8 };
/** Inverter batteries can't recharge when the whole grid is down. */
export const INVERTER_RELIEF_IN_COLLAPSE = 0.3;
/** Generators run for most, not all, dark hours (you sleep through some). */
export const GENERATOR_DUTY_CYCLE = 0.7;
/** Diesel costs this much more than petrol per litre. */
export const DIESEL_PREMIUM = 1.33;

export function darkHours(gridHours: number): number {
  return Math.max(0, Math.min(24, 24 - gridHours));
}

export interface PowerPenaltyInput {
  readonly gridHours: number;
  readonly backup: HomePowerBackup;
  /** False when the generator had no fuel. */
  readonly fuelled: boolean;
  readonly gridCollapse: boolean;
}

/** Comfort lost to blackouts (≥ 0). */
export function nepaComfortPenalty(input: PowerPenaltyInput): number {
  let relief = POWER_BACKUP_RELIEF[input.backup];
  if (input.backup === 'generator' && !input.fuelled) relief = 0;
  if (input.backup === 'inverter' && input.gridCollapse) relief = INVERTER_RELIEF_IN_COLLAPSE;
  return Math.round(darkHours(input.gridHours) * NEPA_PENALTY_PER_DARK_HOUR * (1 - relief) * 10) / 10;
}

/** Litres a generator burns in a day. */
export function generatorLitresPerDay(gridHours: number, litresPerHour: number): number {
  return Math.round(darkHours(gridHours) * GENERATOR_DUTY_CYCLE * litresPerHour * 10) / 10;
}

// ---------------------------------------------------------------------------------------------------------------
// Comfort & prestige
// ---------------------------------------------------------------------------------------------------------------

export type HomeOwnership = 'family' | 'rented' | 'owned';

/** Small comfort bonus for a nicer area (0-5). */
export function districtComfortBonus(districtId: DistrictId): number {
  return Math.round(DISTRICTS[districtId].prestige / 20);
}

/** The most comfort a home (type + area + furniture) can add on top of lifestyle. */
export const MAX_HOME_COMFORT = 30;

const OWNERSHIP_PRESTIGE: Readonly<Record<HomeOwnership, number>> = { family: 0.3, rented: 1, owned: 1.3 };

/** Status (clout) from where you live: district prestige × home type, more if you own it. */
export function homePrestige(districtId: DistrictId, typePrestige: number, ownership: HomeOwnership): number {
  return Math.round(DISTRICTS[districtId].prestige * typePrestige * OWNERSHIP_PRESTIGE[ownership]);
}

/** Status from being a property owner (log-scaled on portfolio value, capped). */
export function portfolioPrestige(portfolioValue: number): number {
  if (portfolioValue <= 0) return 0;
  return Math.min(120, Math.round(30 * Math.log10(1 + portfolioValue / 10_000_000)));
}
