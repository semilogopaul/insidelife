import { DAYS_PER_YEAR, MINUTES_PER_DAY } from '../time/calendar.js';

/**
 * Private aviation: the eight aircraft of docs/MULTI_CITY.md with real-world-based specs, the running costs of owning
 * one (hangar, maintenance, crew, fuel), liveries, names and `5N-` registrations, and the Private Pilot Licence.
 * Prices are base prices (the server charges `world.price(base)` like every other catalog price).
 */

// ----- Places ---------------------------------------------------------------------------------------------------------

/** The General Aviation Terminals (venue ids from docs/MULTI_CITY.md). Aircraft park at one of them. */
export const GAT_IDS = ['mmia-gat', 'naia-gat'] as const;
export type GatId = (typeof GAT_IDS)[number];

export function isGatId(id: string): id is GatId {
  return (GAT_IDS as readonly string[]).includes(id);
}

export const GAT_NAMES: Readonly<Record<GatId, string>> = {
  'mmia-gat': 'Lagos General Aviation Terminal',
  'naia-gat': 'Abuja General Aviation Terminal',
};

/** Where the aircraft sales desk and the flight school are (Lagos). */
export const AIRCRAFT_SALES_GAT: GatId = 'mmia-gat';
export const FLIGHT_SCHOOL_GAT: GatId = 'mmia-gat';

/** Great-circle distance between the two GATs, km (Lagos ↔ Abuja is ~530 km as the crow flies). */
export const GAT_ROUTE_KM = 535;

/** Distance between two GATs in km; 0 for the same one. Only Lagos ↔ Abuja exists. */
export function gatDistanceKm(from: string, to: string): number {
  if (from === to || !isGatId(from) || !isGatId(to)) return 0;
  return GAT_ROUTE_KM;
}

// ----- Aircraft ---------------------------------------------------------------------------------------------------------

export const AIRCRAFT_CLASSES = [
  'piston-single',
  'piston-twin',
  'turboprop',
  'light-jet',
  'midsize-jet',
  'long-range-jet',
  'airliner-jet',
] as const;
export type AircraftClass = (typeof AIRCRAFT_CLASSES)[number];

export type AircraftFuel = 'avgas' | 'jet-a1';

export interface AircraftClassInfo {
  readonly label: string;
  /** Hangar fee per game month (₦, before the price index). */
  readonly hangarFeePerMonth: number;
  /** Maintenance per game year as a share of the aircraft's current value. */
  readonly maintenancePerYear: number;
  /** Crew salaries per game month (₦); 0 for aircraft you fly yourself. */
  readonly crewSalaryPerMonth: number;
  /** Value lost per year (compounded), never below `AIRCRAFT_VALUE_FLOOR`. */
  readonly depreciationPerYear: number;
  /** Clout of owning one (the first aircraft in full, others at a quarter). */
  readonly status: number;
  /** Jets come with a hired crew; piston and turboprop planes need your own Private Pilot Licence. */
  readonly crewed: boolean;
}

export const AIRCRAFT_CLASS_INFO: Readonly<Record<AircraftClass, AircraftClassInfo>> = {
  'piston-single': { label: 'Single piston', hangarFeePerMonth: 250_000, maintenancePerYear: 0.04, crewSalaryPerMonth: 0, depreciationPerYear: 0.03, status: 120, crewed: false },
  'piston-twin': { label: 'Twin piston', hangarFeePerMonth: 600_000, maintenancePerYear: 0.045, crewSalaryPerMonth: 0, depreciationPerYear: 0.035, status: 200, crewed: false },
  turboprop: { label: 'Turboprop', hangarFeePerMonth: 2_500_000, maintenancePerYear: 0.05, crewSalaryPerMonth: 0, depreciationPerYear: 0.045, status: 360, crewed: false },
  'light-jet': { label: 'Light jet', hangarFeePerMonth: 5_000_000, maintenancePerYear: 0.055, crewSalaryPerMonth: 3_000_000, depreciationPerYear: 0.06, status: 600, crewed: true },
  'midsize-jet': { label: 'Midsize jet', hangarFeePerMonth: 9_000_000, maintenancePerYear: 0.055, crewSalaryPerMonth: 4_500_000, depreciationPerYear: 0.06, status: 800, crewed: true },
  'long-range-jet': { label: 'Long-range jet', hangarFeePerMonth: 20_000_000, maintenancePerYear: 0.05, crewSalaryPerMonth: 9_000_000, depreciationPerYear: 0.065, status: 1_100, crewed: true },
  'airliner-jet': { label: 'Airliner (BBJ)', hangarFeePerMonth: 35_000_000, maintenancePerYear: 0.05, crewSalaryPerMonth: 18_000_000, depreciationPerYear: 0.07, status: 1_400, crewed: true },
};

