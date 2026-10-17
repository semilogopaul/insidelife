import { findItem, HOST_TREAT_IDS, ITEMS, type HostTreatId } from '@insidelife/shared';
import type { Aabb } from '../../play/physics/collision';
import type { KitModel } from '../kit/kit-manifest';
import type { PropKind, PropSpec } from '../props/prop-types';
import { furnitureFootprint, propFootprint } from '../walk/colliders';
import { BED_TOP, forward } from './helpers';
import { HOME_SLOTS, type At, type Deg, type FurniturePlacement, type HomePiece, type HomeSlot, type InteriorTemplate, type PlayerSpots, type Spot } from './types';

/**
 * Your belongings in your home.
 *
 * A home you rent or own starts EMPTY: only its fixtures show, and every other piece appears when you own an item that
 * provides it. Template pieces say what they stand for:
 * - `slot`: the look of the item in that slot (a Vitafoam mattress on the floor, then a spring bed, then the super
 *   king), so every purchase changes the room; the dearest item in a slot keeps the template's whole arrangement;
 * - `base` + `slot`: comes with any item in the slot and keeps its own look (the cabinet under the TV, the pot on the
 *   cooker, bedside drawers by a bed frame);
 * - `slot: 'pantry'`: food from your kitchen stock (a plate of jollof on the table while you have meals in);
 * - untagged: a fixture (below) — or, if not, the family's own furniture that never comes with a rented flat.
 *
 * In the family house or a hostel the provided furniture stays until you buy better: what you own in a slot replaces
 * their piece there (shown as itself), except a slot's entry-level item (a mattress on the floor, plastic chairs),
 * which is no upgrade on what the house already has. Nothing owned for the bed slot means a sleeping mat on the floor.
 *
 * FIXTURES — part of the building, in every home whether you own anything or not:
 * - the room itself: walls, floor, windows, doors and curtains (from `RoomSpec`, not pieces);
 * - stairs and stairwells between floors;
 * - the kitchen's built-in units: base and wall cabinets, drawers, the sink, the worktop/island tops (`kitchenBar`);
 * - bathroom fittings: toilet, shower, bathtub, basin and mirror, plus pieces flagged `fixture` (shower trays, glass screens);
 * - the family sign over the parlour (it carries your surname).
 * The cooker, fridge and every appliance are yours to buy, as in any Lagos flat.
 */
const FIXTURE_MODELS: ReadonlySet<KitModel> = new Set<KitModel>(['kitchenCabinet', 'kitchenCabinetDrawer', 'kitchenCabinetUpper', 'kitchenSink', 'kitchenBar', 'toilet', 'shower', 'bathtub', 'bathroomSink', 'bathroomMirror']);
const FIXTURE_PROPS: ReadonlySet<PropKind> = new Set<PropKind>(['stairs', 'stairwell']);

/** Part of the building (see FIXTURES). */
export function isFixture(piece: FurniturePlacement | PropSpec): boolean {
  if (piece.fixture) return true;
  if ('model' in piece) return FIXTURE_MODELS.has(piece.model);
  return FIXTURE_PROPS.has(piece.kind) || (piece.kind === 'sign' && piece.familyName === true);
}

const ITEM_SLOTS: ReadonlySet<string> = new Set(HOME_SLOTS.filter((slot) => slot !== 'pantry'));

/** Shop item → the home slot it fills (its shop `group`; the two coolers split; generators by their power). */
export function slotOf(itemId: string): HomeSlot | null {
  if (itemId === 'fan-standing') return 'fan';
  if (itemId === 'ac-split') return 'ac';
  const item = findItem(itemId);
  if (!item) return null;
  if (item.power === 'generator') return 'generator';
  return ITEM_SLOTS.has(item.group) ? (item.group as HomeSlot) : null;
}

/** Items that come without furniture around them: a mattress on the floor has no bedside drawers. */
const BARE_ITEMS: ReadonlySet<string> = new Set(['bed-foam-mattress', 'chairs-plastic']);

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

/** How each item looks at its anchor (when it isn't the template's own, dearest look). */
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
    case 'gen-small':
      return { props: [{ kind: 'generator', at, rot }] };
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

/** Your own gadgets and comforts: in a family house or hostel they always show instead of the house's. */
const PERSONAL: ReadonlySet<HomeSlot> = new Set(['tv', 'console', 'audio', 'laptop', 'books', 'lamp', 'fan', 'ac']);

