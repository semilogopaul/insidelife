import type {
  DecorChangeDto,
  DecorHomeDto,
  DecorPlaceRequest,
  DecorPurchaseResultDto,
  DecorRecolourResultDto,
  DecorStateDto,
} from '@insidelife/shared';
import { api } from '@/common/api/http';
import { tapOnce } from '@/common/api/tap-once';

const id = (value: string): string => encodeURIComponent(value);

/** Decor endpoints (all under /api/v1). Shared: the Homes app's Decor store and the 3D rooms' Decorate mode. */
export const decorApi = {
  state: () => api.get<DecorStateDto>('/decor'),
  /** Tap once: a retry of the same purchase reuses its key, so it's charged once. */
  purchase: (itemId: string, variant: string, quantity: number) =>
    tapOnce(`decor:${itemId}:${variant}:${quantity}`, (idempotencyKey) =>
      api.post<DecorPurchaseResultDto>('/decor/purchases', { itemId, variant, quantity, idempotencyKey }),
    ),
  place: (pieceId: string, request: DecorPlaceRequest) => api.put<DecorChangeDto>(`/decor/pieces/${id(pieceId)}/spot`, request),
  putBack: (pieceId: string) => api.delete<DecorChangeDto>(`/decor/pieces/${id(pieceId)}/spot`),
  recolour: (pieceId: string, variant: string) =>
    tapOnce(`decor-recolour:${pieceId}:${variant}`, (idempotencyKey) =>
      api.post<DecorRecolourResultDto>(`/decor/pieces/${id(pieceId)}/recolour`, { variant, idempotencyKey }),
    ),
  home: (hostId: string) => api.get<DecorHomeDto>(`/decor/homes/${id(hostId)}`),
};
