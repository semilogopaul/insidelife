import { CITY_MAP, findVenue, type WorldPoint } from '@insidelife/shared';

/**
 * Doors the player can walk through: every in-city venue, their own home, and the homes of hosts whose invite they
 * accepted. Pure lookups for the context button.
 */

export interface Door {
  readonly locationId: string;
  readonly name: string;
  readonly x: number;
  readonly z: number;
}

const VENUE_DOORS: readonly Door[] = CITY_MAP.lots
  .filter((lot) => lot.kind === 'venue' && lot.venueId && lot.entrance)
  .map((lot) => ({
    locationId: lot.venueId as string,
    name: findVenue(lot.venueId as string)?.name ?? 'this place',
    x: (lot.entrance as NonNullable<typeof lot.entrance>).position.x,
    z: (lot.entrance as NonNullable<typeof lot.entrance>).position.z,
  }));

/** Nearest door within `radius` of a point (private doors — home, a host's — are considered too). */
export function nearestDoor(point: WorldPoint, radius: number, privateDoors: readonly Door[], doors: readonly Door[] = VENUE_DOORS): Door | null {
  let best: Door | null = null;
  let bestDistance = radius * radius;
  const consider = (door: Door): void => {
    const dx = door.x - point.x;
    const dz = door.z - point.z;
    const d = dx * dx + dz * dz;
    if (d <= bestDistance) {
      bestDistance = d;
      best = door;
    }
  };
  for (const door of doors) consider(door);
  for (const door of privateDoors) consider(door);
  return best;
}

/** Context-button label for a door. */
export function doorLabel(door: Door, driving: boolean, home: boolean): string {
  const target = home ? 'home' : door.name;
  return driving ? `Park & enter ${target}` : home ? 'Go inside' : `Enter ${target}`;
}
