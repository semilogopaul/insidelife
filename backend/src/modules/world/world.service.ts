import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  activeWorldEvents,
  clockAt,
  economyAt,
  formatNaira,
  fromDateParts,
  isWorldEventActive,
  nextRescaleAfter,
  rngFor,
  dayIndexOf,
  TUNED_TIME_SCALE,
  weatherAt,
  wholeGameMinuteAt,
  type ClockRescale,
  type EconomyState,
  type GameClockConfig,
  type GameMinute,
  type Weather,
  type WorldEvent,
  type WorldEventKind,
} from '@insidelife/shared';
import type { AppConfig } from '../../config/configuration.js';

/** The game clock reads 1 Jan 2027, 06:00 at GAME_EPOCH. */
export const EPOCH_GAME_MINUTE = fromDateParts({ year: 2027, month: 1, day: 1, hour: 6 });

/**
 * Authoritative world clock and world model. Everything is derived from configuration (epoch, scale, speed changes,
 * seed), so any number of server instances agree without coordination.
 *
 * The clock runs at GAME_TIME_SCALE from GAME_EPOCH, then at each GAME_TIME_RESCALES entry it re-anchors to the minute
 * reached so far and runs at the new speed: changing the pace never makes the game minute jump (docs/DEPLOY.md).
 */
@Injectable()
export class WorldService {
  readonly seed: string;
  private readonly base: GameClockConfig;
  private readonly rescales: readonly ClockRescale[];

  constructor(config: ConfigService<AppConfig, true>) {
    const game = config.get('game', { infer: true });
    this.base = { epochRealMs: game.epochRealMs, epochGameMinute: EPOCH_GAME_MINUTE, scale: game.timeScale };
    this.rescales = game.rescales;
    this.seed = game.worldSeed;
    const scale = (this.nextRescale ?? this.clock).scale;
    if (scale !== TUNED_TIME_SCALE) {
      new Logger(WorldService.name).warn(
        `The game clock runs at ×${scale} but actions, rides and sleep are tuned for ×${TUNED_TIME_SCALE}. See docs/DEPLOY.md ("Game speed").`,
      );
    }
  }

  /** The clock running now (a single linear piece; it changes at a scheduled speed change). */
  get clock(): GameClockConfig {
    return clockAt(this.base, this.rescales, Date.now());
  }

  /** The next scheduled speed change, or null. */
  get nextRescale(): ClockRescale | null {
    return nextRescaleAfter(this.rescales, Date.now());
  }

  /** Current whole game minute. */
  now(realMs: number = Date.now()): GameMinute {
    return wholeGameMinuteAt(clockAt(this.base, this.rescales, realMs), realMs);
  }

  economy(t: GameMinute): EconomyState {
    return economyAt(this.seed, t);
  }

  weather(t: GameMinute): Weather {
    return weatherAt(this.seed, t);
  }

  events(t: GameMinute): WorldEvent[] {
    return activeWorldEvents(this.seed, t);
  }

  isActive(t: GameMinute, kind: WorldEventKind): boolean {
    return isWorldEventActive(this.seed, t, kind);
  }

  /** Apply the world price index to a catalog price (rounded to a sensible step). */
  price(base: number, t: GameMinute): number {
    if (base <= 0) return 0;
    const value = base * this.economy(t).priceIndex;
    const step = value >= 1_000_000 ? 10_000 : value >= 10_000 ? 100 : 50;
    return Math.max(step, Math.round(value / step) * step);
  }

  /** A playful daily headline for the HUD ticker. */
  headline(t: GameMinute): string {
    const events = this.events(t).filter((event) => event.kind !== 'public-holiday');
    const economy = this.economy(t);
    const weather = this.weather(t);
    const rng = rngFor(this.seed, 'headline', dayIndexOf(t));
    const lines: string[] = events.map((event) => `${event.title}: ${event.description}`);
    lines.push(
      `Dollar don land ${formatNaira(economy.usdRate)} for parallel market.`,
      `Petrol now ${formatNaira(economy.fuelPrice)} per litre. Plan your movement.`,
      `T-bills paying ${(economy.tbillRate * 100).toFixed(1)}% this week.`,
    );
    if (weather.raining) lines.push('Rain is falling — expect go-slow on Third Mainland Bridge and Bolt surge pricing.');
    if (weather.condition === 'haze') lines.push('Harmattan haze is heavy today. Vaseline your lips.');
    return rng.pick(lines);
  }
}
