import { describe, expect, it } from 'vitest';
import { ITEMS, type ItemCategory } from '@insidelife/shared';
import { DUPLEX_LAYOUT, FLAT_LAYOUT, HOME_LAYOUTS, MANSION_LAYOUT } from '../layouts/catalog';
import { FLAT_BEDROOM } from '../templates/catalog/home-rooms';
import { HOME_DUPLEX, HOME_FACE_ME, HOME_FAMILY, HOME_FLAT, HOME_HOSTEL, HOME_MANSION } from '../templates/catalog/homes';
import { furnish, isFixture, slotOf } from '../templates/furnish';
import type { InteriorTemplate } from '../templates/types';
import type { HomeLayout } from '../layouts/types';

const models = (template: { readonly furniture: readonly { readonly model: string }[] }) => template.furniture.map((piece) => piece.model);
const propKinds = (template: { readonly props: readonly { readonly kind: string }[] }) => template.props.map((prop) => prop.kind);

describe('furnish', () => {
  /** A rented flat (living room, kitchen, bedroom) furnished with what you own. */
  const furnishFlat = (owned: readonly string[]): ReadonlyMap<string, InteriorTemplate> =>
    new Map(FLAT_LAYOUT.rooms.map((room) => [room.id, furnish(room.template, owned, { providedFurniture: false })]));
  const wholeFlat = (rooms: ReadonlyMap<string, InteriorTemplate>) => ({ furniture: [...rooms.values()].flatMap((room) => room.furniture), props: [...rooms.values()].flatMap((room) => room.props) });

  it('shows a new tenant only their starter mattress: no TV, sofas, fridge or AC', () => {
    const rooms = furnishFlat(['bed-foam-mattress', 'phone-tecno-spark']);
    const flat = wholeFlat(rooms);
    expect(models(flat)).not.toContain('televisionModern');
    expect(models(flat)).not.toContain('loungeDesignSofa');
    expect(models(flat)).not.toContain('kitchenFridge');
    expect(models(flat)).not.toContain('bedDouble');
    expect(propKinds(flat)).not.toContain('aircon');
    const bedroom = rooms.get('bedroom');
    expect(propKinds(bedroom ?? { props: [] })).toContain('mattress');
    // Fixed fittings stay.
    expect(models(flat)).toContain('kitchenSink');
    // The sleeper lies on the mattress, not in the air where the bed was.
    expect(bedroom?.player.sleep?.at[1]).toBeCloseTo(0.22);
  });

  it('puts a mat on the floor where the bed would be when you own nothing to sleep on', () => {
    const bedroom = furnishFlat([]).get('bedroom');
    const bed = FLAT_BEDROOM.furniture.find((piece) => piece.slot === 'bed');
    expect(bedroom?.props.some((prop) => prop.kind === 'mat' && prop.at[0] === bed?.at[0] && prop.at[1] === bed?.at[1])).toBe(true);
    expect(bedroom?.player.sleep?.at[1]).toBeCloseTo(0.08);
  });

  it('puts each thing you buy in its room: the fridge in the kitchen, the bed and AC in the bedroom, the TV in the living room', () => {
    const rooms = furnishFlat(['fridge-tabletop', 'bed-orthopedic', 'ac-split', 'tv-55', 'ps5']);
    expect(models(rooms.get('kitchen') ?? { furniture: [] })).toContain('kitchenFridgeSmall');
    expect(models(rooms.get('bedroom') ?? { furniture: [] })).toContain('bedDouble');
    expect(propKinds(rooms.get('bedroom') ?? { props: [] })).toContain('aircon');
    expect(models(rooms.get('living') ?? { furniture: [] })).toContain('televisionModern');
    // The console sits by the TV, and nothing turns up twice.
    expect(rooms.get('living')?.props.some((prop) => prop.kind === 'box' && prop.color === '#f4f4f4')).toBe(true);
    expect(models(wholeFlat(rooms)).filter((model) => model.startsWith('kitchenFridge'))).toHaveLength(1);
    expect(propKinds(wholeFlat(rooms)).filter((kind) => kind === 'aircon')).toHaveLength(1);
  });

  it('has nobody sitting on air: without the armchair its sitter stands, with it they sit', () => {
    const bare = furnishFlat([]).get('living');
    expect(bare?.npcs[0]?.stance).toBe('stand');
    expect(bare?.npcs[0]?.at).toHaveLength(2);
    expect(bare?.player.sit?.stance).toBe('stand');
    const furnished = furnishFlat(['sofa-italian']).get('living');
    expect(furnished?.npcs[0]?.stance).toBe('sit');
    expect(furnished?.player.sit?.stance).toBe('sit');
    // Sitting on the edge of the family-house bed still counts as sitting.
    const family = furnish(HOME_FAMILY, [], { providedFurniture: true });
    expect(family.player.phone?.stance).toBe('sit');
    expect(family.player.type?.stance).toBe('sit');
  });

  it('keeps every authored seat when the furniture is all there (no spot is wrongly stood up)', () => {
    const grounded: string[] = [];
    for (const layout of Object.values(HOME_LAYOUTS)) {
      for (const room of layout.rooms) {
        const furnished = furnish(room.template, [], { providedFurniture: true });
        for (const [key, spot] of Object.entries(room.template.player)) {
          if (spot?.stance === 'sit' && furnished.player[key as 'sit']?.stance !== 'sit') grounded.push(`${room.template.id} player.${key}`);
        }
        room.template.npcs.forEach((spot, i) => {
          if (spot.stance === 'sit' && furnished.npcs[i]?.stance !== 'sit') grounded.push(`${room.template.id} npc ${i}`);
        });
        room.template.guests.forEach((spot, i) => {
          if (spot.stance === 'sit' && furnished.guests[i]?.stance !== 'sit') grounded.push(`${room.template.id} guest ${i}`);
        });
      }
    }
    expect(grounded).toEqual([]);
  });

  it('shows what you buy, sized by the item (a 32" TV in a mansion stays small)', () => {
    const mansion = furnish(HOME_MANSION, ['tv-32', 'sofa-fabric', 'ps5'], { providedFurniture: false });
    const tv = mansion.furniture.find((piece) => piece.model === 'televisionModern');
    expect(tv?.scale).toBeCloseTo(0.8);
    expect(models(mansion)).toContain('loungeSofaLong');
    expect(models(mansion)).not.toContain('loungeDesignSofa');
    expect(mansion.props.some((prop) => prop.kind === 'box' && prop.color === '#f4f4f4')).toBe(true);
  });

  it('keeps the template’s full arrangement for the best item in a slot', () => {
    const mansion = furnish(HOME_MANSION, ['sofa-italian', 'tv-75', 'dining-set'], { providedFurniture: false });
    expect(models(mansion).filter((model) => model === 'loungeDesignSofa')).toHaveLength(2);
    expect(models(mansion).filter((model) => model === 'chairModernCushion').length).toBeGreaterThanOrEqual(5);
    expect(mansion.furniture.find((piece) => piece.model === 'televisionModern')?.scale).toBeCloseTo(1.8);
  });

  it('leaves the family house furnished, upgrading only what you own better', () => {
    const family = furnish(HOME_FAMILY, ['bed-foam-mattress'], { providedFurniture: true });
    expect(models(family)).toContain('bedDouble');
    expect(models(family)).toContain('televisionModern');
    const upgraded = furnish(HOME_FAMILY, ['tv-55'], { providedFurniture: true });
    expect(upgraded.furniture.filter((piece) => piece.model === 'televisionModern')).toHaveLength(1);
    expect(upgraded.furniture.find((piece) => piece.model === 'televisionModern')?.scale).toBeCloseTo(1.15);
  });
});

