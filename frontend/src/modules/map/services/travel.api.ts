import type { CharacterSnapshotDto, TransportMode } from '@insidelife/shared';
import { api } from '@/common/api/http';

export interface TravelQuote {
  readonly mode: TransportMode;
  readonly label: string;
  readonly minutes: number;
  readonly fare: number;
  readonly available: boolean;
  readonly reason?: string;
}

export const travelApi = {
  quotes: (destinationId: string) => api.get<TravelQuote[]>('/characters/me/travel/quotes', { query: { destinationId } }),
  book: (destinationId: string, mode: TransportMode) => api.post<CharacterSnapshotDto>('/characters/me/travel', { destinationId, mode }),
  updateSettings: (body: { lifestyle?: string; defaultTransport?: string }) => api.patch<CharacterSnapshotDto>('/characters/me/settings', body),
};
