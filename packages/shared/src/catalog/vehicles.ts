/**
 * Vehicles catalog — owned by the vehicles domain.
 *
 * Every car maps to a Kenney Car Kit model (`model`) and a paint (`color` hex) that the 3D client renders; the
 * `performance` block feeds the client's arcade driving model. Prices are 2026 Lagos prices (₦) before the world
 * price index. Grades follow the Lagos market: Naija-used (already driven in Nigeria), tokunbo (foreign-used,
 * imported) and brand-new.
 */
import { DAYS_PER_YEAR } from '../time/calendar.js';
import type { DistrictId } from './geography.js';
import { findVenue } from './venues.js';

/** Kenney Car Kit models available to the 3D client. */
export const VEHICLE_MODELS = [
  'sedan',
  'sedan-sports',
  'hatchback-sports',
  'suv',
  'suv-luxury',
  'taxi',
  'van',
  'delivery',
  'truck',
  'police',
] as const;
export type VehicleModel = (typeof VEHICLE_MODELS)[number];

const VEHICLE_MODEL_SET: ReadonlySet<string> = new Set(VEHICLE_MODELS);

export function isVehicleModel(value: string): value is VehicleModel {
  return VEHICLE_MODEL_SET.has(value);
}

export const VEHICLE_GRADES = ['naija-used', 'tokunbo', 'brand-new'] as const;
export type VehicleGrade = (typeof VEHICLE_GRADES)[number];

export const VEHICLE_GRADE_LABELS: Readonly<Record<VehicleGrade, string>> = {
  'naija-used': 'Naija-used',
  tokunbo: 'Tokunbo (foreign-used)',
  'brand-new': 'Brand new',
};

export const VEHICLE_SEGMENTS = ['economy', 'family', 'executive', 'luxury', 'commercial'] as const;
export type VehicleSegment = (typeof VEHICLE_SEGMENTS)[number];

export interface VehiclePaint {
  readonly label: string;
  readonly hex: string;
}

export const VEHICLE_PAINTS = {
  'pearl-white': { label: 'Pearl white', hex: '#f1f1ee' },
  silver: { label: 'Silver', hex: '#b9bec4' },
  'gun-grey': { label: 'Gunmetal grey', hex: '#4a4f55' },
  black: { label: 'Black on black', hex: '#15171a' },
  'matte-black': { label: 'Matte black', hex: '#262626' },
  champagne: { label: 'Champagne gold', hex: '#c8b27d' },
  navy: { label: 'Navy blue', hex: '#1f2f4f' },
  wine: { label: 'Wine', hex: '#6b1f2a' },
  'army-green': { label: 'Army green', hex: '#4b5d3a' },
  'sky-blue': { label: 'Sky blue', hex: '#5aa9e6' },
  'tomato-red': { label: 'Tomato red', hex: '#c0392b' },
  'danfo-yellow': { label: 'Danfo yellow', hex: '#f2b705' },
} as const satisfies Readonly<Record<string, VehiclePaint>>;
export type VehiclePaintId = keyof typeof VEHICLE_PAINTS;
export const VEHICLE_PAINT_IDS = Object.keys(VEHICLE_PAINTS) as readonly VehiclePaintId[];

/** Numbers for the client's arcade driving model. */
export interface VehiclePerformance {
  readonly topSpeedKmh: number;
  /** 0-100 km/h in seconds (lower is quicker). */
  readonly zeroToHundredSeconds: number;
  /** 0-1 steering response and grip. */
  readonly handling: number;
  /** 0-1 braking strength. */
  readonly braking: number;
}

export interface VehicleDefinition {
  readonly id: string;
  readonly name: string;
  /** Lagos street name for the car ("End of Discussion", "Muscle"). */
  readonly nickname: string;
  readonly make: string;
  readonly year: number;
  readonly grade: VehicleGrade;
  readonly segment: VehicleSegment;
  /** Kenney Car Kit model the 3D client renders. */
  readonly model: VehicleModel;
  readonly defaultPaint: VehiclePaintId;
  /** Default paint hex (same as VEHICLE_PAINTS[defaultPaint].hex). */
  readonly color: string;
  /** Paints the dealer can offer. */
  readonly paints: readonly VehiclePaintId[];
  /** Base price (₦) before the world price index. */
  readonly price: number;
  readonly performance: VehiclePerformance;
  readonly fuelType: 'petrol' | 'diesel';
  /** Real-world fuel economy, km per litre. */
  readonly fuelEconomyKmPerLitre: number;
  readonly seats: number;
  /** Status (clout) while it's your primary car. */
  readonly status: number;
  /** Fraction of value lost per game year. */
  readonly depreciationPerYear: number;
  /** Servicing, parts and papers per game year, as a fraction of the base price. */
  readonly maintenancePerYear: number;
  readonly blurb: string;
}

