import type {
  BlueprintId,
  BuyHouseResultDto,
  BuyLandRequest,
  ConstructionPaymentPlan,
  HouseListingDto,
  HousingActionResultDto,
  HousingOverviewDto,
  LandOfferDto,
  RentalListingDto,
  TenancyAction,
} from '@insidelife/shared';
import { api } from '@/common/api/http';

const id = (value: string): string => encodeURIComponent(value);

/** Housing endpoints (all under /api/v1/housing). Commands answer with warm copy + the refreshed Homes view. */
export const homesApi = {
  overview: () => api.get<HousingOverviewDto>('/housing'),
  listings: () => api.get<RentalListingDto[]>('/housing/listings'),
  land: () => api.get<LandOfferDto[]>('/housing/land'),
  houses: () => api.get<HouseListingDto[]>('/housing/houses'),
  signLease: (listingId: string) => api.post<HousingActionResultDto>('/housing/leases', { listingId }),
  move: (to: 'family' | string) => api.post<HousingActionResultDto>('/housing/moves', { to }),
  buyLand: (body: BuyLandRequest) => api.post<HousingActionResultDto>('/housing/land', body),
  buyHouse: (listingId: string) => api.post<BuyHouseResultDto>('/housing/houses', { listingId }),
  perfectTitle: (propertyId: string) =>
    api.post<HousingActionResultDto>(`/housing/properties/${id(propertyId)}/title-perfections`),
  build: (propertyId: string, blueprintId: BlueprintId, payment: ConstructionPaymentPlan) =>
    api.post<HousingActionResultDto>(`/housing/properties/${id(propertyId)}/constructions`, {
      blueprintId,
      payment,
    }),
  tenancy: (propertyId: string, action: TenancyAction) =>
    api.post<HousingActionResultDto>(`/housing/properties/${id(propertyId)}/tenancy`, { action }),
  listForSale: (propertyId: string) =>
    api.post<HousingActionResultDto>(`/housing/properties/${id(propertyId)}/sale`),
  cancelSale: (propertyId: string) =>
    api.delete<HousingActionResultDto>(`/housing/properties/${id(propertyId)}/sale`),
};
