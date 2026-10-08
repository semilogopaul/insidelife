import { Minus, Plus } from 'lucide-react';
import type { ReactNode } from 'react';

export interface StepperProps {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly onChange: (value: number) => void;
  /** Rendered after the number ("days", "plots"). */
  readonly unit?: ReactNode;
}

/** − n + control with an accessible spinbutton role (arrow keys work). */
export function Stepper({ label, value, min, max, onChange, unit }: StepperProps) {
  const set = (next: number): void => onChange(Math.max(min, Math.min(max, next)));
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-bold">{label}</span>
      <div className="flex items-center gap-1 rounded-full bg-paper-2 p-1 ring-1 ring-line">
        <button
          type="button"
          aria-label={`Fewer ${label.toLowerCase()}`}
          disabled={value <= min}
          onClick={() => set(value - 1)}
          className="grid size-9 place-items-center rounded-full hover:bg-paper-3 disabled:opacity-40"
        >
          <Minus size={16} aria-hidden />
        </button>
        <span
          role="spinbutton"
          tabIndex={0}
          aria-label={label}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          onKeyDown={(event) => {
            if (event.key === 'ArrowUp' || event.key === 'ArrowRight') set(value + 1);
            else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') set(value - 1);
            else return;
            event.preventDefault();
          }}
          className="tabular min-w-14 text-center font-bold"
        >
          {value} {unit}
        </span>
        <button
          type="button"
          aria-label={`More ${label.toLowerCase()}`}
          disabled={value >= max}
          onClick={() => set(value + 1)}
          className="grid size-9 place-items-center rounded-full hover:bg-paper-3 disabled:opacity-40"
        >
          <Plus size={16} aria-hidden />
        </button>
      </div>
    </div>
  );
}
