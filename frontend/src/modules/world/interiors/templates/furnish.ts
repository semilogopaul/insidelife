import {
  FURNITURE_SLOTS,
  HOST_TREAT_IDS,
  ITEMS,
  findItem,
  furnitureWorth,
  type DecorItem,
  type DecorVariant,
  type HomeFurnishing,
  type HostTreatId,
} from '@insidelife/shared';
import type { Aabb } from '../../play/physics/collision';
import type { KitModel } from '../kit/kit-manifest';
import type { PropKind, PropSpec } from '../props/prop-types';
import { furnitureFootprint, propFootprint } from '../walk/colliders';
import { furnitureLook, type FurnitureLook } from './furniture-looks';
import { BED_TOP, forward } from './helpers';
import { HOME_SLOTS, type At, type Deg, type FurniturePlacement, type HomePiece, type HomeSlot, type InteriorTemplate, type PlayerSpots, type Spot, type UsableThing } from './types';

/**
 * Your belongings in your home.
 *
 * ONE FURNITURE MODEL. Everything you can move in a home is a *piece* (`pieces`: a bed, a sofa, a TV, a rug, a plant, a
 * desk… standing in a room at a pose; the Decorate mode edits them): this module draws the furniture ones from the kit
 * where they stand and anchors what you do to them — the bed you sleep in is the bed standing in the room, the table you
 * eat at is the dining table, you sit on the sofa and work at the desk. Decor (art, lamps, cushions…) is drawn by the
 * decor layer. What stays where the building put it is a *fitting*:
 * - the room itself: walls, floor, windows, doors and curtains (from `RoomSpec`, not pieces);
 * - stairs and stairwells between floors;
 * - the kitchen's built-in units: base and wall cabinets, drawers, the sink, the worktop/island tops (`kitchenBar`);
 * - bathroom fittings: toilet, shower, bathtub, basin and mirror, plus pieces flagged `fixture` (shower trays, glass screens);
 * - the family sign over the parlour (it carries your surname);
 * - appliances and fittings you buy (cooker, fridge, washer, microwave, the AC, wall clocks, art, the chandelier, the
 *   home cinema…): they appear at their place in the room when you own them, and don't move.
 *
 * Template pieces say what they stand for:
 * - `slot` (a fitted slot): the look of the item in that slot (a gas cooker, then…), so every purchase changes the room;
 *   the dearest item in a slot keeps the template's whole arrangement;
 * - `slot` (a movable slot: bed, seating, dining, rug, plants, storage, desk, tv): what the family house and hostels
 *   provide. A home you rent or own shows none of it — your pieces stand there instead;
 * - `base` + `slot`: comes with any item in the slot and keeps its own look (the pot on the cooker);
 * - `slot: 'pantry'`: food from your kitchen stock (a plate of jollof on the table while you have meals in);
 * - untagged: a fixture (above) — or, if not, the family's own furniture that never comes with a rented flat.
 *
 * In the family house or a hostel the provided furniture stays where it is: your own beds, sofas and tables wait in
 * storage for a place of your own, your small things (art, lamps, plants) go where you put them. Only your gadgets and
 * appliances (TV excepted: it is furniture) replace theirs.
 */
const FIXTURE_MODELS: ReadonlySet<KitModel> = new Set<KitModel>(['kitchenCabinet', 'kitchenCabinetDrawer', 'kitchenCabinetUpper', 'kitchenSink', 'kitchenBar', 'toilet', 'shower', 'bathtub', 'bathroomSink', 'bathroomMirror']);
const FIXTURE_PROPS: ReadonlySet<PropKind> = new Set<PropKind>(['stairs', 'stairwell']);

/** Part of the building (see above). */
export function isFixture(piece: FurniturePlacement | PropSpec): boolean {
  if (piece.fixture) return true;
  if ('model' in piece) return FIXTURE_MODELS.has(piece.model);
  return FIXTURE_PROPS.has(piece.kind) || (piece.kind === 'sign' && piece.familyName === true);
}

/** Slots whose pieces you move around (a piece each); the rest are fitted where the building put them. */
export const MOVABLE_SLOTS: ReadonlySet<HomeSlot> = new Set<HomeSlot>(FURNITURE_SLOTS);

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

interface Anchor {
  readonly at: At;
  readonly rot: Deg;
  readonly y: number;
}

