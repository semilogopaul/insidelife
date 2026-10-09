import { findItem, ITEMS } from '@insidelife/shared';
import type { PropSpec } from '../props/prop-types';
import { BED_TOP, forward } from './helpers';
import type { At, Deg, FurniturePlacement, HomeSlot, InteriorTemplate, Spot } from './types';

/**
 * Your belongings in your home. Template pieces tagged with a `slot` are anchors: in a home you rent or own they show
 * only what you've bought (a Vitafoam mattress on the floor, then a spring bed, then the super king), so every
 * purchase changes the room; in the family house or a hostel the provided furniture stays until yours is better.
 * Nothing owned for the bed slot means a sleeping mat on the floor.
 */

/** Shop item → the home slot it fills (the shop `group`, with the two coolers split). */
function slotOf(itemId: string): HomeSlot | null {
  if (itemId === 'fan-standing') return 'fan';
  if (itemId === 'ac-split') return 'ac';
  const group = findItem(itemId)?.group;
  switch (group) {
    case 'bed':
    case 'seating':
    case 'dining':
    case 'rug':
    case 'plants':
    case 'storage':
    case 'fridge':
    case 'cooker':
    case 'tv':
    case 'console':
    case 'audio':
    case 'laptop':
    case 'books':
    case 'lamp':
      return group;
    case 'laundry':
      return 'laundry';
    default:
      return null;
  }
}

interface Anchor {
  readonly at: At;
  readonly rot: Deg;
  readonly y: number;
}

interface Pieces {
  readonly furniture?: readonly FurniturePlacement[];
  readonly props?: readonly PropSpec[];
  /** Where a sleeper lies (bed slot only). */
  readonly bedTop?: number;
}

/** Offset in the anchor's frame: `right` along its local +x, `ahead` along its facing. */
function offset(anchor: Anchor, right: number, ahead: number): At {
  const a = (anchor.rot * Math.PI) / 180;
  const [x, z] = forward(anchor.at, anchor.rot, ahead);
  return [x + Math.cos(a) * right, z - Math.sin(a) * right];
}

const TV_SCALE: Readonly<Record<string, number>> = { 'tv-32': 0.8, 'tv-55': 1.15, 'tv-75': 1.5 };

/** How each item looks at its anchor. */
function piecesFor(itemId: string, anchor: Anchor): Pieces {
  const { at, rot, y } = anchor;
  switch (itemId) {
    case 'bed-foam-mattress':
      return { props: [{ kind: 'mattress', at, rot, size: [1.2, 1.9], color: '#3949ab' }], bedTop: 0.22 };
    case 'bed-spring':
      return { furniture: [{ model: 'bedSingle', at, rot, palette: { carpet: '#8e3b46', carpetDarker: '#6d2c36' } }], bedTop: BED_TOP };
    case 'bed-orthopedic':
      return { furniture: [{ model: 'bedDouble', at, rot, palette: { carpet: '#e8e2d6', carpetDarker: '#b0a58f' } }], bedTop: BED_TOP };
    case 'bed-super-king':
      return {
        furniture: [
          { model: 'bedDouble', at, rot, scale: 1.2, palette: { carpet: '#f4f0e8', carpetDarker: '#c9a227', carpetWhite: '#ffffff' } },
          { model: 'cabinetBedDrawer', at: offset(anchor, -1.05, -0.62), rot },
          { model: 'cabinetBedDrawer', at: offset(anchor, 1.05, -0.62), rot },
          { model: 'lampRoundTable', at: offset(anchor, -1.05, -0.62), rot, y: 0.39 },
          { model: 'lampRoundTable', at: offset(anchor, 1.05, -0.62), rot, y: 0.39 },
        ],
        bedTop: BED_TOP * 1.2,
      };
    case 'chairs-plastic':
      return {
        props: [
          { kind: 'plastic-chair', at: offset(anchor, -0.32, 0), rot, color: '#ecebe6' },
          { kind: 'plastic-chair', at: offset(anchor, 0.32, 0), rot, color: '#c0392b' },
        ],
      };
    case 'sofa-fabric':
      return { furniture: [{ model: 'loungeSofaLong', at, rot, palette: { carpet: '#4f7942', carpetDarker: '#3c5c32' } }] };
    case 'sofa-leather':
      return { furniture: [{ model: 'loungeSofaCorner', at, rot, palette: { carpet: '#5d4037', carpetDarker: '#3e2723' } }] };
    case 'sofa-italian':
      return {
        furniture: [
          { model: 'loungeDesignSofa', at, rot, palette: { carpetBlue: '#f4f0e8' } },
          { model: 'loungeChairRelax', at: offset(anchor, 1.5, 0.4), rot: rot - 30, palette: { carpet: '#f4f0e8' } },
        ],
      };
    case 'dining-set':
      return {
        furniture: [
          { model: 'tableCross', at, rot, palette: { wood: '#c9a227' } },
          { model: 'chairModernCushion', at: offset(anchor, -0.35, -0.55), rot },
          { model: 'chairModernCushion', at: offset(anchor, 0.35, -0.55), rot },
          { model: 'chairModernCushion', at: offset(anchor, -0.35, 0.55), rot: rot + 180 },
          { model: 'chairModernCushion', at: offset(anchor, 0.35, 0.55), rot: rot + 180 },
        ],
      };
    case 'rug-persian':
      return { furniture: [{ model: 'rugRectangle', at, rot, palette: { carpet: '#8e1b1b', carpetDarker: '#c9a227' } }] };
    case 'plants-snake':
      return { furniture: [{ model: 'pottedPlant', at, rot }] };
    case 'wardrobe-wooden':
      return { furniture: [{ model: 'bookcaseClosedWide', at, rot, scale: 1.2, palette: { wood: '#7a4a2a', woodDark: '#5d3a22' } }] };
    case 'fan-standing':
      return { props: [{ kind: 'standing-fan', at, rot }] };
    case 'ac-split':
      return { props: [{ kind: 'aircon', at, rot, y: y || 2.2 }] };
    case 'fridge-tabletop':
      return { furniture: [{ model: 'kitchenFridgeSmall', at, rot }] };
    case 'fridge-double':
      return { furniture: [{ model: 'kitchenFridgeLarge', at, rot }] };
    case 'cooker-gas':
      return { furniture: [{ model: 'kitchenStove', at, rot }] };
    case 'washing-machine':
      return { furniture: [{ model: 'washer', at: offset(anchor, -0.7, 0), rot }] };
    case 'ps5':
      return { props: [{ kind: 'box', at: offset(anchor, 0.55, 0.05), rot, y, size: [0.26, 0.07, 0.2], color: '#f4f4f4', surface: 'gloss' }] };
    case 'sound-system':
      return {
        furniture: [
          { model: 'speaker', at: offset(anchor, -0.85, 0), rot },
          { model: 'speaker', at: offset(anchor, 0.85, 0), rot },
        ],
      };
    case 'books-past-questions':
    case 'books-african-classics':
      return { furniture: [{ model: 'books', at, rot, y }] };
    case 'lantern-rechargeable':
      return { props: [{ kind: 'lantern', at, rot, y }] };
    default: {
      const scale = TV_SCALE[itemId];
      if (scale) return { furniture: [{ model: 'televisionModern', at, rot, y, scale }] };
      if (itemId.startsWith('laptop-')) return { furniture: [{ model: 'laptop', at, rot, y }] };
      return {};
    }
  }
}