type VehicleInput = Omit<VehicleDefinition, 'color'>;

const car = (input: VehicleInput): VehicleDefinition => ({ ...input, color: VEHICLE_PAINTS[input.defaultPaint].hex });

const perf = (topSpeedKmh: number, zeroToHundredSeconds: number, handling: number, braking: number): VehiclePerformance => ({
  topSpeedKmh,
  zeroToHundredSeconds,
  handling,
  braking,
});

export const VEHICLES: readonly VehicleDefinition[] = [
  // --- Under ₦5M: the Uncle Tunde starter fund ------------------------------------------------------------------
  car({ id: 'toyota-corolla-2003-taxi', name: 'Toyota Corolla 2003', nickname: 'Lagos Taxi', make: 'Toyota', year: 2003, grade: 'naija-used', segment: 'economy', model: 'taxi', defaultPaint: 'danfo-yellow', paints: ['danfo-yellow', 'pearl-white', 'silver'], price: 3_200_000, performance: perf(170, 12.5, 0.52, 0.5), fuelType: 'petrol', fuelEconomyKmPerLitre: 12, seats: 5, status: 2, depreciationPerYear: 0.06, maintenancePerYear: 0.14, blurb: 'Ex-taxi with a new spray. Bulletproof engine, rattling dashboard.' }),
  car({ id: 'kia-picanto-2012', name: 'Kia Picanto 2012', nickname: 'Small Pikin', make: 'Kia', year: 2012, grade: 'naija-used', segment: 'economy', model: 'hatchback-sports', defaultPaint: 'tomato-red', paints: ['tomato-red', 'silver', 'pearl-white', 'sky-blue'], price: 3_500_000, performance: perf(155, 13.5, 0.62, 0.55), fuelType: 'petrol', fuelEconomyKmPerLitre: 17, seats: 4, status: 3, depreciationPerYear: 0.07, maintenancePerYear: 0.12, blurb: 'Sips fuel, squeezes into any parking space in Yaba.' }),
  car({ id: 'honda-accord-2005', name: 'Honda Accord 2005', nickname: 'End of Discussion', make: 'Honda', year: 2005, grade: 'naija-used', segment: 'family', model: 'sedan', defaultPaint: 'silver', paints: ['silver', 'black', 'champagne', 'navy', 'wine'], price: 3_800_000, performance: perf(200, 9.8, 0.58, 0.55), fuelType: 'petrol', fuelEconomyKmPerLitre: 10, seats: 5, status: 6, depreciationPerYear: 0.06, maintenancePerYear: 0.13, blurb: 'Once you drive it, the matter is settled. Lagos favourite since forever.' }),
  car({ id: 'toyota-corolla-2008', name: 'Toyota Corolla 2008', nickname: 'Naija-used Reliable', make: 'Toyota', year: 2008, grade: 'naija-used', segment: 'family', model: 'sedan', defaultPaint: 'gun-grey', paints: ['gun-grey', 'silver', 'black', 'pearl-white', 'wine'], price: 4_500_000, performance: perf(185, 10.5, 0.6, 0.58), fuelType: 'petrol', fuelEconomyKmPerLitre: 13, seats: 5, status: 7, depreciationPerYear: 0.06, maintenancePerYear: 0.12, blurb: 'Parts everywhere, resale forever. Every mechanic in Ladipo knows it.' }),
  car({ id: 'toyota-camry-2004', name: 'Toyota Camry 2004', nickname: 'Big for Nothing', make: 'Toyota', year: 2004, grade: 'naija-used', segment: 'family', model: 'sedan', defaultPaint: 'champagne', paints: ['champagne', 'silver', 'black', 'navy'], price: 4_800_000, performance: perf(190, 10.2, 0.56, 0.55), fuelType: 'petrol', fuelEconomyKmPerLitre: 10, seats: 5, status: 8, depreciationPerYear: 0.06, maintenancePerYear: 0.13, blurb: 'Huge body, smooth ride, and the name says the rest.' }),

  // --- Mid-range ------------------------------------------------------------------------------------------------
  car({ id: 'toyota-sienna-2007', name: 'Toyota Sienna 2007', nickname: 'Family Bus', make: 'Toyota', year: 2007, grade: 'naija-used', segment: 'family', model: 'van', defaultPaint: 'silver', paints: ['silver', 'champagne', 'pearl-white', 'navy'], price: 7_500_000, performance: perf(180, 10, 0.5, 0.5), fuelType: 'petrol', fuelEconomyKmPerLitre: 9, seats: 7, status: 6, depreciationPerYear: 0.07, maintenancePerYear: 0.12, blurb: 'School runs, church runs, Ibadan runs. Fits the whole family and the jollof coolers.' }),
  car({ id: 'kia-rio-2015', name: 'Kia Rio 2015', nickname: 'Rio', make: 'Kia', year: 2015, grade: 'tokunbo', segment: 'economy', model: 'hatchback-sports', defaultPaint: 'sky-blue', paints: ['sky-blue', 'tomato-red', 'pearl-white', 'gun-grey'], price: 9_000_000, performance: perf(180, 11, 0.66, 0.6), fuelType: 'petrol', fuelEconomyKmPerLitre: 15, seats: 5, status: 10, depreciationPerYear: 0.1, maintenancePerYear: 0.07, blurb: 'Clean tokunbo hatchback. AC that actually blows cold.' }),
  car({ id: 'toyota-hiace-danfo', name: 'Toyota Hiace', nickname: 'Danfo', make: 'Toyota', year: 2012, grade: 'tokunbo', segment: 'commercial', model: 'van', defaultPaint: 'danfo-yellow', paints: ['danfo-yellow'], price: 18_000_000, performance: perf(140, 16, 0.4, 0.45), fuelType: 'diesel', fuelEconomyKmPerLitre: 8, seats: 14, status: 3, depreciationPerYear: 0.08, maintenancePerYear: 0.1, blurb: '"Oshodi! Oshodi! Enter with your change!" A business on four wheels.' }),
  car({ id: 'toyota-corolla-2017', name: 'Toyota Corolla 2017', nickname: 'Tokunbo Corolla', make: 'Toyota', year: 2017, grade: 'tokunbo', segment: 'family', model: 'sedan', defaultPaint: 'pearl-white', paints: ['pearl-white', 'silver', 'black', 'gun-grey', 'wine'], price: 18_600_000, performance: perf(190, 10, 0.65, 0.65), fuelType: 'petrol', fuelEconomyKmPerLitre: 14, seats: 5, status: 22, depreciationPerYear: 0.1, maintenancePerYear: 0.06, blurb: 'Clean, reliable, respected. "Who get this motor?"' }),
  car({ id: 'innoson-ivm-fox', name: 'Innoson IVM Fox', nickname: 'Made in Nnewi', make: 'Innoson', year: 2026, grade: 'brand-new', segment: 'family', model: 'sedan', defaultPaint: 'army-green', paints: ['army-green', 'pearl-white', 'silver', 'tomato-red'], price: 22_000_000, performance: perf(175, 12, 0.6, 0.6), fuelType: 'petrol', fuelEconomyKmPerLitre: 14, seats: 5, status: 18, depreciationPerYear: 0.14, maintenancePerYear: 0.05, blurb: 'Brand new and proudly Nigerian. Buy Naija to grow the naira.' }),
  car({ id: 'mitsubishi-canter', name: 'Mitsubishi Canter', nickname: 'Mini Truck', make: 'Mitsubishi', year: 2014, grade: 'tokunbo', segment: 'commercial', model: 'delivery', defaultPaint: 'pearl-white', paints: ['pearl-white', 'sky-blue', 'tomato-red'], price: 24_000_000, performance: perf(120, 20, 0.35, 0.45), fuelType: 'diesel', fuelEconomyKmPerLitre: 7, seats: 3, status: 4, depreciationPerYear: 0.08, maintenancePerYear: 0.08, blurb: 'Moves goods from Apapa to Balogun. Your business will thank you.' }),

  // --- Executive ------------------------------------------------------------------------------------------------
  car({ id: 'toyota-camry-2018', name: 'Toyota Camry 2018', nickname: 'Muscle', make: 'Toyota', year: 2018, grade: 'tokunbo', segment: 'executive', model: 'sedan', defaultPaint: 'black', paints: ['black', 'pearl-white', 'silver', 'navy', 'wine'], price: 30_000_000, performance: perf(210, 8.2, 0.7, 0.7), fuelType: 'petrol', fuelEconomyKmPerLitre: 12, seats: 5, status: 40, depreciationPerYear: 0.11, maintenancePerYear: 0.05, blurb: 'Sharp lines, strong pull. The young manager\'s statement.' }),
  car({ id: 'mercedes-c300-2017', name: 'Mercedes-Benz C300 2017', nickname: 'Benz', make: 'Mercedes-Benz', year: 2017, grade: 'tokunbo', segment: 'executive', model: 'sedan-sports', defaultPaint: 'gun-grey', paints: ['gun-grey', 'black', 'pearl-white', 'navy'], price: 35_000_000, performance: perf(240, 6, 0.8, 0.8), fuelType: 'petrol', fuelEconomyKmPerLitre: 11, seats: 5, status: 55, depreciationPerYear: 0.13, maintenancePerYear: 0.06, blurb: 'German engineering for Lagos potholes. People will call you "Chairman".' }),
  car({ id: 'toyota-hilux-2019', name: 'Toyota Hilux 2019', nickname: 'Hilux', make: 'Toyota', year: 2019, grade: 'tokunbo', segment: 'commercial', model: 'truck', defaultPaint: 'pearl-white', paints: ['pearl-white', 'silver', 'black', 'army-green'], price: 38_000_000, performance: perf(175, 11, 0.55, 0.6), fuelType: 'diesel', fuelEconomyKmPerLitre: 10, seats: 5, status: 25, depreciationPerYear: 0.09, maintenancePerYear: 0.05, blurb: 'Site engineer, farmer, politician\'s convoy — the Hilux does it all.' }),
  car({ id: 'lexus-rx350-2016', name: 'Lexus RX350 2016', nickname: 'Lexus Jeep', make: 'Lexus', year: 2016, grade: 'tokunbo', segment: 'executive', model: 'suv', defaultPaint: 'champagne', paints: ['champagne', 'black', 'pearl-white', 'wine', 'silver'], price: 43_500_000, performance: perf(200, 7.8, 0.68, 0.7), fuelType: 'petrol', fuelEconomyKmPerLitre: 9, seats: 5, status: 70, depreciationPerYear: 0.11, maintenancePerYear: 0.05, blurb: 'The Lagos "I have arrived" SUV. Smooth, quiet, respected at every gate.' }),

  // --- Luxury ---------------------------------------------------------------------------------------------------
  car({ id: 'toyota-prado-2021', name: 'Toyota Land Cruiser Prado 2021', nickname: 'Prado', make: 'Toyota', year: 2021, grade: 'tokunbo', segment: 'luxury', model: 'suv', defaultPaint: 'black', paints: ['black', 'pearl-white', 'silver', 'army-green'], price: 85_000_000, performance: perf(175, 9.5, 0.62, 0.7), fuelType: 'diesel', fuelEconomyKmPerLitre: 8, seats: 7, status: 110, depreciationPerYear: 0.1, maintenancePerYear: 0.04, blurb: 'Big Man energy. Climbs kerbs, floods and the social ladder.' }),
  car({ id: 'range-rover-sport-2021', name: 'Range Rover Sport 2021', nickname: 'Range', make: 'Land Rover', year: 2021, grade: 'tokunbo', segment: 'luxury', model: 'suv-luxury', defaultPaint: 'pearl-white', paints: ['pearl-white', 'black', 'matte-black', 'gun-grey', 'navy'], price: 150_000_000, performance: perf(225, 6.2, 0.75, 0.8), fuelType: 'petrol', fuelEconomyKmPerLitre: 7, seats: 5, status: 170, depreciationPerYear: 0.15, maintenancePerYear: 0.05, blurb: 'Lekki royalty on wheels. The valet at Eko Hotel will remember you.' }),
  car({ id: 'mercedes-g-wagon-2022', name: 'Mercedes-Benz G-Wagon 2022', nickname: 'G-Wagon', make: 'Mercedes-Benz', year: 2022, grade: 'tokunbo', segment: 'luxury', model: 'suv-luxury', defaultPaint: 'matte-black', paints: ['matte-black', 'black', 'pearl-white', 'army-green', 'champagne'], price: 250_000_000, performance: perf(220, 4.5, 0.7, 0.8), fuelType: 'petrol', fuelEconomyKmPerLitre: 6, seats: 5, status: 230, depreciationPerYear: 0.12, maintenancePerYear: 0.04, blurb: 'The box that ends conversations. Odogwu certified.' }),
];