interface Pieces {
  readonly furniture?: readonly FurniturePlacement[];
  readonly props?: readonly PropSpec[];
}

/** Offset in the anchor's frame: `right` along its local +x, `ahead` along its facing. */
function offset(anchor: Anchor, right: number, ahead: number): At {
  const a = (anchor.rot * Math.PI) / 180;
  const [x, z] = forward(anchor.at, anchor.rot, ahead);
  return [x + Math.cos(a) * right, z - Math.sin(a) * right];
}

/** How each fitted item looks at its anchor (when it isn't the template's own, dearest look). Movable furniture is `furniture-looks.ts`. */
function piecesFor(itemId: string, anchor: Anchor): Pieces {
  const { at, rot, y } = anchor;
  switch (itemId) {
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
    default:
      if (itemId.startsWith('laptop-')) return { furniture: [{ model: 'laptop', at, rot, y }] };
      return {};
  }
}

/** The dearest owned item per slot (two fridges don't both show). */
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
const PERSONAL: ReadonlySet<HomeSlot> = new Set(['console', 'audio', 'laptop', 'books', 'lamp', 'fan', 'ac']);

/** The cheapest item of each slot that has several tiers: no upgrade on a furnished house. */
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

/** Gadgets that ride on a piece of furniture when there is one in the room: the laptop and books on the desk, the console by the TV. */
const CARRIERS: Partial<Record<HomeSlot, { readonly by: 'study' | 'tv'; readonly right: number }>> = {
  laptop: { by: 'study', right: 0 },
  books: { by: 'study', right: 0.4 },
  console: { by: 'tv', right: 0 },
};

/** A piece of yours standing in this room (the shape `common/decor` resolves them to). */
export interface FurnishPiece {
  readonly id: string;
  readonly item: DecorItem;
  readonly variant: DecorVariant;
  readonly spot: { readonly x: number; readonly z: number; readonly y: number; readonly rot: number };
}

export interface FurnishOptions {
  /** Family house and hostels come furnished: their furniture stays where it is. */
  readonly providedFurniture: boolean;
  /** Meals in the kitchen: sacks of foodstuff by the cooker, a plate on the table. */
  readonly pantryMeals?: number;
  /** Whose home it is: family signs carry their surname. */
  readonly surname?: string;
  /** What the host has put out for guests (plates, drinks, cake), shown on the main room's table. */
  readonly treats?: readonly HostTreatId[];
  /** The pieces standing in this room (furniture is drawn here, decor by the decor layer). */
  readonly pieces?: readonly FurnishPiece[];
  /** What the whole home does: the best bed, the table to eat at… (`homeFurnishing` over the pieces of every room). */
  readonly home?: HomeFurnishing;
  /** The room of the home being drawn. */
  readonly roomId?: string;
  /** A piece being dragged: it isn't drawn (the editor's ghost stands in). */
  readonly hiddenId?: string | null;
}

/** Foodstuff by the cooker: a rice sack, a second sack, then a bucket of garri as the stock grows. */
function pantryProps(anchor: Anchor, meals: number): PropSpec[] {
  if (meals <= 0) return [];
  const props: PropSpec[] = [{ kind: 'box', at: offset(anchor, 0.75, 0.15), rot: anchor.rot + 8, size: [0.36, 0.5, 0.26], color: '#efe6d0', surface: 'cloth' }];
  if (meals > 20) props.push({ kind: 'box', at: offset(anchor, 1.12, 0.12), rot: anchor.rot - 6, size: [0.34, 0.42, 0.25], color: '#e0d2b4', surface: 'cloth' });
  if (meals > 60) props.push({ kind: 'bucket', at: offset(anchor, 0.95, 0.5), color: '#f6b90b' });
  return props;
}

interface PieceLook {
  readonly piece: FurnishPiece;
  readonly look: FurnitureLook;
}

/** The dearest first (a better bed, a bigger TV). */
const byWorth = (a: PieceLook, b: PieceLook): number => furnitureWorth(b.piece.item) - furnitureWorth(a.piece.item) || a.piece.id.localeCompare(b.piece.id);

