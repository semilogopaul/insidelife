/** Vehicles API contracts — owned by the vehicles domain. */
import type { GameMinute } from '../time/calendar.js';
import type { CityId } from '../catalog/geography.js';
import type { VehicleDefinition, VehicleModel, VehiclePaintId } from '../catalog/vehicles.js';

export interface VehicleCatalogEntryDto {
  readonly vehicle: VehicleDefinition;
  /** Price on the lot right now (world price index applied). */
  readonly price: number;
  /** Extra for remote purchase (the dealer's driver brings it). */
  readonly deliveryFee: number;
  /** Extra per paint that costs more than the colour on the lot (price index applied; missing = free). */
  readonly paintFees: Readonly<Partial<Record<VehiclePaintId, number>>>;
  /** Dealer venue ids with this car on the lot. */
  readonly dealerIds: readonly string[];
  /** You are standing in a dealer that stocks it (buy in person, drive it off today). */
  readonly buyHere: boolean;
}

export type OwnedVehicleStatus = 'owned' | 'in-transit';

export interface OwnedVehicleDto {
  readonly id: string;
  readonly vehicleId: string;
  readonly name: string;
  readonly nickname: string;
  /** Kenney Car Kit model + paint for the 3D client. */
  readonly model: VehicleModel;
  readonly paint: VehiclePaintId;
  readonly color: string;
  /** e.g. `KJA-482-KJ`. */
  readonly plate: string;
  readonly purchasePrice: number;
  /** Market value today. */
  readonly value: number;
  /** What the dealer pays today. */
  readonly saleOffer: number;
  /** 0-100 right now. */
  readonly condition: number;
  readonly drivable: boolean;
  readonly mileageKm: number;
  readonly acquiredAt: GameMinute;
  readonly isPrimary: boolean;
  readonly status: OwnedVehicleStatus;
  /** Remote purchases: when it's delivered to your gate. */
  readonly arrivesAt: GameMinute | null;
  /** What a mechanic workshop charges to fix it properly (back to 100, breakdown cleared); 0 if nothing to fix. */
  readonly repairCost: number;
  /** "Tow & fix" from anywhere (the workshop bill plus the tow truck); 0 if nothing to fix. */
  readonly towRepairCost: number;
  /** Roadside mechanic: gets it going again (breakdown cleared, patched up to 50); 0 if it runs and is fine. */
  readonly roadsideRepairCost: number;
  /** Charged at month end. */
  readonly monthlyMaintenance: number;
  /** Litres in the tank and its size. */
  readonly fuelLitres: number;
  readonly tankLitres: number;
  /** Map km left on the tank. */
  readonly rangeKm: number;
  readonly fuelType: 'petrol' | 'diesel';
  /** Pump price per litre for this car right now (scarcity included). */
  readonly pumpPrice: number;
  /** A 10 L jerrycan brought to you, right now. */
  readonly jerrycanPrice: number;
  /** It broke down and won't move until a mechanic sees it. */
  readonly brokenDown: boolean;
  /** Fuel in the tank, not broken down, good enough to start. */
  readonly canDrive: boolean;
  /** The city it is parked in (a car belongs to one city; elsewhere it can't be driven). */
  readonly cityId: CityId;
  /** On a car carrier to this city (`status` is `in-transit`, `arrivesAt` says when); null otherwise. */
  readonly shippingTo: CityId | null;
  /** What a car carrier charges to take it to the other city right now. */
  readonly shipFee: number;
}

/** POST /v1/vehicles/:id/shipments — a car carrier takes the car to the other city (a key per press so a retry never pays twice). */
export interface VehicleShipmentRequest {
  readonly idempotencyKey: string;
}

export interface VehicleShipmentResultDto {
  readonly vehicle: OwnedVehicleDto;
  readonly toCityId: CityId;
  readonly fee: number;
  readonly arrivesAt: GameMinute;
  readonly balance: number;
}

export interface DriverLicenceDto {
  readonly held: boolean;
  /** A driving test is running right now. */
  readonly testInProgress: boolean;
  readonly testEndsAt: GameMinute | null;
  /** FRSC fee right now. */
  readonly fee: number;
  /** Government venues where you can take the test. */
  readonly testCentres: readonly string[];
}

/** GET /v1/vehicles */
export interface VehiclesDto {
  readonly catalogue: readonly VehicleCatalogEntryDto[];
  readonly mine: readonly OwnedVehicleDto[];
  readonly licence: DriverLicenceDto;
  /** Dealer venue id the character is standing in, if any. */
  readonly atDealer: string | null;
}

/** POST /v1/vehicles/purchases */
export interface VehiclePurchaseRequest {
  readonly vehicleId: string;
  /** Paint id from the vehicle's `paints` (defaults to its `defaultPaint`). */
  readonly colour?: string;
  /** "Tap once" key (a UUID per purchase): a retry with the same key gets the first result back instead of buying twice. */
  readonly idempotencyKey?: string;
}

export interface VehiclePurchaseResultDto {
  readonly channel: 'in-person' | 'delivery';
  readonly vehicle: OwnedVehicleDto;
  readonly price: number;
  /** Extra for a non-default metallic/pearl/matte/special paint (0 for the colour on the lot). */
  readonly paintFee: number;
  readonly deliveryFee: number;
  readonly balance: number;
}

export interface VehicleSaleResultDto {
  readonly vehicleId: string;
  readonly plate: string;
  readonly amount: number;
  readonly balance: number;
}

export interface VehicleRepairResultDto {
  readonly vehicle: OwnedVehicleDto;
  readonly cost: number;
  readonly balance: number;
}

/** POST /v1/vehicles/:id/roadside-repairs and /jerrycans: a key per press so a retry never pays twice. */
export interface VehicleServiceRequest {
  readonly idempotencyKey: string;
}

/** POST /v1/vehicles/:id/jerrycans */
export interface JerrycanResultDto {
  readonly vehicle: OwnedVehicleDto;
  readonly litres: number;
  readonly cost: number;
  readonly balance: number;
}

/** POST /v1/vehicles/licence — pay the FRSC fee and sit the driving test (2 game hours). */
export interface LicenceApplicationResultDto {
  readonly licence: DriverLicenceDto;
  readonly fee: number;
  readonly balance: number;
}
