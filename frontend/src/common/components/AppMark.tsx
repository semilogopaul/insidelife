import { APP_MARK_BACKGROUND, APP_MARK_BOX, APP_MARK_TILE_RADIUS, APP_MARK_TILE_SCALE, appMarkShapes } from '@/common/brand/app-mark';
import { APP_NAME, BRAND_COLORS } from '@/common/brand/brand';
import { cn } from '@/common/utils/cn';

export interface AppMarkProps {
  /** Size in CSS pixels. At 36 px and below the compact mark is drawn (no passengers or fabric detail). */
  readonly size?: number;
  /** Accessible name (ignored when `decorative`). */
  readonly title?: string;
  /** Hide it from assistive tech when the name is already written next to it (e.g. in the wordmark). */
  readonly decorative?: boolean;
  readonly className?: string;
}

const HALF = APP_MARK_BOX / 2;
const TILE_TRANSFORM = `translate(${HALF} ${HALF}) scale(${APP_MARK_TILE_SCALE}) translate(${-HALF} ${-HALF})`;

/** The app icon (a loaded danfo on a lagoon tile) as inline SVG: the same drawing players see on their home screen. */
export function AppMark({ size = 40, title = APP_NAME, decorative = false, className }: AppMarkProps) {
  return (
    <svg
      viewBox={`0 0 ${APP_MARK_BOX} ${APP_MARK_BOX}`}
      width={size}
      height={size}
      className={cn('shrink-0', className)}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : title}
      aria-hidden={decorative || undefined}
      focusable="false"
    >
      <rect width={APP_MARK_BOX} height={APP_MARK_BOX} rx={APP_MARK_TILE_RADIUS} fill={BRAND_COLORS[APP_MARK_BACKGROUND]} />
      <g transform={TILE_TRANSFORM}>
        {appMarkShapes(size <= 36).map((shape, index) => (
          <path key={index} d={shape.d} fill={BRAND_COLORS[shape.fill]} opacity={shape.opacity} />
        ))}
      </g>
    </svg>
  );
}
