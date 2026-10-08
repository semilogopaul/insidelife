import type { NotificationDto } from '@insidelife/shared';
import type { BadgeCelebration } from '../hooks/use-celebration-store';

const PREFIXES: ReadonlyArray<{ readonly pattern: RegExp; readonly kind: BadgeCelebration['kind']; readonly keepTitle?: boolean }> = [
  { pattern: /^Life Goal complete:\s*/i, kind: 'goal' },
  { pattern: /^Chapter \d+ complete:\s*/i, kind: 'goal' },
  { pattern: /^(Secret )?achievement unlocked:\s*/i, kind: 'achievement' },
  { pattern: /^\d+ achievements unlocked!?/i, kind: 'achievement', keepTitle: true },
  { pattern: /^Every Life Goal complete/i, kind: 'goal', keepTitle: true },
];

/**
 * Turn an unlock notification into a toast-level celebration ("Achievement unlocked: Omo Lagos" → "Omo Lagos").
 * Other `achievement`-kind notifications (e.g. the weekly habits summary) aren't unlocks and return null.
 */
export function badgeFromNotification(notification: NotificationDto): BadgeCelebration | null {
  if (notification.kind !== 'achievement') return null;
  const prefix = PREFIXES.find((candidate) => candidate.pattern.test(notification.title));
  if (!prefix) return null;
  const title = prefix.keepTitle ? notification.title : notification.title.replace(prefix.pattern, '');
  const firstSentence = notification.body.split(/(?<=[.!?])\s/)[0] ?? '';
  return { key: `badge:${notification.id}`, kind: prefix.kind, title, body: firstSentence.length > 0 ? firstSentence : null };
}

/** True when `CelebrationLayer` celebrates this notification itself (so the game root can skip its plain toast). */
export function isCelebratedNotification(notification: NotificationDto): boolean {
  return badgeFromNotification(notification) !== null;
}
