import { cn } from '@/common/utils/cn';

/** "INSIDE LIFE" set like a danfo slogan with the double stripe beneath. */
export function Wordmark({ className, size = 'md' }: { readonly className?: string; readonly size?: 'sm' | 'md' | 'lg' }) {
  const text = size === 'lg' ? 'text-5xl' : size === 'sm' ? 'text-xl' : 'text-3xl';
  return (
    <span className={cn('inline-flex flex-col items-start', className)}>
      <span className={cn('type-slogan uppercase tracking-tight', text)}>Inside Life</span>
      <span aria-hidden className="mt-1 block h-[9px] w-full danfo-stripes [--color-ink:currentColor]" />
    </span>
  );
}
