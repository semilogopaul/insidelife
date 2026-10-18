'use client';

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { DecorChangeDto, DecorPieceDto, DecorPlaceRequest, DecorReplaceMode, DecorSpotDto, DecorStateDto } from '@insidelife/shared';
import { queryKeys } from '@/common/api/query-keys';
import { decorApi } from './decor.api';

export const decorKey = queryKeys.domain('decor', 'mine');
const hostKey = (hostId: string) => queryKeys.domain('decor', 'home', hostId);
const aircraftKey = (aircraftId: string) => queryKeys.domain('decor', 'aircraft', aircraftId);

/** What you own and where it stands, plus today's prices. */
export function useDecor(enabled = true) {
  return useQuery<DecorStateDto>({ queryKey: decorKey, queryFn: decorApi.state, enabled, staleTime: 30_000 });
}

/** What stands in a host's home (yours too), polled so a host rearranging shows up for guests. */
export function useHostDecor(hostId: string | null) {
  return useQuery({
    queryKey: hostKey(hostId ?? ''),
    queryFn: () => decorApi.home(hostId ?? ''),
    enabled: hostId !== null,
    refetchInterval: 15_000,
    staleTime: 10_000,
    retry: false,
  });
}

/** What is fitted in an aircraft's cabin (the owner's or a passenger's view), polled so a change shows up for those aboard. */
export function useAircraftDecor(aircraftId: string | null) {
  return useQuery({
    queryKey: aircraftKey(aircraftId ?? ''),
    queryFn: () => decorApi.aircraft(aircraftId ?? ''),
    enabled: aircraftId !== null,
    refetchInterval: 15_000,
    staleTime: 10_000,
    retry: false,
  });
}

/** Overwrite pieces in the cached state with what the server says changed. */
function mergePieces(client: QueryClient, changed: readonly DecorPieceDto[]): void {
  client.setQueryData<DecorStateDto>(decorKey, (state) => {
    if (!state) return state;
    const byId = new Map(changed.map((piece) => [piece.id, piece]));
    return { ...state, pieces: state.pieces.map((piece) => byId.get(piece.id) ?? piece) };
  });
}

function setSpot(client: QueryClient, pieceId: string, spot: DecorSpotDto | null, aircraftId?: string): void {
  client.setQueryData<DecorStateDto>(decorKey, (state) =>
    state
      ? {
          ...state,
          pieces: state.pieces.map((piece) =>
            piece.id === pieceId
              ? { id: piece.id, itemId: piece.itemId, variant: piece.variant, recolours: piece.recolours, spot, ...(aircraftId ? { aircraftId } : {}) }
              : piece,
          ),
        }
      : state,
  );
}

