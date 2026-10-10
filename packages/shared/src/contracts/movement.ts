import type { VehicleModel } from '../catalog/vehicles.js';
import type { Entrance, WorldPoint } from '../world-map/types.js';
import type { CharacterSnapshotDto } from './core.js';

/**
 * Open-world movement contracts (`/characters/me/exits | heartbeats | entries`). The client simulates walking and
 * driving; the server validates door distance and anti-teleport speed and charges fuel for plausible car movement.
 */

/** How the player moves through the open world (positions, heartbeats, entries). */
export type OpenWorldMode = 'walk' | 'car';

/** The car the character drives, as the 3D client renders it outside. */
export interface DrivenVehicleDto {
  readonly ownedVehicleId: string;
  /** Catalog id (`findVehicle`) — the client reads its arcade `performance` from it. */
  readonly vehicleId: string;
  readonly name: string;
  /** Kenney car-kit model key the client renders (sedan, suv, suv-luxury…). */
  readonly model: VehicleModel;
  /** Paint hex. */
  readonly color: string;
  readonly plate: string;
  readonly fuelType: 'petrol' | 'diesel';
  readonly fuelEconomyKmPerLitre: number;
  /** Running state (the server's, as of the last spawn or heartbeat). */
  readonly fuelLitres: number;
  readonly tankLitres: number;
  /** 0-100. */
  readonly condition: number;
  readonly brokenDown: boolean;
}

/** Where the player appears after stepping outside. */
export interface SpawnPoint {
  /** `street:<districtId>`. */
  readonly locationId: string;
  /** The door just used: stand at `position` facing `heading`; the car waits at `parking`. */
  readonly entrance: Entrance;
  readonly hasCar: boolean;
  /** The car parked outside (render model, paint and plate), or null without one. */
  readonly car: DrivenVehicleDto | null;
}

/** `POST /characters/me/exits`. */
export interface ExitResultDto {
  readonly spawn: SpawnPoint;
  readonly snapshot: CharacterSnapshotDto;
}

/** `POST /characters/me/heartbeats` (~every 15 s while outside): keeps `explore` alive and charges fuel. */
export interface MovementHeartbeatRequest {
  readonly position: WorldPoint;
  readonly mode: OpenWorldMode;
  /** Radians (see `Entrance` for the convention). */
  readonly heading?: number;
  /** Driving: m/s of speed lost in hard hits since the last heartbeat (crash damage; the client reports, capped). */
  readonly bumps?: number;
}

/** Why a heartbeat was refused. */
export type HeartbeatRejection = 'not-outside' | 'no-car' | 'implausible' | 'car-disabled';

/**
 * `accepted: false` → the move was implausible or the car can't go (out of fuel, broken down); nothing was charged.
 * `car` is the car with you after this beat (fuel burnt, wear, a breakdown), or null without one.
 */
export interface MovementHeartbeatResultDto {
  readonly accepted: boolean;
  readonly reason?: HeartbeatRejection;
  readonly car: DrivenVehicleDto | null;
}

/** `POST /characters/me/fuel-purchases`: at a filling station (`SERVICE_POINTS`, within `SERVICE_RADIUS`). */
export interface FuelPurchaseRequest {
  readonly stationId: string;
  readonly position: WorldPoint;
  /** Litres to buy; omitted = fill the tank. */
  readonly litres?: number;
  /** One per press: a retry never pays (or fills) twice. */
  readonly idempotencyKey: string;
}

export interface FuelPurchaseResultDto {
  readonly litres: number;
  readonly pricePerLitre: number;
  readonly cost: number;
  readonly car: DrivenVehicleDto;
  readonly balance: number;
}

/** `POST /characters/me/mechanic-visits`: a proper repair at a workshop on the street. */
export interface MechanicVisitRequest {
  readonly workshopId: string;
  readonly position: WorldPoint;
  readonly idempotencyKey: string;
}

export interface MechanicVisitResultDto {
  readonly cost: number;
  readonly car: DrivenVehicleDto;
  readonly balance: number;
}

/** `POST /characters/me/entries` → `CharacterSnapshotDto`. Must stand within `ENTRY_RADIUS` of the door. */
export interface EnterLocationRequest {
  readonly locationId: string;
  readonly position: WorldPoint;
  readonly mode: OpenWorldMode;
}
