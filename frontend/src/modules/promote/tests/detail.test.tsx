import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { PromotionReceiptDto, PromotionTimelineStepDto } from '@insidelife/shared';
import { ReceiptCard } from '../components/detail/ReceiptCard';
import { Timeline } from '../components/detail/Timeline';
import { parsePromoteLink } from '../services/deep-links';
import { gameTimeLabel, playTimeLabels, relativeTo } from '../services/play-times';
import { audienceLine, songGuaranteeLine } from '../services/song-value';

afterEach(cleanup);

const ORDER = '7c2b1f0e-6a4d-4c51-9b7e-0d2f3a4b5c6d';

describe('Promote deep links', () => {
  it('opens what the server’s notices point at', () => {
    expect(parsePromoteLink(`campaign:${ORDER}`)).toEqual({ kind: 'campaign', id: ORDER });
    expect(parsePromoteLink(`song:${ORDER}`)).toEqual({ kind: 'song', orderId: ORDER, venueId: null });
    expect(parsePromoteLink(`song:${ORDER}:quilox`)).toEqual({ kind: 'song', orderId: ORDER, venueId: 'quilox' });
    expect(parsePromoteLink('mmia-arrivals')).toEqual({ kind: 'book', slotId: 'mmia-arrivals' });
    expect(parsePromoteLink('campaigns')).toEqual({ kind: 'campaigns' });
    expect(parsePromoteLink('tracks')).toEqual({ kind: 'tracks' });
  });

  it('ignores anything malformed', () => {
    for (const bad of [null, '', 'campaign:nope', 'song:', `song:${ORDER}:<script>`, 'no-such-slot']) {
      const route = parsePromoteLink(bad);
      expect(route.kind === 'boards' || (route.kind === 'song' && route.venueId === null)).toBe(true);
    }
  });
});

describe('play times (real and game clocks)', () => {
  const now = Date.parse('2026-10-09T20:00:00Z');
  it('says how long until a play, or that it is on now', () => {
    expect(relativeTo(now + 3 * 60_000, now)).toBe('in 3 min');
    expect(relativeTo(now + 65 * 60_000, now)).toBe('in 1 h 5 min');
    expect(relativeTo(now, now)).toBe('now');
    expect(playTimeLabels({ venueId: 'quilox', startsAtMs: now - 60_000, endsAtMs: now + 90_000, gameMinute: 0 }, now)).toMatchObject({ playing: true, relative: 'on now, 2 min left' });
  });

  it('shows the game time it plays at', () => {
    // Game minute 0 = 1 Jan 2027, 00:00 (a Friday).
    expect(gameTimeLabel(23 * 60)).toMatch(/^11:00 PM /);
    expect(playTimeLabels({ venueId: 'quilox', startsAtMs: now + 120_000, endsAtMs: now + 300_000, gameMinute: 60 }, now).game).toMatch(/^1:00 AM /);
  });
});

describe('song value copy', () => {
  it('shows the guarantee and what a day and a play cost before purchase', () => {
    const line = songGuaranteeLine({ playsPerDay: 120, minPlaysPerDay: 119, clubs: 12, weekPriceKobo: 3_500_000 }, 150);
    expect(line).toContain('≈ 120 plays a day across 12 clubs and lounges (never under 119)');
    expect(line).toContain('₦35,000 a week = ₦5,000 a day, about ₦42 a play');
    expect(line).toContain('2:30');
  });

  it('tells the artist who heard it', () => {
    expect(audienceLine(12, 37)).toBe('Heard by 37 players across 12 plays.');
    expect(audienceLine(0, 0)).toBe('No plays yet.');
    expect(audienceLine(3, 0)).toMatch(/no players were in the club/);
  });
});

describe('detail components', () => {
  it('lists the timeline in order, says which step it is at and why it was refused', () => {
    const steps: PromotionTimelineStepDto[] = [
      { step: 'paid', state: 'done', at: '2026-10-09T10:05:00.000Z', note: null },
      { step: 'in-review', state: 'done', at: '2026-10-09T10:05:00.000Z', note: null },
      { step: 'refund-due', state: 'current', at: '2026-10-09T13:00:00.000Z', note: 'Gambling ad' },
      { step: 'refunded', state: 'next', at: null, note: null },
    ];
    render(<Timeline steps={steps} />);
    const items = screen.getAllByRole('listitem');
    expect(items.map((item) => item.textContent?.split('(')[0]?.trim())).toEqual(['Paid', 'In review', 'Refund on the way', 'Refunded']);
    expect(items[2]?.getAttribute('aria-current')).toBe('step');
    expect(screen.getByText('Gambling ad')).toBeTruthy();
  });

  it('shows the receipt with the block price, total and the payment reference', () => {
    const receipt: PromotionReceiptDto = { amountKobo: 15_000_000, blocks: 2, blockDays: 3, blockPriceKobo: 7_500_000, paymentReference: ORDER, paidAt: '2026-10-09T10:05:00.000Z', refundedKobo: 0 };
    render(<ReceiptCard receipt={receipt} />);
    expect(screen.getByText(/per 3 days × 2/)).toBeTruthy();
    expect(screen.getByText('6 days')).toBeTruthy();
    expect(screen.getByText(ORDER)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy payment reference' })).toBeTruthy();
  });
});