export interface AircraftDefinition {
  readonly id: string;
  readonly name: string;
  readonly make: string;
  readonly class: AircraftClass;
  readonly seats: number;
  /** Still-air range, km. */
  readonly rangeKm: number;
  readonly cruiseKmh: number;
  /** Fuel burnt per flight hour at cruise, litres. */
  readonly fuelBurnLph: number;
  readonly fuelType: AircraftFuel;
  /** Base price (₦). */
  readonly price: number;
  readonly blurb: string;
}

const a = (def: AircraftDefinition): AircraftDefinition => def;

export const AIRCRAFT: readonly AircraftDefinition[] = [
  a({ id: 'cessna-172', name: 'Cessna 172 Skyhawk (used)', make: 'Cessna', class: 'piston-single', seats: 4, rangeKm: 1_185, cruiseKmh: 226, fuelBurnLph: 36, fuelType: 'avgas', price: 200_000_000, blurb: 'The world’s favourite trainer. Slow, honest and cheap to run: Lagos to Abuja in under three hours, window down on the descent.' }),
  a({ id: 'piper-seneca', name: 'Piper Seneca V', make: 'Piper', class: 'piston-twin', seats: 6, rangeKm: 1_500, cruiseKmh: 315, fuelBurnLph: 100, fuelType: 'avgas', price: 600_000_000, blurb: 'Two engines for peace of mind over the Niger. A proper small-business aeroplane.' }),
  a({ id: 'king-air-350', name: 'Beechcraft King Air 350', make: 'Beechcraft', class: 'turboprop', seats: 11, rangeKm: 3_300, cruiseKmh: 578, fuelBurnLph: 420, fuelType: 'jet-a1', price: 4_000_000_000, blurb: 'The turboprop every state governor secretly wants. Short runways, big cabin.' }),
  a({ id: 'pilatus-pc12', name: 'Pilatus PC-12 NGX', make: 'Pilatus', class: 'turboprop', seats: 9, rangeKm: 3_300, cruiseKmh: 528, fuelBurnLph: 250, fuelType: 'jet-a1', price: 7_000_000_000, blurb: 'Swiss precision, one big turbine and a cabin like a Range Rover. Lands on almost anything.' }),
  a({ id: 'phenom-300e', name: 'Embraer Phenom 300E', make: 'Embraer', class: 'light-jet', seats: 9, rangeKm: 3_650, cruiseKmh: 839, fuelBurnLph: 600, fuelType: 'jet-a1', price: 15_000_000_000, blurb: 'The best-selling light jet on earth. Comes with a captain, a first officer and a smile.' }),
  a({ id: 'challenger-350', name: 'Bombardier Challenger 350', make: 'Bombardier', class: 'midsize-jet', seats: 10, rangeKm: 5_900, cruiseKmh: 870, fuelBurnLph: 1_000, fuelType: 'jet-a1', price: 35_000_000_000, blurb: 'Stand-up cabin, flat floor, Dubai without a fuel stop. Crew included.' }),
  a({ id: 'gulfstream-g650', name: 'Gulfstream G650ER', make: 'Gulfstream', class: 'long-range-jet', seats: 19, rangeKm: 13_890, cruiseKmh: 904, fuelBurnLph: 1_650, fuelType: 'jet-a1', price: 95_000_000_000, blurb: 'Lagos to Los Angeles non-stop. The jet that tells the room who you are.' }),
  a({ id: 'boeing-bbj', name: 'Boeing Business Jet', make: 'Boeing', class: 'airliner-jet', seats: 25, rangeKm: 10_200, cruiseKmh: 840, fuelBurnLph: 3_000, fuelType: 'jet-a1', price: 150_000_000_000, blurb: 'A 737 with a bedroom, a boardroom and a bar. Heads of state fly these.' }),
];

