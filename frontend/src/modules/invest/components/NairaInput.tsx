'use client';

import type { ReactNode } from 'react';
import { TextField } from '@/common/components';
import { groupDigits, parseNairaInput } from '@/common/utils/money-input';

export interface NairaInputProps {
  readonly label: string;
  readonly value: number | null;
  readonly onChange: (value: number | null) => void;
  readonly hint?: ReactNode;
  readonly error?: string | null;
}

/** Text field for whole naira with live grouping ("1,250,000"). */
export function NairaInput({ label, value, onChange, hint, error }: NairaInputProps) {
  return (
    <TextField
      label={label}
      inputMode="numeric"
      autoComplete="off"
      placeholder="0"
      value={groupDigits(value)}
      onChange={(event) => onChange(parseNairaInput(event.target.value))}
      hint={hint}
      error={error}
      trailing={<span className="text-sm font-bold text-text-faint">NGN</span>}
      className="[&_input]:font-display [&_input]:text-xl [&_input]:font-extrabold [&_input]:tabular-nums"
    />
  );
}
