import { describe, expect, it } from 'vitest';
import { FLAT_LAYOUT, HOME_LAYOUTS } from '../layouts/catalog';
import { FLAT_BEDROOM } from '../templates/catalog/home-rooms';
import { HOME_FAMILY, HOME_MANSION } from '../templates/catalog/homes';
import { furnish } from '../templates/furnish';
import type { InteriorTemplate } from '../templates/types';

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
