import type { ReactNode } from 'react';
import { cn } from '@/common/utils/cn';

export interface NextStepProps {
  /** Small context line above the headline ("Next up", "Today"). Sentence case. */
  readonly kicker?: ReactNode;
  /** The one thing to do, set like a danfo slogan. */
  readonly title: ReactNode;
  readonly body?: ReactNode;
  /** The primary action (and at most one secondary). */
  readonly actions?: ReactNode;
  readonly className?: string;
}

/**
 * The single most useful next move in an app, painted like the back of a danfo: ink panel, yellow condensed
 * headline, the double stripe underneath. One per screen.
 */
export function NextStep({ kicker = 'Next up', title, body, actions, className }: NextStepProps) {
  return (
    <section
      aria-label="Next step"
      className={cn('relative overflow-hidden rounded-card bg-ink text-on-ink', className)}
    >
      <div className="px-4 pb-4 pt-3.5">
        <p className="text-xs font-bold text-on-ink-soft">{kicker}</p>
        <h3 className="type-slogan mt-1 text-[2rem] text-danfo">{title}</h3>
        {body && <div className="mt-2 text-sm leading-snug text-on-ink-soft">{body}</div>}
        {actions && <div className="mt-3.5 flex flex-wrap gap-2">{actions}</div>}
      </div>
      <span aria-hidden className="danfo-stripes block h-[9px] w-full [--color-ink:var(--color-danfo)]" />
    </section>
  );
}
