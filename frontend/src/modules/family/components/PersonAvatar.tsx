import type { RelationshipKind } from '@insidelife/shared';
import { cn } from '@/common/utils/cn';

const TINT: Partial<Record<RelationshipKind, string>> = {
  father: 'bg-danfo text-ink',
  mother: 'bg-danfo text-ink',
  grandparent: 'bg-danfo-deep text-ink',
  sibling: 'bg-[#e8742b] text-white',
  child: 'bg-naira text-white',
  partner: 'bg-ankara text-white',
  fiance: 'bg-ankara text-white',
  spouse: 'bg-ankara text-white',
  friend: 'bg-cobalt text-white',
  acquaintance: 'bg-lagoon text-white',
  ex: 'bg-ink-3 text-white',
};

const SIZE = { sm: { box: 40, text: 'text-sm' }, md: { box: 52, text: 'text-base' }, lg: { box: 72, text: 'text-2xl' } } as const;

/**
 * Initials in a circle, tinted by relationship, wrapped in a closeness ring (the arc fills with closeness 0-100).
 * Deceased family is shown in greyscale.
 */
export function PersonAvatar({
  firstName,
  lastName,
  kind,
  closeness,
  alive = true,
  size = 'md',
  highlight = false,
}: {
  readonly firstName: string;
  readonly lastName: string;
  readonly kind: RelationshipKind | 'self';
  readonly closeness?: number;
  readonly alive?: boolean;
  readonly size?: keyof typeof SIZE;
  readonly highlight?: boolean;
}) {
  const { box, text } = SIZE[size];
  const ring = 3;
  const radius = box / 2 - ring / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, closeness ?? 0));
  return (
    <span className={cn('relative inline-grid shrink-0 place-items-center', !alive && 'grayscale')} style={{ width: box, height: box }}>
      <svg aria-hidden width={box} height={box} className="absolute inset-0 -rotate-90">
        <circle cx={box / 2} cy={box / 2} r={radius} fill="none" stroke="var(--color-paper-3)" strokeWidth={ring} />
        {closeness !== undefined && (
          <circle
            cx={box / 2}
            cy={box / 2}
            r={radius}
            fill="none"
            stroke={pct < 25 ? 'var(--color-okada)' : 'var(--color-naira)'}
            strokeWidth={ring}
            strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * circumference} ${circumference}`}
          />
        )}
      </svg>
      <span
        className={cn(
          'type-title grid place-items-center rounded-full leading-none',
          text,
          kind === 'self' ? 'bg-ink text-danfo' : (TINT[kind] ?? 'bg-paper-3 text-ink'),
          highlight && 'ring-2 ring-danfo ring-offset-2 ring-offset-paper',
        )}
        style={{ width: box - ring * 2 - 4, height: box - ring * 2 - 4 }}
      >
        {`${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase()}
      </span>
    </span>
  );
}