/** Every room of a layout furnished as a home you rent or own. */
const furnishLayout = (layout: HomeLayout, owned: readonly string[], options: { readonly pantryMeals?: number } = {}): ReadonlyMap<string, InteriorTemplate> =>
  new Map(layout.rooms.map((room) => [room.id, furnish(room.template, owned, { providedFurniture: false, ...options })]));
const roomOf = (rooms: ReadonlyMap<string, InteriorTemplate>, id: string): InteriorTemplate => {
  const found = rooms.get(id);
  if (!found) throw new Error(`no room ${id}`);
  return found;
};
const isSleepingMat = (prop: InteriorTemplate['props'][number]): boolean => prop.kind === 'mat' && prop.color === '#8d6e63';

describe('an empty home', () => {
  it('shows only fixtures in every rented or owned home with nothing bought', () => {
    for (const layout of Object.values(HOME_LAYOUTS)) {
      for (const [id, furnished] of furnishLayout(layout, [])) {
        const where = `${layout.id}/${id}`;
        expect(furnished.furniture.filter((piece) => !isFixture(piece)).map((piece) => `${where} ${piece.model}`)).toEqual([]);
        expect(furnished.props.filter((prop) => !isFixture(prop) && !isSleepingMat(prop)).map((prop) => `${where} ${prop.kind}`)).toEqual([]);
      }
    }
  });

  it('keeps the kitchen units, sink, bathroom fittings, stairs and the family sign', () => {
    const flat = furnishLayout(FLAT_LAYOUT, []);
    expect(models(roomOf(flat, 'kitchen'))).toEqual(expect.arrayContaining(['kitchenCabinet', 'kitchenSink', 'kitchenCabinetUpper']));
    expect(models(roomOf(flat, 'bedroom'))).toContain('shower');
    const duplex = furnishLayout(DUPLEX_LAYOUT, []);
    expect(propKinds(roomOf(duplex, 'living'))).toEqual(expect.arrayContaining(['stairs', 'sign']));
    expect(propKinds(roomOf(duplex, 'bedroom'))).toContain('stairwell');
    const signed = furnish(HOME_DUPLEX, [], { providedFurniture: false, surname: 'Okafor' });
    expect(signed.props.some((prop) => prop.kind === 'sign' && prop.lines[0] === 'THE OKAFORS')).toBe(true);
    expect(models(roomOf(furnishLayout(MANSION_LAYOUT, []), 'master'))).toEqual(expect.arrayContaining(['bathtub', 'shower']));
    // Curtains are part of the room spec.
    expect(roomOf(flat, 'living').room.curtain).toBeDefined();
  });

  it('is still playable: a mat to sleep on, and nobody sits on furniture that isn’t there', () => {
    for (const layout of Object.values(HOME_LAYOUTS)) {
      for (const furnished of furnishLayout(layout, []).values()) {
        const sleep = furnished.player.sleep;
        if (sleep?.at.length === 3) expect(sleep.at[1], furnished.id).toBeLessThanOrEqual(0.08);
        for (const spot of [...Object.values(furnished.player), ...furnished.guests, ...furnished.npcs]) {
          if (spot && spot.animation !== 'sleep' && spot.animation !== 'pray') expect(spot.stance, `${furnished.id} ${spot.animation}`).not.toBe('sit');
        }
      }
    }
  });

  it('gives every home item in the shop a slot it fills', () => {
    const home: ReadonlySet<ItemCategory> = new Set(['furniture', 'appliances', 'electronics', 'power', 'computers', 'essentials']);
    // In a cupboard, over the bed or on the roof.
    const unseen = new Set(['mosquito-net', 'inverter', 'solar']);
    const missing = ITEMS.filter((item) => home.has(item.category) && !item.unlisted && !unseen.has(item.id) && slotOf(item.id) === null).map((item) => item.id);
    expect(missing).toEqual([]);
  });

  it.each([
    ['desk-study', FLAT_LAYOUT, 'bedroom', ['desk', 'chairDesk']],
    ['lamps-set', FLAT_LAYOUT, 'living', ['lampRoundFloor']],
    ['lamps-set', FLAT_LAYOUT, 'bedroom', ['lampRoundTable']],
    ['microwave', FLAT_LAYOUT, 'kitchen', ['kitchenMicrowave']],
    ['blender', FLAT_LAYOUT, 'kitchen', ['kitchenBlender']],
    ['toaster', FLAT_LAYOUT, 'kitchen', ['toaster']],
    ['coffee-machine', DUPLEX_LAYOUT, 'kitchen', ['kitchenCoffeeMachine']],
    ['bar-set', DUPLEX_LAYOUT, 'living', ['stoolBar']],
    ['bar-set', DUPLEX_LAYOUT, 'kitchen', ['stoolBar']],
    ['home-cinema', MANSION_LAYOUT, 'cinema', ['loungeChairRelax', 'speaker', 'loungeDesignSofa']],
    ['plants-snake', DUPLEX_LAYOUT, 'bedroom', ['pottedPlant']],
    ['tv-32', FLAT_LAYOUT, 'living', ['cabinetTelevision', 'televisionModern']],
    ['sofa-fabric', FLAT_LAYOUT, 'living', ['loungeSofaLong', 'tableCoffeeGlass']],
    ['bed-spring', FLAT_LAYOUT, 'bedroom', ['bedSingle', 'cabinetBedDrawer']],
  ] as const)('shows %s (%s) in its %s', (item, layout, roomId, expected) => {
    const rooms = furnishLayout(layout, [item]);
    expect(models(roomOf(rooms, roomId))).toEqual(expect.arrayContaining([...expected]));
  });

  it.each([
    ['wall-clock', FLAT_LAYOUT, ['living', 'kitchen'], 'wall-clock'],
    ['mirror-standing', FLAT_LAYOUT, ['bedroom'], 'mirror'],
    ['wall-art', FLAT_LAYOUT, ['living', 'kitchen', 'bedroom'], 'sign'],
    ['water-dispenser', FLAT_LAYOUT, ['kitchen'], 'water-dispenser'],
    ['buckets', FLAT_LAYOUT, ['kitchen', 'bedroom'], 'bucket'],
    ['chandelier', DUPLEX_LAYOUT, ['living'], 'chandelier'],
    ['aquarium', MANSION_LAYOUT, ['living'], 'aquarium'],
    ['ac-split', FLAT_LAYOUT, ['bedroom'], 'aircon'],
  ] as const)('shows %s (%s) as a %s', (item, layout, roomIds, kind) => {
    const rooms = furnishLayout(layout, [item]);
    for (const roomId of roomIds) expect(propKinds(roomOf(rooms, roomId)), roomId).toContain(kind);
  });

  it('shows a desk only in the room that has one, so a purchase shows up once', () => {
    const rooms = furnishLayout(FLAT_LAYOUT, ['desk-study']);
    expect(models(roomOf(rooms, 'living'))).not.toContain('desk');
    expect(models(roomOf(rooms, 'kitchen'))).not.toContain('desk');
  });

  it('puts a generator in the face-me room, and none for an inverter', () => {
    for (const gen of ['gen-small', 'gen-diesel']) expect(propKinds(furnish(HOME_FACE_ME, [gen], { providedFurniture: false }))).toContain('generator');
    expect(propKinds(furnish(HOME_FACE_ME, ['inverter'], { providedFurniture: false }))).not.toContain('generator');
  });

  it('brings no bedside drawers with a mattress on the floor, nor a centre table with plastic chairs', () => {
    expect(models(roomOf(furnishLayout(FLAT_LAYOUT, ['bed-foam-mattress']), 'bedroom'))).not.toContain('cabinetBedDrawer');
    expect(models(furnish(HOME_FLAT, ['chairs-plastic'], { providedFurniture: false }))).not.toContain('tableCoffeeGlass');
  });

  it('sets gadgets on the floor when what they stood on isn’t bought yet', () => {
    const laptopY = (owned: readonly string[]) => roomOf(furnishLayout(FLAT_LAYOUT, owned), 'bedroom').furniture.find((piece) => piece.model === 'laptop')?.y ?? 0;
    expect(laptopY(['laptop-hp-uk'])).toBe(0);
    expect(laptopY(['laptop-hp-uk', 'desk-study'])).toBeCloseTo(0.57);
    // The lantern sits on a bedside drawer only when a bed frame brought one.
    const lanternY = (owned: readonly string[]) => roomOf(furnishLayout(FLAT_LAYOUT, owned), 'bedroom').props.find((prop) => prop.kind === 'lantern')?.y ?? 0;
    expect(lanternY(['lantern-rechargeable'])).toBe(0);
    expect(lanternY(['lantern-rechargeable', 'bed-orthopedic'])).toBeCloseTo(0.39);
  });

  it('puts a plate on the table only with food in the kitchen and a table to put it on', () => {
    const plate = (template: InteriorTemplate) => template.props.some((prop) => prop.kind === 'food-plate');
    expect(plate(furnish(HOME_FLAT, ['dining-set'], { providedFurniture: false, pantryMeals: 0 }))).toBe(false);
    expect(plate(furnish(HOME_FLAT, ['dining-set'], { providedFurniture: false, pantryMeals: 14 }))).toBe(true);
    expect(plate(furnish(HOME_FLAT, [], { providedFurniture: false, pantryMeals: 14 }))).toBe(false);
    // The sacks of foodstuff by the cooker follow the pantry as before.
    const kitchen = roomOf(furnishLayout(FLAT_LAYOUT, ['cooker-gas'], { pantryMeals: 80 }), 'kitchen');
    expect(kitchen.props.filter((prop) => prop.kind === 'box' && prop.surface === 'cloth')).toHaveLength(2);
  });
});

