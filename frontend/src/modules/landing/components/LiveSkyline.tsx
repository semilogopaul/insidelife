'use client';

import { toDateParts } from '@insidelife/shared';
import { useClockSync, useGameMinute, useWorldState } from '@/common/game/use-game-clock';
import { skyAt } from './sky';

/** Window lights for towers: deterministic so SSR and client agree. */
const WINDOWS = Array.from({ length: 70 }, (_, i) => ({ x: 60 + ((i * 97) % 1080), y: 250 + ((i * 53) % 150), on: (i * 7) % 3 !== 0 }));

/**
 * Lagos skyline that follows the live game clock: Eko Atlantic and VI towers, the Lekki–Ikoyi link bridge pylon,
 * Third Mainland Bridge across the lagoon and a danfo making its way home.
 */
export function LiveSkyline() {
  const synced = useClockSync();
  const minute = useGameMinute(4_000);
  const parts = toDateParts(minute);
  const hour = synced ? parts.hour + parts.minute / 60 : 18.4;
  const { data: world } = useWorldState();
  const raining = world?.weather.raining ?? false;
  const sky = skyAt(hour);
  const sunY = 420 - Math.sin(((hour - 6) / 12) * Math.PI) * 330;
  const sunVisible = hour > 5.6 && hour < 19.2;

  return (
    <svg viewBox="0 0 1200 640" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 size-full" role="img" aria-label="Lagos skyline over the lagoon">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sky.top} />
          <stop offset="0.55" stopColor={sky.mid} />
          <stop offset="1" stopColor={sky.horizon} />
        </linearGradient>
        <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sky.horizon} stopOpacity="0.55" />
          <stop offset="0.25" stopColor={sky.water} />
          <stop offset="1" stopColor="#06141b" />
        </linearGradient>
        <radialGradient id="sun">
          <stop offset="0" stopColor={sky.sun} />
          <stop offset="1" stopColor={sky.sun} stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="1200" height="640" fill="url(#sky)" />
      {sunVisible && <circle cx={880} cy={sunY} r={120} fill="url(#sun)" opacity={0.9} />}
      {sunVisible && <circle cx={880} cy={sunY} r={34} fill={sky.sun} />}
      {sky.night > 0.4 &&
        Array.from({ length: 40 }, (_, i) => (
          <circle key={i} cx={(i * 137) % 1200} cy={(i * 71) % 260} r={i % 5 === 0 ? 1.6 : 1} fill="#f4f7f5" opacity={sky.night * 0.7} />
        ))}

      {/* Distant towers: VI, Eko Atlantic */}
      <g fill="#0b2230" opacity={0.92}>
        <rect x="70" y="300" width="46" height="130" />
        <rect x="122" y="250" width="58" height="180" />
        <rect x="188" y="320" width="40" height="110" />
        <rect x="610" y="230" width="52" height="200" />
        <rect x="668" y="190" width="64" height="240" />
        <rect x="740" y="270" width="44" height="160" />
        <rect x="790" y="300" width="70" height="130" />
        <rect x="960" y="260" width="48" height="170" />
        <rect x="1014" y="215" width="56" height="215" />
        <rect x="1076" y="300" width="60" height="130" />
        <path d="M676 190 l24 -38 l24 38z" />
      </g>
      {sky.night > 0.3 &&
        WINDOWS.map((w, i) => (w.on ? <rect key={i} x={w.x} y={w.y} width="5" height="7" fill="#f6b90b" opacity={sky.night * 0.85} /> : null))}

      {/* Lekki–Ikoyi link bridge pylon with stays */}
      <g stroke="#0b2230" strokeWidth="3" fill="none" opacity={0.95}>
        <path d="M430 430 L430 250" strokeWidth="9" />
        {[300, 330, 360, 390, 420].map((x) => (
          <path key={`l${x}`} d={`M430 262 L${x - 130} 430`} />
        ))}
        {[460, 490, 520, 550, 580].map((x) => (
          <path key={`r${x}`} d={`M430 262 L${x + 40} 430`} />
        ))}
      </g>

      {/* Water */}
      <rect x="0" y="430" width="1200" height="210" fill="url(#water)" />
      <g stroke={sky.horizon} strokeOpacity="0.25" strokeWidth="2">
        {Array.from({ length: 14 }, (_, i) => (
          <path key={i} d={`M${(i * 173) % 1100} ${470 + (i % 6) * 26} h${60 + (i % 4) * 30}`} />
        ))}
      </g>

      {/* Third Mainland Bridge: long low deck on pillars */}
      <g fill="#081b25">
        <rect x="0" y="472" width="1200" height="12" />
        {Array.from({ length: 24 }, (_, i) => (
          <rect key={i} x={20 + i * 50} y="484" width="8" height="60" />
        ))}
      </g>
      <g className="danfo-drive">
        <rect x="-120" y="452" width="62" height="22" rx="4" fill="#f6b90b" />
        <rect x="-112" y="456" width="44" height="7" rx="1" fill="#0e2733" opacity="0.85" />
        <rect x="-120" y="466" width="62" height="2" fill="#0e2733" />
        <rect x="-120" y="469" width="62" height="2" fill="#0e2733" />
        {sky.night > 0.3 && <circle cx="-56" cy="468" r="3" fill="#fff7d6" />}
      </g>

      {raining && (
        <g aria-hidden>
          <rect width="1200" height="640" fill="#1d2b33" opacity={0.35} />
          <g className="rain-fall" stroke="#cfe3ea" strokeOpacity="0.35" strokeWidth="1.5">
            {Array.from({ length: 90 }, (_, i) => (
              <path key={i} d={`M${(i * 131) % 1260 - 30} ${(i * 67) % 640 - 640} l-10 26`} />
            ))}
            {Array.from({ length: 90 }, (_, i) => (
              <path key={`b${i}`} d={`M${(i * 131) % 1260 - 30} ${(i * 67) % 640} l-10 26`} />
            ))}
          </g>
        </g>
      )}
    </svg>
  );
}
