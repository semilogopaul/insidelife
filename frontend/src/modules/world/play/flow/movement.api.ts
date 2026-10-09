import type {
  CharacterSnapshotDto,
  DrivenVehicleDto,
  EnterLocationRequest,
  ExitResultDto,
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
  /** The garage — used only to find the car when a spawn arrived without one (e.g. after a reload). */
  garage: () => api.get<VehiclesDto>('/vehicles'),
};

export { adTrackingApi as promotionsApi } from '@/common/promotions/ad-tracking';

/** The primary drivable car from the garage, in the shape the spawn uses. */
export async function primaryCar(): Promise<DrivenVehicleDto | null> {
  const garage = await movementApi.garage();
  const car = garage.mine.find((entry) => entry.isPrimary && entry.drivable && entry.status === 'owned') ?? garage.mine.find((entry) => entry.drivable && entry.status === 'owned');
  if (!car) return null;
  return {
    ownedVehicleId: car.id,
    vehicleId: car.vehicleId,
    name: car.name,
    model: car.model,
    color: car.color,
    plate: car.plate,
    fuelType: 'petrol',
    fuelEconomyKmPerLitre: 10,
  };
}
