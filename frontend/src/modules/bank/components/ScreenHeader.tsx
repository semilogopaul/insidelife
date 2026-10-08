import { ChevronLeft } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';

export interface ScreenHeaderProps {
  readonly title: string;
  readonly onBack: () => void;
  readonly backLabel?: string;
  readonly aside?: ReactNode;
}

/** Sub-screen title inside the Bank with a back step. Focus moves to the title so screen readers announce the screen. */
export function ScreenHeader({ title, onBack, backLabel = 'Back', aside }: ScreenHeaderProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={onBack} aria-label={backLabel} className="-ml-2 grid size-10 shrink-0 place-items-center rounded-full text-text-soft hover:bg-paper-2 hover:text-text">
        <ChevronLeft size={22} aria-hidden />
      </button>
      <h3 ref={heading} tabIndex={-1} className="type-title min-w-0 flex-1 truncate text-2xl outline-none">
        {title}
      </h3>
      {aside}
    </div>
  );
}