export const AIRCRAFT_IDS: readonly string[] = AIRCRAFT.map((aircraft) => aircraft.id);

const AIRCRAFT_INDEX: ReadonlyMap<string, AircraftDefinition> = new Map(AIRCRAFT.map((aircraft) => [aircraft.id, aircraft]));

export function findAircraft(id: string): AircraftDefinition | undefined {
  return AIRCRAFT_INDEX.get(id);
}

export function aircraftClassInfo(aircraft: Pick<AircraftDefinition, 'class'>): AircraftClassInfo {
  return AIRCRAFT_CLASS_INFO[aircraft.class];
}

/** Whether the owner needs a Private Pilot Licence to fly it (jets come with a crew instead). */
export function aircraftNeedsLicence(aircraft: Pick<AircraftDefinition, 'class'>): boolean {
  return !AIRCRAFT_CLASS_INFO[aircraft.class].crewed;
}

/** How many aircraft one character can keep. */
export const MAX_AIRCRAFT = 4;

// ----- Running costs ----------------------------------------------------------------------------------------------------

/** Used aircraft never fall below this share of the (indexed) new price. */
export const AIRCRAFT_VALUE_FLOOR = 0.3;

/** Market value: price × price index × yearly depreciation compounded over the age in your hands. */
export function aircraftMarketValue(aircraft: Pick<AircraftDefinition, 'price' | 'class'>, ageDays: number, priceIndex = 1): number {
  const years = Math.max(0, ageDays) / DAYS_PER_YEAR;
  const depreciation = Math.pow(1 - AIRCRAFT_CLASS_INFO[aircraft.class].depreciationPerYear, years);
  const value = aircraft.price * priceIndex * Math.max(AIRCRAFT_VALUE_FLOOR, depreciation);
  return Math.round(value / 100_000) * 100_000;
}

/** What a broker pays: a share of market value, 88% to 95% depending on the day (`roll` in [0, 1)). */
export function aircraftBrokerOffer(value: number, roll: number): number {
  return Math.round((value * (0.88 + 0.07 * Math.min(0.999, Math.max(0, roll)))) / 100_000) * 100_000;
}

export interface AircraftMonthlyCosts {
  readonly hangar: number;
  readonly maintenance: number;
  readonly crew: number;
  readonly total: number;
}

/**
 * The month-end bill. `value` is the aircraft's current market value (maintenance is a share of it, per year, spread
 * over twelve months); `priceIndex` scales the hangar and crew base figures like every catalog price.
 */
export function aircraftMonthlyCosts(aircraft: Pick<AircraftDefinition, 'class'>, value: number, priceIndex = 1): AircraftMonthlyCosts {
  const info = AIRCRAFT_CLASS_INFO[aircraft.class];
  const hangar = Math.round((info.hangarFeePerMonth * priceIndex) / 100) * 100;
  const crew = Math.round((info.crewSalaryPerMonth * priceIndex) / 100) * 100;
  const maintenance = Math.round((value * info.maintenancePerYear) / 12 / 100) * 100;
  return { hangar, maintenance, crew, total: hangar + maintenance + crew };
}

/** Avgas costs more than petrol, Jet A-1 a bit more again; both scale with the world's petrol price. */
export const AVIATION_FUEL_FACTOR: Readonly<Record<AircraftFuel, number>> = { avgas: 2.2, 'jet-a1': 1.6 };

export function aviationFuelPricePerLitre(petrolPricePerLitre: number, fuel: AircraftFuel): number {
  return Math.round(petrolPricePerLitre * AVIATION_FUEL_FACTOR[fuel]);
}

/** Taxi, take-off, climb and approach on top of the cruise time. */
export const FLIGHT_OVERHEAD_MINUTES = 25;

/** Game minutes in the air for `km`. */
export function flightMinutes(aircraft: Pick<AircraftDefinition, 'cruiseKmh'>, km: number): number {
  if (km <= 0) return 0;
  return Math.max(30, Math.round((km / aircraft.cruiseKmh) * 60) + FLIGHT_OVERHEAD_MINUTES);
}

