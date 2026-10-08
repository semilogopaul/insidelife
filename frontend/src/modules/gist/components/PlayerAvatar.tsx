import { cn } from '@/common/utils/cn';

const TINTS = ['bg-danfo text-ink', 'bg-naira text-white', 'bg-ankara text-white', 'bg-cobalt text-white', 'bg-lagoon text-white', 'bg-ink-3 text-white'] as const;

function tintFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return TINTS[hash % TINTS.length] ?? TINTS[0];
}

const SIZES = { sm: 'size-8 text-xs', md: 'size-10 text-sm', lg: 'size-16 text-xl', xl: 'size-20 text-2xl' } as const;

/** Initials avatar (stable colour per handle) with an online dot. The 3D avatar lives in the world. */
export function PlayerAvatar({
  name,
  handle,
  online,
  size = 'md',
  className,
}: {
  readonly name: string;
  readonly handle: string;
  readonly online?: boolean;
  readonly size?: keyof typeof SIZES;
  readonly className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <span className={cn('relative inline-grid shrink-0 place-items-center rounded-full font-bold', SIZES[size], tintFor(handle), className)}>
      <span aria-hidden className="type-title leading-none">
        {initials || '?'}
      </span>
      {online !== undefined && (
        <span
          className={cn('absolute bottom-0 right-0 rounded-full ring-2 ring-paper', size === 'sm' ? 'size-2.5' : 'size-3', online ? 'bg-naira' : 'bg-text-faint')}
          aria-label={online ? 'Online' : 'Offline'}
          role="img"
        />
      )}
    </span>
  );
}
