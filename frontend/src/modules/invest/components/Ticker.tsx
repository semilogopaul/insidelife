import type { InstrumentKind } from '@insidelife/shared';
import { cn } from '@/common/utils/cn';

/** Square ticker tile: stocks on ink, crypto on cobalt, so the two markets read apart at a glance (label included). */
export function Ticker({ id, kind, size = 'md' }: { readonly id: string; readonly kind: InstrumentKind; readonly size?: 'md' | 'lg' }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center rounded-[10px] font-display font-extrabold tracking-tight text-white',
        kind === 'crypto' ? 'bg-cobalt' : 'bg-ink',
        size === 'lg' ? 'size-14 text-sm' : 'size-11 text-[0.62rem]',
      )}
    >
      {id.slice(0, size === 'lg' ? 5 : 4)}
    </span>
  );
}
