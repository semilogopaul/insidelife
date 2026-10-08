import { Ban } from 'lucide-react';
import type { BillboardDayAvailability, IsoDate } from '@insidelife/shared';
import { cn } from '@/common/utils/cn';
import { addDays, dayState, formatDay } from '../../services/rules';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const weekdayIndex = (date: IsoDate): number => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;

export interface AvailabilityCalendarProps {
  readonly days: readonly BillboardDayAvailability[];
  /** Highlight the chosen run (exclusive end). */
  readonly selection?: { readonly start: IsoDate; readonly days: number } | null;
  /** Tapping a free day picks it as the start date. */
  readonly onPick?: (date: IsoDate) => void;
}

/**
 * Four weeks of the board, Monday-first. Each day shows ad spaces left (status colour + a number + "Full" with an
 * icon, so it never relies on colour), and the chosen run is outlined.
 */
export function AvailabilityCalendar({ days, selection, onPick }: AvailabilityCalendarProps) {
  if (days.length === 0) return null;
  const lead = weekdayIndex(days[0]!.date);
  const end = selection ? addDays(selection.start, selection.days) : null;
  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center text-2xs font-bold text-text-faint" aria-hidden>
        {WEEKDAYS.map((day) => (
          <span key={day}>{day.slice(0, 2)}</span>
        ))}
      </div>
      <ol className="mt-1 grid grid-cols-7 gap-1" aria-label="Availability, next 4 weeks">
        {Array.from({ length: lead }, (_, index) => (
          <li key={`lead-${index}`} aria-hidden />
        ))}
        {days.map((day) => {
          const state = dayState(day);
          const left = Math.max(0, day.capacity - day.booked);
          const chosen = selection !== null && selection !== undefined && end !== null && day.date >= selection.start && day.date < end;
          const label = `${formatDay(day.date)}: ${state === 'full' ? 'full' : `${left} of ${day.capacity} spaces free`}${chosen ? ', in your booking' : ''}`;
          const body = (
            <>
              <span className="text-xs font-bold leading-none">{Number(day.date.slice(8))}</span>
              <span className="mt-0.5 flex items-center gap-0.5 text-[0.6rem] leading-none">
                {state === 'full' ? (
                  <>
                    <Ban size={9} aria-hidden /> Full
                  </>
                ) : (
                  `${left} left`
                )}
              </span>
            </>
          );
          const className = cn(
            'flex h-11 w-full flex-col items-center justify-center rounded-chip ring-inset',
            state === 'full' ? 'bg-okada-soft text-okada' : state === 'filling' ? 'bg-danfo-soft text-[#6b4b00]' : 'bg-naira-soft text-naira',
            chosen && 'ring-2 ring-ink',
          );
          return (
            <li key={day.date}>
              {onPick && state !== 'full' ? (
                <button type="button" aria-label={label} aria-pressed={chosen} onClick={() => onPick(day.date)} className={cn(className, 'hover:brightness-95')}>
                  {body}
                </button>
              ) : (
                <span aria-label={label} role="img" className={className}>
                  {body}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-2xs text-text-soft">
        <Legend className="bg-naira-soft ring-naira/40" label="Plenty of space" />
        <Legend className="bg-danfo-soft ring-danfo/60" label="Filling up" />
        <Legend className="bg-okada-soft ring-okada/40" label="Full" />
      </p>
    </div>
  );
}

function Legend({ className, label }: { readonly className: string; readonly label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span aria-hidden className={cn('size-3 rounded-[3px] ring-1', className)} />
      {label}
    </span>
  );
}
