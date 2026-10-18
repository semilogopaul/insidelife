import { findFurnitureSpec, type DecorVariant } from '@insidelife/shared';
import type { Palette } from '../kit/furniture-kit';
import type { PropSpec } from '../props/prop-types';
import { BED_TOP, forward, seat, stand } from './helpers';
import type { At, FurniturePlacement, Spot } from './types';

/**
 * How each piece of furniture you own looks and is used in a room, from where it stands. A piece is one arrangement
 * around the middle of its footprint (a desk with its chair, a dining table with its chairs, a TV on its cabinet, a
 * super king with bedside units); `local(right, ahead)` places things in the piece's own frame (0° faces +z, the way
 * you approach it). The spots say where the avatar lies, sits or eats: the 3D room anchors every home action to
 * them, so the bed you sleep in is the one standing in the room.
 */

export interface FurniturePose {
  readonly at: At;
  /** Degrees about +Y, 0 faces +z. */
  readonly rot: number;
}

export interface FurnitureLook {
  readonly furniture: readonly FurniturePlacement[];
  readonly props: readonly PropSpec[];
  /** Lying down, for sleeping and napping. */
  readonly sleep?: Spot;
  /** Sitting, to rest, chat or watch TV. */
  readonly sit?: Spot;
  /** Sitting at a table to eat. */
  readonly eat?: Spot;
  /** Sitting at a desk to type, read or study. */
  readonly work?: Spot;
  /** Standing where you would watch a TV from when there is nowhere to sit. */
  readonly watch?: Spot;
  /** A gadget's place on top (a laptop on the desk): floor point, height and turn. */
  readonly carry?: { readonly at: At; readonly y: number; readonly rot: number };
  /** The top of the piece (m), for things that sit on it. */
  readonly top?: number;
}

/** Offset in a piece's frame: `right` along its local +x, `ahead` along its facing. */
export function local(pose: FurniturePose, right: number, ahead: number): At {
  const a = (pose.rot * Math.PI) / 180;
  const [x, z] = forward(pose.at, pose.rot, ahead);
  return [x + Math.cos(a) * right, z - Math.sin(a) * right];
}

const fabric = (variant: DecorVariant): Palette => ({ carpet: variant.hex, carpetDarker: variant.accent });
const wood = (variant: DecorVariant): Palette => ({ wood: variant.hex, woodDark: variant.accent });

/** Kit sofas sit a touch lower than chairs. */
const SOFA_SEAT: { readonly y?: number } = {};

const TV_SCALE: Readonly<Record<string, number>> = { 'tv-32': 0.8, 'tv-55': 1.15, 'tv-75': 1.5 };
const TV_CABINET_SCALE: Readonly<Record<string, number>> = { 'tv-32': 1, 'tv-55': 1.08, 'tv-75': 1.33 };

/** Is this shop item a piece of furniture with a look (a bed, sofa, table, rug, plant, wardrobe, desk or TV)? */
export const hasFurnitureLook = (itemId: string): boolean => findFurnitureSpec(itemId) !== undefined;

