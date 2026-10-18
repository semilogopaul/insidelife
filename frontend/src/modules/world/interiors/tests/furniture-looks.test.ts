import { describe, expect, it } from 'vitest';
import { FURNITURE_SPECS, findDecorItem, furnitureDecorId } from '@insidelife/shared';
import { furnitureFootprint, propFootprint } from '../walk/colliders';
import { furnitureLook, hasFurnitureLook } from '../templates/furniture-looks';

/** Every look is drawn round its middle: at rot 0 its pieces must stay within the footprint the catalog (and the server's placement check) promise. */
function extent(look: NonNullable<ReturnType<typeof furnitureLook>>): { minX: number; maxX: number; minZ: number; maxZ: number; height: number } {
  const boxes = [...look.furniture.map(furnitureFootprint), ...look.props.map(propFootprint)].filter((box) => box !== null);
  return {
    minX: Math.min(...boxes.map((box) => box.minX)),
    maxX: Math.max(...boxes.map((box) => box.maxX)),
    minZ: Math.min(...boxes.map((box) => box.minZ)),
    maxZ: Math.max(...boxes.map((box) => box.maxZ)),
    height: Math.max(...boxes.map((box) => box.height)),
  };
}

describe('furniture looks', () => {
  const at = { at: [0, 0] as const, rot: 0 };

  it.each(FURNITURE_SPECS.map((spec) => [spec.shopItemId] as const))('draws %s within its catalog footprint and height, in every finish', (id) => {
    const item = findDecorItem(furnitureDecorId(id))!;
    expect(hasFurnitureLook(id)).toBe(true);
    for (const variant of item.variants) {
      const look = furnitureLook(id, at, variant)!;
      expect(look, `${id}/${variant.id}`).not.toBeNull();
      const box = extent(look);
      const [w, d] = item.footprint;
      // The server validates with the catalog footprint: the drawing may not stick out of it by more than a hand.
      expect(box.maxX - box.minX, `${id} width`).toBeLessThanOrEqual(w + 0.12);
      expect(box.maxZ - box.minZ, `${id} depth`).toBeLessThanOrEqual(d + 0.12);
      // …and should fill most of it (a footprint twice the drawing blocks floor for nothing).
      expect((box.maxX - box.minX) * (box.maxZ - box.minZ), `${id} fills it`).toBeGreaterThan(w * d * 0.5);
      expect(box.height, `${id} height`).toBeLessThanOrEqual(item.height + 0.25);
    }
  });

  it('turns with the piece: a quarter turn swaps the footprint', () => {
    const item = findDecorItem(furnitureDecorId('desk-study'))!;
    const look = furnitureLook('desk-study', { at: [2, 1], rot: 90 }, item.variants[0]!)!;
    const box = extent(look);
    expect(box.maxX - box.minX).toBeLessThan(box.maxZ - box.minZ + 0.3);
    expect((box.minX + box.maxX) / 2).toBeCloseTo(2, 0);
    expect((box.minZ + box.maxZ) / 2).toBeCloseTo(1, 0);
  });

  it('gives every function its spot, inside the piece', () => {
    const spotIn = (id: string, key: 'sleep' | 'sit' | 'eat' | 'work' | 'watch', rot = 0) => {
      const item = findDecorItem(furnitureDecorId(id))!;
      const look = furnitureLook(id, { at: [0, 0], rot }, item.variants[0]!)!;
      const spot = look[key];
      expect(spot, `${id} ${key}`).toBeDefined();
      return { spot: spot!, item };
    };
    for (const id of ['bed-foam-mattress', 'bed-spring', 'bed-orthopedic', 'bed-super-king']) {
      const { spot, item } = spotIn(id, 'sleep');
      // Lying on the bed, at its height.
      expect(spot.animation).toBe('sleep');
      expect(spot.at).toHaveLength(3);
      expect(Math.abs(spot.at[0])).toBeLessThan(item.footprint[0] / 2);
      expect(spot.at[1]).toBeGreaterThan(0.2);
    }
    for (const id of ['chairs-plastic', 'sofa-fabric', 'sofa-leather', 'sofa-italian']) expect(spotIn(id, 'sit').spot.stance).toBe('sit');
    expect(spotIn('dining-set', 'eat').spot.animation).toBe('eat');
    expect(spotIn('desk-study', 'work').spot.animation).toBe('type');
    for (const id of ['tv-32', 'tv-55', 'tv-75']) {
      const watch = spotIn(id, 'watch', 90).spot;
      // You watch from in front of it, facing it.
      expect(watch.at[0]).toBeGreaterThan(1);
      expect(watch.rot).toBe(270);
    }
  });

  it('lets a gadget ride on the desk and the TV, and only those', () => {
    const desk = furnitureLook('desk-study', at, findDecorItem(furnitureDecorId('desk-study'))!.variants[0]!)!;
    expect(desk.carry?.y).toBeCloseTo(0.57);
    const tv = furnitureLook('tv-55', at, findDecorItem(furnitureDecorId('tv-55'))!.variants[0]!)!;
    expect(tv.carry).toBeDefined();
    const bed = furnitureLook('bed-spring', at, findDecorItem(furnitureDecorId('bed-spring'))!.variants[0]!)!;
    expect(bed.carry).toBeUndefined();
  });

  it('refuses things that are not movable furniture', () => {
    expect(furnitureLook('fridge-double', at, findDecorItem(furnitureDecorId('bed-spring'))!.variants[0]!)).toBeNull();
    expect(hasFurnitureLook('ac-split')).toBe(false);
  });
});
