import type {
  CharacterSnapshotDto,
  DrivenVehicleDto,
  EnterLocationRequest,
  ExitResultDto,
  FuelPurchaseRequest,
  FuelPurchaseResultDto,
  MechanicVisitRequest,
  MechanicVisitResultDto,
  MovementHeartbeatRequest,
  MovementHeartbeatResultDto,
  VehiclesDto,
} from '@insidelife/shared';
import { api } from '@/common/api/http';

/** Server calls of the open world (all under `/api/v1`). */
export const movementApi = {
  exit: () => api.post<ExitResultDto>('/characters/me/exits'),
  heartbeat: (body: MovementHeartbeatRequest) => api.post<MovementHeartbeatResultDto>('/characters/me/heartbeats', body),
  enter: (body: EnterLocationRequest) => api.post<CharacterSnapshotDto>('/characters/me/entries', body),
  /** Fill up (or buy `litres`) at a filling station you've pulled up at. */
  buyFuel: (body: FuelPurchaseRequest) => api.post<FuelPurchaseResultDto>('/characters/me/fuel-purchases', body),
  /** A proper repair at a mechanic workshop you've pulled up at. */
  seeMechanic: (body: MechanicVisitRequest) => api.post<MechanicVisitResultDto>('/characters/me/mechanic-visits', body),
  /** The garage — used only to find the car when a spawn arrived without one (e.g. after a reload). */
  garage: () => api.get<VehiclesDto>('/vehicles'),
};

export { adTrackingApi as promotionsApi } from '@/common/promotions/ad-tracking';

/** The car with you from the garage (the primary one, else any delivered car), in the shape the spawn uses. */
export async function primaryCar(): Promise<DrivenVehicleDto | null> {
  const garage = await movementApi.garage();
  const owned = garage.mine.filter((entry) => entry.status === 'owned');
  const car = owned.find((entry) => entry.isPrimary && entry.canDrive) ?? owned.find((entry) => entry.canDrive) ?? owned.find((entry) => entry.isPrimary) ?? owned[0];
  if (!car) return null;
  const catalog = garage.catalogue.find((entry) => entry.vehicle.id === car.vehicleId)?.vehicle;
  return {
    ownedVehicleId: car.id,
    vehicleId: car.vehicleId,
    name: car.name,
    model: car.model,
    color: car.color,
    plate: car.plate,
    fuelType: car.fuelType,
    fuelEconomyKmPerLitre: catalog?.fuelEconomyKmPerLitre ?? 10,
    fuelLitres: car.fuelLitres,
    tankLitres: car.tankLitres,
    condition: car.condition,
    brokenDown: car.brokenDown,
  };
}
