import { describe, expect, it } from 'vitest';
import type { NotificationDto } from '@insidelife/shared';
import { badgeFromNotification, isCelebratedNotification } from '../services/badge-from-notification';

const note = (title: string, body = 'Stepped out into the Lagos madness. Common · +1 clout'): NotificationDto => ({
  id: 'n1',
  kind: 'achievement',
  title,
  body,
  gameMinute: 0,
  createdAt: '2026-10-08T00:00:00.000Z',
  read: false,
  tone: 'good',
});

describe('badgeFromNotification', () => {
  it('celebrates unlocks and goals with a clean title', () => {
    expect(badgeFromNotification(note('Achievement unlocked: Omo Lagos'))).toMatchObject({ kind: 'achievement', title: 'Omo Lagos', body: 'Stepped out into the Lagos madness.' });
    expect(badgeFromNotification(note('Secret achievement unlocked: Night crawler'))?.title).toBe('Night crawler');
    expect(badgeFromNotification(note('Life Goal complete: Step outside'))).toMatchObject({ kind: 'goal', title: 'Step outside' });
    expect(badgeFromNotification(note('3 achievements unlocked!'))?.title).toBe('3 achievements unlocked!');
  });

  it('ignores achievement-kind notifications that are not unlocks', () => {
    expect(badgeFromNotification(note('Your week of habits', '12h of study. Intellect +3.'))).toBeNull();
    expect(isCelebratedNotification(note('Your week of habits'))).toBe(false);
    expect(isCelebratedNotification({ ...note('Achievement unlocked: Omo Lagos'), kind: 'social' })).toBe(false);
  });
});
