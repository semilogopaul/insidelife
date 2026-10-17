import { useId } from 'react';
import type { Airframe } from '../services/hangar-rules';

export interface AircraftArtProps {
  readonly airframe: Airframe;
  /** Fuselage colour (hex). */
  readonly base: string;
  /** Stripe, tail and engine colour (hex). */
  readonly accent: string;
  /** Name painted on the fuselage (already upper-case), or empty. */
  readonly name?: string;
  /** `5N-XXX` painted small near the tail. */
  readonly registration?: string;
  readonly className?: string;
  readonly label: string;
}

const INK = '#16232b';
const GLASS = '#a9d6ea';

/** Perceived brightness, to pick readable ink for the painted name. */
function onColour(hex: string): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const luma = (0.299 * (value >> 16) + 0.587 * ((value >> 8) & 255) + 0.114 * (value & 255)) / 255;
  return luma > 0.6 ? INK : '#ffffff';
}

/**
 * A side view of the aircraft in its livery, drawn as SVG so the colour changes are live while you edit. One shape
 * per airframe family (piston, twin, turboprop, jet, airliner); the base colour paints the fuselage and wing, the
 * accent the stripe, tail and engines.
 */
export function AircraftArt({ airframe, base, accent, name, registration, className, label }: AircraftArtProps) {
  const id = useId().replace(/:/g, '');
  const shade = `${id}-shade`;
  const nameInk = onColour(base);
  const prop = airframe === 'piston' || airframe === 'twin' || airframe === 'turboprop';
  const long = airframe === 'airliner';
  // Fuselage extents per family.
  const nose = prop ? 214 : long ? 236 : 226;
  const tail = prop ? 40 : long ? 12 : 22;
  const deck = long ? 58 : 56;
  return (
    <svg viewBox="0 0 250 100" role="img" aria-label={label} className={className}>
      <defs>
        <linearGradient id={shade} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.38" />
          <stop offset="0.55" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.22" />
        </linearGradient>
      </defs>
      <ellipse cx="125" cy="90" rx="92" ry="4" fill="#000000" opacity="0.16" />
      {/* Tail fin and tailplane (accent). */}
      {airframe === 'jet' || airframe === 'airliner' ? (
        <>
          <path d={`M${tail + 2} ${deck - 10} L${tail - 8} 12 L${tail + 26} 12 L${tail + 50} ${deck - 8}Z`} fill={accent} />
          <path d={`M${tail + 8} ${deck - 4} L${tail - 6} ${deck - 24} L${tail + 22} ${deck - 8}Z`} fill={accent} opacity="0.75" />
        </>
      ) : (
        <>
          <path d={`M${tail + 2} ${deck - 8} L${tail - 4} 22 L${tail + 20} 22 L${tail + 40} ${deck - 6}Z`} fill={accent} />
          <path d={`M${tail + 6} ${deck + 2} L${tail - 8} ${deck - 6} L${tail + 24} ${deck + 4}Z`} fill={accent} opacity="0.75" />
        </>
      )}
      {/* Fuselage. */}
      <path
        d={`M${tail} ${deck - 8} C${tail + 30} ${deck - 20} ${nose - 60} ${deck - 24} ${nose - 18} ${deck - 20} C${nose - 4} ${deck - 17} ${nose} ${deck - 6} ${nose} ${deck} C${nose} ${deck + 8} ${nose - 14} ${deck + 15} ${nose - 36} ${deck + 15} L${tail + 36} ${deck + 15} C${tail + 14} ${deck + 12} ${tail + 2} ${deck + 2} ${tail} ${deck - 8}Z`}
        fill={base}
      />
      {/* Accent stripe along the windows. */}
      <path d={`M${tail + 12} ${deck + 6} L${nose - 8} ${deck + 6} L${nose - 12} ${deck + 11} L${tail + 22} ${deck + 11}Z`} fill={accent} />
      {/* Cockpit and cabin windows. */}
      <path d={`M${nose - 52} ${deck - 17} C${nose - 36} ${deck - 19} ${nose - 22} ${deck - 15} ${nose - 14} ${deck - 6} L${nose - 52} ${deck - 6}Z`} fill={GLASS} />
      {Array.from({ length: long ? 9 : 6 }, (_, index) => (
        <rect key={index} x={tail + 40 + index * (long ? 14 : 15)} y={deck - 12} width={long ? 8 : 9} height={6} rx={2} fill={GLASS} />
      ))}
      {/* Wing (high wing for the props, low for the jets) and engines. */}
      {prop ? (
        <>
          <path d={`M${nose - 118} ${deck - 20} L${nose - 70} ${deck - 20} L${nose - 98} ${deck - 38} L${nose - 124} ${deck - 38}Z`} fill={base} />
          <path d={`M${nose - 118} ${deck - 20} L${nose - 70} ${deck - 20} L${nose - 72} ${deck - 24} L${nose - 118} ${deck - 24}Z`} fill={accent} opacity="0.85" />
          <rect x={nose - 6} y={deck - 26} width="4" height="26" rx="2" fill={INK} opacity="0.7" />
          <ellipse cx={nose - 3} cy={deck - 13} rx="3" ry="15" fill="#ffffff" opacity="0.28" />
          {airframe !== 'piston' && <ellipse cx={nose - 92} cy={deck - 28} rx="14" ry="5" fill={accent} />}
        </>
      ) : (
        <>
          <path d={`M${nose - 126} ${deck + 4} L${nose - 70} ${deck + 4} L${nose - 118} ${deck + 28} L${nose - 140} ${deck + 28}Z`} fill={base} />
          <path d={`M${nose - 126} ${deck + 4} L${nose - 70} ${deck + 4} L${nose - 74} ${deck + 8} L${nose - 128} ${deck + 8}Z`} fill={accent} opacity="0.85" />
          <rect x={nose - 108} y={deck + 8} width="30" height="11" rx="5.5" fill={accent} />
          <rect x={nose - 108} y={deck + 8} width="6" height="11" rx="3" fill={INK} opacity="0.55" />
        </>
      )}
      {airframe === 'twin' && <rect x={nose - 160} y={deck - 30} width="24" height="9" rx="4.5" fill={accent} />}
      {/* Landing gear. */}
      <g stroke={INK} strokeWidth="3" strokeLinecap="round">
        <path d={`M${nose - 40} ${deck + 15} L${nose - 40} ${deck + 25}`} />
        <path d={`M${tail + 78} ${deck + 15} L${tail + 78} ${deck + 25}`} />
      </g>
      <circle cx={nose - 40} cy={deck + 28} r="5" fill={INK} />
      <circle cx={tail + 78} cy={deck + 28} r="5" fill={INK} />
      <path d={`M${tail} ${deck - 8} C${tail + 30} ${deck - 20} ${nose - 60} ${deck - 24} ${nose - 18} ${deck - 20} C${nose - 4} ${deck - 17} ${nose} ${deck - 6} ${nose} ${deck} C${nose} ${deck + 8} ${nose - 14} ${deck + 15} ${nose - 36} ${deck + 15} L${tail + 36} ${deck + 15} C${tail + 14} ${deck + 12} ${tail + 2} ${deck + 2} ${tail} ${deck - 8}Z`} fill={`url(#${shade})`} />
      {name && (
        <text x={(tail + nose) / 2 + 6} y={deck + 1} textAnchor="middle" fontSize={name.length > 11 ? 8 : 10} fontWeight={800} letterSpacing="0.14em" fill={nameInk}>
          {name}
        </text>
      )}
      {registration && (
        <text x={tail + 44} y={deck + 24} fontSize="7" fontWeight={700} letterSpacing="0.1em" fill={INK} opacity="0.75">
          {registration}
        </text>
      )}
    </svg>
  );
}