/** The cheapest item of each slot that has several tiers (a mattress on the floor, plastic chairs): no upgrade on a furnished house. */
const BASIC_OF_SLOT: ReadonlyMap<HomeSlot, string> = (() => {
  const tiers = new Map<HomeSlot, string[]>();
  for (const item of ITEMS) {
    const slot = slotOf(item.id);
    if (slot) tiers.set(slot, [...(tiers.get(slot) ?? []), item.id]);
  }
  const basic = new Map<HomeSlot, string>();
  for (const [slot, ids] of tiers) {
    if (ids.length < 2) continue;
    const cheapest = ids.reduce((low, id) => ((findItem(id)?.price ?? 0) < (findItem(low)?.price ?? 0) ? id : low));
    basic.set(slot, cheapest);
  }
  return basic;
})();

/** Does an item have its own look at an anchor (rather than standing for the template's arrangement)? */
const ORIGIN: Anchor = { at: [0, 0], rot: 0, y: 0 };
const hasOwnLook = (itemId: string): boolean => {
  const pieces = piecesFor(itemId, ORIGIN);
  return (pieces.furniture?.length ?? 0) + (pieces.props?.length ?? 0) > 0;
};

/** Console and speakers sit by the TV, the washing machine by the fridge, when the template has no spot for them. */
const BORROWS: Partial<Record<HomeSlot, HomeSlot>> = { console: 'tv', audio: 'tv', laundry: 'fridge' };

export interface FurnishOptions {
  /** Family house and hostels come furnished: keep their pieces unless yours are better. */
  readonly providedFurniture: boolean;
  /** Meals in the kitchen: sacks of foodstuff by the cooker, a plate on the table. */
  readonly pantryMeals?: number;
  /** Whose home it is: family signs carry their surname. */
  readonly surname?: string;
  /** What the host has put out for guests (plates, drinks, cake), shown on the main room's table. */
  readonly treats?: readonly HostTreatId[];
}

/** Foodstuff by the cooker: a rice sack, a second sack, then a bucket of garri as the stock grows. */
function pantryProps(anchor: Anchor, meals: number): PropSpec[] {
  if (meals <= 0) return [];
  const props: PropSpec[] = [{ kind: 'box', at: offset(anchor, 0.75, 0.15), rot: anchor.rot + 8, size: [0.36, 0.5, 0.26], color: '#efe6d0', surface: 'cloth' }];
  if (meals > 20) props.push({ kind: 'box', at: offset(anchor, 1.12, 0.12), rot: anchor.rot - 6, size: [0.34, 0.42, 0.25], color: '#e0d2b4', surface: 'cloth' });
  if (meals > 60) props.push({ kind: 'bucket', at: offset(anchor, 0.95, 0.5), color: '#f6b90b' });
  return props;
}

