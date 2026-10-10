import { AD_PLACEMENTS, BILLBOARD_SLOT_IDS, adSpotGeometry, adViewingPoint, canViewAdFrom, findAdSlot, findRoute, venueEntrance } from '@insidelife/shared';
import { describe, expect, it } from 'vitest';
import { adDestinationId } from '@/common/promotions/ad-focus';
import { resolveDestination } from '../navigation/destination';

describe('"See it in Lagos" GPS destinations', () => {
  it('leads to the viewing point in front of a premium board, named after the slot', () => {
    const slotId = 'third-mainland-north';
    const destination = resolveDestination(adDestinationId(slotId), null, undefined);
    const view = adViewingPoint(slotId)!;
    expect(destination).not.toBeNull();
    expect(destination!.adSlotId).toBe(slotId);
    expect(destination!.name).toBe(findAdSlot(slotId)!.name);
    expect(destination!.entrance.position).toEqual(view.position);
    expect(destination!.entrance.heading).toBe(view.heading);
    // Standing there you can see the board, and the GPS can route there from a venue door.
    expect(canViewAdFrom(adSpotGeometry(slotId)!, destination!.entrance.position)).toBe(true);
    expect(findRoute(venueEntrance('unilag')!.position, destination!.entrance.position)).not.toBeNull();
  });

  it('resolves every premium board and a sample of street spots, and keeps a name the caller gives', () => {
    const sample = [...BILLBOARD_SLOT_IDS, ...AD_PLACEMENTS.filter((_, index) => index % 50 === 0).map((spot) => spot.id)];
    for (const slotId of sample) {
      const destination = resolveDestination(adDestinationId(slotId), null, undefined);
      expect(destination, slotId).not.toBeNull();
      expect(canViewAdFrom(adSpotGeometry(slotId)!, destination!.entrance.position), slotId).toBe(true);
    }
    const spot = AD_PLACEMENTS[0]!;
    expect(resolveDestination(adDestinationId(spot.id), 'Herbert Macaulay bus shelter', undefined)?.name).toBe('Herbert Macaulay bus shelter');
  });

  it('refuses ads without a place in the city and unknown slots; venues still resolve', () => {
    expect(resolveDestination(adDestinationId('lagos-tv'), null, undefined)).toBeNull();
    expect(resolveDestination(adDestinationId('no-such-board'), null, undefined)).toBeNull();
    expect(resolveDestination('ad:', null, undefined)).toBeNull();
    const venue = resolveDestination('unilag', null, undefined);
    expect(venue?.entrance).toEqual(venueEntrance('unilag'));
    expect(venue?.adSlotId).toBeUndefined();
  });
});
