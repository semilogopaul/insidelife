import type { VehicleModel } from '@insidelife/shared';
import { cn } from '@/common/utils/cn';
import { carShape, type CarShape } from '../services/motors-rules';

/** Side-view silhouettes (facing right) drawn on a 160×64 canvas: body outline + glass. */
const SHAPES: Record<
  CarShape,
  { readonly body: string; readonly glass: string; readonly wheels: readonly [number, number]; readonly trim?: string }
> = {
  sedan: {
    body: 'M10 48 C8 40 12 35 22 34 L48 31 L62 19 C64 17 67 16 71 16 L103 16 C108 16 111 18 114 21 L126 31 L144 33 C151 34 154 38 154 44 L154 48 Z',
    glass: 'M66 21 L72 19 L88 19 L88 30 L56 30 Z M92 19 L103 19 C106 19 108 20 110 22 L118 30 L92 30 Z',
    wheels: [38, 126],
  },
  hatch: {
    body: 'M14 48 C12 40 15 35 24 34 L50 31 L64 18 C66 16 69 15 73 15 L112 15 C120 15 124 18 126 24 L130 32 L142 34 C149 35 152 39 152 44 L152 48 Z',
    glass: 'M68 20 L74 18 L94 18 L94 30 L58 30 Z M98 18 L112 18 C117 18 120 20 121 24 L123 30 L98 30 Z',
    wheels: [40, 124],
  },
  suv: {
    body: 'M8 48 C6 38 10 32 20 31 L40 29 L52 13 C54 11 57 10 61 10 L118 10 C124 10 128 12 130 16 L136 29 L146 31 C153 32 156 37 156 43 L156 48 Z',
    glass: 'M58 14 L62 13 L86 13 L86 27 L48 27 Z M90 13 L117 13 C121 13 124 14 125 17 L129 27 L90 27 Z',
    wheels: [38, 128],
  },
  van: {
    body: 'M8 48 L8 16 C8 12 11 9 15 9 L118 9 C126 9 132 13 136 20 L144 31 C151 32 156 37 156 43 L156 48 Z',
    glass:
      'M16 14 L52 14 L52 27 L16 27 Z M56 14 L92 14 L92 27 L56 27 Z M96 14 L118 14 C123 14 127 16 130 21 L135 27 L96 27 Z',
    wheels: [36, 128],
  },
  box: {
    body: 'M6 48 L6 8 L104 8 L104 22 L120 22 C127 22 132 25 136 30 L144 34 C151 35 155 39 155 44 L155 48 Z',
    glass: 'M108 25 L120 25 C125 25 129 27 131 31 L108 31 Z',
    wheels: [32, 128],
  },
  pickup: {
    body: 'M6 48 L6 30 L66 30 L70 16 C71 13 74 11 78 11 L112 11 C118 11 121 13 124 17 L132 30 L146 32 C152 33 156 38 156 43 L156 48 Z',
    glass: 'M76 15 L94 15 L94 28 L72 28 Z M98 15 L111 15 C115 15 117 16 119 19 L125 28 L98 28 Z',
    wheels: [36, 128],
  },
  // Low wedge: long raked screen, engine behind the seats, rear wing.
  supercar: {
    body: 'M6 48 L6 36 L30 33 L52 31 L66 23 C70 21 76 20 82 20 L94 21 L126 33 L150 38 C155 39 157 42 157 46 L157 48 Z',
    glass: 'M68 25 L77 23 L91 23 L114 32 L62 32 Z',
    wheels: [36, 128],
    trim: 'M3 27 L28 27 L28 30 L3 30 Z M13 30 L16 30 L16 33 L13 33 Z',
  },
  // Rounded hypercar with a small wing.
  hypercar: {
    body: 'M8 48 C7 40 10 35 18 34 L48 32 L64 23 C68 20 76 19 84 19 L96 20 C102 21 108 24 114 28 L130 34 L148 37 C155 38 157 42 157 46 L157 48 Z',
    glass: 'M67 25 L77 22 L93 22 C99 23 104 26 108 29 L111 32 L60 32 Z',
    wheels: [38, 126],
    trim: 'M8 29 L28 29 L28 31 L8 31 Z',
  },
  // Long bonnet, fastback roof.
  gt: {
    body: 'M8 48 C7 40 10 36 18 35 L30 33 L54 21 C57 19 62 18 68 18 L88 18 C94 18 98 21 102 25 L110 31 L146 34 C153 35 156 39 156 44 L156 48 Z',
    glass: 'M56 23 L64 21 L84 21 L84 30 L46 30 Z M88 21 C92 21 95 23 98 26 L102 30 L88 30 Z',
    wheels: [38, 128],
  },
  // Long and formal, upright nose, bonnet ornament.
  limo: {
    body: 'M4 48 L4 34 C4 31 6 30 10 30 L32 29 L44 14 C46 12 49 11 53 11 L106 11 C110 11 113 13 115 16 L124 28 L152 30 C156 31 158 34 158 38 L158 48 Z',
    glass: 'M48 15 L52 14 L76 14 L76 26 L38 26 Z M80 14 L104 14 C107 14 109 15 110 17 L117 26 L80 26 Z',
    wheels: [32, 132],
    trim: 'M148 26 L150 26 L150 29 L148 29 Z',
  },
  // The box: flat sides, upright screen, flared arches.
  gbox: {
    body: 'M8 48 L8 10 C8 8 9 7 11 7 L112 7 C115 7 116 8 117 10 L120 24 L150 25 C153 25 155 27 155 30 L155 48 Z',
    glass: 'M14 11 L50 11 L50 23 L14 23 Z M54 11 L86 11 L86 23 L54 23 Z M90 11 L111 11 L114 23 L90 23 Z',
    wheels: [36, 128],
    trim: 'M22 34 L50 34 L50 37 L22 37 Z M114 34 L142 34 L142 37 L114 37 Z',
  },
  // Big three-row SUV.
  grand: {
    body: 'M6 48 L6 12 C6 9 8 8 11 8 L112 8 C117 8 120 10 122 13 L130 27 L150 29 C155 30 157 33 157 37 L157 48 Z',
    glass: 'M12 12 L44 12 L44 25 L12 25 Z M48 12 L82 12 L82 25 L48 25 Z M86 12 L111 12 C115 12 117 13 119 16 L124 25 L86 25 Z',
    wheels: [36, 130],
  },
  // Sporty SUV with a sloping coupe roof.
  'coupe-suv': {
    body: 'M8 48 C7 38 10 33 18 32 L28 30 L52 14 C55 12 59 11 64 11 L100 11 C106 11 110 13 113 17 L122 28 L148 31 C154 32 156 36 156 42 L156 48 Z',
    glass: 'M54 16 L62 14 L84 14 L84 27 L40 27 Z M88 14 L99 14 C103 14 106 15 108 18 L114 27 L88 27 Z',
    wheels: [38, 128],
  },
};

