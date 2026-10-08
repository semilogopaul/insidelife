import type { CharacterSnapshotDto, SuggestionDto, TransportMode } from '@insidelife/shared';
import { api } from '@/common/api/http';

export interface TravelQuote {
  readonly mode: TransportMode;
  readonly label: string;
  readonly minutes: number;
  readonly fare: number;
  readonly available: boolean;
  readonly reason?: string;
}

export const hudApi = {
  suggestions: () => api.get<SuggestionDto[]>('/progression/suggestions'),
  quotes: (destinationId: string) => api.get<TravelQuote[]>('/characters/me/travel/quotes', { query: { destinationId } }),
  book: (destinationId: string, mode: TransportMode) => api.post<CharacterSnapshotDto>('/characters/me/travel', { destinationId, mode }),
  startAction: (actionId: string, durationMinutes: number) => api.post<CharacterSnapshotDto>('/characters/me/actions', { actionId, durationMinutes }),
};
