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

const id = (value: string): string => encodeURIComponent(value);

/** Vehicles endpoints (all under /api/v1/vehicles). */
export const motorsApi = {
  overview: () => api.get<VehiclesDto>('/vehicles'),
  purchase: (body: VehiclePurchaseRequest) => api.post<VehiclePurchaseResultDto>('/vehicles/purchases', body),
  applyForLicence: () => api.post<LicenceApplicationResultDto>('/vehicles/licence'),
  setPrimary: (vehicleId: string) => api.post<OwnedVehicleDto>(`/vehicles/${id(vehicleId)}/primary`),
  sell: (vehicleId: string) => api.post<VehicleSaleResultDto>(`/vehicles/${id(vehicleId)}/sale`),
  repair: (vehicleId: string) => api.post<VehicleRepairResultDto>(`/vehicles/${id(vehicleId)}/repairs`),
};
