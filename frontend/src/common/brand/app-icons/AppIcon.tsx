import { useId } from 'react';
import { cn } from '@/common/utils/cn';
import { APP_ICON_ART, type AppIconId } from './art';
import type { ArtContext } from './art-kit';

export interface AppIconProps {
  readonly app: AppIconId;
  /** Size in CSS pixels. At 36 px and below fine detail is left out. */
  readonly size?: number;
  /** Accessible name; defaults to the app's name. Ignored when `decorative`. */
  readonly title?: string;
  /** Hide it from assistive tech when the app's name is written next to it (home screen, app header). */
  readonly decorative?: boolean;
  readonly className?: string;
}

const BOX = 64;
/** Same launcher squircle as the game's own app mark. */
const RADIUS = 14;

/** A phone app's icon: an illustrated rounded tile, the same drawing on the home screen and in the app's header. */
export function AppIcon({ app, size = 56, title, decorative = false, className }: AppIconProps) {
  const uid = `ai${useId().replace(/[^\w-]/g, '')}`;
  const art = APP_ICON_ART[app];
  const ctx: ArtContext = {
    id: (name) => `${uid}-${name}`,
    url: (name) => `url(#${uid}-${name})`,
    compact: size <= 36,
  };
  const rim = art.rim ?? { color: '#ffffff', opacity: 0.22 };
  return (
    <svg
      viewBox={`0 0 ${BOX} ${BOX}`}
      width={size}
      height={size}
      className={cn('shrink-0', className)}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : (title ?? art.name)}
      aria-hidden={decorative || undefined}
      focusable="false"
    >
      <defs>
        <linearGradient id={ctx.id('tile')} x1={0} y1={0} x2={0} y2={1}>
          <stop offset={0} stopColor={art.tile[0]} />
          <stop offset={1} stopColor={art.tile[1]} />
        </linearGradient>
        <radialGradient id={ctx.id('sheen')} cx={0.3} cy={0} r={0.85}>
          <stop offset={0} stopColor="#ffffff" stopOpacity={0.32} />
          <stop offset={1} stopColor="#ffffff" stopOpacity={0} />
        </radialGradient>
        <clipPath id={ctx.id('clip')}>
          <rect width={BOX} height={BOX} rx={RADIUS} />
        </clipPath>
        <filter
          id={ctx.id('lift')}
          filterUnits="userSpaceOnUse"
          x={-8}
          y={-8}
          width={BOX + 16}
          height={BOX + 16}
        >
          <feDropShadow dx={0} dy={1.6} stdDeviation={1.3} floodColor="#061218" floodOpacity={0.32} />
        </filter>
      </defs>
      <rect width={BOX} height={BOX} rx={RADIUS} fill={ctx.url('tile')} />
      <g clipPath={ctx.url('clip')}>
        {art.backdrop?.(ctx)}
        <rect width={BOX} height={BOX} fill={ctx.url('sheen')} />
        <g filter={ctx.url('lift')}>{art.subject(ctx)}</g>
      </g>
      <rect
        x={0.5}
        y={0.5}
        width={BOX - 1}
        height={BOX - 1}
        rx={RADIUS - 0.5}
        fill="none"
        stroke={rim.color}
        strokeOpacity={rim.opacity}
      />
    </svg>
  );
}
