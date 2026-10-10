import type { Repository } from 'typeorm';
import { clubPlayVenues, clubSongGuarantee, type GameClockConfig } from '@insidelife/shared';
import type { WorldService } from '../world/world.service.js';
import { ClubScheduleService } from './club-schedule.service.js';
import type { ClubPlayOrderEntity } from './entities/club-play-order.entity.js';
import type { ClubTrackEntity } from './entities/club-track.entity.js';

const clock: GameClockConfig = { epochRealMs: Date.parse('2026-09-01T00:00:00Z'), epochGameMinute: 360, scale: 120 };
const world = { clock, seed: 'eko-o-ni-baje', now: () => 0 } as unknown as WorldService;
const NOW = Date.parse('2026-10-09T20:00:00Z');

const order = (patch: Partial<ClubPlayOrderEntity>): ClubPlayOrderEntity =>
  ({
    id: 'order-1',
    trackId: 'track-1',
    ownerUserId: 'user-1',
    ownerCharacterId: 'char-1',
    status: 'live',
    startDate: '2026-10-09',
    endDate: '2026-10-16',
    lane: 4,
    paidAt: new Date('2026-10-08T10:00:00Z'),
    reviewedAt: null,
    ...patch,
  }) as ClubPlayOrderEntity;

const track = { id: 'track-1', artistName: 'Ayo', title: 'Eko Love', audioUrl: '/media/tracks/a.mp3', contentType: 'audio/mpeg', durationSeconds: 150, removedAt: null } as ClubTrackEntity;

function service(orders: ClubPlayOrderEntity[]): ClubScheduleService {
  const orderRepo = { find: async () => orders } as unknown as Repository<ClubPlayOrderEntity>;
  const trackRepo = { find: async () => [track] } as unknown as Repository<ClubTrackEntity>;
  return new ClubScheduleService(world, orderRepo, trackRepo);
}

describe('ClubScheduleService', () => {
  it('publishes the same times to the clubs’ audio as the song page shows', async () => {
    const schedule = service([order({})]);
    const { upcoming } = await schedule.playsOf(order({}), track, 6, NOW);
    expect(upcoming).toHaveLength(6);
    for (const play of upcoming) {
      const feed = await schedule.schedule(play.venueId, play.startsAtMs - 60_000);
      const inFeed = feed.plays.find((entry) => entry.startsAtMs === play.startsAtMs);
      expect(inFeed, `${play.venueId} at ${new Date(play.startsAtMs).toISOString()}`).toMatchObject({ trackId: 'track-1', venueId: play.venueId, durationSeconds: 150 });
      expect(play.endsAtMs - play.startsAtMs).toBe(150_000);
    }
  });

  it('plays a song only on its lane, only on its dates, only once approved', async () => {
    const live = service([order({})]);
    const slots = await live.slotsBetween(NOW, NOW + 3 * 3_600_000);
    const withSong = slots.filter((slot) => slot.holder);
    expect(withSong.length).toBeGreaterThan(0);
    for (const slot of withSong) expect(slot.lane).toBe(4);
    // Game music everywhere else (other lanes are free).
    expect(slots.filter((slot) => !slot.holder).every((slot) => slot.lane !== 4)).toBe(true);

    const later = service([order({ startDate: '2026-10-20', endDate: '2026-10-27' })]);
    expect((await later.slotsBetween(NOW, NOW + 3 * 3_600_000)).some((slot) => slot.holder)).toBe(false);
    expect(await service([order({ status: 'in-review' })]).playsOf(order({ status: 'in-review' }), track, 3, NOW)).toEqual({ playingNow: null, upcoming: [] });
  });

  it('never counts slots from before the song was approved (a restart catching up can’t invent plays)', async () => {
    const approvedAt = new Date(NOW + 60 * 60_000);
    const schedule = service([order({ reviewedAt: approvedAt })]);
    const slots = (await schedule.slotsBetween(NOW, NOW + 3 * 3_600_000)).filter((slot) => slot.lane === 4);
    expect(slots.some((slot) => slot.startsAtMs < approvedAt.getTime())).toBe(true);
    for (const slot of slots) expect(slot.holder !== null, new Date(slot.startsAtMs).toISOString()).toBe(slot.startsAtMs >= approvedAt.getTime());
    const { upcoming } = await schedule.playsOf(order({ reviewedAt: approvedAt }), track, 5, NOW);
    for (const play of upcoming) expect(play.startsAtMs).toBeGreaterThanOrEqual(approvedAt.getTime());
  });

  it('gives a song about the guaranteed plays a day, in every club', async () => {
    const schedule = service([order({ startDate: '2026-10-01', endDate: '2026-10-29' })]);
    const dayStart = Date.parse('2026-10-09T23:00:00Z'); // Lagos midnight
    const slots = (await schedule.slotsBetween(dayStart, dayStart + 86_400_000)).filter((slot) => slot.holder && slot.startsAtMs >= dayStart && slot.startsAtMs < dayStart + 86_400_000);
    const guarantee = clubSongGuarantee(clock.scale);
    expect(slots.length).toBeGreaterThanOrEqual(guarantee.minPlaysPerDay);
    expect(slots.length).toBeLessThanOrEqual(guarantee.playsPerDay + 1);
    expect(new Set(slots.map((slot) => slot.venueId)).size).toBe(clubPlayVenues().length);
  });

  it('serves a club’s feed from a few minutes back (to join mid-song) to ~20 minutes ahead', async () => {
    const feed = await service([order({})]).schedule('quilox', NOW);
    expect(feed.untilMs).toBe(NOW + 20 * 60_000);
    for (const play of feed.plays) {
      expect(play.venueId).toBe('quilox');
      expect(play.startsAtMs + play.durationSeconds * 1000).toBeGreaterThan(NOW - 4 * 60_000);
      expect(play.startsAtMs).toBeLessThan(feed.untilMs);
    }
    await expect(service([]).schedule('unilag', NOW)).rejects.toThrow();
  });
});