/** Litres burnt over `km`, including the overhead minutes. */
export function flightFuelLitres(aircraft: Pick<AircraftDefinition, 'cruiseKmh' | 'fuelBurnLph'>, km: number): number {
  return Math.round((flightMinutes(aircraft, km) / 60) * aircraft.fuelBurnLph);
}

/** Fuel bill for a flight at today's pump price. */
export function flightFuelCost(aircraft: Pick<AircraftDefinition, 'cruiseKmh' | 'fuelBurnLph' | 'fuelType'>, km: number, petrolPricePerLitre: number): number {
  const litres = flightFuelLitres(aircraft, km);
  return Math.round((litres * aviationFuelPricePerLitre(petrolPricePerLitre, aircraft.fuelType)) / 100) * 100;
}

// ----- Delivery, liveries, names, registrations -------------------------------------------------------------------------

/** A remote purchase is ferried to your chosen GAT; it arrives after this many game days. */
export const FERRY_DELIVERY_DAYS = 3;
export const FERRY_DELIVERY_MINUTES = FERRY_DELIVERY_DAYS * MINUTES_PER_DAY;

/** Ferry fee for a remote purchase: 0.35% of the price, at least ₦1.5m (before the price index). */
export function aircraftFerryFee(aircraft: Pick<AircraftDefinition, 'price'>): number {
  return Math.max(1_500_000, Math.round((aircraft.price * 0.0035) / 100_000) * 100_000);
}

export interface LiveryColour {
  readonly id: string;
  readonly label: string;
  readonly hex: string;
}

/** Paints for the base and accent colours. Plenty of pinks, because someone will ask. */
export const LIVERY_COLOURS: readonly LiveryColour[] = [
  { id: 'arctic-white', label: 'Arctic white', hex: '#f5f7fa' },
  { id: 'pearl', label: 'Pearl', hex: '#e8e4da' },
  { id: 'silver', label: 'Silver', hex: '#b9c0c8' },
  { id: 'graphite', label: 'Graphite', hex: '#3a3f47' },
  { id: 'jet-black', label: 'Jet black', hex: '#101216' },
  { id: 'navy', label: 'Navy', hex: '#14284b' },
  { id: 'royal-blue', label: 'Royal blue', hex: '#1f4fd8' },
  { id: 'sky-blue', label: 'Sky blue', hex: '#5fb4ea' },
  { id: 'emerald', label: 'Naija green', hex: '#0b8a4b' },
  { id: 'lime', label: 'Lime', hex: '#8fd14f' },
  { id: 'gold', label: 'Gold', hex: '#d9a935' },
  { id: 'orange', label: 'Sunset orange', hex: '#f07a22' },
  { id: 'crimson', label: 'Crimson', hex: '#c21f3a' },
  { id: 'wine', label: 'Wine', hex: '#6d1630' },
  { id: 'purple', label: 'Royal purple', hex: '#5b2a86' },
  { id: 'blush-pink', label: 'Blush pink', hex: '#f4b6c8' },
  { id: 'flamingo-pink', label: 'Flamingo pink', hex: '#f77fa8' },
  { id: 'hot-pink', label: 'Hot pink', hex: '#ff2d8a' },
  { id: 'magenta', label: 'Magenta', hex: '#c2188e' },
];

const LIVERY_INDEX: ReadonlyMap<string, LiveryColour> = new Map(LIVERY_COLOURS.map((colour) => [colour.id, colour]));

export function findLiveryColour(id: string): LiveryColour | undefined {
  return LIVERY_INDEX.get(id);
}

export interface Livery {
  readonly base: string;
  readonly accent: string;
}

export const DEFAULT_LIVERY: Livery = { base: 'arctic-white', accent: 'navy' };

export function isValidLivery(livery: Livery): boolean {
  return LIVERY_INDEX.has(livery.base) && LIVERY_INDEX.has(livery.accent);
}

export const AIRCRAFT_NAME_MAX = 16;
export const AIRCRAFT_NAME_MIN = 2;

