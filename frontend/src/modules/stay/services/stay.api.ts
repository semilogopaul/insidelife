import type { HotelBookingResultDto, HotelCheckoutResultDto, HotelsDto } from '@insidelife/shared';
import { api } from '@/common/api/http';
import { tapOnce } from '@/common/api/tap-once';

/** Hotel endpoints (all under /api/v1/hotels). Booking and checkout are tap-once. */
export const stayApi = {
  overview: () => api.get<HotelsDto>('/hotels'),
  book: (venueId: string, nights: number) =>
    tapOnce(`hotel:${venueId}:${nights}`, (idempotencyKey) => api.post<HotelBookingResultDto>('/hotels/stays', { venueId, nights, idempotencyKey })),
  checkout: () => tapOnce('hotel-checkout', (idempotencyKey) => api.post<HotelCheckoutResultDto>('/hotels/stay/checkout', { idempotencyKey })),
};