/** Buying, placing, putting back and re-colouring. Placing and putting back show at once and settle on the server's word. */
export function useDecorCommands() {
  const client = useQueryClient();
  const refreshMoney = (): void => {
    void client.invalidateQueries({ queryKey: queryKeys.snapshot });
    void client.invalidateQueries({ queryKey: queryKeys.wallet });
  };
  /** Furniture counts for comfort, sleep and what you can do at home: everything that shows those refreshes. */
  const refreshFurniture = (): void => {
    refreshMoney();
    void client.invalidateQueries({ queryKey: decorKey });
    void client.invalidateQueries({ queryKey: queryKeys.domain('decor', 'home') });
    void client.invalidateQueries({ queryKey: queryKeys.domain('inventory') });
    void client.invalidateQueries({ queryKey: queryKeys.domain('shop') });
    void client.invalidateQueries({ queryKey: queryKeys.domain('housing') });
  };
  return {
    purchase: useMutation({
      mutationFn: ({ itemId, variant, quantity, place }: { itemId: string; variant: string; quantity: number; place?: { templateId: string; roomId: string } }) =>
        decorApi.purchase(itemId, variant, quantity, place),
      onSuccess: (result) => {
        client.setQueryData<DecorStateDto>(decorKey, (state) => (state ? { ...state, pieces: [...state.pieces, ...result.pieces] } : state));
        refreshMoney();
        void client.invalidateQueries({ queryKey: decorKey });
      },
    }),
    place: useMutation({
      mutationFn: ({ pieceId, request, aircraftId }: { pieceId: string; request: DecorPlaceRequest; aircraftId?: string }) =>
        aircraftId ? decorApi.placeInAircraft(aircraftId, pieceId, request) : decorApi.place(pieceId, request),
      onMutate: ({ pieceId, request, aircraftId }) => {
        const previous = client.getQueryData<DecorStateDto>(decorKey);
        setSpot(client, pieceId, {
          templateId: request.templateId,
          roomId: request.roomId,
          x: request.x,
          z: request.z,
          y: request.y ?? 0,
          rot: request.rot,
          wall: request.wall ?? null,
          onId: request.onId ?? null,
        }, aircraftId);
        return { previous };
      },
      onSuccess: (change: DecorChangeDto) => {
        mergePieces(client, change.pieces);
        void client.invalidateQueries({ queryKey: queryKeys.domain('decor', 'home') });
        void client.invalidateQueries({ queryKey: queryKeys.domain('decor', 'aircraft') });
        // Moving a bed or a table can change what the home does (which room you sleep in): the numbers follow.
        void client.invalidateQueries({ queryKey: decorKey });
        void client.invalidateQueries({ queryKey: queryKeys.domain('inventory') });
      },
      onError: (_error, _vars, context) => {
        if (context?.previous) client.setQueryData(decorKey, context.previous);
        void client.invalidateQueries({ queryKey: decorKey });
      },
    }),
    putBack: useMutation({
      mutationFn: (pieceId: string) => decorApi.putBack(pieceId),
      onMutate: (pieceId) => {
        const previous = client.getQueryData<DecorStateDto>(decorKey);
        setSpot(client, pieceId, null);
        client.setQueryData<DecorStateDto>(decorKey, (state) =>
          state ? { ...state, pieces: state.pieces.map((piece) => (piece.spot?.onId === pieceId ? { ...piece, spot: null } : piece)) } : state,
        );
        return { previous };
      },
      onSuccess: (change: DecorChangeDto) => {
        mergePieces(client, change.pieces);
        void client.invalidateQueries({ queryKey: queryKeys.domain('decor', 'home') });
        void client.invalidateQueries({ queryKey: queryKeys.domain('decor', 'aircraft') });
      },
      onError: (_error, _vars, context) => {
        if (context?.previous) client.setQueryData(decorKey, context.previous);
        void client.invalidateQueries({ queryKey: decorKey });
      },
    }),
    /** Furniture from the shop: lands in the room you are in (or the inventory), visible at once. */
    buyFurniture: useMutation({
      mutationFn: ({ itemId, roomId }: { itemId: string; roomId?: string }) => decorApi.buyFurniture(itemId, roomId),
      onSuccess: refreshFurniture,
    }),
    sell: useMutation({
      mutationFn: (pieceId: string) => decorApi.sell(pieceId),
      onMutate: (pieceId) => {
        const previous = client.getQueryData<DecorStateDto>(decorKey);
        client.setQueryData<DecorStateDto>(decorKey, (state) => (state ? { ...state, pieces: state.pieces.filter((piece) => piece.id !== pieceId) } : state));
        return { previous };
      },
      onSuccess: refreshFurniture,
      onError: (_error, _vars, context) => {
        if (context?.previous) client.setQueryData(decorKey, context.previous);
        void client.invalidateQueries({ queryKey: decorKey });
      },
    }),
    replace: useMutation({
      mutationFn: ({ pieceId, oldId, mode }: { pieceId: string; oldId: string; mode: DecorReplaceMode }) => decorApi.replace(pieceId, oldId, mode),
      onSuccess: refreshFurniture,
    }),
    arrange: useMutation({
      mutationFn: (roomId?: string) => decorApi.arrange(roomId),
      onSuccess: refreshFurniture,
    }),
    recolour: useMutation({
      mutationFn: ({ pieceId, variant }: { pieceId: string; variant: string }) => decorApi.recolour(pieceId, variant),
      onSuccess: (result) => {
        mergePieces(client, [result.piece]);
        refreshMoney();
        void client.invalidateQueries({ queryKey: queryKeys.domain('decor', 'home') });
      },
    }),
  };
}
