import type { VehicleModel } from '@insidelife/shared';
import { cn } from '@/common/utils/cn';
import { carShape, type CarShape } from '../services/motors-rules';

/** Side-view silhouettes (facing right) drawn on a 160×64 canvas: body outline + glass. */
const SHAPES: Record<
  CarShape,
  { readonly body: string; readonly glass: string; readonly wheels: readonly [number, number] }
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
