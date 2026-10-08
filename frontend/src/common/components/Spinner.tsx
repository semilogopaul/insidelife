import { cn } from '@/common/utils/cn';

export function Spinner({ size = 18, className }: { readonly size?: number; readonly className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn('inline-block animate-spin rounded-full border-2 border-current border-r-transparent', className)}
      style={{ width: size, height: size }}
    />
  );
}
