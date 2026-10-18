import { describe, expect, it } from 'vitest';
import { ITEMS, type ItemCategory } from '@insidelife/shared';
import { DUPLEX_LAYOUT, FLAT_LAYOUT, HOME_LAYOUTS, MANSION_LAYOUT } from '../layouts/catalog';
import { FLAT_BEDROOM } from '../templates/catalog/home-rooms';
import { HOME_DUPLEX, HOME_FACE_ME, HOME_FAMILY, HOME_FLAT, HOME_HOSTEL } from '../templates/catalog/homes';
import { furnish, isFixture, slotOf } from '../templates/furnish';
import { furnishedHome } from './furnished-home';
import type { InteriorTemplate } from '../templates/types';
import type { HomeLayout } from '../layouts/types';

const models = (template: { readonly furniture: readonly { readonly model: string }[] }) => template.furniture.map((piece) => piece.model);
const propKinds = (template: { readonly props: readonly { readonly kind: string }[] }) => template.props.map((prop) => prop.kind);

describe('furnish', () => {
  const propsOf = (home: ReturnType<typeof furnishedHome>) => [...home.rooms.values()].flatMap((room) => room.props);
  const furnitureOf = (home: ReturnType<typeof furnishedHome>) => [...home.rooms.values()].flatMap((room) => room.furniture);
  const roomModels = (home: ReturnType<typeof furnishedHome>, roomId: string) => models(home.rooms.get(roomId)!);

  it('shows a new tenant only their starter mattress: no TV, sofas, fridge or AC', () => {
    const flat = furnishedHome('home-flat', ['bed-foam-mattress'], ['phone-tecno-spark']);
    expect(models({ furniture: furnitureOf(flat) })).not.toContain('televisionModern');
    expect(models({ furniture: furnitureOf(flat) })).not.toContain('loungeDesignSofa');
    expect(models({ furniture: furnitureOf(flat) })).not.toContain('kitchenFridge');
    expect(models({ furniture: furnitureOf(flat) })).not.toContain('bedDouble');
    expect(propKinds({ props: propsOf(flat) })).not.toContain('aircon');
    const bedroom = flat.rooms.get('bedroom')!;
    expect(propKinds(bedroom)).toContain('mattress');
    // Fixed fittings stay.
    expect(models({ furniture: furnitureOf(flat) })).toContain('kitchenSink');
    // The sleeper lies on the mattress, not in the air where the bed was.
    expect(bedroom.player.sleep?.at[1]).toBeCloseTo(0.22);
    expect(flat.home.sleep).toMatchObject({ roomId: 'bedroom' });
  });

  it('puts a mat on the floor where the bed would be when you own nothing to sleep on', () => {
    const bedroom = furnishedHome('home-flat', []).rooms.get('bedroom')!;
    const bed = FLAT_BEDROOM.furniture.find((piece) => piece.slot === 'bed');
    expect(bedroom.props.some((prop) => prop.kind === 'mat' && prop.at[0] === bed?.at[0] && prop.at[1] === bed?.at[1])).toBe(true);
    expect(bedroom.player.sleep?.at[1]).toBeCloseTo(0.08);
  });

  it('puts a bed where you stand it: a better bed beside the old one, each sleeping at its own height', () => {
    const flat = furnishedHome('home-flat', ['bed-foam-mattress', 'bed-orthopedic']);
    const bedroom = flat.rooms.get('bedroom')!;
    expect(propKinds(bedroom)).toContain('mattress');
    expect(models(bedroom)).toContain('bedDouble');
    // The best bed is the one you sleep in.
    expect(flat.home.sleep?.itemId).toBe('home-bed-orthopedic');
    expect(bedroom.player.sleep?.at[1]).toBeCloseTo(0.4);
    // No mat under or beside them: there is a bed.
    expect(bedroom.props.some((prop) => prop.kind === 'mat' && prop.color === '#8d6e63')).toBe(false);
  });

  it('puts each thing you buy in its room: the fridge in the kitchen, the bed and AC in the bedroom, the TV in the living room', () => {
    const flat = furnishedHome('home-flat', ['bed-orthopedic', 'tv-55'], ['fridge-tabletop', 'ac-split', 'ps5']);
    expect(roomModels(flat, 'kitchen')).toContain('kitchenFridgeSmall');
    expect(roomModels(flat, 'bedroom')).toContain('bedDouble');
    expect(propKinds(flat.rooms.get('bedroom')!)).toContain('aircon');
    expect(roomModels(flat, 'living')).toContain('televisionModern');
    // The console sits by the TV, and nothing turns up twice.
    expect(flat.rooms.get('living')?.props.some((prop) => prop.kind === 'box' && prop.color === '#f4f4f4')).toBe(true);
    expect(models({ furniture: furnitureOf(flat) }).filter((model) => model.startsWith('kitchenFridge'))).toHaveLength(1);
    expect(propKinds({ props: propsOf(flat) }).filter((kind) => kind === 'aircon')).toHaveLength(1);
  });

  it('has nobody sitting on air: without the sofa you stand, with it you sit', () => {
    const bare = furnishedHome('home-flat', []).rooms.get('living')!;
    expect(bare.player.sit).toBeUndefined();
    const furnished = furnishedHome('home-flat', ['sofa-italian']).rooms.get('living')!;
    expect(furnished.player.sit?.stance).toBe('sit');
    // A home you rent or own has no strangers in it; the family house keeps the family.
    expect(bare.npcs).toEqual([]);
    expect(furnish(HOME_FAMILY, [], { providedFurniture: true }).npcs).toHaveLength(HOME_FAMILY.npcs.length);
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
    const mansion = furnishedHome('home-mansion', ['tv-32', 'sofa-fabric'], ['ps5']);
    const tv = furnitureOf(mansion).find((piece) => piece.model === 'televisionModern');
    expect(tv?.scale).toBeCloseTo(0.8);
    expect(models({ furniture: furnitureOf(mansion) })).toContain('loungeSofaLong');
    expect(models({ furniture: furnitureOf(mansion) })).not.toContain('loungeDesignSofa');
    expect(propsOf(mansion).some((prop) => prop.kind === 'box' && prop.color === '#f4f4f4')).toBe(true);
  });

  it('shows the biggest pieces as themselves: a 75" TV, the Italian set, the dining set with its chairs', () => {
    const mansion = furnishedHome('home-mansion', ['sofa-italian', 'tv-75', 'dining-set']);
    expect(furnitureOf(mansion).find((piece) => piece.model === 'televisionModern')?.scale).toBeCloseTo(1.5);
    expect(models({ furniture: furnitureOf(mansion) })).toEqual(expect.arrayContaining(['loungeDesignSofa', 'loungeChairRelax']));
    expect(models({ furniture: furnitureOf(mansion) }).filter((model) => model === 'chairModernCushion')).toHaveLength(4);
  });

  it('leaves the family house exactly as it is: its furniture stays put and yours waits for a place of your own', () => {
    const family = furnish(HOME_FAMILY, ['bed-foam-mattress', 'tv-55', 'bed-spring', 'sofa-leather'], { providedFurniture: true });
    const plain = furnish(HOME_FAMILY, [], { providedFurniture: true });
    expect(models(family)).toEqual(models(plain));
    expect(models(family)).toContain('bedDouble');
    expect(models(family)).not.toContain('bedSingle');
    expect(family.furniture.find((piece) => piece.model === 'televisionModern')?.scale).toBeCloseTo(0.85);
  });

  it('still lets your gadgets and appliances replace theirs in a furnished house', () => {
    const family = furnish(HOME_FAMILY, ['fan-standing', 'lantern-rechargeable'], { providedFurniture: true });
    expect(propKinds(family)).toEqual(expect.arrayContaining(['standing-fan', 'lantern']));
  });

  it('keeps the hostel’s bunk whatever bed you own', () => {
    const hostel = furnish(HOME_HOSTEL, ['bed-orthopedic'], { providedFurniture: true });
    expect(models(hostel).filter((model) => model === 'bedBunk')).toHaveLength(2);
    expect(models(hostel)).not.toContain('bedDouble');
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
    expect(models(roomOf(flat, 'bathroom'))).toEqual(expect.arrayContaining(['shower', 'toilet', 'bathroomSink']));
    const duplex = furnishLayout(DUPLEX_LAYOUT, []);
    expect(propKinds(roomOf(duplex, 'living'))).toEqual(expect.arrayContaining(['stairs', 'sign']));
    expect(propKinds(roomOf(duplex, 'bedroom'))).toContain('stairwell');
    const signed = furnish(HOME_DUPLEX, [], { providedFurniture: false, surname: 'Okafor' });
    expect(signed.props.some((prop) => prop.kind === 'sign' && prop.lines[0] === 'THE OKAFORS')).toBe(true);
    expect(models(roomOf(furnishLayout(MANSION_LAYOUT, []), 'bathroom'))).toEqual(expect.arrayContaining(['bathtub', 'shower', 'toilet']));
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
    ['lamps-set', FLAT_LAYOUT, 'living', ['lampRoundFloor']],
    ['lamps-set', FLAT_LAYOUT, 'bedroom', ['lampRoundTable']],
    ['microwave', FLAT_LAYOUT, 'kitchen', ['kitchenMicrowave']],
    ['blender', FLAT_LAYOUT, 'kitchen', ['kitchenBlender']],
    ['toaster', FLAT_LAYOUT, 'kitchen', ['toaster']],
    ['coffee-machine', DUPLEX_LAYOUT, 'kitchen', ['kitchenCoffeeMachine']],
    ['bar-set', DUPLEX_LAYOUT, 'living', ['stoolBar']],
    ['bar-set', DUPLEX_LAYOUT, 'kitchen', ['stoolBar']],
    ['home-cinema', MANSION_LAYOUT, 'cinema', ['loungeChairRelax', 'speaker', 'loungeDesignSofa']],
  ] as const)('shows %s (%s) in its %s', (item, layout, roomId, expected) => {
    const rooms = furnishLayout(layout, [item]);
    expect(models(roomOf(rooms, roomId))).toEqual(expect.arrayContaining([...expected]));
  });

  it.each([
    ['wall-clock', FLAT_LAYOUT, ['living', 'kitchen'], 'wall-clock'],
    ['mirror-standing', FLAT_LAYOUT, ['bedroom'], 'mirror'],
    ['wall-art', FLAT_LAYOUT, ['living', 'kitchen', 'bedroom'], 'sign'],
    ['water-dispenser', FLAT_LAYOUT, ['kitchen'], 'water-dispenser'],
    ['buckets', FLAT_LAYOUT, ['kitchen', 'bathroom'], 'bucket'],
    ['chandelier', DUPLEX_LAYOUT, ['living'], 'chandelier'],
    ['aquarium', MANSION_LAYOUT, ['living'], 'aquarium'],
    ['ac-split', FLAT_LAYOUT, ['bedroom'], 'aircon'],
  ] as const)('shows %s (%s) as a %s', (item, layout, roomIds, kind) => {
    const rooms = furnishLayout(layout, [item]);
    for (const roomId of roomIds) expect(propKinds(roomOf(rooms, roomId)), roomId).toContain(kind);
  });

  it.each([
    ['desk-study', 'home-flat', 'bedroom', ['desk', 'chairDesk']],
    ['plants-snake', 'home-duplex', 'living', ['pottedPlant']],
    ['tv-32', 'home-flat', 'living', ['cabinetTelevision', 'televisionModern']],
    ['sofa-fabric', 'home-flat', 'living', ['loungeSofaLong']],
    ['bed-spring', 'home-flat', 'bedroom', ['bedSingle']],
    ['wardrobe-wooden', 'home-flat', 'bedroom', ['bookcaseClosedWide']],
    ['dining-set', 'home-flat', 'kitchen', ['tableCross', 'chairModernCushion']],
    ['rug-persian', 'home-duplex', 'living', ['rugRectangle']],
  ] as const)('shows the %s you bought (%s) in its %s', (item, template, roomId, expected) => {
    const home = furnishedHome(template, [item]);
    expect(models(home.rooms.get(roomId)!)).toEqual(expect.arrayContaining([...expected]));
  });

  it('shows a desk only in the room that has it, so a purchase shows up once', () => {
    const home = furnishedHome('home-flat', ['desk-study']);
    expect(models(home.rooms.get('living')!)).not.toContain('desk');
    expect(models(home.rooms.get('kitchen')!)).not.toContain('desk');
    expect(models(home.rooms.get('bedroom')!).filter((model) => model === 'desk')).toHaveLength(1);
  });

  it('keeps the fitted appliances where the building put them even when the furniture moves', () => {
    const home = furnishedHome('home-mansion', [{ item: 'dining-set', room: 'living' }], ['fridge-double', 'cooker-gas']);
    expect(models(home.rooms.get('kitchen')!)).toEqual(expect.arrayContaining(['kitchenFridgeLarge', 'kitchenStove']));
  });

  it('puts a generator in the face-me room, and none for an inverter', () => {
    for (const gen of ['gen-small', 'gen-diesel']) expect(propKinds(furnish(HOME_FACE_ME, [gen], { providedFurniture: false }))).toContain('generator');
    expect(propKinds(furnish(HOME_FACE_ME, ['inverter'], { providedFurniture: false }))).not.toContain('generator');
  });

  it('sets gadgets on the floor when what they stood on isn’t bought yet, and on the desk when it is', () => {
    const laptopY = (bring: readonly string[]) => furnishedHome('home-flat', bring, ['laptop-hp-uk']).rooms.get('bedroom')!.furniture.find((piece) => piece.model === 'laptop')?.y ?? 0;
    expect(laptopY([])).toBe(0);
    expect(laptopY(['desk-study'])).toBeCloseTo(0.57);
    // A desk in the living room carries the laptop there, and not also in the bedroom.
    const moved = furnishedHome('home-flat', [{ item: 'desk-study', room: 'living' }], ['laptop-hp-uk']);
    expect(moved.rooms.get('living')!.furniture.find((piece) => piece.model === 'laptop')?.y).toBeCloseTo(0.57);
    expect(models(moved.rooms.get('bedroom')!)).not.toContain('laptop');
  });

  it('puts a plate on the table only with food in the kitchen and a table to put it on', () => {
    const plate = (template: InteriorTemplate) => template.props.some((prop) => prop.kind === 'food-plate');
    const withMeals = (meals: number, bring: readonly string[]) => furnishedHome('home-flat', bring, [], { pantryMeals: meals }).rooms.get('kitchen')!;
    expect(plate(withMeals(0, ['dining-set']))).toBe(false);
    expect(plate(withMeals(14, ['dining-set']))).toBe(true);
    expect(plate(withMeals(14, []))).toBe(false);
    // No plate floating in the parlour where the table used to be.
    expect(plate(furnishedHome('home-flat', ['dining-set'], [], { pantryMeals: 14 }).rooms.get('living')!)).toBe(false);
    // The sacks of foodstuff by the cooker follow the pantry as before.
    const kitchen = roomOf(furnishLayout(FLAT_LAYOUT, ['cooker-gas'], { pantryMeals: 80 }), 'kitchen');
    expect(kitchen.props.filter((prop) => prop.kind === 'box' && prop.surface === 'cloth')).toHaveLength(2);
  });

  it('counts a decor bed as a bed you can sleep on', () => {
    const home = furnishedHome('home-flat', ['bed-royal-gold']);
    expect(home.home.sleep).toMatchObject({ itemId: 'bed-royal-gold', roomId: 'bedroom', quality: 0.9 });
    const bedroom = home.rooms.get('bedroom')!;
    expect(bedroom.player.sleep?.at[1]).toBeCloseTo(0.6);
    expect(bedroom.things?.some((thing) => thing.kind === 'bed')).toBe(true);
    expect(bedroom.props.some((prop) => prop.kind === 'mat' && prop.color === '#8d6e63')).toBe(false);
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
  it('lays the treats on the table you eat at, in whatever room it stands, at its height', () => {
    const home = furnishedHome('home-flat', ['dining-set'], [], { treats: ['suya-platter', 'cake', 'soft-drinks'] });
    const kitchen = home.rooms.get('kitchen')!;
    const plate = kitchen.props.find((prop) => prop.kind === 'food-plate' && prop.food === 'suya');
    expect(plate?.y).toBeGreaterThan(0.4);
    expect(propKinds(kitchen)).toEqual(expect.arrayContaining(['cake', 'bottles']));
    expect(home.rooms.get('living')!.props.some((prop) => prop.kind === 'food-plate')).toBe(false);
  });

  it('spreads a cloth on the floor of an empty parlour, and leaves kitchens and bedrooms out', () => {
    const rooms = new Map(FLAT_LAYOUT.rooms.map((room) => [room.id, furnish(room.template, [], { providedFurniture: false, treats: ['jollof-chicken'] })]));
    const living = roomOf(rooms, 'living');
    expect(living.props.some((prop) => prop.kind === 'food-plate' && prop.food === 'chicken' && (prop.y ?? 0) < 0.05)).toBe(true);
    expect(living.props.some((prop) => prop.kind === 'mat' && prop.color === '#f4ede0')).toBe(true);
    for (const id of ['kitchen', 'bedroom']) expect(roomOf(rooms, id).props.some((prop) => prop.kind === 'food-plate')).toBe(false);
  });

  it('shows nothing when nothing is out', () => {
    expect(furnishedHome('home-flat', ['dining-set'], [], { treats: [] }).rooms.get('kitchen')!.props.some((prop) => prop.kind === 'food-plate')).toBe(false);
  });
});
