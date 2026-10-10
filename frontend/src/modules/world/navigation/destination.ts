import {
  adViewingPoint,
  findAdSlot,
  findVenue,
  homeEntrance,
  homeKey,
  homeLocationId,
  venueEntrance,
  type CharacterSnapshotDto,
  type DistrictId,
  type Entrance,
  type VisitsDto,
} from '@insidelife/shared';
import { adSlotOfDestination } from '@/common/promotions/ad-focus';
import { ownedLots } from '../city/layout/owned-lots';

/** Where the GPS is leading: a door, or the spot in front of an ad board ("See it in Lagos"). */
export interface Destination {
  readonly id: string;
  readonly name: string;
  readonly entrance: Entrance;
  /** Set for `ad:<slotId>` destinations: the board to highlight on arrival. */
  readonly adSlotId?: string;
}

/**
 * Resolves a navigation destination id to a door: venues, the player's own home, `property:<id>` they own, the home of
 * a host whose invite they accepted, or `ad:<slotId>` — the viewing point in front of an ad board (on the road, facing
 * it; `adViewingPoint`).
 */
export function resolveDestination(id: string, name: string | null, snapshot: CharacterSnapshotDto | undefined, visits?: VisitsDto): Destination | null {
  const adSlotId = adSlotOfDestination(id);
  if (adSlotId) {
    const view = adViewingPoint(adSlotId);
    if (!view) return null;
    const parking = { x: view.position.x, z: view.position.z, heading: view.heading };
    return { id, name: name ?? findAdSlot(adSlotId)?.name ?? 'the billboard', entrance: { position: view.position, heading: view.heading, parking }, adSlotId };
  }
  if (snapshot && id === homeLocationId(snapshot.character.id)) {
    return { id, name: name ?? 'home', entrance: homeEntrance(homeKey(snapshot.character.id, snapshot.character.homePropertyId), snapshot.character.homeDistrictId as DistrictId) };
  }
  const owned = snapshot ? ownedLots(snapshot.summary.properties).find(({ property }) => `property:${property.id}` === id) : undefined;
  if (owned?.lot.entrance) return { id, name: name ?? owned.property.label, entrance: owned.lot.entrance };
  const visit = visits?.incoming.find((candidate) => candidate.home.locationId === id && candidate.status === 'accepted');
  if (visit) return { id, name: name ?? `${visit.host.firstName}’s place`, entrance: visit.home.entrance };
  const entrance = venueEntrance(id);
  if (!entrance) return null;
  return { id, name: name ?? findVenue(id)?.name ?? 'your destination', entrance };
}
