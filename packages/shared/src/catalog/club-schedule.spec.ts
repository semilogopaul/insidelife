import { describe, expect, it } from 'vitest';
import { MINUTES_PER_DAY } from '../time/calendar.js';
import { realMsAt, type GameClockConfig } from '../time/clock.js';
import { CLUB_ROTATION_CAPACITY, TRACK_MAX_SECONDS, clubPlayVenues } from './promotions.js';
import { clubSlotMinutes, clubSlotTemplate, clubSlotsBetween, clubSongGuarantee, laneOfSlot, nextLaneSlots } from './club-schedule.js';
import { findVenue, isVenueOpen } from './venues.js';

const SCALE = 120;
const SEED = 'eko-o-ni-baje';
const options = { seed: SEED };
const clock: GameClockConfig = { epochRealMs: Date.parse('2026-10-01T00:00:00Z'), epochGameMinute: 0, scale: SCALE };

describe('club schedule: slots', () => {
  it('makes a slot long enough for the longest song plus game music, in whole game hours', () => {
    // 3 min + 30 s of real time = 420 game minutes at ×120.
    expect(clubSlotMinutes(120)).toBe(420);
    expect(clubSlotMinutes(60)).toBe(240);
    expect((clubSlotMinutes(SCALE) / SCALE) * 60).toBeGreaterThanOrEqual(TRACK_MAX_SECONDS);
  });

  it('puts every slot inside its club’s opening hours, on the hour, after an opening lead', () => {
    const template = clubSlotTemplate(SCALE);
    const length = clubSlotMinutes(SCALE);
    expect(template.length).toBeGreaterThanOrEqual(clubPlayVenues().length);
    for (const slot of template) {
      const venue = findVenue(slot.venueId);
      expect(venue).toBeDefined();
      const [open, close] = venue?.hours ?? [0, 24];
      expect(slot.offsetMinutes % 60).toBe(0);
      expect(slot.offsetMinutes).toBeGreaterThanOrEqual(open * 60 + 60);
      expect(slot.offsetMinutes + length).toBeLessThanOrEqual(close * 60);
      // Open the whole time a song can play.
      for (let minute = slot.offsetMinutes; minute < slot.offsetMinutes + length; minute += 60) {
        expect(isVenueOpen(venue!, Math.floor(minute / 60) % 24), `${slot.venueId} at ${minute}`).toBe(true);
      }
    }
  });

  it('never overlaps two slots in one club', () => {
    const slots = clubSlotsBetween(0, 10 * MINUTES_PER_DAY, SCALE, options);
    const byVenue = new Map<string, typeof slots>();
    for (const slot of slots) byVenue.set(slot.venueId, [...(byVenue.get(slot.venueId) ?? []), slot]);
    for (const list of byVenue.values()) {
      for (let i = 1; i < list.length; i++) expect(list[i]!.startMinute).toBeGreaterThanOrEqual(list[i - 1]!.endMinute);
    }
  });

  it('is deterministic: same inputs, same schedule; another seed shuffles the lanes', () => {
    const a = clubSlotsBetween(5_000_000, 5_000_000 + 3 * MINUTES_PER_DAY, SCALE, options);
    const b = clubSlotsBetween(5_000_000, 5_000_000 + 3 * MINUTES_PER_DAY, SCALE, options);
    expect(b).toEqual(a);
    const other = clubSlotsBetween(5_000_000, 5_000_000 + 3 * MINUTES_PER_DAY, SCALE, { seed: 'another' });
    expect(other.map((slot) => slot.startMinute)).toEqual(a.map((slot) => slot.startMinute));
    expect(other.map((slot) => slot.lane)).not.toEqual(a.map((slot) => slot.lane));
  });

  it('returns slots overlapping a window, filtered by club', () => {
    const slots = clubSlotsBetween(1_000_000, 1_000_000 + 2 * MINUTES_PER_DAY, SCALE, { ...options, venueId: 'quilox' });
    expect(slots.length).toBeGreaterThanOrEqual(2);
    for (const slot of slots) expect(slot.venueId).toBe('quilox');
  });
});

describe('club schedule: lanes and the guarantee', () => {
  it('gives every lane exactly one slot in each block of lanes', () => {
    for (let block = 0; block < 300; block++) {
      const lanes = new Set(Array.from({ length: CLUB_ROTATION_CAPACITY }, (_, p) => laneOfSlot(block * CLUB_ROTATION_CAPACITY + p, SEED)));
      expect(lanes.size).toBe(CLUB_ROTATION_CAPACITY);
    }
  });

  it('spreads each lane over every club evenly (once per club every 12 game days)', () => {
    const days = CLUB_ROTATION_CAPACITY * 4;
    const slots = clubSlotsBetween(0, days * MINUTES_PER_DAY, SCALE, options).filter((slot) => slot.startMinute >= 0 && slot.index < days * clubSlotTemplate(SCALE).length);
    for (let lane = 0; lane < CLUB_ROTATION_CAPACITY; lane++) {
      const perClub = new Map<string, number>();
      for (const slot of slots) if (slot.lane === lane) perClub.set(slot.venueId, (perClub.get(slot.venueId) ?? 0) + 1);
      expect(perClub.size).toBe(clubSlotTemplate(SCALE).length === CLUB_ROTATION_CAPACITY ? clubPlayVenues().length : perClub.size);
      const counts = [...perClub.values()];
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    }
  });

  it('keeps the plays-a-day guarantee for every lane on every real day, whatever time the day starts', () => {
    const guarantee = clubSongGuarantee(SCALE);
    // 12 clubs and lounges × one slot a game night × 120 game days a real day.
    expect(guarantee).toMatchObject({ slotsPerDay: 1_440, playsPerDay: 120, minPlaysPerDay: 119, clubs: 12, lanes: 12 });
    for (const startHour of [0, 3.25, 7, 11.5, 13, 19.75]) {
      const fromMs = Date.parse('2026-10-09T00:00:00Z') + startHour * 3_600_000;
      const fromMinute = (fromMs - clock.epochRealMs) / 60_000 * SCALE;
      const toMinute = fromMinute + SCALE * MINUTES_PER_DAY;
      const slots = clubSlotsBetween(fromMinute, toMinute, SCALE, options).filter((slot) => slot.startMinute >= fromMinute && slot.startMinute < toMinute);
      expect(slots.length).toBe(guarantee.slotsPerDay);
      for (let lane = 0; lane < CLUB_ROTATION_CAPACITY; lane++) {
        const plays = slots.filter((slot) => slot.lane === lane).length;
        expect(plays, `lane ${lane} from ${startHour}h`).toBeGreaterThanOrEqual(guarantee.minPlaysPerDay);
        expect(plays).toBeLessThanOrEqual(guarantee.playsPerDay + 1);
      }
    }
  });

  it('finds a lane’s next plays in time order and maps them to exact real times', () => {
    const from = 2_000_000;
    const next = nextLaneSlots(5, from, 4, SCALE, options);
    expect(next).toHaveLength(4);
    for (const slot of next) {
      expect(slot.lane).toBe(5);
      expect(slot.startMinute).toBeGreaterThanOrEqual(from);
    }
    for (let i = 1; i < next.length; i++) expect(next[i]!.startMinute).toBeGreaterThan(next[i - 1]!.startMinute);
    // One game day = 12 real minutes: a play every ~12 minutes somewhere in Lagos.
    expect(realMsAt(clock, next[1]!.startMinute) - realMsAt(clock, next[0]!.startMinute)).toBeLessThanOrEqual(2 * 12 * 60_000);
  });
});