export function furnish(template: InteriorTemplate, owned: readonly string[], { providedFurniture, pantryMeals = 0, surname, treats = [] }: FurnishOptions): InteriorTemplate {
  // Where each slot's item goes: its first own (non-base) piece.
  const anchors = new Map<HomeSlot, Anchor>();
  const remember = (piece: HomePiece & { readonly at: At; readonly rot?: Deg; readonly y?: number }): void => {
    if (piece.slot && !piece.base && !anchors.has(piece.slot)) anchors.set(piece.slot, { at: piece.at, rot: piece.rot ?? 0, y: piece.y ?? 0 });
  };
  template.furniture.forEach(remember);
  template.props.forEach(remember);

  // In a furnished house, an entry-level piece of furniture you own (a mattress on the floor) doesn't replace theirs.
  const mine = new Map([...bestPerSlot(owned)].filter(([slot, item]) => !providedFurniture || PERSONAL.has(slot) || BASIC_OF_SLOT.get(slot) !== item));
  // A top-tier item in a slot the template furnishes keeps the template's whole (lavish) arrangement — in a home you
  // furnish. In a furnished house the template's pieces are the family's, so yours shows as itself.
  const keepOriginal = (slot: HomeSlot): boolean => {
    const item = mine.get(slot);
    if (!item) return providedFurniture;
    if (item !== TOP_OF_SLOT.get(slot) || !anchors.has(slot)) return false;
    return !providedFurniture || !hasOwnLook(item);
  };
  // Pieces an item brings itself (a super king's bedside drawers) stand in for the template's own of that model.
  const ownModels = (slot: HomeSlot): ReadonlySet<string> => {
    const item = mine.get(slot);
    const anchor = anchors.get(slot);
    if (!item || !anchor || keepOriginal(slot)) return new Set();
    return new Set((piecesFor(item, anchor).furniture ?? []).map((piece) => piece.model));
  };
  const shows = (piece: FurniturePlacement | PropSpec): boolean => {
    const slot = piece.slot;
    if (!slot) return providedFurniture || isFixture(piece);
    if (slot === 'pantry') return pantryMeals > 0;
    if (!piece.base) return keepOriginal(slot);
    const item = mine.get(slot);
    if (item && 'model' in piece && ownModels(slot).has(piece.model)) return false;
    return item ? !BARE_ITEMS.has(item) : providedFurniture;
  };

  let furniture: FurniturePlacement[] = template.furniture.filter(shows);
  let props: PropSpec[] = template.props.filter(shows);
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

  const kitchen = anchors.get('cooker') ?? anchors.get('fridge');
  if (kitchen) props.push(...pantryProps({ ...kitchen, y: 0 }, pantryMeals));

  // Nothing to sleep on: a mat on the floor at the bed's place.
  const bedAnchor = anchors.get('bed');
  if (bedAnchor && !mine.has('bed') && !providedFurniture) {
    props.push({ kind: 'mat', at: bedAnchor.at, rot: bedAnchor.rot, size: [0.9, 1.9], color: '#8d6e63', border: '#5d4037' });
    bedTop = 0.08;
  }

  ({ furniture, props } = restOnSomething(furniture, props));
  props.push(...spreadFor(template, furniture, anchors, treats));

  if (surname) {
    const family = `THE ${surname.toUpperCase()}S`;
    props.forEach((prop, index) => {
      if (prop.kind === 'sign' && prop.familyName) props[index] = { ...prop, lines: [family, ...prop.lines.slice(1)] };
    });
  }

  // Seats you don't own aren't there: whoever would sit on one stands in its place instead of sitting on air.
  const seats = [...furniture.map(furnitureFootprint), ...props.map(propFootprint)].filter((box) => box !== null);
  const sleep = template.player.sleep;
  // On your bed (or mattress, or mat) — or, napping where the couch would be, on the floor.
  const sleepTop = bedTop ?? (sleep && sleep.at.length === 3 && !hasSeat(sleep, seats) ? FLOOR_SLEEP : null);
  const player =
    sleep && sleepTop !== null && sleep.at.length === 3
      ? { ...template.player, sleep: { ...sleep, at: [sleep.at[0], sleepTop, sleep.at[2]] as const } satisfies Spot }
      : template.player;
  const grounded = <T extends Spot>(spot: T): T => (spot.stance === 'sit' && !hasSeat(spot, seats) ? { ...spot, at: [spot.at[0], spot.at[spot.at.length - 1] as number], stance: 'stand' } : spot);
  const players = Object.fromEntries(Object.entries(player).map(([key, spot]) => [key, spot && key !== 'sleep' ? grounded(spot) : spot])) as PlayerSpots;
  // The template's people are the family (family house) or roommates (hostel); a home you rent or own has no
  // strangers in it — just you, your guests and your visitors.
  const npcs = providedFurniture ? template.npcs.map(grounded) : [];
  return { ...template, furniture, props, player: players, npcs, guests: template.guests.map(grounded) };
}

// ----- Things resting on other things --------------------------------------------------------------------------------

/** Between these heights (m) a piece rests on something; higher up it hangs on a wall (signs, AC, wall cabinets). */
const RESTING = [0.3, 1.0] as const;
/** A top this close to a piece's height carries it. */
const TOP_TOLERANCE = 0.16;
/** Food and drink go when their table does; everything else ends up on the floor (a laptop by the mattress). */
const SPILLS: ReadonlySet<PropKind> = new Set<PropKind>(['food-plate', 'bottles', 'pot', 'cake']);

const resting = (y: number | undefined): boolean => y !== undefined && y > RESTING[0] && y <= RESTING[1];

/** Is there a top under `at` at about height `y` (a desk under the laptop, a drawer under the lamp)? */
function carried(at: At, y: number, tops: readonly Aabb[]): boolean {
  const margin = 0.05;
  return tops.some((box) => at[0] >= box.minX - margin && at[0] <= box.maxX + margin && at[1] >= box.minZ - margin && at[1] <= box.maxZ + margin && Math.abs(box.height - y) <= TOP_TOLERANCE);
}

/** Without the furniture they stood on, gadgets sit on the floor and plates and bottles aren't there. */
function restOnSomething(furniture: readonly FurniturePlacement[], props: readonly PropSpec[]): { furniture: FurniturePlacement[]; props: PropSpec[] } {
  const tops = [...furniture.map(furnitureFootprint), ...props.map(propFootprint)].filter((box): box is Aabb => box !== null);
  return {
    furniture: furniture.map((piece) => (resting(piece.y) && !carried(piece.at, piece.y ?? 0, tops) ? { ...piece, y: 0 } : piece)),
    props: props.flatMap((prop) => {
      if (!resting(prop.y) || carried(prop.at, prop.y ?? 0, tops)) return [prop];
      return SPILLS.has(prop.kind) ? [] : [{ ...prop, y: 0 }];
    }),
  };
}

// ----- A host's spread ------------------------------------------------------------------------------------------------

