'use client';

import { useId } from 'react';
import { cn } from '@/common/utils/cn';
import { groupDigits, parseNairaInput } from '@/common/utils/money-input';

export interface AmountFieldProps {
  readonly label: string;
  readonly value: number | null;
  readonly onChange: (value: number | null) => void;
  readonly hint?: string;
  readonly invalid?: boolean;
  /** Hide the soft keyboard on touch screens (an on-screen keypad is shown instead). */
  readonly keypad?: boolean;
  readonly autoFocus?: boolean;
}

/** The big naira figure. Typing digits works on a keyboard; the keypad drives it on touch. */
export function AmountField({ label, value, onChange, hint, invalid, keypad = false, autoFocus }: AmountFieldProps) {
  const id = useId();
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <label htmlFor={id} className="text-sm font-bold text-text-soft">
        {label}
      </label>
      <div className={cn('flex max-w-full items-baseline justify-center gap-1 rounded-card px-3 ring-danfo focus-within:ring-2', invalid ? 'text-okada' : 'text-ink')}>
        <span aria-hidden className="type-figure text-3xl text-text-faint">
          ₦
        </span>
        <input
          id={id}
          value={groupDigits(value)}
          onChange={(event) => onChange(parseNairaInput(event.target.value))}
          inputMode={keypad ? 'none' : 'numeric'}
          autoComplete="off"
          autoFocus={autoFocus}
          placeholder="0"
          aria-invalid={invalid || undefined}
          aria-describedby={hint ? `${id}-hint` : undefined}
          size={Math.max(1, groupDigits(value).length)}
          className="type-figure min-w-[2ch] max-w-full bg-transparent text-center text-[2.75rem] leading-tight caret-danfo-deep placeholder:text-text-faint focus:outline-none"
        />
      </div>
      {hint && (
        <p id={`${id}-hint`} className={cn('text-sm', invalid ? 'font-bold text-okada' : 'text-text-soft')} aria-live="polite">
          {hint}
        </p>
      )}
    </div>
  );
}
