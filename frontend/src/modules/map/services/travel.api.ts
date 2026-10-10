import type { CharacterSnapshotDto, TransportMode, TravelRequest } from '@insidelife/shared';
import { api } from '@/common/api/http';

export const travelApi = {
  /** Book a ride; `acceptClosed` once the player has agreed to arrive at a place that will be shut. */
  book: (destinationId: string, mode: TransportMode, acceptClosed = false) =>
    api.post<CharacterSnapshotDto>('/characters/me/travel', { destinationId, mode, ...(acceptClosed ? { acceptClosed } : {}) } satisfies TravelRequest),
  updateSettings: (body: { lifestyle?: string; defaultTransport?: string }) => api.patch<CharacterSnapshotDto>('/characters/me/settings', body),
};
