import { Check, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/common/utils/cn';

export interface ChecklistItem {
  readonly key: string;
  readonly label: ReactNode;
  readonly met: boolean;
  readonly hint?: ReactNode;
}

/** Requirements with a tick or a cross (icon + words, never colour alone). */
export function Checklist({
  items,
  className,
}: {
  readonly items: readonly ChecklistItem[];
  readonly className?: string;
}) {
  return (
    <ul className={cn('flex flex-col gap-2', className)}>
      {items.map((item) => (
        <li key={item.key} className="flex items-start gap-2.5 text-sm">
          <span
            className={cn(
              'mt-px grid size-5 shrink-0 place-items-center rounded-full',
              item.met ? 'bg-naira-soft text-naira' : 'bg-okada-soft text-okada',
            )}
            aria-hidden
          >
            {item.met ? <Check size={13} strokeWidth={3} /> : <X size={13} strokeWidth={3} />}
          </span>
          <span className="min-w-0">
            <span className={cn('block', item.met ? 'text-text-soft' : 'font-bold')}>
              <span className="sr-only">{item.met ? 'Done: ' : 'Missing: '}</span>
              {item.label}
            </span>
            {!item.met && item.hint && <span className="block text-xs text-text-soft">{item.hint}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
