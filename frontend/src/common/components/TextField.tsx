import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/common/utils/cn';

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly label: string;
  readonly hint?: ReactNode;
  readonly error?: string | null;
  readonly trailing?: ReactNode;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, trailing, className, id, ...rest },
  ref,
) {
  const generated = useId();
  const inputId = id ?? generated;
  const hintId = `${inputId}-hint`;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={inputId} className="text-sm font-bold text-text">
        {label}
      </label>
      <div
        className={cn(
          'flex h-12 items-center rounded-card bg-paper-2 ring-1 ring-line transition focus-within:ring-2 focus-within:ring-ink',
          error && 'ring-2 ring-okada',
        )}
      >
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={hint || error ? hintId : undefined}
          className="h-full min-w-0 flex-1 bg-transparent px-3.5 text-[1rem] text-text placeholder:text-text-faint focus:outline-none"
          {...rest}
        />
        {trailing && <span className="pr-3">{trailing}</span>}
      </div>
      {(error || hint) && (
        <p id={hintId} className={cn('text-sm', error ? 'text-okada' : 'text-text-soft')}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
});
