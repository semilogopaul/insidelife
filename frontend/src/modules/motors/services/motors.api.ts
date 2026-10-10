import type {
  LicenceApplicationResultDto,
  OwnedVehicleDto,
  VehiclePurchaseRequest,
  VehiclePurchaseResultDto,
  VehicleRepairResultDto,
  VehicleSaleResultDto,
  VehiclesDto,
} from '@insidelife/shared';
import { api } from '@/common/api/http';
import { tapOnce } from '@/common/api/tap-once';

const id = (value: string): string => encodeURIComponent(value);

/** Vehicles endpoints (all under /api/v1/vehicles). */
export const motorsApi = {
  overview: () => api.get<VehiclesDto>('/vehicles'),
  /** Tap once: a retry of the same purchase reuses its key, so it's charged once. */
  purchase: (body: VehiclePurchaseRequest) =>
    tapOnce(`vehicle:${body.vehicleId}:${body.colour ?? ''}`, (idempotencyKey) =>
      api.post<VehiclePurchaseResultDto>('/vehicles/purchases', { ...body, idempotencyKey }),
    ),
  applyForLicence: () => api.post<LicenceApplicationResultDto>('/vehicles/licence'),
  setPrimary: (vehicleId: string) => api.post<OwnedVehicleDto>(`/vehicles/${id(vehicleId)}/primary`),
  sell: (vehicleId: string) => api.post<VehicleSaleResultDto>(`/vehicles/${id(vehicleId)}/sale`),
  repair: (vehicleId: string) => api.post<VehicleRepairResultDto>(`/vehicles/${id(vehicleId)}/repairs`),
};
