import { AD_VIEW_MAX_AGE_MS, AD_VIEW_RADIUS_METRES, MAX_PLAUSIBLE_SPEED, adSpotGeometry, type AdSpotGeometry } from '@insidelife/shared';
import { judgeView, VIEW_REPORTS_PER_MINUTE, VIEW_SLACK_METRES, viewsAllowed, type ViewerState } from './views.rules.js';

const NOW = Date.parse('2026-10-09T12:00:00Z');
const board = adSpotGeometry('third-mainland-north') as AdSpotGeometry;
const ahead = (metres: number) => ({ x: board.position.x + Math.cos(board.facing) * metres, z: board.position.z + Math.sin(board.facing) * metres });
const onStreet = (fix: ViewerState['fix']): ViewerState => ({ locationId: 'street:yaba', riding: false, fix, ride: null });
const street = (viewer: ViewerState, seenAt = NOW) => judgeView({ surface: 'street', spot: board, seenAt, now: NOW, viewer });

describe('ad views: is it plausible?', () => {
  it('counts a player whose last accepted position is in view of the board', () => {
    expect(street(onStreet({ ...ahead(20), at: NOW - 1_000, mode: 'walk' }))).toBe('count');
  });

  it('allows for how far they could have walked or driven since that position', () => {
    const walkReach = AD_VIEW_RADIUS_METRES + MAX_PLAUSIBLE_SPEED.walk * 10 + VIEW_SLACK_METRES;
    expect(street(onStreet({ ...ahead(walkReach - 1), at: NOW - 10_000, mode: 'walk' }))).toBe('count');
    expect(street(onStreet({ ...ahead(walkReach + 5), at: NOW - 10_000, mode: 'walk' }))).toBe('too-far');
    // The same distance is fine in a car (40 m/s at most).
    expect(street(onStreet({ ...ahead(walkReach + 5), at: NOW - 10_000, mode: 'car' }))).toBe('count');
  });

  it('refuses a script claiming boards across town', () => {
    expect(street(onStreet({ x: board.position.x + 600, z: board.position.z + 300, at: NOW - 2_000, mode: 'car' }))).toBe('too-far');
  });

  it('refuses players with no position in the city (indoors, offline, never outside)', () => {
    expect(street({ locationId: 'unilag', riding: false, fix: null, ride: null })).toBe('not-there');
  });

  it('counts passengers whose ride passes the board, not others', () => {
    const route = [ahead(15), { x: ahead(15).x + 200, z: ahead(15).z }];
    expect(street({ locationId: 'unilag', riding: true, fix: null, ride: route })).toBe('count');
    const elsewhere = [{ x: board.position.x + 400, z: board.position.z + 400 }, { x: board.position.x + 600, z: board.position.z + 400 }];
    expect(street({ locationId: 'unilag', riding: true, fix: null, ride: elsewhere })).toBe('too-far');
  });

  it('refuses stale or future views', () => {
    const viewer = onStreet({ ...ahead(10), at: NOW, mode: 'walk' });
    expect(street(viewer, NOW - AD_VIEW_MAX_AGE_MS - 1)).toBe('stale');
    expect(street(viewer, NOW + 60_000)).toBe('stale');
    expect(street(viewer, Number.NaN)).toBe('stale');
  });

  it('counts Lagos TV only indoors, and phone apps for any signed-in player', () => {
    const tv = (viewer: ViewerState) => judgeView({ surface: 'tv', spot: null, seenAt: NOW, now: NOW, viewer });
    expect(tv({ locationId: 'home:abc', riding: false, fix: null, ride: null })).toBe('count');
    expect(tv({ locationId: 'yaba-left-joint', riding: false, fix: null, ride: null })).toBe('count');
    expect(tv({ locationId: 'street:yaba', riding: false, fix: null, ride: null })).toBe('not-there');
    expect(tv({ locationId: 'unilag', riding: true, fix: null, ride: null })).toBe('not-there');
    expect(judgeView({ surface: 'phone', spot: null, seenAt: NOW, now: NOW, viewer: onStreet(null) })).toBe('count');
  });

  it('rate-limits reports per player per minute', () => {
    expect(viewsAllowed(0, 32)).toBe(32);
    expect(viewsAllowed(50, 32)).toBe(VIEW_REPORTS_PER_MINUTE - 50);
    expect(viewsAllowed(VIEW_REPORTS_PER_MINUTE, 5)).toBe(0);
    expect(viewsAllowed(200, 5)).toBe(0);
  });
});
