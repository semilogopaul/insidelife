import { cn } from '@/common/utils/cn';
import { PICTOGRAM_BOX, PICTOGRAMS } from './pictograms';
import { PLACE_STYLES, type PlaceKind } from './place-kinds';

export interface PlaceIconProps {
  readonly kind: PlaceKind;
  /** Size in CSS pixels. */
  readonly size?: number;
  /** Accessible name; defaults to what the pictogram depicts ("Market"). Ignored when `decorative`. */
  readonly title?: string;
  /** Hide it from assistive tech when the place is already named next to it. */
  readonly decorative?: boolean;
  readonly className?: string;
}

const HALF = PICTOGRAM_BOX / 2;
/** Share of the disc the pictogram fills (the minimap markers use the same proportion). */
export const PLACE_GLYPH_SCALE = 0.66;
const GLYPH_TRANSFORM = `translate(${HALF} ${HALF}) scale(${PLACE_GLYPH_SCALE}) translate(${-HALF} ${-HALF})`;

/** A place's pictogram on its coloured disc: the marker the minimap draws, for lists and headers. */
export function PlaceIcon({ kind, size = 40, title, decorative = false, className }: PlaceIconProps) {
  const style = PLACE_STYLES[kind];
  return (
    <svg
      viewBox={`0 0 ${PICTOGRAM_BOX} ${PICTOGRAM_BOX}`}
      width={size}
      height={size}
      className={cn('shrink-0', className)}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : (title ?? style.label)}
      aria-hidden={decorative || undefined}
      focusable="false"
    >
      <circle cx={HALF} cy={HALF} r={HALF} fill={style.color} />
      <g transform={GLYPH_TRANSFORM} fill={style.ink}>
        {PICTOGRAMS[style.pictogram].map((layer, index) => (
          <path key={index} d={layer.d} fillRule={layer.rule} />
        ))}
      </g>
    </svg>
  );
}
