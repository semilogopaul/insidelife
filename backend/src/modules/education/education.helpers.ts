import {
  MINUTES_PER_DAY,
  MINUTES_PER_HOUR,
  findAction,
  isWeekend,
  type GameMinute,
  type NotificationDto,
  isInterruptibleActivity,
} from '@insidelife/shared';
import { GameRuleException } from '../../common/exceptions/domain.exception.js';
import type { SimulationContext } from '../simulation/simulation-context.js';

/** Routine priorities (hospital > away > work > lecture). */
export const LECTURE_PRIORITY = 10;
export const WORK_PRIORITY = 20;

/** Add (or replace) a temporary mood modifier. */
export function addMoodModifier(ctx: SimulationContext, id: string, label: string, value: number, days: number): void {
  const character = ctx.character;
  character.moodModifiers = [
    ...character.moodModifiers.filter((modifier) => modifier.id !== id),
    { id, label, value, until: ctx.time + days * MINUTES_PER_DAY },
  ];
}

/** Commands need the character standing still (not mid-trip, not in the middle of another action). */
export function assertFree(ctx: SimulationContext): void {
  const character = ctx.character;
  if (character.travel) throw new GameRuleException('TRAVELLING', 'You’re on the move. Arrive first.');
  const activity = character.activity;
  if (activity && !isInterruptibleActivity(activity) && activity.endsAt > ctx.time) {
    const verb = findAction(activity.actionId)?.verb.toLowerCase() ?? 'doing something';
    throw new GameRuleException('BUSY', `You’re busy (${verb}). Finish or cancel it first.`);
  }
}

/** Weekday, not a public holiday: the days lectures, classes and PPA run. */
export function isWorkingDay(ctx: SimulationContext, at: GameMinute): boolean {
  return !isWeekend(at) && !ctx.world.isActive(at, 'public-holiday');
}

/** A [start, end) window on a given day at whole hours. */
export function dayWindow(dayIndex: number, startHour: number, endHour: number): { readonly startsAt: GameMinute; readonly endsAt: GameMinute } {
  const dayStart = dayIndex * MINUTES_PER_DAY;
  return { startsAt: dayStart + startHour * MINUTES_PER_HOUR, endsAt: dayStart + endHour * MINUTES_PER_HOUR };
}

export function minutesOf(start: GameMinute, end: GameMinute): number {
  return Math.max(0, end - start);
}

export type NotificationTone = NotificationDto['tone'];
