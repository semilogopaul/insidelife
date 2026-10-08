import {
  MINUTES_PER_DAY,
  formatClock,
  formatDate,
  formatGameDuration,
  startOfDay,
  type GameMinute,
} from '@insidelife/shared';

/** "in 2d 4h" / "3h ago" / "now". */
export function relativeGameTime(t: GameMinute, now: GameMinute): string {
  const delta = t - now;
  if (Math.abs(delta) < 1) return 'now';
  return delta > 0 ? `in ${formatGameDuration(delta)}` : `${formatGameDuration(-delta)} ago`;
}

/** "Today 08:00", "Tomorrow 14:30", "Fri 14 Mar 2031, 08:00". */
export function gameDateTime(t: GameMinute, now: GameMinute): string {
  const day = startOfDay(t);
  const today = startOfDay(now);
  if (day === today) return `Today ${formatClock(t)}`;
  if (day === today + MINUTES_PER_DAY) return `Tomorrow ${formatClock(t)}`;
  if (day === today - MINUTES_PER_DAY) return `Yesterday ${formatClock(t)}`;
  return `${formatDate(t)}, ${formatClock(t)}`;
}
