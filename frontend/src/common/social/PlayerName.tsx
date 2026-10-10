import type { ReactNode } from 'react';
import type { WealthClass } from '@insidelife/shared';
import { cn } from '@/common/utils/cn';
import { wealthLabel, wealthNameClass } from './wealth-class';

/**
 * A player's name in their class colour: gold for nepo, blue for lapo. The class is also spoken to screen readers, so
 * colour is never the only signal. Without a class (not known yet) it renders plain.
 */
export function PlayerName({
  wealthClass,
  onDark = false,
  className,
  children,
}: {
  readonly wealthClass: WealthClass | undefined;
  readonly onDark?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <span data-wealth-class={wealthClass} className={cn(wealthNameClass(wealthClass, onDark), className)}>
      {children}
      {wealthClass && <span className="sr-only"> ({wealthLabel(wealthClass)})</span>}
    </span>
  );
}