/** Why a painted name is not acceptable (shape only; the server also runs the profanity filter), or null. */
export function aircraftNameIssue(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < AIRCRAFT_NAME_MIN) return `The name needs at least ${AIRCRAFT_NAME_MIN} characters`;
  if (trimmed.length > AIRCRAFT_NAME_MAX) return `The name can be at most ${AIRCRAFT_NAME_MAX} characters`;
  if (!/^[A-Za-z0-9 ]+$/.test(trimmed)) return 'Use only letters, digits and spaces';
  if (/ {2,}/.test(trimmed)) return 'Use single spaces between words';
  return null;
}

/** The name as it is painted: trimmed and upper-case ("Air Tolu" → "AIR TOLU"). */
export function normaliseAircraftName(name: string): string {
  return name.trim().toUpperCase();
}

/** Nigerian civil registration prefix. */
export const REGISTRATION_PREFIX = '5N-';

/** Three-letter registrations the registry refuses (rude or misleading). */
const BLOCKED_REGISTRATIONS: ReadonlySet<string> = new Set(['ASS', 'SEX', 'WTF', 'FCK', 'FUK', 'DIE', 'KKK', 'NZI', 'SOS', 'TNT', 'XXX', 'POO', 'PEE', 'BUM', 'TIT', 'GAY', 'HIV', 'RIP']);

/** The `5N-XXX` form of three letters, or null when the input isn't three letters (case-insensitive, prefix optional). */
export function normaliseRegistration(input: string): string | null {
  const letters = input.trim().toUpperCase().replace(/^5N-?/, '');
  if (!/^[A-Z]{3}$/.test(letters)) return null;
  return `${REGISTRATION_PREFIX}${letters}`;
}

export function registrationIssue(input: string): string | null {
  const registration = normaliseRegistration(input);
  if (!registration) return 'A Nigerian registration is 5N- and three letters, like 5N-TOL';
  if (BLOCKED_REGISTRATIONS.has(registration.slice(REGISTRATION_PREFIX.length))) return 'The registry won’t issue that registration';
  return null;
}

/** Fees to change what's painted, as a share of the aircraft's base price (before the price index). */
export function aircraftLiveryFee(aircraft: Pick<AircraftDefinition, 'price'>): number {
  return Math.max(500_000, Math.round((aircraft.price * 0.004) / 10_000) * 10_000);
}
export function aircraftNameFee(aircraft: Pick<AircraftDefinition, 'price'>): number {
  return Math.max(150_000, Math.round((aircraft.price * 0.0008) / 10_000) * 10_000);
}
export function aircraftRegistrationFee(aircraft: Pick<AircraftDefinition, 'price'>): number {
  return Math.max(250_000, Math.round((aircraft.price * 0.0015) / 10_000) * 10_000);
}

// ----- Private Pilot Licence ----------------------------------------------------------------------------------------------

/** Certification id held by the education domain (`CREDENTIALS_PORT`). */
export const PPL_CERTIFICATION = 'ppl';

export const PILOT_TRAINING = {
  certification: PPL_CERTIFICATION,
  /** Venue id of the flight school. */
  venueId: FLIGHT_SCHOOL_GAT,
  minAge: 18,
  /** Enrolment fee (₦, before the price index). */
  enrolFee: 6_000_000,
  lessonFee: 1_400_000,
  /** Lessons needed before the check-ride, at most one per game day: over two weeks of game days. */
  lessonsRequired: 16,
  lessonActionId: 'flight-lesson',
  lessonMinutes: 60,
  checkRideFee: 2_500_000,
  checkRideActionId: 'check-ride',
  checkRideMinutes: 90,
} as const;

export interface CheckRideCandidate {
  readonly intellect: number;
  readonly hustle: number;
  /** 0-100. */
  readonly mood: number;
  /** Lessons beyond the required number. */
  readonly extraLessons: number;
}

/** Chance of passing the check-ride: the more you've flown, the better; never a certainty. */
export function checkRidePassChance(candidate: CheckRideCandidate): number {
  const chance = 0.5 + candidate.intellect / 300 + candidate.hustle / 400 + (candidate.mood - 50) / 500 + Math.min(6, candidate.extraLessons) * 0.03;
  return Math.min(0.93, Math.max(0.3, chance));
}