/** The arrangement for `itemId` standing at `pose` in `variant`'s finish; null for products that aren't movable furniture. */
export function furnitureLook(itemId: string, pose: FurniturePose, variant: DecorVariant): FurnitureLook | null {
  const { at, rot } = pose;
  const l = (right: number, ahead: number): At => local(pose, right, ahead);
  switch (itemId) {
    case 'bed-foam-mattress':
      return { furniture: [], props: [{ kind: 'mattress', at, rot, size: [1.2, 1.9], color: variant.hex }], sleep: { at: [at[0], 0.22, at[1]], rot, animation: 'sleep' }, top: 0.22 };
    case 'bed-spring':
      return { furniture: [{ model: 'bedSingle', at, rot, palette: fabric(variant) }], props: [], sleep: { at: [at[0], BED_TOP, at[1]], rot, animation: 'sleep' }, top: BED_TOP };
    case 'bed-orthopedic':
      return { furniture: [{ model: 'bedDouble', at, rot, palette: fabric(variant) }], props: [], sleep: { at: [at[0], BED_TOP, at[1]], rot, animation: 'sleep' }, top: BED_TOP };
    case 'bed-super-king': {
      const top = BED_TOP * 1.2;
      return {
        furniture: [
          { model: 'bedDouble', at, rot, scale: 1.2, palette: { ...fabric(variant), carpetWhite: '#ffffff' } },
          { model: 'cabinetBedDrawer', at: l(-1.05, -0.62), rot, base: true },
          { model: 'cabinetBedDrawer', at: l(1.05, -0.62), rot, base: true },
          { model: 'lampRoundTable', at: l(-1.05, -0.62), rot, y: 0.39, base: true },
          { model: 'lampRoundTable', at: l(1.05, -0.62), rot, y: 0.39, base: true },
        ],
        props: [],
        sleep: { at: [at[0], top, at[1]], rot, animation: 'sleep' },
        top,
      };
    }
    case 'chairs-plastic':
      return {
        furniture: [],
        props: [
          { kind: 'plastic-chair', at: l(-0.32, 0), rot, color: variant.hex },
          { kind: 'plastic-chair', at: l(0.32, 0), rot, color: variant.accent },
        ],
        sit: seat(l(-0.32, 0), rot),
      };
    case 'sofa-fabric':
      return { furniture: [{ model: 'loungeSofaLong', at, rot, palette: fabric(variant) }], props: [], sit: seat(at, rot, 'sit', SOFA_SEAT) };
    case 'sofa-leather':
      return { furniture: [{ model: 'loungeSofaCorner', at, rot, palette: fabric(variant) }], props: [], sit: seat(at, rot, 'sit', SOFA_SEAT) };
    case 'sofa-italian': {
      const sofa = l(-0.5, 0);
      return {
        furniture: [
          { model: 'loungeDesignSofa', at: sofa, rot, palette: { carpetBlue: variant.hex } },
          { model: 'loungeChairRelax', at: l(1, 0.2), rot: rot - 30, palette: { carpet: variant.hex } },
        ],
        props: [],
        sit: seat(sofa, rot, 'sit', SOFA_SEAT),
      };
    }
    case 'dining-set': {
      const front = l(0.35, 0.55);
      return {
        furniture: [
          { model: 'tableCross', at, rot, palette: wood(variant) },
          { model: 'chairModernCushion', at: l(-0.35, -0.55), rot, base: true },
          { model: 'chairModernCushion', at: l(0.35, -0.55), rot, base: true },
          { model: 'chairModernCushion', at: l(-0.35, 0.55), rot: rot + 180, base: true },
          { model: 'chairModernCushion', at: front, rot: rot + 180, base: true },
        ],
        props: [],
        eat: seat(front, rot + 180, 'eat', { y: 0.25 }),
        top: 0.52,
      };
    }
    case 'rug-persian':
      return { furniture: [{ model: 'rugRectangle', at, rot, palette: fabric(variant) }], props: [] };
    case 'plants-snake':
      return { furniture: [{ model: 'pottedPlant', at, rot }], props: [] };
    case 'wardrobe-wooden':
      return {
        furniture: [{ model: 'bookcaseClosedWide', at, rot, scale: 1.2, palette: wood(variant), thing: { kind: 'wardrobe', name: 'Wardrobe' } }],
        props: [],
      };
    case 'desk-study': {
      const chair = l(0, 0.35);
      const work = seat(chair, rot + 180, 'type', { props: false });
      return {
        furniture: [
          { model: 'desk', at: l(0, -0.3), rot, palette: wood(variant) },
          { model: 'chairDesk', at: chair, rot: rot + 180, base: true },
        ],
        props: [],
        work,
        sit: seat(chair, rot + 180, 'sit', { props: false }),
        carry: { at: l(0, -0.3), y: 0.57, rot },
        top: 0.58,
      };
    }
    case 'tv-32':
    case 'tv-55':
    case 'tv-75': {
      const scale = TV_SCALE[itemId]!;
      // The TV stands on the cabinet's top (the kit cabinet is 0.31 m tall × 1.5, scaled with the TV).
      const top = 0.465 * TV_CABINET_SCALE[itemId]!;
      return {
        furniture: [
          { model: 'cabinetTelevision', at, rot, scale: TV_CABINET_SCALE[itemId], base: true },
          { model: 'televisionModern', at: l(0, -0.04), rot, y: top, scale },
        ],
        props: [],
        watch: { ...stand(forward(at, rot, 1.9), rot + 180, 'sit'), stance: 'stand' },
        carry: { at, y: top, rot },
      };
    }
    default:
      return null;
  }
}
