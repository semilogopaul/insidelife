import { MINUTES_PER_DAY, weatherAt, type Weather, type WeatherCondition } from '@insidelife/shared';
import { gameClock } from '@/common/game/game-clock';

/**
 * Time of day and weather as seen by the 3D world. Reads the game clock (no React); a preview can pin both
 * (dev route `?hour=` / `?weather=`). Weather is cached per 3-hour block so per-frame reads stay cheap.
 */

interface TimeOverride {
  hour: number | null;
  weather: WeatherCondition | null;
}

const override: TimeOverride = { hour: null, weather: null };

export function setWorldTimeOverride(hour: number | null, weather: WeatherCondition | null = null): void {
  override.hour = hour;
  override.weather = weather;
}

/** Fractional hour of day 0–24. Before the clock syncs we show late afternoon (the city's best side). */
export function worldHour(): number {
  if (override.hour !== null) return override.hour;
  if (!gameClock.ready) return 16.5;
  const minuteOfDay = gameClock.now() % MINUTES_PER_DAY;
  return (minuteOfDay < 0 ? minuteOfDay + MINUTES_PER_DAY : minuteOfDay) / 60;
}

const CLEAR: Weather = { condition: 'clear', intensity: 0, raining: false, temperatureC: 30, season: 'dry' };
let cachedBlock = Number.NaN;
let cachedSeed = '';
let cachedWeather: Weather = CLEAR;

export function worldWeather(): Weather {
  if (override.weather !== null) {
    const condition = override.weather;
    return {
      condition,
      intensity: condition === 'clear' ? 0 : condition === 'storm' ? 0.95 : 0.6,
      raining: condition === 'rain' || condition === 'storm',
      temperatureC: 29,
      season: condition === 'haze' ? 'harmattan' : 'rainy',
    };
  }
  if (!gameClock.ready || !gameClock.worldSeed) return CLEAR;
  const now = gameClock.now();
  const block = Math.floor(now / 180);
  if (block !== cachedBlock || cachedSeed !== gameClock.worldSeed) {
    cachedBlock = block;
    cachedSeed = gameClock.worldSeed;
    cachedWeather = weatherAt(gameClock.worldSeed, now);
  }
  return cachedWeather;
}
