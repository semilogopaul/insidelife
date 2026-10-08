/** Vehicles API contracts — owned by the vehicles domain. */
import type { GameMinute } from '../time/calendar.js';
import type { VehicleDefinition, VehicleModel, VehiclePaintId } from '../catalog/vehicles.js';

export interface VehicleCatalogEntryDto {
  readonly vehicle: VehicleDefinition;
  /** Price on the lot right now (world price index applied). */
  readonly price: number;
  /** Extra for remote purchase (the dealer's driver brings it). */
  readonly deliveryFee: number;
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
  /** Cost to restore to 100 condition now (0 if nothing to fix). */
  readonly repairCost: number;
  /** Charged at month end. */
  readonly monthlyMaintenance: number;
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
}

export interface VehiclePurchaseResultDto {
  readonly channel: 'in-person' | 'delivery';
  readonly vehicle: OwnedVehicleDto;
  readonly price: number;
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

/** POST /v1/vehicles/licence — pay the FRSC fee and sit the driving test (2 game hours). */
export interface LicenceApplicationResultDto {
  readonly licence: DriverLicenceDto;
  readonly fee: number;
  readonly balance: number;
}
