'use client';

import { CloudRain, Cloud, CloudSun, Fuel, Sun, Users, Wind, type LucideIcon } from 'lucide-react';
import { formatClock12, formatDate, formatNaira, type WeatherCondition } from '@insidelife/shared';
import { useClockSync, useGameMinute, useWorldState } from '@/common/game/use-game-clock';

const WEATHER_ICON: Record<WeatherCondition, LucideIcon> = { clear: Sun, cloudy: Cloud, rain: CloudRain, storm: CloudRain, haze: Wind };
const WEATHER_LABEL: Record<WeatherCondition, string> = { clear: 'Clear', cloudy: 'Cloudy', rain: 'Raining', storm: 'Storm', haze: 'Harmattan haze' };

/** A live strip of what's happening in the game's Lagos right now. */
export function LagosNow() {
  const synced = useClockSync();
  const minute = useGameMinute(2_000);
  const { data } = useWorldState();
  const WeatherIcon = data ? WEATHER_ICON[data.weather.condition] : CloudSun;

  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:flex sm:flex-wrap sm:items-center sm:gap-x-8" aria-label="Lagos right now">
      <div>
        <dt className="text-on-ink-soft">In Lagos it’s</dt>
        <dd className="tabular font-bold text-on-ink">{synced ? `${formatClock12(minute)}, ${formatDate(minute)}` : '—'}</dd>
      </div>
      <div className="flex items-start gap-2">
        <WeatherIcon size={18} aria-hidden className="mt-0.5 text-danfo" />
        <div>
          <dt className="text-on-ink-soft">Weather</dt>
          <dd className="font-bold text-on-ink">{data ? `${WEATHER_LABEL[data.weather.condition]}, ${data.weather.temperatureC}°C` : '—'}</dd>
        </div>
      </div>
      <div className="flex items-start gap-2">
        <Fuel size={18} aria-hidden className="mt-0.5 text-danfo" />
        <div>
          <dt className="text-on-ink-soft">Petrol / dollar</dt>
          <dd className="tabular font-bold text-on-ink">{data ? `${formatNaira(data.economy.fuelPrice)}/L · ${formatNaira(data.economy.usdRate)}/$` : '—'}</dd>
        </div>
      </div>
      <div className="flex items-start gap-2">
        <Users size={18} aria-hidden className="mt-0.5 text-danfo" />
        <div>
          <dt className="text-on-ink-soft">Living here now</dt>
          <dd className="tabular font-bold text-on-ink">{data ? (data.onlinePlayers > 0 ? data.onlinePlayers.toLocaleString('en-NG') : 'Be one of the first') : '—'}</dd>
        </div>
      </div>
    </dl>
  );
}