const VEHICLE_INDEX: ReadonlyMap<string, VehicleDefinition> = new Map(VEHICLES.map((vehicle) => [vehicle.id, vehicle]));

export function findVehicle(id: string): VehicleDefinition | undefined {
  return VEHICLE_INDEX.get(id);
}

export function isVehiclePaintId(value: string): value is VehiclePaintId {
  return Object.prototype.hasOwnProperty.call(VEHICLE_PAINTS, value);
}

/** The paint if the dealer offers it for this vehicle. */
export function vehiclePaint(vehicle: VehicleDefinition, paintId: string): VehiclePaint | undefined {
  if (!isVehiclePaintId(paintId) || !vehicle.paints.includes(paintId)) return undefined;
  return VEHICLE_PAINTS[paintId];
}

// ---------------------------------------------------------------------------------------------------------------
// Dealers
// ---------------------------------------------------------------------------------------------------------------

export interface CarDealerStock {
  readonly grades: readonly VehicleGrade[];
  readonly minPrice?: number;
  readonly maxPrice?: number;
}

/** Stock profile per dealer venue; other `car-dealer` venues stock everything. */
export const CAR_DEALER_STOCK: Readonly<Record<string, CarDealerStock>> = {
  'berger-car-market': { grades: ['naija-used', 'tokunbo'], maxPrice: 50_000_000 },
  'lekki-car-mart': { grades: ['tokunbo', 'brand-new'], minPrice: 15_000_000 },
};

