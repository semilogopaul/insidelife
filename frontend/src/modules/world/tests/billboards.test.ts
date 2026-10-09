import { AD_SLOTS, BILLBOARD_SLOT_IDS, type LiveBillboardsDto } from '@insidelife/shared';
import { describe, expect, it } from 'vitest';
import { currentBillboard, rotationFor } from '../city/billboards/billboard-content';

const live: LiveBillboardsDto = {
  generatedAt: '2026-10-08T00:00:00Z',
  phoneApps: [],
  priceLabels: { totem: 'From ₦3,500/week' },
  slots: [
    {
      slotId: 'lekki-toll-gate',
      format: 'landscape',
      width: 1500,
      height: 500,
      rotationSeconds: 10,
      creatives: [
        { campaignId: 'a', imageUrl: 'https://cdn.example/a.webp', linkUrl: 'https://a.example', title: 'A' },
        { campaignId: 'b', imageUrl: 'https://cdn.example/b.webp', linkUrl: 'https://b.example', title: 'B' },
      ],
      hasSpace: false,
      houseAd: { headline: 'Your ad here', body: 'Open Promote', priceLabel: '₦105,000/week', action: { type: 'open-phone-app', app: 'billboards', slotId: 'lekki-toll-gate' } },
    },
  ],
};

describe('billboard rotation', () => {
  it('shows house ads when nothing is booked (or the endpoint is missing)', () => {
    for (const slotId of BILLBOARD_SLOT_IDS) expect(currentBillboard(slotId, undefined, 0).kind).toBe('house');
    const house = currentBillboard('ikorodu-garage', undefined, 0);
    expect(house.kind === 'house' && house.priceLabel).toBe('₦17,500/week');
    const lightbox = AD_SLOTS.find((slot) => slot.kind === 'totem');
    const empty = lightbox ? currentBillboard(lightbox.id, undefined, 0) : null;
    expect(empty?.kind === 'house' && empty.priceLabel).toMatch(/^₦[\d,]+\/week$/);
  });

  it('rotates live creatives every rotationSeconds, the same for every viewer', () => {
    expect(rotationFor('lekki-toll-gate', live).items).toHaveLength(2);
    const first = currentBillboard('lekki-toll-gate', live, 0);
    const second = currentBillboard('lekki-toll-gate', live, 10_000);
    const third = currentBillboard('lekki-toll-gate', live, 20_000);
    expect(first.kind === 'creative' && first.campaignId).toBe('a');
    expect(second.kind === 'creative' && second.campaignId).toBe('b');
    expect(third.kind === 'creative' && third.campaignId).toBe('a');
  });
});
