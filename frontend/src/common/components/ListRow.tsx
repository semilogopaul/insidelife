import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/common/utils/cn';

export interface ListRowProps {
  readonly title: ReactNode;
  readonly subtitle?: ReactNode;
  readonly leading?: ReactNode;
  readonly trailing?: ReactNode;
  readonly onClick?: () => void;
  readonly disabled?: boolean;
  readonly className?: string;
}

/** Tappable row used across phone apps (jobs, listings, people, holdings). Renders a button only when clickable. */
export function ListRow({ title, subtitle, leading, trailing, onClick, disabled, className }: ListRowProps) {
  const content = (
    <>
      {leading && <span className="shrink-0">{leading}</span>}
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate font-bold">{title}</span>
        {subtitle && <span className="block truncate text-sm text-text-soft">{subtitle}</span>}
      </span>
      {trailing && <span className="shrink-0 text-right">{trailing}</span>}
      {onClick && <ChevronRight size={18} aria-hidden className="shrink-0 text-text-faint" />}
    </>
  );
  const base = 'flex w-full items-center gap-3 rounded-card px-3 py-3';
  return onClick ? (
    <button type="button" onClick={onClick} disabled={disabled} className={cn(base, 'bg-paper-2 hover:bg-paper-3 disabled:opacity-50', className)}>
      {content}
    </button>
  ) : (
    <div className={cn(base, 'bg-paper-2', className)}>{content}</div>
  );
}
