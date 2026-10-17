import type {
  AircraftFlightRequest,
  AircraftFlightResultDto,
  ApronDto,
  FlightPassengersDto,
  FlightsOverviewDto,
  HangarDto,
  TravelActionResultDto,
} from '@insidelife/shared';
import { api } from '@/common/api/http';
import { tapOnce } from '@/common/api/tap-once';

const id = (value: string): string => encodeURIComponent(value);

/**
 * The slice of the aviation and flights endpoints the 3D world needs: your fleet, the apron of the terminal you're in,
 * flying a plane you board, the gate (commercial boarding) and the others aboard your flight. The phone apps (Hangar,
 * Flights) have their own clients; these hit the same endpoints and share their query keys.
 */
export const aviationApi = {
  hangar: () => api.get<HangarDto>('/aircraft'),
  apron: (gat: string) => api.get<ApronDto>(`/aircraft/apron/${id(gat)}`),
  fly: (aircraftId: string, body: Omit<AircraftFlightRequest, 'idempotencyKey'>) =>
    tapOnce(`aircraft-flight:${aircraftId}:${body.destination}`, (idempotencyKey) =>
      api.post<AircraftFlightResultDto>(`/aircraft/${id(aircraftId)}/flights`, { ...body, idempotencyKey }),
    ),
  flights: () => api.get<FlightsOverviewDto>('/flights'),
  checkIn: (bookingId: string) => api.post<TravelActionResultDto>(`/flights/bookings/${id(bookingId)}/check-in`),
  board: (bookingId: string) => api.post<TravelActionResultDto>(`/flights/bookings/${id(bookingId)}/board`),
  passengers: (flightId: string) => api.get<FlightPassengersDto>(`/flights/${id(flightId)}/passengers`),
};
