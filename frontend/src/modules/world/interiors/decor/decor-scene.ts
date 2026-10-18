import type { BufferGeometry } from 'three';
import { decorRect, isFlatDecor, normalizeRot, type DecorItem, type DecorPose, type DecorVariant, type OrientedRect } from '@insidelife/shared';
import type { PlacedPiece } from '@/common/decor';
import { buildProps } from '../props/build-props';
import type { PropSpec } from '../props/prop-types';
import type { InteriorTemplate } from '../templates/types';
import { drawDecor } from './decor-models';

/** Anything that can be drawn: a placed piece, or a ghost being carried. */
export interface DecorDrawable {
  readonly id: string;
  readonly item: DecorItem;
  readonly variant: DecorVariant;
  readonly pose: DecorPose;
}

export const drawableOf = (piece: PlacedPiece): DecorDrawable => ({ id: piece.id, item: piece.item, variant: piece.variant, pose: piece.spot });

/**
 * One static geometry for every piece in a room (one draw call). Floor and tabletop pieces stand at their pose; wall
 * pieces hang on their wall (pose x/z already on the wall line, rotation 0 / 90).
 */
export function buildDecorGeometry(pieces: readonly DecorDrawable[]): BufferGeometry | null {
  if (pieces.length === 0) return null;
  return buildProps([], (kit) => {
    for (const piece of pieces) {
      kit.place([piece.pose.x, piece.pose.z], piece.pose.y, piece.pose.rot);
      drawDecor(kit, piece.item, piece.variant, piece.id);
    }
  });
}

/** A piece at the origin facing +z: the ghost's geometry, moved about by its group's transform. */
export function buildGhostGeometry(item: DecorItem, variant: DecorVariant): BufferGeometry | null {
  return buildDecorGeometry([{ id: 'ghost', item, variant, pose: { x: 0, z: 0, y: 0, rot: 0, wall: null, onId: null } }]);
}

export interface PickBox {
  readonly id: string;
  /** Centre of the box in room space. */
  readonly position: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  /** Degrees about +Y. */
  readonly rot: number;
}

/** The invisible box a tap or drag picks a piece by. */
export function pickBoxOf(room: { readonly width: number; readonly depth: number }, piece: DecorDrawable): PickBox {
  const rect: OrientedRect = decorRect(room, piece.item, piece.pose);
  return {
    id: piece.id,
    position: [rect.x, piece.pose.y + piece.item.height / 2, rect.z],
    size: [rect.w, piece.item.height, rect.d],
    rot: normalizeRot(rect.rot),
  };
}

/**
 * The template with the decor's solid pieces added as invisible boxes, for the walker's collisions only (the room is
 * drawn from the template without them). Rugs, wall pieces and things on tables don't block.
 */
export function withDecorColliders(template: InteriorTemplate, pieces: readonly PlacedPiece[]): InteriorTemplate {
  const solid: PropSpec[] = pieces
    // Furniture is drawn by the room (its kit pieces are already colliders there).
    .filter((piece) => piece.item.placement === 'floor' && !isFlatDecor(piece.item) && piece.item.shape !== 'kit')
    .map((piece) => ({
      kind: 'box' as const,
      at: [piece.spot.x, piece.spot.z] as const,
      rot: piece.spot.rot,
      size: [piece.item.footprint[0], piece.item.height, piece.item.footprint[1]] as const,
      color: '#000000',
    }));
  return solid.length > 0 ? { ...template, props: [...template.props, ...solid] } : template;
}
