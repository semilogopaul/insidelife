import { formatClock12, toDateParts, WEEKDAYS, type ClubPlayTimeDto } from '@insidelife/shared';

/**
 * Play times in both clocks: the real local time on the player's phone ("9:42 PM") with how long until it, and the
 * in-game time it happens at ("11:00 PM, Sat in Lagos"). Pure, so the copy is testable.
 */

const realClock = new Intl.DateTimeFormat('en-NG', { hour: 'numeric', minute: '2-digit' });
const realDay = new Intl.DateTimeFormat('en-NG', { weekday: 'short', day: 'numeric', month: 'short' });

/** "in 3 min", "in 1 h 5 min", "now", "2 min ago". */
export function relativeTo(targetMs: number, nowMs: number): string {
  const minutes = Math.round((targetMs - nowMs) / 60_000);
  if (minutes === 0) return 'now';
  const abs = Math.abs(minutes);
  const span = abs < 60 ? `${abs} min` : `${Math.floor(abs / 60)} h${abs % 60 ? ` ${abs % 60} min` : ''}`;
  return minutes > 0 ? `in ${span}` : `${span} ago`;
}

/** "9:42 PM" (today) or "Sat 10 Oct, 9:42 PM" on another day, in the phone's time zone. */
export function realTimeLabel(ms: number, nowMs: number): string {
  const time = realClock.format(new Date(ms));
  return new Date(ms).toDateString() === new Date(nowMs).toDateString() ? time : `${realDay.format(new Date(ms))}, ${time}`;
}

/** "11:00 PM Sat" on the game clock. */
export function gameTimeLabel(gameMinute: number): string {
  const weekday = WEEKDAYS[toDateParts(gameMinute).weekday] ?? '';
  return `${formatClock12(gameMinute)} ${weekday.slice(0, 3)}`.trim();
}

export interface PlayTimeLabels {
  readonly real: string;
  readonly relative: string;
  readonly game: string;
  readonly playing: boolean;
}

export function playTimeLabels(play: ClubPlayTimeDto, nowMs: number): PlayTimeLabels {
  const playing = play.startsAtMs <= nowMs && nowMs < play.endsAtMs;
  return {
    real: realTimeLabel(play.startsAtMs, nowMs),
    relative: playing ? `on now, ${Math.max(1, Math.ceil((play.endsAtMs - nowMs) / 60_000))} min left` : relativeTo(play.startsAtMs, nowMs),
    game: gameTimeLabel(play.gameMinute),
    playing,
  };
}
