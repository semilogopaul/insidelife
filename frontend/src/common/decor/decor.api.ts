import type {
  DecorAircraftDto,
  DecorArrangeResultDto,
  DecorChangeDto,
  DecorHomeDto,
  DecorPlaceRequest,
  DecorPurchaseResultDto,
  DecorRecolourResultDto,
  DecorReplaceMode,
  DecorReplaceResultDto,
  DecorSellResultDto,
  DecorStateDto,
  ShopPurchaseResultDto,
} from '@insidelife/shared';
import { api } from '@/common/api/http';
import { tapOnce } from '@/common/api/tap-once';

const id = (value: string): string => encodeURIComponent(value);

/** Decor endpoints (all under /api/v1). Shared: the Homes app's Decor store and the 3D rooms' Decorate mode. */
export const decorApi = {
  state: () => api.get<DecorStateDto>('/decor'),
  /** Tap once: a retry of the same purchase reuses its key, so it's charged once. */
  purchase: (itemId: string, variant: string, quantity: number, place?: { readonly templateId: string; readonly roomId: string }) =>
    tapOnce(`decor:${itemId}:${variant}:${quantity}`, (idempotencyKey) =>
      api.post<DecorPurchaseResultDto>('/decor/purchases', { itemId, variant, quantity, ...(place ? { place } : {}), idempotencyKey }),
    ),
  /** Furniture is sold by the shop: it arrives as pieces, put in the room you are in when it fits. */
  buyFurniture: (itemId: string, roomId?: string) =>
    tapOnce(`furniture:${itemId}`, (idempotencyKey) =>
      api.post<ShopPurchaseResultDto>('/shop/purchases', { itemId, quantity: 1, ...(roomId ? { roomId } : {}), idempotencyKey }),
    ),
  sell: (pieceId: string) =>
    tapOnce(`decor-sell:${pieceId}`, (idempotencyKey) => api.post<DecorSellResultDto>(`/decor/pieces/${id(pieceId)}/sell`, { idempotencyKey })),
  replace: (pieceId: string, oldId: string, mode: DecorReplaceMode) =>
    tapOnce(`decor-replace:${pieceId}:${oldId}:${mode}`, (idempotencyKey) =>
      api.post<DecorReplaceResultDto>(`/decor/pieces/${id(pieceId)}/replace`, { oldId, mode, idempotencyKey }),
    ),
  arrange: (roomId?: string) => api.post<DecorArrangeResultDto>('/decor/arrange', roomId ? { roomId } : {}),
  place: (pieceId: string, request: DecorPlaceRequest) => api.put<DecorChangeDto>(`/decor/pieces/${id(pieceId)}/spot`, request),
  putBack: (pieceId: string) => api.delete<DecorChangeDto>(`/decor/pieces/${id(pieceId)}/spot`),
  recolour: (pieceId: string, variant: string) =>
    tapOnce(`decor-recolour:${pieceId}:${variant}`, (idempotencyKey) =>
      api.post<DecorRecolourResultDto>(`/decor/pieces/${id(pieceId)}/recolour`, { variant, idempotencyKey }),
    ),
  home: (hostId: string) => api.get<DecorHomeDto>(`/decor/homes/${id(hostId)}`),
  /** An aircraft's cabin decor: its owner's and whoever is aboard. */
  aircraft: (aircraftId: string) => api.get<DecorAircraftDto>(`/decor/aircraft/${id(aircraftId)}`),
  /** Fit a piece in a room of one of your aircraft (or move/turn one already there). */
  placeInAircraft: (aircraftId: string, pieceId: string, request: DecorPlaceRequest) =>
    api.put<DecorChangeDto>(`/decor/aircraft/${id(aircraftId)}/pieces/${id(pieceId)}/spot`, request),
};
