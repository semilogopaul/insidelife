import { describe, expect, it } from 'vitest';
import type { CharacterSnapshotDto, NeedProfile, TimelineSegmentDto } from '@insidelife/shared';
import { activityEndRefreshDelayMs, placesDisagree, snapshotPlace, timelinePlace } from './snapshot';

const flat = { target: 50, rate: 0 };
const profile: NeedProfile = { energy: flat, hunger: flat, hygiene: flat, fun: flat, social: flat };
const segment = (kind: TimelineSegmentDto['kind'], startsAt: number, endsAt: number, locationId: string): TimelineSegmentDto => ({
  kind,
  startsAt,
  endsAt,
  locationId,
  label: kind,
  explicit: false,
  profile,
});

function snapshot(locationId: string, timeline: TimelineSegmentDto[], travel: CharacterSnapshotDto['travel'] = null): CharacterSnapshotDto {
  return { asOf: 1000, character: { id: 'me', locationId }, timeline, travel } as unknown as CharacterSnapshotDto;
}

describe('world vs timeline consistency', () => {
  // The owner's screen: UNILAG interior rendered, HUD "Heading to home · 28m left", road audio, needs nearly empty.
  const atUnilag = snapshot('unilag', [segment('idle', 1000, 1100, 'unilag'), segment('commute', 1100, 1160, 'home:me')]);

  it('flags the interior still on screen once the timeline has the character on the road', () => {
    expect(snapshotPlace(atUnilag)).toEqual({ kind: 'inside', locationId: 'unilag' });
    expect(placesDisagree(atUnilag, 1050)).toBe(false);
    expect(timelinePlace(atUnilag, 1120)).toEqual({ kind: 'riding', toLocationId: 'home:me' });
    expect(placesDisagree(atUnilag, 1120)).toBe(true);
  });

  it('flags a ride the timeline says has arrived, and accepts the refetched snapshot', () => {
    const riding = snapshot('unilag', [segment('commute', 1000, 1060, 'home:me'), segment('idle', 1060, 1200, 'home:me')], {
      fromLocationId: 'unilag',
      toLocationId: 'home:me',
      mode: 'danfo',
      departAt: 1000,
      arriveAt: 1060,
      fare: 500,
    });
    expect(placesDisagree(riding, 1030)).toBe(false);
    expect(placesDisagree(riding, 1070)).toBe(true);
    const arrived = snapshot('home:me', [segment('idle', 1070, 1300, 'home:me')]);
    expect(placesDisagree(arrived, 1075)).toBe(false);
  });

  it('treats any street as outside (the player walks between districts between snapshots)', () => {
    const outside = snapshot('street:yaba', [segment('action', 1000, 1030, 'street:surulere')]);
    expect(placesDisagree(outside, 1010)).toBe(false);
  });
});

describe('activityEndRefreshDelayMs', () => {
  it('refreshes just after the activity ends, never in a tight loop', () => {
    expect(activityEndRefreshDelayMs(20_000)).toBe(20_500);
    expect(activityEndRefreshDelayMs(-5_000)).toBe(1_000);
    expect(activityEndRefreshDelayMs(10 ** 12)).toBe(24 * 60 * 60_000);
  });
});
