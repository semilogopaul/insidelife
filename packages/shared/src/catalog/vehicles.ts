/**
 * Vehicles catalog — owned by the vehicles domain.
 *
 * Every car maps to a body (`model`: a Kenney Car Kit model, or one of the client's procedural luxury bodies) and a
 * paint (`color` hex) that the 3D client renders; the `performance` block feeds the client's arcade driving model.
 * Makes and model names are the real ones Lagos buyers know; the 3D bodies and badges are look-alikes, not copies. Prices are 2026 Lagos prices (₦) before the world
 * price index. Grades follow the Lagos market: Naija-used (already driven in Nigeria), tokunbo (foreign-used,
 * imported) and brand-new.
 */
import { DAYS_PER_YEAR, MINUTES_PER_DAY, WEEKDAYS, startOfDay, toDateParts, type GameMinute } from '../time/calendar.js';
import type { DistrictId } from './geography.js';
import { findVenue } from './venues.js';

/** Kenney Car Kit models available to the 3D client. */
export const KIT_VEHICLE_MODELS = [
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
  'danfo',
] as const;

/** Procedural luxury bodies the client builds itself (look-alike silhouettes, no real-brand details). */
export const LUXURY_BODY_MODELS = ['supercar', 'hypercar', 'gt-coupe', 'limousine', 'box-suv', 'grand-suv', 'coupe-suv'] as const;
export type LuxuryBodyModel = (typeof LUXURY_BODY_MODELS)[number];

/** Every body a car can have. */
export const VEHICLE_MODELS = [...KIT_VEHICLE_MODELS, ...LUXURY_BODY_MODELS] as const;
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

export const VEHICLE_SEGMENTS = ['economy', 'family', 'executive', 'luxury', 'exotic', 'commercial'] as const;
export type VehicleSegment = (typeof VEHICLE_SEGMENTS)[number];

/** How a paint is finished: solid colours cost nothing extra; the rest are priced as a share of the car. */
export const PAINT_FINISHES = ['solid', 'metallic', 'pearl', 'matte', 'special'] as const;
export type PaintFinish = (typeof PAINT_FINISHES)[number];

export const PAINT_FINISH_LABELS: Readonly<Record<PaintFinish, string>> = {
  solid: 'Solid',
  metallic: 'Metallic',
  pearl: 'Pearl',
  matte: 'Matte',
  special: 'Special order',
};

/** Share of the car's price a non-default paint adds, by finish (the colour on the lot is always free). */
export const PAINT_FINISH_RATES: Readonly<Record<PaintFinish, number>> = {
  solid: 0,
  metallic: 0.01,
  pearl: 0.025,
  matte: 0.04,
  special: 0.07,
};

export interface VehiclePaint {
  readonly label: string;
  readonly hex: string;
  readonly finish: PaintFinish;
}

