'use client';

import { useMemo } from 'react';
import { isDecorTemplate, type DecorPieceDto } from '@insidelife/shared';
import { asPieceLike, piecesInRoom, useDecor, useHostDecor, type PieceLike, type PlacedPiece } from '@/common/decor';

/** Whose decor the room shows: yours (and you may rearrange it), or a host's you're visiting. */
export type DecorMode = 'own' | { readonly hostId: string } | null;

export interface RoomDecor {
  /** Pieces standing in this room. */
  readonly placed: readonly PlacedPiece[];
  /** Everything you own (to pick from in Decorate mode); empty when it isn't your home. */
  readonly own: readonly DecorPieceDto[];
  /** You can rearrange this room (your own rented or owned home). */
  readonly editable: boolean;
}

const NONE: readonly never[] = [];

/** The decor of one room of a home: loads yours, or the host's for a visitor, and picks out this room's pieces. */
export function useRoomDecor(mode: DecorMode, templateId: string | undefined, roomId: string | undefined): RoomDecor {
  const decorates = templateId !== undefined && isDecorTemplate(templateId);
  const mine = useDecor(mode === 'own' && decorates);
  const host = useHostDecor(mode !== null && mode !== 'own' && decorates ? mode.hostId : null);
  const pieces: readonly PieceLike[] = useMemo(() => {
    if (!decorates) return NONE;
    if (mode === 'own') return mine.data?.pieces ?? NONE;
    return host.data?.placed.map(asPieceLike) ?? NONE;
  }, [decorates, mode, mine.data, host.data]);
  const placed = useMemo(() => (templateId && roomId ? piecesInRoom(pieces, templateId, roomId) : NONE), [pieces, templateId, roomId]);
  return {
    placed,
    own: mode === 'own' ? (mine.data?.pieces ?? NONE) : NONE,
    editable: mode === 'own' && mine.data?.home.eligible === true,
  };
}
