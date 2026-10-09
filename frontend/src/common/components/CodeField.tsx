'use client';

import { useId, useState } from 'react';
import { EMAIL_CODE_LENGTH } from '@insidelife/shared';
import { cn } from '@/common/utils/cn';

export interface CodeFieldProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** Called once the last digit is typed or pasted. */
  readonly onComplete?: (code: string) => void;
  readonly disabled?: boolean;
  readonly invalid?: boolean;
  readonly describedBy?: string;
  readonly autoFocus?: boolean;
}

/** Keep the digits of whatever was typed or pasted ("123 456", "123-456"), up to the code length. */
export const codeDigits = (raw: string): string => raw.replace(/\D/g, '').slice(0, EMAIL_CODE_LENGTH);

/**
 * One real input drawn as six boxes. A single input keeps paste, the keyboard's "code from Mail/Messages"
 * suggestion (`one-time-code`), screen readers and hardware keyboards working; it sits transparent on top of the
 * boxes and takes every tap.
 */
export function CodeField({
  value,
  onChange,
  onComplete,
  disabled,
  invalid,
  describedBy,
  autoFocus,
}: CodeFieldProps) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const active = Math.min(value.length, EMAIL_CODE_LENGTH - 1);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-bold text-text">
        {EMAIL_CODE_LENGTH}-digit code
      </label>
      <div className="relative">
        <div aria-hidden className="grid grid-cols-6 gap-2">
          {Array.from({ length: EMAIL_CODE_LENGTH }, (_, index) => {
            const digit = value[index];
            const current = focused && index === active;
            return (
              <span
                key={index}
                className={cn(
                  'grid h-14 place-items-center rounded-card bg-paper-2 font-display text-[1.6rem] font-black tabular-nums text-ink ring-1 ring-line transition',
                  current && 'ring-2 ring-ink',
                  invalid && 'ring-2 ring-okada',
                  disabled && 'opacity-60',
                )}
              >
                {digit ?? (current ? <span className="h-7 w-0.5 bg-ink motion-safe:animate-pulse" /> : null)}
              </span>
            );
          })}
        </div>
        <input
          id={id}
          value={value}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          spellCheck={false}
          autoCorrect="off"
          autoFocus={autoFocus}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(event) => {
            const next = codeDigits(event.target.value);
            onChange(next);
            if (next.length === EMAIL_CODE_LENGTH && next !== value) onComplete?.(next);
          }}
          className="absolute inset-0 h-full w-full cursor-text bg-transparent text-[16px] text-transparent caret-transparent outline-none selection:bg-transparent disabled:cursor-not-allowed"
        />
      </div>
    </div>
  );
}
