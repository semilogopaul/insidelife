import { describe, expect, it } from 'vitest';
import { HOME_FAMILY, HOME_FLAT, HOME_MANSION } from '../templates/catalog/homes';
import { furnish } from '../templates/furnish';

const models = (template: { readonly furniture: readonly { readonly model: string }[] }) => template.furniture.map((piece) => piece.model);
const propKinds = (template: { readonly props: readonly { readonly kind: string }[] }) => template.props.map((prop) => prop.kind);

describe('furnish', () => {
  it('shows a new tenant only their starter mattress: no TV, sofas, fridge or AC', () => {
    const flat = furnish(HOME_FLAT, ['bed-foam-mattress', 'phone-tecno-spark'], { providedFurniture: false });
    expect(models(flat)).not.toContain('televisionModern');
    expect(models(flat)).not.toContain('loungeDesignSofa');
    expect(models(flat)).not.toContain('kitchenFridge');
    expect(models(flat)).not.toContain('bedDouble');
    expect(propKinds(flat)).not.toContain('aircon');
    expect(propKinds(flat)).toContain('mattress');
    // Fixed fittings stay.
    expect(models(flat)).toContain('kitchenSink');
    // The sleeper lies on the mattress, not in the air where the bed was.
    expect(flat.player.sleep?.at[1]).toBeCloseTo(0.22);
  });

  it('puts a mat on the floor when you own nothing to sleep on', () => {
    const flat = furnish(HOME_FLAT, [], { providedFurniture: false });
    expect(propKinds(flat)).toContain('mat');
    expect(flat.player.sleep?.at[1]).toBeCloseTo(0.08);
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
