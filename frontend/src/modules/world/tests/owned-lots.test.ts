import { NO_EXTERIOR, findGateColour, findHousePaint, homeEntrance, homeKey, type OwnedPropertyMarkerDto } from '@insidelife/shared';
import { describe, expect, it } from 'vitest';
import { ownedLots, withOwnedLots } from '../city/layout/owned-lots';
import { cityPlan } from '../city/layout/placements';
import { buildOwnedGeometry } from '../city/render/owned-geometry';

const marker = (
  id: string,
  stage: OwnedPropertyMarkerDto['stage'],
  extra: Partial<OwnedPropertyMarkerDto> = {},
): OwnedPropertyMarkerDto => ({
  id,
  districtId: 'lekki',
  label: `Plot ${id}`,
  stage,
  blueprintId: stage === 'land' ? null : 'duplex',
  livedIn: false,
  exterior: NO_EXTERIOR,
  ...extra,
});

const insideLot = (
  lot: { footprint: { minX: number; minZ: number; maxX: number; maxZ: number } },
  x: number,
  z: number,
): boolean =>
  x > lot.footprint.minX && x < lot.footprint.maxX && z > lot.footprint.minZ && z < lot.footprint.maxZ;

describe('owned lots', () => {
  const base = cityPlan();

  it('leaves the city untouched when you own nothing', () => {
    expect(withOwnedLots(base, ownedLots([]))).toBe(base);
  });

  it('clears the generic house on your lot and puts your own walls, gate and house there', () => {
    const owned = ownedLots([marker('a', 'built')]);
    const [{ lot }] = owned as [(typeof owned)[number]];
    const plan = withOwnedLots(base, owned);
    for (const placement of [...plan.placements.commercial, ...plan.placements.suburban])
      expect(insideLot(lot, placement.x, placement.z)).toBe(false);
    expect(plan.gates.filter((gate) => insideLot(lot, gate.x, gate.z))).toHaveLength(1);
    expect(
      plan.walls.filter((wall) => insideLot(lot, (wall.x0 + wall.x1) / 2, (wall.z0 + wall.z1) / 2)),
    ).toHaveLength(5);
    const bodies = plan.colliders.filter((box) =>
      insideLot(lot, (box.minX + box.maxX) / 2, (box.minZ + box.maxZ) / 2),
    );
    expect(bodies).toHaveLength(1);
    expect(bodies[0]!.height).toBeGreaterThan(6);
    // The front door spot stays outside everything solid.
    const door = lot.entrance!.position;
    for (const box of plan.colliders)
      expect(door.x > box.minX && door.x < box.maxX && door.z > box.minZ && door.z < box.maxZ).toBe(false);
  });

  it('keeps bare land open and walkable', () => {
    const owned = ownedLots([marker('b', 'land')]);
    const [{ lot }] = owned as [(typeof owned)[number]];
    const plan = withOwnedLots(base, owned);
    expect(
      plan.colliders.some((box) => insideLot(lot, (box.minX + box.maxX) / 2, (box.minZ + box.maxZ) / 2)),
    ).toBe(false);
    expect(plan.walls.some((wall) => insideLot(lot, wall.x0, wall.z0))).toBe(false);
  });

  it('returns the same lots and plan while nothing you own changes', () => {
    const first = ownedLots([marker('c', 'construction')]);
    const again = ownedLots([marker('c', 'construction')]);
    expect(again).toBe(first);
    expect(withOwnedLots(base, again)).toBe(withOwnedLots(base, first));
    expect(ownedLots([marker('c', 'built')])).not.toBe(first);
  });

  it('gives each of your properties its own lot, the one you live in on your front door', () => {
    const properties = Array.from({ length: 12 }, (_, i) =>
      marker(`p${i}`, i % 3 === 0 ? 'land' : 'built', { livedIn: i === 5 }),
    );
    const owned = ownedLots(properties);
    expect(owned).toHaveLength(12);
    expect(new Set(owned.map(({ lot }) => lot.id)).size).toBe(12);
    const home = owned.find(({ property }) => property.livedIn);
    expect(home?.lot.entrance).toEqual(homeEntrance(homeKey('me', 'p5'), 'lekki'));
  });

  it('paints the fence and gate in the owner’s colours', () => {
    const owned = ownedLots([marker('painted', 'built', { exterior: { paint: 'sky', roof: 'charcoal', gate: 'gold', name: 'Ada Villa' } })]);
    const [{ lot }] = owned as [(typeof owned)[number]];
    const plan = withOwnedLots(base, owned);
    const walls = plan.walls.filter((wall) => insideLot(lot, (wall.x0 + wall.x1) / 2, (wall.z0 + wall.z1) / 2));
    expect(new Set(walls.map((wall) => wall.color))).toEqual(new Set([Number.parseInt(findHousePaint('sky')!.hex.slice(1), 16)]));
    expect(plan.gates.find((gate) => insideLot(lot, gate.x, gate.z))?.color).toBe(Number.parseInt(findGateColour('gold')!.hex.slice(1), 16));
    const { signs } = buildOwnedGeometry(owned, { firstName: 'Ada', lastName: 'Obi' });
    expect(signs.find((sign) => sign.kind === 'plate')?.lines[0]).toBe('ADA VILLA');
  });

  it('builds every blueprint and stage with its signs', () => {
    const properties = [
      marker('l', 'land'),
      marker('s', 'construction', { blueprintId: 'block-of-flats' }),
      ...(['bungalow', 'duplex', 'block-of-flats', 'mansion'] as const).map((blueprintId) =>
        marker(blueprintId, 'built', { blueprintId }),
      ),
    ];
    const { geometry, signs } = buildOwnedGeometry(ownedLots(properties), {
      firstName: 'Ada',
      lastName: 'Obi',
    });
    expect(geometry?.getAttribute('color')).toBeDefined();
    expect(signs.map((sign) => sign.kind)).toEqual(expect.arrayContaining(['land', 'site', 'plate', 'wall']));
    expect(signs.find((sign) => sign.kind === 'plate')?.lines[0]).toMatch(/^OBI /);
    geometry?.dispose();
  });
});
