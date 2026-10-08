import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/common/utils/cn';
import { Spinner } from './Spinner';

type Variant = 'danfo' | 'ink' | 'paper' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  danfo: 'bg-danfo text-ink hover:bg-danfo-deep active:translate-y-px shadow-[0_3px_0_var(--color-danfo-deep)]',
  ink: 'bg-ink text-on-ink hover:bg-ink-2 active:translate-y-px',
  paper: 'bg-paper text-ink hover:bg-paper-2 ring-1 ring-line active:translate-y-px',
  ghost: 'bg-transparent text-current hover:bg-white/10',
  danger: 'bg-okada text-white hover:brightness-110 active:translate-y-px',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm rounded-chip gap-1.5',
  md: 'h-11 px-4 text-[0.95rem] rounded-card gap-2',
  lg: 'h-14 px-6 text-lg rounded-card gap-2.5',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: Variant;
  readonly size?: Size;
  readonly loading?: boolean;
  readonly icon?: ReactNode;
  readonly block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'danfo', size = 'md', loading = false, icon, block, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex select-none items-center justify-center font-bold transition-[background-color,transform,filter] duration-150',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner size={size === 'lg' ? 22 : 18} /> : icon}
      {children}
    </button>
  );
});
