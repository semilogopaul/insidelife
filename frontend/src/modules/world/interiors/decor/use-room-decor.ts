'use client';

import { useMemo } from 'react';
import { isAircraftDecorTemplate, isDecorTemplate, type DecorPieceDto } from '@insidelife/shared';
import { asPieceLike, piecesInRoom, useAircraftDecor, useDecor, useHostDecor, type PieceLike, type PlacedPiece } from '@/common/decor';
import { useSnapshot } from '@/common/game/snapshot';

/**
 * Whose decor the room shows: yours (and you may rearrange it), a host's you're visiting, or an aircraft's cabin
 * (its owner may rearrange it; anyone aboard sees it).
 */
export type DecorMode = 'own' | { readonly hostId: string } | { readonly aircraftId: string } | null;

export interface RoomDecor {
  /** Pieces standing in this room. */
  readonly placed: readonly PlacedPiece[];
  /** Everything you own (to pick from in Decorate mode); empty when it isn't yours to rearrange. */
  readonly own: readonly DecorPieceDto[];
  /** You can rearrange this room (your own rented or owned home, or a cabin of your own aircraft). */
  readonly editable: boolean;
  /** Set for a cabin: placements go to this aircraft's endpoint. */
  readonly aircraftId?: string;
}

const NONE: readonly never[] = [];

/** The decor of one room of a home or a cabin: loads yours, or the host's / the aircraft's for a visitor, and picks out this room's pieces. */
export function useRoomDecor(mode: DecorMode, templateId: string | undefined, roomId: string | undefined): RoomDecor {
  const cabin = mode !== null && mode !== 'own' && 'aircraftId' in mode ? mode.aircraftId : null;
  const decorates = templateId !== undefined && (cabin !== null ? isAircraftDecorTemplate(templateId) : isDecorTemplate(templateId));
  const me = useSnapshot().data?.character.id;
  const mine = useDecor((mode === 'own' || cabin !== null) && decorates);
  const host = useHostDecor(mode !== null && mode !== 'own' && 'hostId' in mode && decorates ? mode.hostId : null);
  const plane = useAircraftDecor(cabin !== null && decorates ? cabin : null);
  const ownsPlane = cabin !== null && plane.data !== undefined && plane.data.ownerId === me;
  const pieces: readonly PieceLike[] = useMemo(() => {
    if (!decorates) return NONE;
    if (mode === 'own') return mine.data?.pieces ?? NONE;
    if (cabin !== null) return plane.data?.placed.map(asPieceLike) ?? NONE;
    return host.data?.placed.map(asPieceLike) ?? NONE;
  }, [decorates, mode, cabin, mine.data, host.data, plane.data]);
  const placed = useMemo(() => (templateId && roomId ? piecesInRoom(pieces, templateId, roomId) : NONE), [pieces, templateId, roomId]);
  return {
    placed,
    own: mode === 'own' || ownsPlane ? (mine.data?.pieces ?? NONE) : NONE,
    editable: mode === 'own' ? mine.data?.home.eligible === true : ownsPlane,
    ...(cabin !== null ? { aircraftId: cabin } : {}),
  };
}
