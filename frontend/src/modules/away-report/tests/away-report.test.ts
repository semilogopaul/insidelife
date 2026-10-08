import { describe, expect, it } from 'vitest';
import type { NotificationDto, NotificationKind } from '@insidelife/shared';
import { buildAwaySummary, categoryOf, gameMinutesAway } from '../services/away-report';

const SINCE = Date.parse('2026-10-08T08:00:00.000Z');
let seq = 0;

function note(kind: NotificationKind, minutesAfter: number, extra: Partial<NotificationDto> = {}): NotificationDto {
  seq += 1;
  return {
    id: `n${seq}`,
    kind,
    title: `${kind} ${seq}`,
    body: 'Body.',
    gameMinute: 1_000 + minutesAfter,
    createdAt: new Date(SINCE + minutesAfter * 60_000).toISOString(),
    read: false,
    tone: 'neutral',
    ...extra,
  };
}

describe('buildAwaySummary', () => {
  it('keeps only unread notifications created since the player left', () => {
    const summary = buildAwaySummary(
      [note('salary', 10, { amount: 412_000 }), note('bill', -5, { amount: -30_000 }), note('family', 20, { read: true }), note('health', 0)],
      SINCE,
    );
    expect(summary.count).toBe(2);
    expect(summary.groups.map((group) => group.category)).toEqual(['salary', 'health']);
  });

  it('sums money in and out and nets each group', () => {
    const summary = buildAwaySummary(
      [
        note('salary', 5, { amount: 412_000 }),
        note('bill', 6, { amount: -150_000 }),
        note('bill', 7, { amount: -25_000 }),
        note('money-received', 8, { amount: 20_000 }),
        note('world', 9),
      ],
      SINCE,
    );
    expect(summary.moneyIn).toBe(432_000);
    expect(summary.moneyOut).toBe(175_000);
    expect(summary.net).toBe(257_000);
    expect(summary.groups.find((group) => group.category === 'bills')?.net).toBe(-175_000);
  });

  it('gives the weekly habits summary its own group', () => {
    const summary = buildAwaySummary([note('achievement', 3, { title: 'Your week of habits' }), note('achievement', 4, { title: 'Achievement unlocked: Omo Lagos' })], SINCE);
    expect(summary.groups.map((group) => group.category)).toEqual(['habits', 'events']);
    expect(categoryOf('achievement', 'Your week of habits')).toBe('habits');
  });

  it('orders groups salary → bills → health → family → money → events → other, newest first inside', () => {
    const summary = buildAwaySummary(
      [note('system', 1), note('world', 2), note('relationship', 3), note('health', 4), note('bill', 5), note('salary', 6), note('investment', 7), note('family', 9)],
      SINCE,
    );
    expect(summary.groups.map((group) => group.category)).toEqual(['salary', 'bills', 'health', 'family', 'money', 'events', 'other']);
    const family = summary.groups.find((group) => group.category === 'family');
    expect(family?.items.map((item) => item.kind)).toEqual(['family', 'relationship']);
  });

  it('returns an empty summary when nothing new happened', () => {
    const summary = buildAwaySummary([note('salary', -30, { amount: 1 })], SINCE);
    expect(summary).toEqual({ count: 0, moneyIn: 0, moneyOut: 0, net: 0, groups: [] });
  });
});

describe('helpers', () => {
  it('maps love and family together, achievements into events', () => {
    expect(categoryOf('relationship')).toBe('family');
    expect(categoryOf('achievement')).toBe('events');
    expect(categoryOf('property')).toBe('money');
  });

  it('converts real time away into game minutes with the clock scale', () => {
    expect(gameMinutesAway(5 * 60_000, 120)).toBe(600);
    expect(gameMinutesAway(-1, 120)).toBe(0);
  });
});