describe('provided homes', () => {
  it('keeps the family house furnished: desk, drawers, lamps, posters and clock', () => {
    const family = furnish(HOME_FAMILY, [], { providedFurniture: true });
    expect(models(family)).toEqual(expect.arrayContaining(['bedDouble', 'cabinetBedDrawer', 'lampRoundTable', 'desk', 'chairDesk', 'cabinetTelevision', 'televisionModern', 'bookcaseClosedDoors']));
    expect(propKinds(family)).toEqual(expect.arrayContaining(['sign', 'wall-clock', 'lantern', 'standing-fan']));
    expect(propKinds(family)).not.toContain('mat');
  });

  it('keeps every provided piece of every home template (family flats, duplexes and face-me rooms too)', () => {
    for (const layout of Object.values(HOME_LAYOUTS)) {
      for (const { template } of layout.rooms) {
        const furnished = furnish(template, [], { providedFurniture: true, pantryMeals: 10 });
        expect(furnished.furniture.length, template.id).toBe(template.furniture.length);
        expect(furnished.props.length, template.id).toBeGreaterThanOrEqual(template.props.length);
        // Everything that stood on something still does (nothing authored is set down on the floor).
        expect(furnished.furniture.map((piece) => piece.y ?? 0), template.id).toEqual(template.furniture.map((piece) => piece.y ?? 0));
        expect(furnished.props.slice(0, template.props.length).map((prop) => prop.y ?? 0), template.id).toEqual(template.props.map((prop) => prop.y ?? 0));
      }
    }
  });

  it('keeps the hostel’s bunks, lockers and reading table', () => {
    const hostel = furnish(HOME_HOSTEL, [], { providedFurniture: true });
    expect(models(hostel).filter((model) => model === 'bedBunk')).toHaveLength(2);
    expect(models(hostel)).toEqual(expect.arrayContaining(['bookcaseClosedDoors', 'table', 'chair']));
  });

  it('keeps the family flat’s radio, which a rented flat never gets', () => {
    expect(models(furnish(HOME_FLAT, [], { providedFurniture: true }))).toEqual(expect.arrayContaining(['radio', 'sideTableDrawers']));
    expect(models(furnish(HOME_FLAT, ['sound-system'], { providedFurniture: false }))).not.toContain('radio');
  });
});