/** The dearest owned item per slot (two beds don't both show). */
function bestPerSlot(owned: readonly string[]): Map<HomeSlot, string> {
  const best = new Map<HomeSlot, string>();
  for (const itemId of owned) {
    const slot = slotOf(itemId);
    if (!slot) continue;
    const current = best.get(slot);
    if (!current || (findItem(itemId)?.price ?? 0) > (findItem(current)?.price ?? 0)) best.set(slot, itemId);
  }
  return best;
}

/** The dearest item that fills each slot (what the template's own furniture represents). */
const TOP_OF_SLOT: ReadonlyMap<HomeSlot, string> = bestPerSlot(ITEMS.map((item) => item.id));

/** In a family house or hostel the furniture isn't yours to replace; your own gadgets and comforts still show. */
const PERSONAL: ReadonlySet<HomeSlot> = new Set(['tv', 'console', 'audio', 'laptop', 'books', 'lamp', 'fan', 'ac']);

/** Console and speakers sit by the TV, the washing machine by the fridge, when the template has no spot for them. */
const BORROWS: Partial<Record<HomeSlot, HomeSlot>> = { console: 'tv', audio: 'tv', laundry: 'fridge' };

export interface FurnishOptions {
  /** Family house and hostels come furnished: keep their pieces unless yours are better. */
  readonly providedFurniture: boolean;
}

export function furnish(template: InteriorTemplate, owned: readonly string[], { providedFurniture }: FurnishOptions): InteriorTemplate {
  const anchors = new Map<HomeSlot, Anchor>();
  const remember = (slot: HomeSlot | undefined, anchor: Anchor): void => {
    if (slot && !anchors.has(slot)) anchors.set(slot, anchor);
  };
  for (const piece of template.furniture) remember(piece.slot, { at: piece.at, rot: piece.rot ?? 0, y: piece.y ?? 0 });
  for (const prop of template.props) remember(prop.slot, { at: prop.at, rot: prop.rot ?? 0, y: prop.y ?? 0 });

  const mine = new Map([...bestPerSlot(owned)].filter(([slot]) => !providedFurniture || PERSONAL.has(slot)));
  // A top-tier item in a slot the template furnishes keeps the template's whole (lavish) arrangement.
  const keepOriginal = (slot: HomeSlot): boolean => {
    const item = mine.get(slot);
    return item ? item === TOP_OF_SLOT.get(slot) && anchors.has(slot) : providedFurniture;
  };

  const furniture: FurniturePlacement[] = template.furniture.filter((piece) => !piece.slot || keepOriginal(piece.slot));
  const props: PropSpec[] = template.props.filter((prop) => !prop.slot || keepOriginal(prop.slot));
  let bedTop: number | null = null;

  for (const [slot, itemId] of mine) {
    if (keepOriginal(slot)) continue;
    const anchor = anchors.get(slot) ?? (BORROWS[slot] ? anchors.get(BORROWS[slot]) : undefined);
    if (!anchor) continue;
    const pieces = piecesFor(itemId, anchor);
    furniture.push(...(pieces.furniture ?? []));
    props.push(...(pieces.props ?? []));
    if (pieces.bedTop !== undefined) bedTop = pieces.bedTop;
  }

  // Nothing to sleep on: a mat on the floor at the bed's place.
  const bedAnchor = anchors.get('bed');
  if (bedAnchor && !mine.has('bed') && !providedFurniture) {
    props.push({ kind: 'mat', at: bedAnchor.at, rot: bedAnchor.rot, size: [0.9, 1.9], color: '#8d6e63', border: '#5d4037' });
    bedTop = 0.08;
  }

  const sleep = template.player.sleep;
  const player =
    sleep && bedTop !== null && sleep.at.length === 3
      ? { ...template.player, sleep: { ...sleep, at: [sleep.at[0], bedTop, sleep.at[2]] as const } satisfies Spot }
      : template.player;
  return { ...template, furniture, props, player };
}
