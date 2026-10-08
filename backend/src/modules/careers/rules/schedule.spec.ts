import { MINUTES_PER_DAY, MINUTES_PER_HOUR, findJob, fromDateParts, toDateParts, type JobDefinition } from '@insidelife/shared';
import { attendanceRatio, classifyShiftTime, overlapMinutes, scheduledMinutesBetween, shiftForDay, type EmploymentWindow } from './schedule.js';

const job = (id: string): JobDefinition => {
  const definition = findJob(id);
  if (!definition) throw new RangeError(`missing job ${id}`);
  return definition;
};

const window: EmploymentWindow = { startedAt: 0, leaveFrom: null, leaveUntil: null };
const noHolidays = (): boolean => false;
const allHolidays = (): boolean => true;
/** Find the first day index at/after `from` with the given weekday (0 = Monday). */
const dayWithWeekday = (weekday: number, from = 10): number => {
  for (let day = from; ; day++) if (toDateParts(day * MINUTES_PER_DAY).weekday === weekday) return day;
};

describe('work schedule', () => {
  const bank = job('bank-graduate-trainee');

  it('puts a weekday shift on the routine and none at the weekend', () => {
    const monday = dayWithWeekday(0);
    const shift = shiftForDay(bank, window, monday, noHolidays);
    expect(shift?.startsAt).toBe(monday * MINUTES_PER_DAY + 7 * MINUTES_PER_HOUR);
    expect(shift ? shift.endsAt - shift.startsAt : 0).toBe(11 * MINUTES_PER_HOUR);
    expect(shiftForDay(bank, window, dayWithWeekday(5), noHolidays)).toBeNull();
  });

  it('skips days before the start date and during approved leave', () => {
    const monday = dayWithWeekday(0);
    expect(shiftForDay(bank, { ...window, startedAt: (monday + 1) * MINUTES_PER_DAY }, monday, noHolidays)).toBeNull();
    const onLeave = { ...window, leaveFrom: monday * MINUTES_PER_DAY, leaveUntil: (monday + 3) * MINUTES_PER_DAY };
    expect(shiftForDay(bank, onLeave, monday + 1, noHolidays)).toBeNull();
    expect(shiftForDay(bank, onLeave, monday + 3, noHolidays)).not.toBeNull();
  });

  it('gives formal staff public holidays but hustlers keep working', () => {
    const monday = dayWithWeekday(0);
    expect(shiftForDay(bank, window, monday, allHolidays)).toBeNull();
    expect(shiftForDay(job('pos-attendant'), window, monday, allHolidays)).not.toBeNull();
  });

  it('runs night shifts past midnight', () => {
    const guard = job('security-guard');
    const shift = shiftForDay(guard, window, dayWithWeekday(0), noHolidays);
    expect(shift && shift.endsAt - (Math.floor(shift.startsAt / MINUTES_PER_DAY) + 1) * MINUTES_PER_DAY).toBe(6 * MINUTES_PER_HOUR);
  });

  it('counts a month of scheduled minutes', () => {
    const from = fromDateParts({ year: 2027, month: 3, day: 1 });
    const minutes = scheduledMinutesBetween(bank, window, from, from + 30 * MINUTES_PER_DAY, noHolidays);
    const weekdays = Array.from({ length: 30 }, (_, i) => toDateParts(from + i * MINUTES_PER_DAY).weekday).filter((weekday) => weekday < 5).length;
    expect(minutes).toBe(weekdays * 11 * MINUTES_PER_HOUR);
  });

  it('classifies time inside a shift', () => {
    expect(classifyShiftTime({ kind: 'work', locationId: 'marina' }, 'marina')).toBe('worked');
    expect(classifyShiftTime({ kind: 'action', locationId: 'marina', actionCategory: 'food' }, 'marina')).toBe('worked');
    expect(classifyShiftTime({ kind: 'action', locationId: 'the-vault', actionCategory: 'fun' }, 'marina')).toBe('absent');
    expect(classifyShiftTime({ kind: 'action', locationId: 'marina', actionCategory: 'fun' }, 'marina')).toBe('absent');
    expect(classifyShiftTime({ kind: 'commute', locationId: 'marina' }, 'marina')).toBe('late');
    expect(classifyShiftTime({ kind: 'hospital', locationId: 'luth' }, 'marina')).toBe('excused');
    expect(classifyShiftTime({ kind: 'sleep', locationId: 'home:x' }, 'marina')).toBe('absent');
  });

  it('measures attendance with lateness counting half', () => {
    expect(attendanceRatio(0, 0, 0)).toBe(1);
    expect(attendanceRatio(600, 540, 60)).toBeCloseTo(0.95, 5);
    expect(attendanceRatio(600, 0, 0)).toBe(0);
    expect(overlapMinutes(0, 100, 50, 200)).toBe(50);
    expect(overlapMinutes(0, 100, 100, 200)).toBe(0);
  });
});
