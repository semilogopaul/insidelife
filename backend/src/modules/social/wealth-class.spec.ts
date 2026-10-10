import { describe, expect, it } from 'vitest';
import type { PresenceService } from '../presence/presence.service.js';
import type { WorldService } from '../world/world.service.js';
import { PlayerCardsService, type CardRow } from './player-cards.service.js';
import { wealthClassOfRow } from './wealth-class.service.js';

const world = { now: () => 0, economy: () => ({ usdRate: 1500 }) } as unknown as WorldService;
const cards = new PlayerCardsService(undefined as never, {} as PresenceService, world);

const row = (extra: Partial<CardRow>): CardRow => ({ id: 'c1', handle: 'ada', first_name: 'Ada', last_name: 'B', status: 10, title: null, ...extra });

describe('wealth class from bank rows', () => {
  it('is lapo at or under ₦20M and nepo above', () => {
    expect(wealthClassOfRow({ bank_naira: '20000000', bank_usd_cents: '0' }, 1500)).toBe('lapo');
    expect(wealthClassOfRow({ bank_naira: '20000001', bank_usd_cents: '0' }, 1500)).toBe('nepo');
  });

  it('counts dollars at the going rate', () => {
    // $10,000 at ₦1,500 = ₦15M, plus ₦6M cash = ₦21M
    expect(wealthClassOfRow({ bank_naira: 6_000_000, bank_usd_cents: 1_000_000 }, 1500)).toBe('nepo');
    expect(wealthClassOfRow({ bank_naira: 4_000_000, bank_usd_cents: 1_000_000 }, 1500)).toBe('lapo');
  });

  it('defaults to lapo when the row has no bank figures', () => {
    expect(wealthClassOfRow({}, 1500)).toBe('lapo');
  });
});

describe('player cards', () => {
  it('carry the class but never the amount', () => {
    const card = cards.toCard(row({ bank_naira: '90000000', bank_usd_cents: '0' }), true);
    expect(card.wealthClass).toBe('nepo');
    expect(JSON.stringify(card)).not.toContain('90000000');
    expect(cards.toCard(row({ bank_naira: '5', bank_usd_cents: '0' }), false).wealthClass).toBe('lapo');
  });
});
