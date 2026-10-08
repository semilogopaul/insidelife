import { MINUTES_PER_DAY, MINUTES_PER_HOUR, toDateParts, type ActionCategory, type ActivityKind, type GameMinute, type JobDefinition } from '@insidelife/shared';

/** The parts of an employment that shape its routine. */
export interface EmploymentWindow {
  readonly startedAt: GameMinute;
  readonly leaveFrom: GameMinute | null;
  readonly leaveUntil: GameMinute | null;
}

export interface WorkShift {
  readonly dayIndex: number;
  readonly startsAt: GameMinute;
  readonly endsAt: GameMinute;
}

/**
 * The shift for one game day, or null: not a working day, before the start date, on approved leave, or a public
 * holiday for jobs that observe them (hustles never close).
 */
export function shiftForDay(
  job: JobDefinition,
  window: EmploymentWindow,
  dayIndex: number,
  isPublicHoliday: (t: GameMinute) => boolean,
): WorkShift | null {
  const dayStart = dayIndex * MINUTES_PER_DAY;
  if (!job.schedule.days.includes(toDateParts(dayStart).weekday)) return null;
  const startsAt = dayStart + Math.round(job.schedule.startHour * MINUTES_PER_HOUR);
  const endsAt = startsAt + Math.round(job.schedule.hours * MINUTES_PER_HOUR);
  if (startsAt < window.startedAt) return null;
  if (window.leaveFrom !== null && window.leaveUntil !== null && startsAt >= window.leaveFrom && startsAt < window.leaveUntil) return null;
  if (job.perks.holidays && isPublicHoliday(dayStart + 12 * MINUTES_PER_HOUR)) return null;
  return { dayIndex, startsAt, endsAt };
}

/** Full scheduled minutes in [from, to) — used for payslip previews. */
export function scheduledMinutesBetween(
  job: JobDefinition,
  window: EmploymentWindow,
  from: GameMinute,
  to: GameMinute,
  isPublicHoliday: (t: GameMinute) => boolean,
): number {
  let total = 0;
  for (let day = Math.floor(from / MINUTES_PER_DAY) - 1; day * MINUTES_PER_DAY < to; day++) {
    const shift = shiftForDay(job, window, day, isPublicHoliday);
    if (shift) total += overlapMinutes(shift.startsAt, shift.endsAt, from, to);
  }
  return total;
}

export function overlapMinutes(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

/** How time inside a shift counts. */
export type ShiftTime = 'worked' | 'late' | 'absent' | 'excused';

/** Action categories that count as a break when taken at the workplace (lunch, a quick wash). */
export const WORKPLACE_BREAK_CATEGORIES: ReadonlySet<ActionCategory> = new Set<ActionCategory>(['food', 'hygiene']);

/**
 * Classify a timeline segment that overlaps a shift: at the workplace working (or on a lunch break there) = worked;
 * stuck in traffic = late; admitted to hospital = excused; anything else (an explicit action, idling elsewhere,
 * sleeping in) = absent.
 */
export function classifyShiftTime(
  segment: { readonly kind: ActivityKind; readonly locationId: string; readonly actionCategory?: ActionCategory },
  workLocationId: string,
): ShiftTime {
  const atWork = segment.locationId === workLocationId;
  if (segment.kind === 'work' && atWork) return 'worked';
  if (segment.kind === 'action' && atWork && segment.actionCategory !== undefined && WORKPLACE_BREAK_CATEGORIES.has(segment.actionCategory)) return 'worked';
  if (segment.kind === 'hospital') return 'excused';
  if (segment.kind === 'commute') return 'late';
  return 'absent';
}

/** Share of scheduled time that counts as present (lateness counts half). 1 when nothing was scheduled. */
export function attendanceRatio(scheduled: number, worked: number, late: number): number {
  if (scheduled <= 0) return 1;
  return Math.min(1, Math.max(0, (worked + late * 0.5) / scheduled));
}
