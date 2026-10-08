import { describe, expect, it } from 'vitest';
import type { ModerationCampaignDto, ModerationQueueDto } from '@insidelife/shared';
import { itemKey, itemsFor, nextSelection, reasonProblem, type QueueItem } from '../services/queue';

const campaign = (id: string): ModerationCampaignDto =>
  ({ id, title: id, ownerHandle: 'tolu', ownerUserId: 'u', slotId: 'yaba-hub' }) as unknown as ModerationCampaignDto;

const queue: ModerationQueueDto = {
  campaigns: [campaign('a'), campaign('b'), campaign('c')],
  clubOrders: [],
  refundsDue: { campaigns: [campaign('r')], clubOrders: [] },
};

describe('moderation queue', () => {
  it('lists each section with stable keys', () => {
    expect(itemsFor(queue, 'campaigns').map(itemKey)).toEqual(['campaigns:a', 'campaigns:b', 'campaigns:c']);
    expect(itemsFor(queue, 'refunds').map(itemKey)).toEqual(['campaigns:r']);
    expect(itemsFor(queue, 'club-orders')).toEqual([]);
  });

  it('selects the item that slides into place after a decision', () => {
    const before: QueueItem[] = itemsFor(queue, 'campaigns');
    const after = before.filter((item) => item.id !== 'b');
    expect(nextSelection(before, after, 'campaigns:b')).toBe('campaigns:c');
    const afterLast = before.filter((item) => item.id !== 'c');
    expect(nextSelection(before, afterLast, 'campaigns:c')).toBe('campaigns:b');
    expect(nextSelection(before, [], 'campaigns:a')).toBeNull();
  });

  it('requires a real reason to reject', () => {
    expect(reasonProblem('  ')).toMatch(/at least 3/);
    expect(reasonProblem('Scam offer')).toBeNull();
    expect(reasonProblem('x'.repeat(301))).toMatch(/under 300/);
  });
});