/** True if the venue is a car dealer with this vehicle on the lot. */
export function dealerStocks(venueId: string, vehicle: VehicleDefinition): boolean {
  const venue = findVenue(venueId);
  if (!venue || venue.type !== 'car-dealer') return false;
  const stock = CAR_DEALER_STOCK[venueId];
  if (!stock) return true;
  if (!stock.grades.includes(vehicle.grade)) return false;
  if (stock.minPrice !== undefined && vehicle.price < stock.minPrice) return false;
  if (stock.maxPrice !== undefined && vehicle.price > stock.maxPrice) return false;
  return true;
}

// ---------------------------------------------------------------------------------------------------------------
// Ownership rules
// ---------------------------------------------------------------------------------------------------------------

/** Remote purchase: the dealer's driver brings it to your gate (₦, before the price index). */
export const VEHICLE_DELIVERY_FEE = 50_000;
/** Dealers buy cars back at this share of the depreciated value. */
export const DEALER_OFFER_RANGE = [0.65, 0.85] as const;
/** Garage limit. */
export const MAX_VEHICLES = 6;
/** Below this condition the car won't start (no driving until repaired). */
export const VEHICLE_UNDRIVABLE_CONDITION = 10;
/** Below this condition breakdowns start happening. */
export const VEHICLE_BREAKDOWN_CONDITION = 45;
/** Full repair (0 → 100 condition) costs this share of the base price. */
export const VEHICLE_REPAIR_RATE = 0.2;
/** Value never drops below this share of the base price (scrap and parts). */
export const VEHICLE_SCRAP_FLOOR = 0.12;

