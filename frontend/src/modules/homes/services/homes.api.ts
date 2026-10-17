import type {
  BlueprintId,
  BuyHouseResultDto,
  BuyLandRequest,
  CityId,
  ConstructionPaymentPlan,
  DecorMakeoverRequest,
  ExteriorMakeoverRequest,
  HouseListingDto,
  HousingActionResultDto,
  HousingOverviewDto,
  LandOfferDto,
  RentalListingDto,
  TenancyAction,
} from '@insidelife/shared';
import { api } from '@/common/api/http';
import { tapOnce } from '@/common/api/tap-once';

const id = (value: string): string => encodeURIComponent(value);

/**
 * Housing endpoints (all under /api/v1/housing). Commands answer with warm copy + the refreshed Homes view. Paying
 * commands (leases, land, houses, makeovers) are tap once: a retry reuses the key, so it's charged once.
 */
export const homesApi = {
  overview: () => api.get<HousingOverviewDto>('/housing'),
  listings: (cityId: CityId) => api.get<RentalListingDto[]>(`/housing/listings?cityId=${cityId}`),
  land: (cityId: CityId) => api.get<LandOfferDto[]>(`/housing/land?cityId=${cityId}`),
  houses: (cityId: CityId) => api.get<HouseListingDto[]>(`/housing/houses?cityId=${cityId}`),
  signLease: (listingId: string) =>
    tapOnce(`lease:${listingId}`, (idempotencyKey) =>
      api.post<HousingActionResultDto>('/housing/leases', { listingId, idempotencyKey }),
    ),
  move: (to: 'family' | string) => api.post<HousingActionResultDto>('/housing/moves', { to }),
  buyLand: (body: BuyLandRequest) =>
    tapOnce(`land:${body.districtId}:${body.title}:${body.plots ?? 1}`, (idempotencyKey) =>
      api.post<HousingActionResultDto>('/housing/land', { ...body, idempotencyKey }),
    ),
  buyHouse: (listingId: string) =>
    tapOnce(`house:${listingId}`, (idempotencyKey) =>
      api.post<BuyHouseResultDto>('/housing/houses', { listingId, idempotencyKey }),
    ),
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
  restyle: (propertyId: string, body: ExteriorMakeoverRequest) =>
    tapOnce(`exterior:${propertyId}:${JSON.stringify(body)}`, (idempotencyKey) =>
      api.post<HousingActionResultDto>(`/housing/properties/${id(propertyId)}/makeovers`, {
        ...body,
        idempotencyKey,
      }),
    ),
  redecorate: (body: DecorMakeoverRequest) =>
    tapOnce(`decor:${JSON.stringify(body)}`, (idempotencyKey) =>
      api.post<HousingActionResultDto>('/housing/makeovers', { ...body, idempotencyKey }),
    ),
};