/** A flat side-view illustration of the car in its paint (decorative; the name says what it is). */
export function CarArt({
  model,
  color,
  className,
}: {
  readonly model: VehicleModel;
  readonly color: string;
  readonly className?: string;
}) {
  const shape = SHAPES[carShape(model)];
  return (
    <svg viewBox="0 0 160 64" aria-hidden className={cn('h-auto w-full', className)}>
      <ellipse cx="81" cy="58" rx="72" ry="3.5" fill="var(--color-ink)" opacity="0.14" />
      <path
        d={shape.body}
        fill={color}
        stroke="var(--color-ink)"
        strokeOpacity="0.35"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M8 43 L156 43 L156 48 L8 48 Z" fill="var(--color-ink)" opacity="0.14" />
      <path
        d={shape.glass}
        fill="#cfe2ea"
        stroke="var(--color-ink)"
        strokeOpacity="0.4"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <rect
        x="148"
        y="36"
        width="6"
        height="3"
        rx="1.5"
        fill="#fff4c2"
        stroke="var(--color-ink)"
        strokeOpacity="0.3"
        strokeWidth="0.6"
      />
      {shape.trim && <path d={shape.trim} fill="#1b1f22" />}
      {shape.wheels.map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="48" r="10.5" fill="#1b1f22" />
          <circle cx={cx} cy="48" r="4.8" fill="#c9ced3" />
        </g>
      ))}
    </svg>
  );
}

/** A Lagos number plate ("KJA-482-KJ"). */
export function Plate({ plate }: { readonly plate: string }) {
  return (
    <span
      className="inline-flex flex-col items-center rounded-[4px] bg-white px-1.5 pb-0.5 pt-px leading-none ring-1 ring-cobalt/50"
      aria-label={`Plate ${plate}`}
    >
      <span aria-hidden className="text-[7px] font-bold tracking-wide text-cobalt">
        LAGOS
      </span>
      <span aria-hidden className="type-figure text-xs text-cobalt">
        {plate}
      </span>
    </span>
  );
}
