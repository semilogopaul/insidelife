import { ChevronDown } from 'lucide-react';
import { useId } from 'react';
import { cn } from '@/common/utils/cn';

export interface SelectOption<T extends string> {
  readonly value: T;
  readonly label: string;
}

export interface SelectFieldProps<T extends string> {
  readonly label: string;
  readonly value: T;
  readonly options: readonly SelectOption<T>[];
  readonly onChange: (value: T) => void;
  /** Hide the visible label (still announced). */
  readonly hideLabel?: boolean;
  readonly className?: string;
}

/** Native select styled for the phone (best keyboard and screen-reader support on every device). */
export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  hideLabel,
  className,
}: SelectFieldProps<T>) {
  const id = useId();
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={id} className={cn('text-sm font-bold', hideLabel && 'sr-only')}>
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value as T)}
          className="h-11 w-full appearance-none truncate rounded-card bg-paper-2 pl-3.5 pr-9 text-[0.95rem] font-bold text-text ring-1 ring-line focus:outline-none focus-visible:ring-2 focus-visible:ring-ink"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={18}
          aria-hidden
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-soft"
        />
      </div>
    </div>
  );
}
