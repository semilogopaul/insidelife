import { cn } from '@/common/utils/cn';
import { AppMark } from './AppMark';

type WordmarkSize = 'sm' | 'md' | 'lg';

const TEXT: Record<WordmarkSize, string> = { sm: 'text-xl', md: 'text-3xl', lg: 'text-5xl' };
const MARK: Record<WordmarkSize, number> = { sm: 36, md: 52, lg: 76 };

/** "INSIDE LIFE" set like a danfo slogan with the double stripe beneath; `withMark` puts the app icon before it. */
export function Wordmark({ className, size = 'md', withMark = false }: { readonly className?: string; readonly size?: WordmarkSize; readonly withMark?: boolean }) {
  const word = (
    <span className={cn('inline-flex flex-col items-start', !withMark && className)}>
      <span className={cn('type-slogan uppercase tracking-tight', TEXT[size])}>Inside Life</span>
      <span aria-hidden className="mt-1 block h-[9px] w-full danfo-stripes [--color-ink:currentColor]" />
    </span>
  );
  if (!withMark) return word;
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <AppMark size={MARK[size]} decorative />
      {word}
    </span>
  );
}
