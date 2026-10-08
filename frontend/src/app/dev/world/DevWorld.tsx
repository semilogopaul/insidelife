'use client';

import { WEATHER_CONDITIONS, findVenue, venueEntrance, type WeatherCondition } from '@insidelife/shared';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { useNavigation } from '@/common/game/navigation-store';

const CityPreview = dynamic(() => import('@/modules/world').then((module) => module.CityPreview), { ssr: false });
const Minimap = dynamic(() => import('@/modules/world').then((module) => module.Minimap), { ssr: false });

const parseOffset = (value: string | null): readonly [number, number, number] | undefined => {
  const parts = value?.split(',').map(Number);
  return parts && parts.length === 3 && parts.every(Number.isFinite) ? [parts[0] as number, parts[1] as number, parts[2] as number] : undefined;
};

/** Composition root for the dev city viewer (query: hour, weather, at, cam=x,y,z, to, quality, hud=0, play=1, car). */
export function DevWorld() {
  const params = useSearchParams();
  const hourParam = params.get('hour');
  const hour = hourParam !== null && Number.isFinite(Number(hourParam)) ? Number(hourParam) : 17.4;
  const weatherParam = params.get('weather');
  const weather = WEATHER_CONDITIONS.includes(weatherParam as WeatherCondition) ? (weatherParam as WeatherCondition) : 'clear';
  const at = params.get('at') ?? 'unilag';
  const focus = useMemo(() => venueEntrance(at)?.position ?? { x: 0, z: 0 }, [at]);
  const offset = useMemo(() => parseOffset(params.get('cam')), [params]);
  const qualityParam = params.get('quality');
  const graphics = qualityParam === 'low' || qualityParam === 'high' || qualityParam === 'auto' ? qualityParam : qualityParam === 'medium' ? 'auto' : undefined;
  const to = params.get('to');
  // Play-test sandbox: `play=1` spawns at the `at` venue's door (optionally with `car=<kit model>`).
  const playParam = params.get('play');
  const carParam = params.get('car');
  const play = useMemo(() => (playParam === '1' ? { at, carModel: carParam ?? 'sedan' } : null), [playParam, carParam, at]);
  const setDestination = useNavigation((state) => state.setDestination);
  const guidance = useNavigation((state) => state.instruction);
  const remaining = useNavigation((state) => state.remainingMetres);
  useEffect(() => {
    setDestination(to ?? null, to ? (findVenue(to)?.name ?? to) : null);
  }, [to, setDestination]);
  return (
    <main className="fixed inset-0 overflow-hidden bg-ink">
      <CityPreview hour={hour} weather={weather} focus={focus} cameraOffset={offset} graphics={graphics} play={play} />
      {params.get('hud') !== '0' && (
        <div className="safe-pad pointer-events-none absolute inset-0 flex items-start justify-between p-3">
          <Minimap />
          {guidance && (
            <p className="max-w-sm rounded-card bg-danfo px-3 py-2 text-ink shadow-[var(--shadow-glass)]">
              <span className="type-title block text-lg leading-tight">{guidance.text}</span>
              <span className="text-xs font-bold">
                {Math.round(guidance.distance)} m{remaining !== null ? ` · ${remaining} m to go` : ''}
              </span>
            </p>
          )}
        </div>
      )}
    </main>
  );
}