describe('a host’s spread', () => {
  it('lays the treats on the dining table at its height', () => {
    const living = furnish(HOME_FLAT, ['dining-set'], { providedFurniture: false, treats: ['suya-platter', 'cake', 'soft-drinks'] });
    const plate = living.props.find((prop) => prop.kind === 'food-plate' && prop.food === 'suya');
    expect(plate?.y).toBeGreaterThan(0.4);
    expect(propKinds(living)).toEqual(expect.arrayContaining(['cake', 'bottles']));
  });

  it('spreads a cloth on the floor of an empty parlour, and leaves kitchens and bedrooms out', () => {
    const rooms = new Map(FLAT_LAYOUT.rooms.map((room) => [room.id, furnish(room.template, [], { providedFurniture: false, treats: ['jollof-chicken'] })]));
    const living = roomOf(rooms, 'living');
    expect(living.props.some((prop) => prop.kind === 'food-plate' && prop.food === 'chicken' && (prop.y ?? 0) < 0.05)).toBe(true);
    expect(living.props.some((prop) => prop.kind === 'mat' && prop.color === '#f4ede0')).toBe(true);
    for (const id of ['kitchen', 'bedroom']) expect(roomOf(rooms, id).props.some((prop) => prop.kind === 'food-plate')).toBe(false);
  });

  it('shows nothing when nothing is out', () => {
    expect(furnish(HOME_FLAT, ['dining-set'], { providedFurniture: false, treats: [] }).props.some((prop) => prop.kind === 'food-plate')).toBe(false);
  });
});