export const VEHICLE_PAINTS = {
  'pearl-white': { label: 'Pearl white', hex: '#f1f1ee', finish: 'pearl' },
  silver: { label: 'Silver', hex: '#b9bec4', finish: 'metallic' },
  'gun-grey': { label: 'Gunmetal grey', hex: '#4a4f55', finish: 'metallic' },
  black: { label: 'Black on black', hex: '#15171a', finish: 'solid' },
  'matte-black': { label: 'Matte black', hex: '#262626', finish: 'matte' },
  champagne: { label: 'Champagne gold', hex: '#c8b27d', finish: 'metallic' },
  navy: { label: 'Navy blue', hex: '#1f2f4f', finish: 'solid' },
  wine: { label: 'Wine', hex: '#6b1f2a', finish: 'metallic' },
  'army-green': { label: 'Army green', hex: '#4b5d3a', finish: 'solid' },
  'sky-blue': { label: 'Sky blue', hex: '#5aa9e6', finish: 'solid' },
  'tomato-red': { label: 'Tomato red', hex: '#c0392b', finish: 'solid' },
  'danfo-yellow': { label: 'Danfo yellow', hex: '#f2b705', finish: 'solid' },
  'racing-red': { label: 'Racing red', hex: '#b3121b', finish: 'metallic' },
  'royal-blue': { label: 'Royal blue', hex: '#1f4fbf', finish: 'metallic' },
  emerald: { label: 'Emerald green', hex: '#0f5f45', finish: 'metallic' },
  'satin-grey': { label: 'Satin grey', hex: '#6b6f75', finish: 'matte' },
  'arctic-pearl': { label: 'Arctic pearl', hex: '#f7f7f4', finish: 'pearl' },
  'sunset-orange': { label: 'Sunset orange', hex: '#f26b1d', finish: 'pearl' },
  'lime-green': { label: 'Lime green', hex: '#8cc63f', finish: 'pearl' },
  'midnight-purple': { label: 'Midnight purple', hex: '#3b1f5c', finish: 'special' },
  'rose-gold': { label: 'Rose gold', hex: '#c98f7a', finish: 'special' },
  'chrome-gold': { label: 'Gold chrome', hex: '#d4a52a', finish: 'special' },
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
  car({ id: 'toyota-hiace-danfo', name: 'Toyota Hiace', nickname: 'Danfo', make: 'Toyota', year: 2012, grade: 'tokunbo', segment: 'commercial', model: 'danfo', defaultPaint: 'danfo-yellow', paints: ['danfo-yellow'], price: 18_000_000, performance: perf(140, 16, 0.4, 0.45), fuelType: 'diesel', fuelEconomyKmPerLitre: 8, seats: 14, status: 3, depreciationPerYear: 0.08, maintenancePerYear: 0.1, blurb: '"Oshodi! Oshodi! Enter with your change!" A business on four wheels.' }),
  car({ id: 'toyota-corolla-2017', name: 'Toyota Corolla 2017', nickname: 'Tokunbo Corolla', make: 'Toyota', year: 2017, grade: 'tokunbo', segment: 'family', model: 'sedan', defaultPaint: 'pearl-white', paints: ['pearl-white', 'silver', 'black', 'gun-grey', 'wine'], price: 18_600_000, performance: perf(190, 10, 0.65, 0.65), fuelType: 'petrol', fuelEconomyKmPerLitre: 14, seats: 5, status: 22, depreciationPerYear: 0.1, maintenancePerYear: 0.06, blurb: 'Clean, reliable, respected. "Who get this motor?"' }),
  car({ id: 'innoson-ivm-fox', name: 'Innoson IVM Fox', nickname: 'Made in Nnewi', make: 'Innoson', year: 2026, grade: 'brand-new', segment: 'family', model: 'sedan', defaultPaint: 'army-green', paints: ['army-green', 'pearl-white', 'silver', 'tomato-red'], price: 22_000_000, performance: perf(175, 12, 0.6, 0.6), fuelType: 'petrol', fuelEconomyKmPerLitre: 14, seats: 5, status: 18, depreciationPerYear: 0.14, maintenancePerYear: 0.05, blurb: 'Brand new and proudly Nigerian. Buy Naija to grow the naira.' }),
  car({ id: 'mitsubishi-canter', name: 'Mitsubishi Canter', nickname: 'Mini Truck', make: 'Mitsubishi', year: 2014, grade: 'tokunbo', segment: 'commercial', model: 'delivery', defaultPaint: 'pearl-white', paints: ['pearl-white', 'sky-blue', 'tomato-red'], price: 24_000_000, performance: perf(120, 20, 0.35, 0.45), fuelType: 'diesel', fuelEconomyKmPerLitre: 7, seats: 3, status: 4, depreciationPerYear: 0.08, maintenancePerYear: 0.08, blurb: 'Moves goods from Apapa to Balogun. Your business will thank you.' }),

  // --- Executive ------------------------------------------------------------------------------------------------
  car({ id: 'toyota-camry-2018', name: 'Toyota Camry 2018', nickname: 'New Shape', make: 'Toyota', year: 2018, grade: 'tokunbo', segment: 'executive', model: 'sedan', defaultPaint: 'black', paints: ['black', 'pearl-white', 'silver', 'navy', 'wine'], price: 30_000_000, performance: perf(210, 8.2, 0.7, 0.7), fuelType: 'petrol', fuelEconomyKmPerLitre: 12, seats: 5, status: 40, depreciationPerYear: 0.11, maintenancePerYear: 0.05, blurb: 'Sharp lines, strong pull. The young manager\'s statement.' }),
  car({ id: 'mercedes-c300-2017', name: 'Mercedes-Benz C300 2017', nickname: 'Benz', make: 'Mercedes-Benz', year: 2017, grade: 'tokunbo', segment: 'executive', model: 'sedan-sports', defaultPaint: 'gun-grey', paints: ['gun-grey', 'black', 'pearl-white', 'navy'], price: 35_000_000, performance: perf(240, 6, 0.8, 0.8), fuelType: 'petrol', fuelEconomyKmPerLitre: 11, seats: 5, status: 55, depreciationPerYear: 0.13, maintenancePerYear: 0.06, blurb: 'German engineering for Lagos potholes. People will call you "Chairman".' }),
  car({ id: 'toyota-hilux-2019', name: 'Toyota Hilux 2019', nickname: 'Hilux', make: 'Toyota', year: 2019, grade: 'tokunbo', segment: 'commercial', model: 'truck', defaultPaint: 'pearl-white', paints: ['pearl-white', 'silver', 'black', 'army-green'], price: 38_000_000, performance: perf(175, 11, 0.55, 0.6), fuelType: 'diesel', fuelEconomyKmPerLitre: 10, seats: 5, status: 25, depreciationPerYear: 0.09, maintenancePerYear: 0.05, blurb: 'Site engineer, farmer, politician\'s convoy — the Hilux does it all.' }),
  car({ id: 'lexus-rx350-2016', name: 'Lexus RX350 2016', nickname: 'Lexus Jeep', make: 'Lexus', year: 2016, grade: 'tokunbo', segment: 'executive', model: 'suv', defaultPaint: 'champagne', paints: ['champagne', 'black', 'pearl-white', 'wine', 'silver'], price: 43_500_000, performance: perf(200, 7.8, 0.68, 0.7), fuelType: 'petrol', fuelEconomyKmPerLitre: 9, seats: 5, status: 70, depreciationPerYear: 0.11, maintenancePerYear: 0.05, blurb: 'The Lagos "I have arrived" SUV. Smooth, quiet, respected at every gate.' }),

  // --- Luxury ---------------------------------------------------------------------------------------------------
  car({ id: 'toyota-prado-2021', name: 'Toyota Land Cruiser Prado 2021', nickname: 'Prado', make: 'Toyota', year: 2021, grade: 'tokunbo', segment: 'luxury', model: 'suv', defaultPaint: 'black', paints: ['black', 'pearl-white', 'silver', 'army-green'], price: 85_000_000, performance: perf(175, 9.5, 0.62, 0.7), fuelType: 'diesel', fuelEconomyKmPerLitre: 8, seats: 7, status: 110, depreciationPerYear: 0.1, maintenancePerYear: 0.04, blurb: 'Big Man energy. Climbs kerbs, floods and the social ladder.' }),
  car({ id: 'range-rover-sport-2021', name: 'Range Rover Sport 2021', nickname: 'Range', make: 'Land Rover', year: 2021, grade: 'tokunbo', segment: 'luxury', model: 'suv-luxury', defaultPaint: 'pearl-white', paints: ['pearl-white', 'black', 'matte-black', 'gun-grey', 'navy'], price: 150_000_000, performance: perf(225, 6.2, 0.75, 0.8), fuelType: 'petrol', fuelEconomyKmPerLitre: 7, seats: 5, status: 170, depreciationPerYear: 0.15, maintenancePerYear: 0.05, blurb: 'Lekki royalty on wheels. The valet at Eko Hotel will remember you.' }),
  car({ id: 'mercedes-g-wagon-2022', name: 'Mercedes-Benz G-Wagon 2022', nickname: 'G-Wagon', make: 'Mercedes-Benz', year: 2022, grade: 'tokunbo', segment: 'luxury', model: 'box-suv', defaultPaint: 'matte-black', paints: ['matte-black', 'black', 'pearl-white', 'army-green', 'champagne'], price: 250_000_000, performance: perf(220, 4.5, 0.7, 0.8), fuelType: 'petrol', fuelEconomyKmPerLitre: 6, seats: 5, status: 230, depreciationPerYear: 0.12, maintenancePerYear: 0.04, blurb: 'The box that ends conversations. Odogwu certified.' }),
  // --- Everyday Lagos favourites -------------------------------------------------------------------------------------
  car({ id: 'peugeot-406-2004', name: 'Peugeot 406 2004', nickname: 'First Car', make: 'Peugeot', year: 2004, grade: 'naija-used', segment: 'economy', model: 'sedan', defaultPaint: 'silver', paints: ['silver', 'black', 'wine', 'pearl-white'], price: 2_800_000, performance: perf(180, 11.5, 0.55, 0.5), fuelType: 'petrol', fuelEconomyKmPerLitre: 11, seats: 5, status: 1, depreciationPerYear: 0.07, maintenancePerYear: 0.15, blurb: 'Your uncle\'s old car, still standing. Every Ladipo mechanic has the parts.' }),
  car({ id: 'toyota-yaris-2012', name: 'Toyota Yaris 2012', nickname: 'Yaris', make: 'Toyota', year: 2012, grade: 'naija-used', segment: 'economy', model: 'hatchback-sports', defaultPaint: 'sky-blue', paints: ['sky-blue', 'silver', 'pearl-white', 'tomato-red'], price: 4_200_000, performance: perf(165, 12.8, 0.6, 0.55), fuelType: 'petrol', fuelEconomyKmPerLitre: 16, seats: 5, status: 5, depreciationPerYear: 0.07, maintenancePerYear: 0.1, blurb: 'Small, Toyota-tough and kind to your fuel money.' }),
  car({ id: 'honda-accord-2010', name: 'Honda Accord 2010', nickname: 'Evil Spirit', make: 'Honda', year: 2010, grade: 'naija-used', segment: 'family', model: 'sedan', defaultPaint: 'black', paints: ['black', 'silver', 'gun-grey', 'pearl-white', 'wine'], price: 7_200_000, performance: perf(210, 8.9, 0.62, 0.6), fuelType: 'petrol', fuelEconomyKmPerLitre: 11, seats: 5, status: 12, depreciationPerYear: 0.07, maintenancePerYear: 0.1, blurb: 'Those headlamps earned the name. Smooth, fast and still everywhere in Lagos.' }),
  car({ id: 'toyota-camry-2010', name: 'Toyota Camry 2010', nickname: 'Muscle', make: 'Toyota', year: 2010, grade: 'naija-used', segment: 'family', model: 'sedan', defaultPaint: 'silver', paints: ['silver', 'black', 'gun-grey', 'champagne', 'pearl-white'], price: 7_800_000, performance: perf(200, 9.4, 0.6, 0.6), fuelType: 'petrol', fuelEconomyKmPerLitre: 11, seats: 5, status: 13, depreciationPerYear: 0.07, maintenancePerYear: 0.1, blurb: 'Broad shoulders, quiet cabin. The car that says "I\'m doing well, thank God."' }),
  car({ id: 'toyota-highlander-2010', name: 'Toyota Highlander 2010', nickname: 'Highlander', make: 'Toyota', year: 2010, grade: 'naija-used', segment: 'family', model: 'suv', defaultPaint: 'gun-grey', paints: ['gun-grey', 'silver', 'black', 'pearl-white', 'wine'], price: 10_500_000, performance: perf(190, 9.5, 0.55, 0.6), fuelType: 'petrol', fuelEconomyKmPerLitre: 8, seats: 7, status: 16, depreciationPerYear: 0.07, maintenancePerYear: 0.1, blurb: 'Seven seats for the school run, the market and the village trip at Christmas.' }),
  car({ id: 'toyota-venza-2011', name: 'Toyota Venza 2011', nickname: 'Venza', make: 'Toyota', year: 2011, grade: 'tokunbo', segment: 'family', model: 'suv', defaultPaint: 'champagne', paints: ['champagne', 'silver', 'black', 'pearl-white', 'wine'], price: 13_500_000, performance: perf(195, 8.9, 0.58, 0.62), fuelType: 'petrol', fuelEconomyKmPerLitre: 9, seats: 5, status: 18, depreciationPerYear: 0.08, maintenancePerYear: 0.08, blurb: 'Not quite a jeep, not quite a car, completely Lagos. Big wheels, soft ride.' }),
  car({ id: 'kia-sorento-2017', name: 'Kia Sorento 2017', nickname: 'Sorento', make: 'Kia', year: 2017, grade: 'tokunbo', segment: 'family', model: 'suv', defaultPaint: 'pearl-white', paints: ['pearl-white', 'silver', 'black', 'navy'], price: 20_000_000, performance: perf(190, 8.9, 0.58, 0.62), fuelType: 'petrol', fuelEconomyKmPerLitre: 9, seats: 7, status: 20, depreciationPerYear: 0.1, maintenancePerYear: 0.06, blurb: 'A seven-seater with toys — reverse camera, push start — at a family price.' }),
  car({ id: 'honda-crv-2017', name: 'Honda CR-V 2017', nickname: 'CR-V', make: 'Honda', year: 2017, grade: 'tokunbo', segment: 'family', model: 'suv', defaultPaint: 'silver', paints: ['silver', 'black', 'pearl-white', 'navy', 'wine'], price: 23_000_000, performance: perf(190, 9.2, 0.62, 0.66), fuelType: 'petrol', fuelEconomyKmPerLitre: 11, seats: 5, status: 26, depreciationPerYear: 0.09, maintenancePerYear: 0.05, blurb: 'Sensible money, high seating, gentle on fuel. Mummy\'s favourite.' }),
  car({ id: 'lexus-es350-2015', name: 'Lexus ES350 2015', nickname: 'ES', make: 'Lexus', year: 2015, grade: 'tokunbo', segment: 'executive', model: 'sedan-sports', defaultPaint: 'black', paints: ['black', 'pearl-white', 'champagne', 'silver'], price: 24_000_000, performance: perf(210, 7.2, 0.68, 0.7), fuelType: 'petrol', fuelEconomyKmPerLitre: 10, seats: 5, status: 34, depreciationPerYear: 0.1, maintenancePerYear: 0.05, blurb: 'Camry money\'s classy cousin. Soft leather and a quiet that costs extra.' }),
  car({ id: 'toyota-rav4-2018', name: 'Toyota RAV4 2018', nickname: 'RAV4', make: 'Toyota', year: 2018, grade: 'tokunbo', segment: 'family', model: 'suv', defaultPaint: 'pearl-white', paints: ['pearl-white', 'silver', 'black', 'tomato-red', 'navy'], price: 26_000_000, performance: perf(185, 9.5, 0.6, 0.65), fuelType: 'petrol', fuelEconomyKmPerLitre: 11, seats: 5, status: 28, depreciationPerYear: 0.08, maintenancePerYear: 0.04, blurb: 'Climbs kerbs, survives floods, resells fast. The smart young family\'s jeep.' }),
  car({ id: 'hyundai-elantra-2024', name: 'Hyundai Elantra 2024', nickname: 'Elantra', make: 'Hyundai', year: 2024, grade: 'brand-new', segment: 'family', model: 'sedan', defaultPaint: 'pearl-white', paints: ['pearl-white', 'silver', 'black', 'royal-blue', 'tomato-red'], price: 32_000_000, performance: perf(195, 9.8, 0.66, 0.68), fuelType: 'petrol', fuelEconomyKmPerLitre: 14, seats: 5, status: 30, depreciationPerYear: 0.14, maintenancePerYear: 0.03, blurb: 'Brand new with warranty, nobody drove it before you. Smells like progress.' }),
  car({ id: 'toyota-highlander-2019', name: 'Toyota Highlander 2019', nickname: 'Highlander Big Boy', make: 'Toyota', year: 2019, grade: 'tokunbo', segment: 'executive', model: 'suv', defaultPaint: 'black', paints: ['black', 'pearl-white', 'gun-grey', 'silver', 'wine'], price: 45_000_000, performance: perf(200, 7.5, 0.62, 0.7), fuelType: 'petrol', fuelEconomyKmPerLitre: 9, seats: 7, status: 75, depreciationPerYear: 0.08, maintenancePerYear: 0.04, blurb: 'Seven seats, V6 pull and the respect of every estate gateman in Magodo.' }),

  // --- Luxury: the convoy class --------------------------------------------------------------------------------------
  car({ id: 'porsche-cayenne-turbo-2021', name: 'Porsche Cayenne Turbo 2021', nickname: 'Cayenne', make: 'Porsche', year: 2021, grade: 'tokunbo', segment: 'luxury', model: 'coupe-suv', defaultPaint: 'silver', paints: ['silver', 'black', 'pearl-white', 'racing-red', 'satin-grey'], price: 180_000_000, performance: perf(285, 3.9, 0.82, 0.86), fuelType: 'petrol', fuelEconomyKmPerLitre: 7, seats: 5, status: 180, depreciationPerYear: 0.15, maintenancePerYear: 0.05, blurb: 'A sports car that carries five. The Lekki dad who still has fun.' }),
  car({ id: 'maserati-levante-2022', name: 'Maserati Levante 2022', nickname: 'Trident', make: 'Maserati', year: 2022, grade: 'tokunbo', segment: 'luxury', model: 'coupe-suv', defaultPaint: 'navy', paints: ['navy', 'black', 'pearl-white', 'wine', 'satin-grey'], price: 230_000_000, performance: perf(264, 5.2, 0.78, 0.82), fuelType: 'petrol', fuelEconomyKmPerLitre: 6, seats: 5, status: 190, depreciationPerYear: 0.17, maintenancePerYear: 0.06, blurb: 'Italian engine note, Lekki bounce. Few people have it; everybody notices it.' }),
  car({ id: 'mercedes-s580-2022', name: 'Mercedes-Benz S580 2022', nickname: 'Oga at the Top', make: 'Mercedes-Benz', year: 2022, grade: 'tokunbo', segment: 'luxury', model: 'limousine', defaultPaint: 'black', paints: ['black', 'pearl-white', 'silver', 'navy', 'emerald'], price: 240_000_000, performance: perf(250, 4.8, 0.75, 0.82), fuelType: 'petrol', fuelEconomyKmPerLitre: 8, seats: 5, status: 200, depreciationPerYear: 0.13, maintenancePerYear: 0.04, blurb: 'Back-seat money. Your driver opens the door; you step out at Eko Hotel.' }),
  car({ id: 'cadillac-escalade-2023', name: 'Cadillac Escalade 2023', nickname: 'Convoy', make: 'Cadillac', year: 2023, grade: 'tokunbo', segment: 'luxury', model: 'grand-suv', defaultPaint: 'black', paints: ['black', 'pearl-white', 'satin-grey', 'navy'], price: 260_000_000, performance: perf(210, 6.2, 0.6, 0.72), fuelType: 'petrol', fuelEconomyKmPerLitre: 6, seats: 7, status: 205, depreciationPerYear: 0.12, maintenancePerYear: 0.04, blurb: 'Every senator\'s convoy has one. Big, black, and everybody moves out of the way.' }),
  car({ id: 'toyota-land-cruiser-300-2023', name: 'Toyota Land Cruiser 300 2023', nickname: 'Big Daddy', make: 'Toyota', year: 2023, grade: 'tokunbo', segment: 'luxury', model: 'grand-suv', defaultPaint: 'pearl-white', paints: ['pearl-white', 'black', 'silver', 'army-green'], price: 270_000_000, performance: perf(210, 6.7, 0.6, 0.72), fuelType: 'diesel', fuelEconomyKmPerLitre: 8, seats: 7, status: 200, depreciationPerYear: 0.08, maintenancePerYear: 0.03, blurb: 'The Jeep that never dies. Governors, bishops and village chiefs agree.' }),
  car({ id: 'lexus-lx600-2023', name: 'Lexus LX600 2023', nickname: 'LX', make: 'Lexus', year: 2023, grade: 'tokunbo', segment: 'luxury', model: 'grand-suv', defaultPaint: 'pearl-white', paints: ['pearl-white', 'black', 'silver', 'champagne'], price: 290_000_000, performance: perf(210, 6.9, 0.62, 0.72), fuelType: 'petrol', fuelEconomyKmPerLitre: 6, seats: 7, status: 215, depreciationPerYear: 0.09, maintenancePerYear: 0.03, blurb: 'Land Cruiser bones in a tailored suit. Quiet power for quiet money.' }),
  car({ id: 'mercedes-g63-2024', name: 'Mercedes-AMG G63 2024', nickname: 'G-Wagon AMG', make: 'Mercedes-Benz', year: 2024, grade: 'brand-new', segment: 'luxury', model: 'box-suv', defaultPaint: 'matte-black', paints: ['matte-black', 'black', 'satin-grey', 'pearl-white', 'army-green', 'rose-gold'], price: 480_000_000, performance: perf(240, 4.4, 0.7, 0.82), fuelType: 'petrol', fuelEconomyKmPerLitre: 5, seats: 5, status: 270, depreciationPerYear: 0.14, maintenancePerYear: 0.035, blurb: 'Brand-new and loud. Wakes the whole estate when you start it.' }),
  car({ id: 'range-rover-autobiography-2023', name: 'Range Rover Autobiography 2023', nickname: 'Autobiography', make: 'Land Rover', year: 2023, grade: 'brand-new', segment: 'luxury', model: 'grand-suv', defaultPaint: 'pearl-white', paints: ['pearl-white', 'black', 'satin-grey', 'navy', 'emerald'], price: 620_000_000, performance: perf(250, 4.6, 0.72, 0.82), fuelType: 'petrol', fuelEconomyKmPerLitre: 6, seats: 5, status: 290, depreciationPerYear: 0.16, maintenancePerYear: 0.05, blurb: 'The full-size Range. Banana Island gate men wave you in without asking.' }),

  // --- Exotic: sports cars, supercars and the cars Lagos stops to film ----------------------------------------------
  car({ id: 'porsche-911-turbo-s-2022', name: 'Porsche 911 Turbo S 2022', nickname: 'Nine-Eleven', make: 'Porsche', year: 2022, grade: 'tokunbo', segment: 'exotic', model: 'gt-coupe', defaultPaint: 'silver', paints: ['silver', 'racing-red', 'black', 'satin-grey', 'lime-green'], price: 420_000_000, performance: perf(330, 2.7, 0.92, 0.92), fuelType: 'petrol', fuelEconomyKmPerLitre: 8, seats: 4, status: 260, depreciationPerYear: 0.08, maintenancePerYear: 0.04, blurb: 'Fast enough to scare you, polite enough for Third Mainland traffic.' }),
  car({ id: 'bentley-continental-gt-2021', name: 'Bentley Continental GT 2021', nickname: 'Conti', make: 'Bentley', year: 2021, grade: 'tokunbo', segment: 'exotic', model: 'gt-coupe', defaultPaint: 'emerald', paints: ['emerald', 'black', 'arctic-pearl', 'royal-blue', 'wine'], price: 480_000_000, performance: perf(318, 3.7, 0.82, 0.86), fuelType: 'petrol', fuelEconomyKmPerLitre: 6, seats: 4, status: 280, depreciationPerYear: 0.14, maintenancePerYear: 0.05, blurb: 'A gentleman\'s express. Leather, wood and twelve cylinders.' }),
  car({ id: 'bentley-bentayga-2022', name: 'Bentley Bentayga 2022', nickname: 'Bentayga', make: 'Bentley', year: 2022, grade: 'tokunbo', segment: 'exotic', model: 'grand-suv', defaultPaint: 'black', paints: ['black', 'arctic-pearl', 'emerald', 'wine', 'rose-gold'], price: 520_000_000, performance: perf(290, 4.5, 0.75, 0.85), fuelType: 'petrol', fuelEconomyKmPerLitre: 6, seats: 5, status: 280, depreciationPerYear: 0.14, maintenancePerYear: 0.05, blurb: 'Bentley comfort with Lagos ground clearance. The pothole never wins.' }),
  car({ id: 'maserati-mc20-2023', name: 'Maserati MC20 2023', nickname: 'MC20', make: 'Maserati', year: 2023, grade: 'brand-new', segment: 'exotic', model: 'supercar', defaultPaint: 'royal-blue', paints: ['royal-blue', 'pearl-white', 'black', 'racing-red'], price: 560_000_000, performance: perf(325, 2.9, 0.9, 0.9), fuelType: 'petrol', fuelEconomyKmPerLitre: 7, seats: 2, status: 300, depreciationPerYear: 0.12, maintenancePerYear: 0.05, blurb: 'Doors that open to the sky. Brand new, nobody else on your street has it.' }),
  car({ id: 'lamborghini-huracan-evo-2022', name: 'Lamborghini Huracán EVO 2022', nickname: 'Lambo', make: 'Lamborghini', year: 2022, grade: 'tokunbo', segment: 'exotic', model: 'supercar', defaultPaint: 'lime-green', paints: ['lime-green', 'sunset-orange', 'matte-black', 'pearl-white', 'racing-red'], price: 620_000_000, performance: perf(325, 2.9, 0.9, 0.9), fuelType: 'petrol', fuelEconomyKmPerLitre: 6, seats: 2, status: 320, depreciationPerYear: 0.1, maintenancePerYear: 0.05, blurb: 'The car on every hustler\'s vision board. It sounds like an argument.' }),
  car({ id: 'mercedes-maybach-s680-2023', name: 'Mercedes-Maybach S680 2023', nickname: 'Maybach', make: 'Mercedes-Benz', year: 2023, grade: 'brand-new', segment: 'exotic', model: 'limousine', defaultPaint: 'black', paints: ['black', 'arctic-pearl', 'rose-gold', 'silver'], price: 650_000_000, performance: perf(250, 4.5, 0.72, 0.84), fuelType: 'petrol', fuelEconomyKmPerLitre: 6, seats: 4, status: 300, depreciationPerYear: 0.14, maintenancePerYear: 0.04, blurb: 'Reclining seats, champagne fridge and a driver in a black suit.' }),
  car({ id: 'ferrari-f8-tributo-2021', name: 'Ferrari F8 Tributo 2021', nickname: 'Ferrari', make: 'Ferrari', year: 2021, grade: 'tokunbo', segment: 'exotic', model: 'supercar', defaultPaint: 'racing-red', paints: ['racing-red', 'black', 'pearl-white', 'sunset-orange', 'chrome-gold'], price: 680_000_000, performance: perf(340, 2.9, 0.92, 0.92), fuelType: 'petrol', fuelEconomyKmPerLitre: 6, seats: 2, status: 330, depreciationPerYear: 0.09, maintenancePerYear: 0.05, blurb: 'Red, loud and rare. Traffic wardens forget to write the ticket.' }),
  car({ id: 'lamborghini-urus-s-2024', name: 'Lamborghini Urus S 2024', nickname: 'Urus', make: 'Lamborghini', year: 2024, grade: 'brand-new', segment: 'exotic', model: 'coupe-suv', defaultPaint: 'sunset-orange', paints: ['sunset-orange', 'lime-green', 'black', 'matte-black', 'pearl-white', 'racing-red'], price: 780_000_000, performance: perf(305, 3.5, 0.85, 0.9), fuelType: 'petrol', fuelEconomyKmPerLitre: 5, seats: 5, status: 320, depreciationPerYear: 0.15, maintenancePerYear: 0.05, blurb: 'The family car that does 305. Every phone at Landmark Beach comes out.' }),
  car({ id: 'lamborghini-aventador-svj-2021', name: 'Lamborghini Aventador SVJ 2021', nickname: 'Aventador', make: 'Lamborghini', year: 2021, grade: 'tokunbo', segment: 'exotic', model: 'supercar', defaultPaint: 'sunset-orange', paints: ['sunset-orange', 'lime-green', 'matte-black', 'midnight-purple', 'chrome-gold'], price: 1_150_000_000, performance: perf(350, 2.8, 0.93, 0.93), fuelType: 'petrol', fuelEconomyKmPerLitre: 4, seats: 2, status: 360, depreciationPerYear: 0.06, maintenancePerYear: 0.05, blurb: 'Twelve cylinders, scissor doors and a sound that shakes Admiralty Way.' }),
  car({ id: 'rolls-royce-cullinan-2023', name: 'Rolls-Royce Cullinan 2023', nickname: 'Cullinan', make: 'Rolls-Royce', year: 2023, grade: 'brand-new', segment: 'exotic', model: 'grand-suv', defaultPaint: 'black', paints: ['black', 'arctic-pearl', 'midnight-purple', 'emerald', 'rose-gold', 'chrome-gold'], price: 1_250_000_000, performance: perf(250, 5.2, 0.62, 0.8), fuelType: 'petrol', fuelEconomyKmPerLitre: 5, seats: 5, status: 370, depreciationPerYear: 0.12, maintenancePerYear: 0.04, blurb: 'Old money in a tall coat. Gate men salute before they see who is inside.' }),
  car({ id: 'rolls-royce-phantom-2023', name: 'Rolls-Royce Phantom 2023', nickname: 'Phantom', make: 'Rolls-Royce', year: 2023, grade: 'brand-new', segment: 'exotic', model: 'limousine', defaultPaint: 'black', paints: ['black', 'arctic-pearl', 'midnight-purple', 'navy', 'chrome-gold'], price: 1_600_000_000, performance: perf(250, 5.4, 0.6, 0.8), fuelType: 'petrol', fuelEconomyKmPerLitre: 5, seats: 5, status: 390, depreciationPerYear: 0.11, maintenancePerYear: 0.04, blurb: 'For people who don\'t drive themselves. The quietest room in Lagos.' }),
  car({ id: 'bugatti-chiron-sport-2021', name: 'Bugatti Chiron Sport 2021', nickname: 'Chiron', make: 'Bugatti', year: 2021, grade: 'tokunbo', segment: 'exotic', model: 'hypercar', defaultPaint: 'royal-blue', paints: ['royal-blue', 'black', 'racing-red', 'chrome-gold'], price: 5_500_000_000, performance: perf(420, 2.4, 0.95, 0.95), fuelType: 'petrol', fuelEconomyKmPerLitre: 4, seats: 2, status: 450, depreciationPerYear: 0.03, maintenancePerYear: 0.03, blurb: 'Only a handful in Africa. When it pulls up, Lagos stops and films.' }),
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

/**
 * What a paint adds to the price (₦, before the world price index): nothing for the colour on the lot or a solid
 * colour; otherwise the finish's share of the car's price, rounded to the nearest ₦1,000. Unknown paints add 0.
 */
export function paintSurcharge(vehicle: Pick<VehicleDefinition, 'price' | 'defaultPaint'>, paintId: string): number {
  if (paintId === vehicle.defaultPaint || !isVehiclePaintId(paintId)) return 0;
  return Math.round((vehicle.price * PAINT_FINISH_RATES[VEHICLE_PAINTS[paintId].finish]) / 1_000) * 1_000;
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

/**
 * When a car ordered for delivery reaches your gate: midnight at the end of the next day, whatever time you order
 * (handed over at day end). The one source for the server's `arrivesAt`, the dealer sheet's promise and the toasts.
 */
export function vehicleDeliveryArrival(orderedAt: GameMinute): GameMinute {
  return startOfDay(orderedAt) + 2 * MINUTES_PER_DAY;
}

/** "by midnight tonight", "by tomorrow night, at midnight", "by Friday night, at midnight": a delivery at midnight `arrivesAt`, seen from `now`. */
export function deliveryByLabel(arrivesAt: GameMinute, now: GameMinute): string {
  const days = Math.round((arrivesAt - startOfDay(now)) / MINUTES_PER_DAY);
  if (days <= 1) return 'by midnight tonight';
  if (days === 2) return 'by tomorrow night, at midnight';
  return `by ${WEEKDAYS[toDateParts(arrivesAt - 1).weekday]} night, at midnight`;
}

/** What the dealer promises when you order now ("by tomorrow night, at midnight"). */
export function vehicleDeliveryPromise(orderedAt: GameMinute): string {
  return deliveryByLabel(vehicleDeliveryArrival(orderedAt), orderedAt);
}
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
  testMinutes: 60,
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