/** Condition a car of each grade has when it leaves the lot; values are relative to it. */
export const BASELINE_CONDITION: Readonly<Record<VehicleGrade, number>> = {
  'naija-used': 70,
  tokunbo: 88,
  'brand-new': 100,
};

/** FRSC driver's licence (granted as a certification through the education domain). */
export const DRIVERS_LICENCE = {
  certification: 'drivers-licence',
  /** FRSC fee, before the price index. */
  fee: 25_000,
  actionId: 'driving-test',
  testMinutes: 120,
  venueType: 'government',
} as const;

/**
 * Market value of a car: base price (at today's price index) × yearly depreciation compounded over its age in your
 * hands × a condition factor relative to the grade's baseline, never below the scrap floor.
 */
export function vehicleMarketValue(
  vehicle: Pick<VehicleDefinition, 'price' | 'depreciationPerYear' | 'grade'>,
  ageDays: number,
  condition: number,
  priceIndex = 1,
): number {
  const years = Math.max(0, ageDays) / DAYS_PER_YEAR;
  const depreciation = Math.pow(1 - vehicle.depreciationPerYear, years);
  const baseline = BASELINE_CONDITION[vehicle.grade];
  const conditionFactor = Math.min(1.05, Math.max(0.5, 0.5 + (0.5 * Math.max(0, condition)) / baseline));
  const value = vehicle.price * priceIndex * Math.max(VEHICLE_SCRAP_FLOOR, depreciation * conditionFactor);
  return Math.round(value / 1_000) * 1_000;
}

/** Lagos registration prefixes by district (plates look like `KJA-482-KJ`). */
export const PLATE_PREFIXES: Readonly<Record<DistrictId, string>> = {
  ikeja: 'KJA',
  ikorodu: 'KRD',
  mushin: 'MUS',
  surulere: 'LSR',
  yaba: 'YAB',
  ojo: 'JJJ',
  'lagos-island': 'LND',
  ikoyi: 'EKY',
  'banana-island': 'EKY',
  'victoria-island': 'EKY',
  lekki: 'EKY',
  ajah: 'EKY',
  epe: 'EPE',
};
