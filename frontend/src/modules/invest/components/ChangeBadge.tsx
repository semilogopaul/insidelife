import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn } from '@/common/utils/cn';
import { formatChange } from '../services/invest-math';

/** Signed % change with an arrow (direction never relies on colour alone). */
export function ChangeBadge({ ratio, label, size = 'sm', className }: { readonly ratio: number; readonly label?: string; readonly size?: 'sm' | 'md'; readonly className?: string }) {
  const Icon = ratio > 0 ? ArrowUpRight : ratio < 0 ? ArrowDownRight : Minus;
  return (
    <span
      className={cn(
        'tabular inline-flex items-center gap-0.5 font-bold',
        ratio > 0 ? 'text-naira' : ratio < 0 ? 'text-okada' : 'text-text-soft',
        size === 'md' ? 'text-sm' : 'text-xs',
        className,
      )}
    >
      <Icon size={size === 'md' ? 16 : 13} strokeWidth={2.6} aria-hidden />
      {formatChange(ratio)}
      {label && <span className="font-normal text-text-soft"> {label}</span>}
    </span>
  );
}
