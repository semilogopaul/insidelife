'use client';

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { DecorChangeDto, DecorPieceDto, DecorPlaceRequest, DecorSpotDto, DecorStateDto } from '@insidelife/shared';
import { queryKeys } from '@/common/api/query-keys';
import { decorApi } from './decor.api';

export const decorKey = queryKeys.domain('decor', 'mine');
const hostKey = (hostId: string) => queryKeys.domain('decor', 'home', hostId);

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

/** Overwrite pieces in the cached state with what the server says changed. */
function mergePieces(client: QueryClient, changed: readonly DecorPieceDto[]): void {
  client.setQueryData<DecorStateDto>(decorKey, (state) => {
    if (!state) return state;
    const byId = new Map(changed.map((piece) => [piece.id, piece]));
    return { ...state, pieces: state.pieces.map((piece) => byId.get(piece.id) ?? piece) };
  });
}

function setSpot(client: QueryClient, pieceId: string, spot: DecorSpotDto | null): void {
  client.setQueryData<DecorStateDto>(decorKey, (state) =>
    state ? { ...state, pieces: state.pieces.map((piece) => (piece.id === pieceId ? { ...piece, spot } : piece)) } : state,
  );
}

/** Buying, placing, putting back and re-colouring. Placing and putting back show at once and settle on the server's word. */
export function useDecorCommands() {
  const client = useQueryClient();
  const refreshMoney = (): void => {
    void client.invalidateQueries({ queryKey: queryKeys.snapshot });
    void client.invalidateQueries({ queryKey: queryKeys.wallet });
  };
  return {
    purchase: useMutation({
      mutationFn: ({ itemId, variant, quantity }: { itemId: string; variant: string; quantity: number }) =>
        decorApi.purchase(itemId, variant, quantity),
      onSuccess: (result) => {
        client.setQueryData<DecorStateDto>(decorKey, (state) => (state ? { ...state, pieces: [...state.pieces, ...result.pieces] } : state));
        refreshMoney();
        void client.invalidateQueries({ queryKey: decorKey });
      },
    }),
    place: useMutation({
      mutationFn: ({ pieceId, request }: { pieceId: string; request: DecorPlaceRequest }) => decorApi.place(pieceId, request),
      onMutate: ({ pieceId, request }) => {
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
        });
        return { previous };
      },
      onSuccess: (change: DecorChangeDto) => {
        mergePieces(client, change.pieces);
        void client.invalidateQueries({ queryKey: queryKeys.domain('decor', 'home') });
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
      },
      onError: (_error, _vars, context) => {
        if (context?.previous) client.setQueryData(decorKey, context.previous);
        void client.invalidateQueries({ queryKey: decorKey });
      },
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
