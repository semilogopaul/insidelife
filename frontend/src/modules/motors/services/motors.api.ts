import type {
  JerrycanResultDto,
  LicenceApplicationResultDto,
  OwnedVehicleDto,
  VehiclePurchaseRequest,
  VehiclePurchaseResultDto,
  VehicleRepairResultDto,
  VehicleSaleResultDto,
  VehicleShipmentResultDto,
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
  /** Tow & fix: a tow truck to a workshop and a proper repair, from anywhere. */
  repair: (vehicleId: string) => api.post<VehicleRepairResultDto>(`/vehicles/${id(vehicleId)}/repairs`),
  /** Roadside mechanic: gets it going where it stands (premium). */
  roadside: (vehicleId: string, idempotencyKey: string) => api.post<VehicleRepairResultDto>(`/vehicles/${id(vehicleId)}/roadside-repairs`, { idempotencyKey }),
  /** A car carrier takes the car to the other city (fee, about 2 game days). */
  ship: (vehicleId: string, idempotencyKey: string) => api.post<VehicleShipmentResultDto>(`/vehicles/${id(vehicleId)}/shipments`, { idempotencyKey }),
  /** A 10 L jerrycan brought to you (premium). */
  jerrycan: (vehicleId: string, idempotencyKey: string) => api.post<JerrycanResultDto>(`/vehicles/${id(vehicleId)}/jerrycans`, { idempotencyKey }),
};
