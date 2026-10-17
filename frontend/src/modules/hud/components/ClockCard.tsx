import { Cloud, CloudLightning, CloudRain, Moon, Sun, Wind, type LucideIcon } from 'lucide-react';
import type { Weather } from '@insidelife/shared';

const ICONS: Record<Weather['condition'], LucideIcon> = { clear: Sun, cloudy: Cloud, rain: CloudRain, storm: CloudLightning, haze: Wind };

export function ClockCard({ clock, date, hour, weather, place, city }: { clock: string; date: string; hour: number; weather: Weather | null; place: string; city: string }) {
  const night = hour < 6 || hour >= 19;
  const Icon = weather && weather.condition !== 'clear' ? ICONS[weather.condition] : night ? Moon : Sun;
  return (
    <div className="glass flex items-center gap-3 rounded-card px-3.5 py-2.5">
      <Icon size={22} aria-hidden className="text-danfo" />
      <div className="leading-tight">
        <p className="type-figure text-lg text-on-ink">{clock}</p>
        <p className="text-2xs text-on-ink-soft">
          {date}
          {weather ? ` · ${weather.temperatureC}°C` : ''}
        </p>
        <p className="max-w-40 truncate text-2xs font-bold text-on-ink">
          <span data-testid="hud-city" className="mr-1.5 rounded-full bg-danfo px-1.5 py-px text-ink">
            {city}
          </span>
          {place}
        </p>
      </div>
    </div>
  );
}
