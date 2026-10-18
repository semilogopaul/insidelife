'use client';

import { useEffect, useMemo } from 'react';
import type { PlacedPiece } from '@/common/decor';
import { createSurfaceMaterial } from '@/common/three/materials/surface-material';
import { buildDecorGeometry, drawableOf } from './decor-scene';

/** A cheap identity for a room's pieces: a poll that changes nothing must not rebuild the geometry. */
export function piecesSignature(pieces: readonly PlacedPiece[]): string {
  return pieces
    .map((piece) => `${piece.id}:${piece.variant.id}:${piece.spot.x},${piece.spot.z},${piece.spot.y},${piece.spot.rot},${piece.spot.wall ?? ''}`)
    .join('|');
}

/**
 * The decor standing in this room, as one static geometry (one draw call). `hiddenId` is the piece being dragged:
 * the editor draws it as the ghost instead. Furniture from the shop is drawn from the kit by the room itself.
 */
export function DecorLayer({ pieces, hiddenId = null }: { readonly pieces: readonly PlacedPiece[]; readonly hiddenId?: string | null }) {
  const signature = piecesSignature(pieces) + `#${hiddenId ?? ''}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the signature stands for `pieces`
  const geometry = useMemo(() => buildDecorGeometry(pieces.filter((piece) => piece.id !== hiddenId && piece.item.shape !== 'kit').map(drawableOf)), [signature]);
  const material = useMemo(() => createSurfaceMaterial(), []);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  if (!geometry) return null;
  return <mesh name="decor" geometry={geometry} material={material} />;
}