/** What each treat puts on the table. */
const TREAT_PROPS: Readonly<Record<HostTreatId, (at: At, rot: Deg, y: number) => PropSpec>> = {
  'home-cooked': (at, rot, y) => ({ kind: 'food-plate', at, rot, y, food: 'amala' }),
  'jollof-chicken': (at, rot, y) => ({ kind: 'food-plate', at, rot, y, food: 'chicken' }),
  'small-chops': (at, rot, y) => ({ kind: 'food-plate', at, rot, y, food: 'small-chops' }),
  'suya-platter': (at, rot, y) => ({ kind: 'food-plate', at, rot, y, food: 'suya' }),
  pizza: (at, rot, y) => ({ kind: 'food-plate', at, rot, y, food: 'pizza' }),
  'soft-drinks': (at, rot, y) => ({ kind: 'bottles', at, rot, y, count: 4, colors: ['#3e2723', '#b71c1c', '#ef6c00'] }),
  beer: (at, rot, y) => ({ kind: 'bottles', at, rot, y, count: 4, colors: ['#2e7d32', '#6d4c41'] }),
  'palm-wine': (at, rot, y) => ({ kind: 'bottles', at, rot, y, count: 2, colors: ['#efe8d6'] }),
  champagne: (at, rot, y) => ({ kind: 'bottles', at, rot, y, count: 2, colors: ['#1b3d2f'] }),
  cake: (at, rot, y) => ({ kind: 'cake', at, rot, y }),
  'take-home-packs': (at, rot, y) => ({ kind: 'box', at, rot, y, size: [0.22, 0.08, 0.16], color: '#fbf8ef', surface: 'paint' }),
  'goodie-bags': (at, rot, y) => ({ kind: 'box', at, rot, y, size: [0.18, 0.24, 0.09], color: '#c2185b', surface: 'paint' }),
};

/** Places on a table for the spread (right, ahead in the table's frame); a cloth on the floor takes them wider apart. */
const SPOTS: ReadonlyArray<readonly [number, number]> = [
  [-0.25, -0.1],
  [0.25, 0.1],
  [0, 0],
  [0.25, -0.1],
  [-0.25, 0.1],
];
const DINING_TABLE = /^table(?!Coffee)/;

/**
 * The host's spread goes on the main room's table (the parlour, or the only room): the dining table, else the centre
 * table, else a cloth on the floor where the table would be (an empty flat still gets its jollof). Kitchens and
 * bedrooms of bigger homes (`<home>:<room>` templates) get none.
 */
function spreadFor(template: InteriorTemplate, furniture: readonly FurniturePlacement[], anchors: ReadonlyMap<HomeSlot, Anchor>, treats: readonly HostTreatId[]): PropSpec[] {
  const served = HOST_TREAT_IDS.filter((id) => treats.includes(id));
  if (served.length === 0 || template.id.includes(':')) return [];
  const table = furniture.find((piece) => piece.slot === 'dining' && DINING_TABLE.test(piece.model)) ?? furniture.find((piece) => piece.model.startsWith('tableCoffee'));
  const top = table ? furnitureFootprint(table)?.height : undefined;
  const props: PropSpec[] = [];
  let surface: Anchor;
  let spread = 1;
  if (table && top !== undefined) {
    surface = { at: table.at, rot: table.rot ?? 0, y: top };
  } else {
    const floor = anchors.get('dining') ?? anchors.get('rug') ?? anchors.get('seating');
    const standing = template.player.default?.at;
    const at: At = floor?.at ?? (standing ? [standing[0], standing[standing.length - 1] as number] : [0, 0]);
    surface = { at, rot: floor?.rot ?? 0, y: 0.012 };
    spread = 1.5;
    props.push({ kind: 'mat', at, rot: surface.rot, size: [1.3, 0.9], color: '#f4ede0', border: '#c0392b' });
  }
  served.slice(0, SPOTS.length).forEach((id, i) => {
    const [right, ahead] = SPOTS[i] as readonly [number, number];
    props.push(TREAT_PROPS[id](offset(surface, right * spread, ahead * spread), surface.rot, surface.y));
  });
  return props;
}

/** Lying on the bare floor. */
const FLOOR_SLEEP = 0.05;

/** A seated avatar's hips are up to this far behind its feet (spots on a bed's edge sit just past the bed). */
const SEAT_REACH = 0.3;

/** Is there something under a seated spot (a chair, sofa, bench, stool, mattress…)? */
function hasSeat(spot: Spot, seats: readonly Aabb[]): boolean {
  const x = spot.at[0];
  const z = spot.at[spot.at.length - 1] as number;
  return seats.some((box) => x >= box.minX - SEAT_REACH && x <= box.maxX + SEAT_REACH && z >= box.minZ - SEAT_REACH && z <= box.maxZ + SEAT_REACH);
}