export function furnish(template: InteriorTemplate, owned: readonly string[], options: FurnishOptions): InteriorTemplate {
  const { providedFurniture, pantryMeals = 0, surname, treats = [], home, roomId, hiddenId = null } = options;
  // Where each slot's item goes: its first own (non-base) piece.
  const anchors = new Map<HomeSlot, Anchor>();
  const remember = (piece: HomePiece & { readonly at: At; readonly rot?: Deg; readonly y?: number }): void => {
    if (piece.slot && !piece.base && !anchors.has(piece.slot)) anchors.set(piece.slot, { at: piece.at, rot: piece.rot ?? 0, y: piece.y ?? 0 });
  };
  template.furniture.forEach(remember);
  template.props.forEach(remember);

  // Movable furniture is pieces, not belongings: only fitted slots are looked up by what you own.
  const fittedOwned = owned.filter((itemId) => {
    const slot = slotOf(itemId);
    return slot === null || !MOVABLE_SLOTS.has(slot);
  });
  // In a furnished house, an entry-level piece you own doesn't replace theirs.
  const mine = new Map([...bestPerSlot(fittedOwned)].filter(([slot, item]) => !providedFurniture || PERSONAL.has(slot) || BASIC_OF_SLOT.get(slot) !== item));
  // A top-tier item in a slot the template furnishes keeps the template's whole (lavish) arrangement — in a home you
  // furnish. In a furnished house the template's pieces are the family's, so yours shows as itself.
  const keepOriginal = (slot: HomeSlot): boolean => {
    const item = mine.get(slot);
    if (!item) return providedFurniture;
    if (item !== TOP_OF_SLOT.get(slot) || !anchors.has(slot)) return false;
    return !providedFurniture || !hasOwnLook(item);
  };
  // Pieces an item brings itself stand in for the template's own of that model.
  const ownModels = (slot: HomeSlot): ReadonlySet<string> => {
    const item = mine.get(slot);
    const anchor = anchors.get(slot);
    if (!item || !anchor || keepOriginal(slot)) return new Set();
    return new Set((piecesFor(item, anchor).furniture ?? []).map((piece) => piece.model));
  };
  const shows = (piece: FurniturePlacement | PropSpec): boolean => {
    const slot = piece.slot;
    if (!slot) return providedFurniture || isFixture(piece);
    // What the family provides stays; in a home you rent or own your pieces stand there instead.
    if (MOVABLE_SLOTS.has(slot)) return providedFurniture;
    if (slot === 'pantry') return pantryMeals > 0;
    if (!piece.base) return keepOriginal(slot);
    const item = mine.get(slot);
    if (item && 'model' in piece && ownModels(slot).has(piece.model)) return false;
    return item ? true : providedFurniture;
  };

  let furniture: FurniturePlacement[] = template.furniture.filter(shows);
  let props: PropSpec[] = template.props.filter(shows);

  // ----- Your pieces ------------------------------------------------------------------------------------------------
  const here = (options.pieces ?? []).filter((piece) => piece.id !== hiddenId);
  const looks: PieceLook[] = [];
  const things: UsableThing[] = [];
  const decorBeds: FurnishPiece[] = [];
  if (!providedFurniture) {
    for (const piece of here) {
      const shopItemId = piece.item.shopItemId;
      if (!shopItemId) {
        if (piece.item.fn === 'sleep') decorBeds.push(piece);
        continue;
      }
      const look = furnitureLook(shopItemId, { at: [piece.spot.x, piece.spot.z], rot: piece.spot.rot }, piece.variant);
      if (look) looks.push({ piece, look });
    }
    for (const { piece, look } of looks) {
      const slot = piece.item.furnitureSlot;
      furniture.push(...look.furniture.map((entry) => (slot && !entry.slot ? { ...entry, slot } : entry)));
      props.push(...look.props);
    }
    for (const bed of decorBeds) {
      things.push({ kind: 'bed', name: 'Bed', at: [bed.spot.x, bed.spot.z], rot: bed.spot.rot, size: bed.item.footprint, height: bed.item.surface ?? bed.item.height });
    }
  }
  const lookWhere = (pick: (look: FurnitureLook) => unknown, found?: { readonly pieceId: string } | null): PieceLook | undefined => {
    const candidates = looks.filter((entry) => pick(entry.look)).toSorted(byWorth);
    return candidates.find((entry) => entry.piece.id === found?.pieceId) ?? candidates[0];
  };
  const carrierFor = (by: 'study' | 'tv'): PieceLook | undefined => lookWhere((look) => look.carry !== undefined && (by === 'tv' ? look.watch !== undefined : look.work !== undefined));

  // ----- Fitted items -----------------------------------------------------------------------------------------------
  let bedTop: number | null = null;
  for (const [slot, itemId] of mine) {
    if (keepOriginal(slot)) continue;
    let anchor = anchors.get(slot) ?? (BORROWS[slot] ? anchors.get(BORROWS[slot]) : undefined);
    const carrier = CARRIERS[slot];
    if (carrier && !providedFurniture) {
      const host = carrierFor(carrier.by);
      if (host?.look.carry) {
        const { at, y, rot } = host.look.carry;
        anchor = { at: offset({ at, rot, y: 0 }, carrier.right, 0), rot, y };
      } else if (home?.[carrier.by === 'study' ? 'study' : 'tv'] && (home[carrier.by === 'study' ? 'study' : 'tv']?.roomId ?? roomId) !== roomId) {
        // The desk (or the TV) is in another room: the laptop, the books and the console are on it there.
        continue;
      }
    }
    if (!anchor) continue;
    const pieces = piecesFor(itemId, anchor);
    furniture.push(...(pieces.furniture ?? []).map((entry) => (entry.slot ? entry : { ...entry, slot })));
    props.push(...(pieces.props ?? []).map((entry) => (entry.slot ? entry : { ...entry, slot })));
  }

  const kitchen = anchors.get('cooker') ?? anchors.get('fridge');
  if (kitchen) props.push(...pantryProps({ ...kitchen, y: 0 }, pantryMeals));

  // ----- Where you lie, sit, eat and work ---------------------------------------------------------------------------
  const spots: Record<string, Spot | undefined> = { ...template.player };
  if (!providedFurniture) {
    // The seats and beds of the template were the family's; yours are the pieces standing here.
    for (const key of ['sleep', 'sit', 'phone', 'read', 'type']) delete spots[key];
    const bed = lookWhere((look) => look.sleep, home?.sleep);
    const decorBed = decorBeds.toSorted((a, b) => furnitureWorth(b.item) - furnitureWorth(a.item))[0];
    if (bed?.look.sleep) {
      spots.sleep = bed.look.sleep;
      bedTop = bed.look.top ?? BED_TOP;
    } else if (decorBed) {
      bedTop = decorBed.item.surface ?? 0.55;
      spots.sleep = { at: [decorBed.spot.x, bedTop, decorBed.spot.z], rot: decorBed.spot.rot, animation: 'sleep' };
    } else {
      // Nothing to sleep on in the whole home: a mat on the floor at the bed's place.
      const bedAnchor = anchors.get('bed');
      const bedElsewhere = home?.sleep != null && home.sleep.roomId !== roomId;
      if (bedAnchor && !bedElsewhere) {
        props.push({ kind: 'mat', at: bedAnchor.at, rot: bedAnchor.rot, size: [0.9, 1.9], color: '#8d6e63', border: '#5d4037' });
        spots.sleep = { at: [bedAnchor.at[0], 0.08, bedAnchor.at[1]], rot: bedAnchor.rot, animation: 'sleep' };
        bedTop = 0.08;
      }
    }
    const sofa = lookWhere((look) => look.sit && !look.work, home?.sit);
    const desk = lookWhere((look) => look.work, home?.study);
    const tv = lookWhere((look) => look.watch, home?.tv);
    const table = lookWhere((look) => look.eat, home?.eat);
    // Somewhere to sit: the sofa, else a seat at the table, else the desk chair; with none, in front of the TV.
    const sit = sofa?.look.sit ?? table?.look.eat ?? desk?.look.sit ?? tv?.look.watch;
    if (sit) {
      spots.sit = { ...sit, animation: 'sit' };
      spots.phone = { ...sit, animation: 'phone' };
    }
    // Working: at the desk; with none, wherever you can sit with a book (the sofa, the table).
    const work = desk?.look.work ?? sofa?.look.sit ?? table?.look.eat;
    if (work) {
      spots.type = { ...work, animation: 'type', props: desk?.look.work ? false : undefined };
      spots.read = { ...work, animation: 'read', props: undefined };
    }
    if (table?.look.eat) {
      spots.eat = table.look.eat;
      // A plate of jollof on your table while the kitchen has food in.
      if (pantryMeals > 0 && table.look.top !== undefined) {
        props.push({ kind: 'food-plate', at: [table.piece.spot.x, table.piece.spot.z], y: table.look.top, food: 'jollof', slot: 'pantry' });
      }
    }
  }

  ({ furniture, props } = restOnSomething(furniture, props));
  props.push(...spreadFor(template, furniture, anchors, treats, providedFurniture ? undefined : lookWhere((look) => look.eat, home?.eat), home?.eat == null));

  if (surname) {
    const family = `THE ${surname.toUpperCase()}S`;
    props.forEach((prop, index) => {
      if (prop.kind === 'sign' && prop.familyName) props[index] = { ...prop, lines: [family, ...prop.lines.slice(1)] };
    });
  }

  // Seats you don't own aren't there: whoever would sit on one stands in its place instead of sitting on air.
  const seats = [...furniture.map(furnitureFootprint), ...props.map(propFootprint)].filter((box) => box !== null);
  const sleep = spots.sleep;
  // On your bed (or mattress, or mat) — or, napping where the couch would be, on the floor.
  const sleepTop = bedTop ?? (sleep && sleep.at.length === 3 && !hasSeat(sleep, seats) ? FLOOR_SLEEP : null);
  const player = {
    ...spots,
    ...(sleep && sleepTop !== null && sleep.at.length === 3 ? { sleep: { ...sleep, at: [sleep.at[0], sleepTop, sleep.at[2]] as const } satisfies Spot } : {}),
  } as PlayerSpots;
  const grounded = <T extends Spot>(spot: T): T => (spot.stance === 'sit' && !hasSeat(spot, seats) ? { ...spot, at: [spot.at[0], spot.at[spot.at.length - 1] as number], stance: 'stand' } : spot);
  const players = Object.fromEntries(Object.entries(player).map(([key, spot]) => [key, spot && key !== 'sleep' ? grounded(spot) : spot])) as PlayerSpots;
  // The template's people are the family (family house) or roommates (hostel); a home you rent or own has no
  // strangers in it — just you, your guests and your visitors.
  const npcs = providedFurniture ? template.npcs.map(grounded) : [];
  return {
    ...template,
    furniture,
    props,
    player: players,
    npcs,
    guests: template.guests.map(grounded),
    ...(things.length > 0 ? { things: [...(template.things ?? []), ...things] } : {}),
  };
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
 * The host's spread goes on the table you eat at, in whatever room it stands (the dining table in the kitchen, the
 * parlour's); in a furnished house, the dining or centre table. A home with no table at all gets a cloth on the floor
 * where the table would be in the main room (an empty flat still gets its jollof). Kitchens and bedrooms of bigger
 * homes (`<home>:<room>` templates) get none unless the table is theirs.
 */
function spreadFor(
  template: InteriorTemplate,
  furniture: readonly FurniturePlacement[],
  anchors: ReadonlyMap<HomeSlot, Anchor>,
  treats: readonly HostTreatId[],
  yours: PieceLook | undefined,
  noTableAnywhere: boolean,
): PropSpec[] {
  const served = HOST_TREAT_IDS.filter((id) => treats.includes(id));
  if (served.length === 0) return [];
  const main = !template.id.includes(':');
  const props: PropSpec[] = [];
  let surface: Anchor;
  let spread = 1;
  if (yours?.look.top !== undefined) {
    surface = { at: yours.piece.spot ? [yours.piece.spot.x, yours.piece.spot.z] : [0, 0], rot: yours.piece.spot.rot, y: yours.look.top };
  } else {
    if (!main) return [];
    const table = furniture.find((piece) => piece.slot === 'dining' && DINING_TABLE.test(piece.model)) ?? furniture.find((piece) => piece.model.startsWith('tableCoffee'));
    const top = table ? furnitureFootprint(table)?.height : undefined;
    if (table && top !== undefined) {
      surface = { at: table.at, rot: table.rot ?? 0, y: top };
    } else {
      // No table here: a cloth on the floor, but only when the home has none (a table elsewhere gets the spread).
      if (!noTableAnywhere) return [];
      const floor = anchors.get('dining') ?? anchors.get('rug') ?? anchors.get('seating');
      const standing = template.player.default?.at;
      const at: At = floor?.at ?? (standing ? [standing[0], standing[standing.length - 1] as number] : [0, 0]);
      surface = { at, rot: floor?.rot ?? 0, y: 0.012 };
      spread = 1.5;
      props.push({ kind: 'mat', at, rot: surface.rot, size: [1.3, 0.9], color: '#f4ede0', border: '#c0392b' });
    }
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
