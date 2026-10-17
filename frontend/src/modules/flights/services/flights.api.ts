import type {
  CityId,
  FlightCabin,
  FlightChannel,
  FlightSearchDto,
  FlightsOverviewDto,
  TravelActionResultDto,
} from '@insidelife/shared';
import { api } from '@/common/api/http';
import { tapOnce } from '@/common/api/tap-once';

export const flightsApi = {
  overview: () => api.get<FlightsOverviewDto>('/flights'),
  search: (from: CityId, day: number) => api.get<FlightSearchDto>('/flights/search', { query: { from, day } }),
  book: (flightId: string, cabin: FlightCabin, channel: FlightChannel) =>
    tapOnce(`flight:${flightId}:${cabin}`, (idempotencyKey) =>
      api.post<TravelActionResultDto>('/flights/bookings', { flightId, cabin, channel, idempotencyKey }),
    ),
  checkIn: (bookingId: string) => api.post<TravelActionResultDto>(`/flights/bookings/${bookingId}/check-in`),
  board: (bookingId: string) => api.post<TravelActionResultDto>(`/flights/bookings/${bookingId}/board`),
  change: (bookingId: string, flightId: string) =>
    tapOnce(`flight-change:${bookingId}:${flightId}`, (idempotencyKey) =>
      api.post<TravelActionResultDto>(`/flights/bookings/${bookingId}/change`, { flightId, idempotencyKey }),
    ),
  bus: (toCity: CityId) =>
    tapOnce(`bus:${toCity}`, (idempotencyKey) => api.post<TravelActionResultDto>('/travel/bus', { toCity, idempotencyKey })),
};
