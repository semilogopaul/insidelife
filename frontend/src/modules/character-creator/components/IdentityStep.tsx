'use client';

import { Check, Loader2, X } from 'lucide-react';
import { STATES_OF_ORIGIN, type Gender } from '@insidelife/shared';
import { TextField } from '@/common/components';
import type { HandleStatus } from '../hooks/useHandleAvailability';
import { Chips } from './controls';

export interface IdentityValues {
  readonly firstName: string;
  readonly lastName: string;
  readonly handle: string;
  readonly gender: Gender;
  readonly stateOfOrigin: string;
}

export interface IdentityStepProps {
  readonly values: IdentityValues;
  readonly handleStatus: HandleStatus;
  readonly onChange: (patch: Partial<IdentityValues>) => void;
}

const HANDLE_HINT = 'Other players find you by @handle. Letters, numbers and _.';

function handleTrailing(status: HandleStatus) {
  if (status === 'checking') return <Loader2 size={18} className="animate-spin text-text-soft" aria-hidden />;
  if (status === 'available') return <Check size={18} className="text-naira" aria-hidden />;
  if (status === 'taken') return <X size={18} className="text-okada" aria-hidden />;
  return null;
}

export function IdentityStep({ values, handleStatus, onChange }: IdentityStepProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <TextField label="First name" value={values.firstName} onChange={(event) => onChange({ firstName: event.target.value })} autoComplete="given-name" />
        <TextField label="Surname" value={values.lastName} onChange={(event) => onChange({ lastName: event.target.value })} autoComplete="family-name" />
      </div>
      <TextField
        label="Handle"
        value={values.handle}
        onChange={(event) => onChange({ handle: event.target.value.replace(/[^a-z0-9_]/gi, '').toLowerCase() })}
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={20}
        trailing={handleTrailing(handleStatus)}
        error={handleStatus === 'taken' ? `@${values.handle} don already dey. Try another one.` : null}
        hint={handleStatus === 'available' ? `@${values.handle} is free. E don set.` : HANDLE_HINT}
      />
      <Chips<Gender>
        label="Gender"
        options={[
          { id: 'female', label: 'Female' },
          { id: 'male', label: 'Male' },
        ]}
        selected={values.gender}
        onSelect={(gender) => onChange({ gender })}
      />
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-bold">State of origin</span>
        <select value={values.stateOfOrigin} onChange={(event) => onChange({ stateOfOrigin: event.target.value })} className="h-12 rounded-card bg-paper-2 px-3 ring-1 ring-line focus-visible:ring-2 focus-visible:ring-ink">
          {STATES_OF_ORIGIN.map((state) => (
            <option key={state.id} value={state.id}>
              {state.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
