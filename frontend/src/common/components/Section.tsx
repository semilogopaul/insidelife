import type { ReactNode } from 'react';
import { cn } from '@/common/utils/cn';

/** A titled block inside a phone app. */
export function Section({ title, aside, children, className }: { readonly title: ReactNode; readonly aside?: ReactNode; readonly children: ReactNode; readonly className?: string }) {
  return (
    <section className={cn('flex flex-col gap-2.5', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="type-title text-lg">{title}</h3>
        {aside && <div className="text-sm text-text-soft">{aside}</div>}
      </div>
      {children}
    </section>
  );
}
