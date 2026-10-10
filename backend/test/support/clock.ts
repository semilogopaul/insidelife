import { MINUTES_PER_DAY, MINUTES_PER_HOUR, startOfDay, toDateParts, type GameMinute } from '@insidelife/shared';
import type { WorldService } from '../../src/modules/world/world.service.js';

/**
 * A controllable world clock for the suite. Every service reads "now" through `WorldService.now()`; the suite pins it
 * (so a test never drifts from shopping hours into bedtime halfway through) and only ever moves it forward, the way
 * time moves for players. Conversions of a real timestamp (`now(realMs)`) are left untouched.
 */
export class TestClock {
  private pinned: GameMinute;
  private readonly realNow: (realMs?: number) => GameMinute;

  constructor(private readonly world: WorldService) {
    this.realNow = world.now.bind(world);
    // Start tomorrow (game time) at 10:00, ahead of the real game clock, so the pinned time never runs backwards.
    this.pinned = startOfDay(this.realNow()) + MINUTES_PER_DAY + 10 * MINUTES_PER_HOUR;
    world.now = (realMs?: number): GameMinute => (realMs === undefined ? this.pinned : this.realNow(realMs));
  }

  get now(): GameMinute {
    return this.pinned;
  }

  get hour(): number {
    return toDateParts(this.pinned).hour;
  }

  advance(minutes: number): GameMinute {
    if (minutes < 0) throw new RangeError('The clock only moves forward');
    this.pinned += Math.round(minutes);
    return this.pinned;
  }

  /** Move forward to the next time the clock reads `hour:minute` (later today, else tomorrow). */
  at(hour: number, minute = 0): GameMinute {
    const target = startOfDay(this.pinned) + hour * MINUTES_PER_HOUR + minute;
    this.pinned = target > this.pinned ? target : target + MINUTES_PER_DAY;
    return this.pinned;
  }

  /** Move to the next midnight and a little past it (day-end hooks run: deliveries, bills). */
  pastMidnight(minutes = 30): GameMinute {
    this.pinned = startOfDay(this.pinned) + MINUTES_PER_DAY + minutes;
    return this.pinned;
  }
}
