import { cn } from '@/common/utils/cn';

/**
 * Parody maker badges for the dealer and garage. The car names are the real ones Lagos buyers know, but none of these
 * emblems copies a real logo: each nods to the original's shape and colours (a shield, an oval, wings) with its own
 * mark — a charging goat, a dancing horse, a two-pronged fork, a five-pointed star, "BG" in an oval.
 */

type Frame = 'circle' | 'oval' | 'shield' | 'square';
type Mark = { readonly text: string } | { readonly path: string; readonly stroke?: boolean };

interface BadgeDesign {
  readonly frame: Frame;
  readonly fill: string;
  readonly ring: string;
  readonly ink: string;
  readonly mark: Mark;
}

const GOAT = 'M7 9 C6 6 7 4 9 3 C8 5 9 7 10 8 L14 8 C15 7 16 5 15 3 C17 4 18 6 17 9 L16 13 C16 16 14 18 12 19 C10 18 8 16 8 13 Z';
const HORSE = 'M9 19 L10 13 L8 11 L9 7 C10 5 12 4 14 5 L16 7 L15 9 L13 9 L14 12 L16 13 L15 19 L13 19 L13 15 L11 15 L11 19 Z';
const FORK = 'M10 19 L10 11 C8 11 7 9 7 6 L7 4 M10 11 C12 11 13 9 13 6 L13 4 M10 11 L10 4';
const STAR = 'M12 3 L14.6 9.3 L21 9.6 L16 13.8 L17.8 20.2 L12 16.6 L6.2 20.2 L8 13.8 L3 9.6 L9.4 9.3 Z';
const WINGS = 'M2 10 C5 9 8 9 10 11 M2 13 C5 12 8 12 10 13 M22 10 C19 9 16 9 14 11 M22 13 C19 12 16 12 14 13';
const RINGS = 'M4 12 C4 8 8 6 12 6 C16 6 20 8 20 12 C20 16 16 18 12 18 C8 18 4 16 4 12 Z M10 7 L10 17 M14 7 L14 17';

const BADGES: Readonly<Record<string, BadgeDesign>> = {
  Lamborghini: { frame: 'shield', fill: '#14110d', ring: '#d4a52a', ink: '#d4a52a', mark: { path: GOAT } },
  Ferrari: { frame: 'shield', fill: '#f2c500', ring: '#14110d', ink: '#14110d', mark: { path: HORSE } },
  Bugatti: { frame: 'oval', fill: '#c1121f', ring: '#e6e6e6', ink: '#ffffff', mark: { text: 'BG' } },
  'Rolls-Royce': { frame: 'square', fill: '#1b1d22', ring: '#c9ced3', ink: '#e8ecef', mark: { text: 'ЯR' } },
  Bentley: { frame: 'circle', fill: '#1b1d22', ring: '#c9ced3', ink: '#c9ced3', mark: { path: WINGS, stroke: true } },
  Maserati: { frame: 'oval', fill: '#1f3b73', ring: '#c9ced3', ink: '#e8ecef', mark: { path: FORK, stroke: true } },
  'Mercedes-Benz': { frame: 'circle', fill: '#e8ecef', ring: '#7d848c', ink: '#3a3f45', mark: { path: STAR } },
  Porsche: { frame: 'shield', fill: '#d4a52a', ring: '#14110d', ink: '#b3121b', mark: { text: 'P' } },
  'Land Rover': { frame: 'oval', fill: '#0f5f45', ring: '#c9ced3', ink: '#ffffff', mark: { text: 'LR' } },
  Cadillac: { frame: 'shield', fill: '#1f2f4f', ring: '#c9ced3', ink: '#e8ecef', mark: { text: 'C' } },
  Lexus: { frame: 'oval', fill: '#2b2f35', ring: '#c9ced3', ink: '#e8ecef', mark: { text: 'Ł' } },
  Toyota: { frame: 'oval', fill: '#e8ecef', ring: '#b3121b', ink: '#b3121b', mark: { path: RINGS, stroke: true } },
  Honda: { frame: 'square', fill: '#e8ecef', ring: '#7d848c', ink: '#3a3f45', mark: { text: 'H' } },
  Kia: { frame: 'oval', fill: '#e8ecef', ring: '#7d848c', ink: '#3a3f45', mark: { text: 'KY' } },
  Innoson: { frame: 'circle', fill: '#0f5132', ring: '#f2b705', ink: '#ffffff', mark: { text: 'IVM' } },
  Mitsubishi: { frame: 'circle', fill: '#e8ecef', ring: '#b3121b', ink: '#b3121b', mark: { text: '◆◆' } },
};

const FALLBACK: BadgeDesign = { frame: 'circle', fill: '#e8ecef', ring: '#7d848c', ink: '#3a3f45', mark: { text: '' } };

function FrameShape({ frame, fill, ring }: { readonly frame: Frame; readonly fill: string; readonly ring: string }) {
  const common = { fill, stroke: ring, strokeWidth: 1.6 };
  if (frame === 'circle') return <circle cx="12" cy="12" r="10.2" {...common} />;
  if (frame === 'oval') return <ellipse cx="12" cy="12" rx="11" ry="8" {...common} />;
  if (frame === 'square') return <rect x="2.5" y="2.5" width="19" height="19" rx="2.5" {...common} />;
  return <path d="M3 3 L21 3 L21 11 C21 16 17 20 12 22 C7 20 3 16 3 11 Z" {...common} />;
}

/** The maker's (parody) badge; decorative — the name beside it says which make it is. */
export function MakeBadge({ make, className }: { readonly make: string; readonly className?: string }) {
  const design = BADGES[make] ?? { ...FALLBACK, mark: { text: make.slice(0, 2).toUpperCase() } };
  const { mark } = design;
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn('size-7 shrink-0', className)}>
      <FrameShape frame={design.frame} fill={design.fill} ring={design.ring} />
      {'text' in mark ? (
        <text x="12" y="12" dominantBaseline="central" textAnchor="middle" fill={design.ink} fontSize={mark.text.length > 2 ? 6.5 : 8.5} fontWeight={800} style={{ fontFamily: 'var(--font-display)' }}>
          {mark.text}
        </text>
      ) : mark.stroke ? (
        <path d={mark.path} fill="none" stroke={design.ink} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d={mark.path} fill={design.ink} transform="translate(2.4 2.4) scale(0.8)" />
      )}
    </svg>
  );
}
