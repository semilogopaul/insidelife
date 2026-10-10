import type {
  JerrycanResultDto,
  LicenceApplicationResultDto,
  OwnedVehicleDto,
  VehiclePurchaseRequest,
  VehiclePurchaseResultDto,
  VehicleRepairResultDto,
  VehicleSaleResultDto,
  VehiclesDto,
} from '@insidelife/shared';
import { api } from '@/common/api/http';

const id = (value: string): string => encodeURIComponent(value);

/** Vehicles endpoints (all under /api/v1/vehicles). */
export const motorsApi = {
  overview: () => api.get<VehiclesDto>('/vehicles'),
  purchase: (body: VehiclePurchaseRequest) => api.post<VehiclePurchaseResultDto>('/vehicles/purchases', body),
  applyForLicence: () => api.post<LicenceApplicationResultDto>('/vehicles/licence'),
  setPrimary: (vehicleId: string) => api.post<OwnedVehicleDto>(`/vehicles/${id(vehicleId)}/primary`),
  sell: (vehicleId: string) => api.post<VehicleSaleResultDto>(`/vehicles/${id(vehicleId)}/sale`),
  /** Tow & fix: a tow truck to a workshop and a proper repair, from anywhere. */
  repair: (vehicleId: string) => api.post<VehicleRepairResultDto>(`/vehicles/${id(vehicleId)}/repairs`),
  /** Roadside mechanic: gets it going where it stands (premium). */
  roadside: (vehicleId: string, idempotencyKey: string) => api.post<VehicleRepairResultDto>(`/vehicles/${id(vehicleId)}/roadside-repairs`, { idempotencyKey }),
  /** A 10 L jerrycan brought to you (premium). */
  jerrycan: (vehicleId: string, idempotencyKey: string) => api.post<JerrycanResultDto>(`/vehicles/${id(vehicleId)}/jerrycans`, { idempotencyKey }),
};
