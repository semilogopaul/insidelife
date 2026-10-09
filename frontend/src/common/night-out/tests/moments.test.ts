import { describe, expect, it } from 'vitest';
import { NIGHT_OUT_RULES, type VenueMomentDto } from '@insidelife/shared';
import { momentCopy } from '../moment-copy';
import { bannerEndsAt, bannerMoments, liveMoments, mergeMoments, nextMomentChange, useVenueMoments, vipMoment } from '../moments-store';

const ADA = { characterId: 'ada-id', handle: 'ada', firstName: 'Ada' };
const FEMI = { characterId: 'femi-id', handle: 'femi', firstName: 'Femi' };

function moment(overrides: Partial<VenueMomentDto>): VenueMomentDto {
  return {
    id: 'm1',
    venueId: 'quilox',
    kind: 'shoutout',
    from: ADA,
    to: null,
    label: 'Shoutout',
    emoji: '🎤',
    tier: 'shoutout-basic',
    effect: 'spotlight',
    message: 'Lagos to the world',
    durationMs: 8_000,
    startsAt: 10_000,
    ...overrides,
  };
}

describe('mergeMoments', () => {
  it('keeps this room’s moments in play order, without duplicates or finished ones', () => {
    const first = moment({ id: 'a', startsAt: 10_000 });
    const queued = moment({ id: 'b', startsAt: 20_000 });
    const elsewhere = moment({ id: 'c', venueId: 'club-57' });
    const over = moment({ id: 'd', startsAt: 0, durationMs: 1_000 });
    const merged = mergeMoments([], [queued, first, elsewhere, over], 'quilox', 5_000);
    expect(merged.map((item) => item.id)).toEqual(['a', 'b']);
    expect(mergeMoments(merged, [first], 'quilox', 5_000)).toBe(merged);
    expect(mergeMoments(merged, [], 'quilox', 19_000).map((item) => item.id)).toEqual(['b']);
  });

  it('forgets the last room when you walk into another', () => {
    const store = useVenueMoments.getState();
    store.enter('quilox');
    useVenueMoments.getState().add([moment({ id: 'x' })], 0);
    expect(useVenueMoments.getState().moments).toHaveLength(1);
    useVenueMoments.getState().enter('club-57');
    expect(useVenueMoments.getState().moments).toHaveLength(0);
    useVenueMoments.getState().add([moment({ id: 'y' })], 0);
    expect(useVenueMoments.getState().moments).toHaveLength(0);
    useVenueMoments.getState().enter(null);
  });
});

describe('bannerMoments', () => {
  const shoutout = moment({ id: 's', startsAt: 10_000 });
  const next = moment({ id: 's2', startsAt: 19_500, from: FEMI });
  const bottle = moment({ id: 'b', kind: 'bottle', tier: 'champagne', effect: 'sparkler', label: 'Champagne', emoji: '🍾', to: FEMI, message: null, startsAt: 12_000, durationMs: 10_000 });
  const vip = moment({ id: 'v', kind: 'vip-section', tier: 'vip-section', effect: 'vip-sign', label: 'Reserve the VIP section', message: null, startsAt: 11_000, durationMs: 600_000 });
  const all = [shoutout, vip, bottle, next];

  it('shows one shoutout at a time, plus bottles and experiences under it', () => {
    expect(bannerMoments(all, 9_000)).toEqual({ headline: null, others: [] });
    const now = bannerMoments(all, 13_000);
    expect(now.headline?.id).toBe('s');
    expect(now.others.map((item) => item.id)).toEqual(['b', 'v']);
    expect(bannerMoments(all, 20_000).headline?.id).toBe('s2');
  });

  it('keeps the VIP banner short while its sign stays up until closing', () => {
    expect(bannerEndsAt(vip)).toBe(11_000 + NIGHT_OUT_RULES.vipBannerMs);
    expect(bannerMoments([vip], 30_000).others).toHaveLength(0);
    expect(liveMoments([vip], 30_000)).toHaveLength(1);
    expect(vipMoment([vip], 30_000)?.from.handle).toBe('ada');
    expect(vipMoment([vip], 700_000)).toBeNull();
  });

  it('wakes views exactly when something starts or stops', () => {
    expect(nextMomentChange(all, 9_000)).toBe(10_000);
    expect(nextMomentChange(all, 10_000)).toBe(11_000);
    expect(nextMomentChange([shoutout], 18_000)).toBeNull();
  });
});

describe('momentCopy', () => {
  it('puts the right name in bold', () => {
    expect(momentCopy(moment({ tier: 'shoutout-odogwu' }))).toMatchObject({ name: '@ada', text: 'Lagos to the world' });
    expect(momentCopy(moment({ tier: 'shoutout-odogwu' })).eyebrow).toContain('Odogwu');
    expect(momentCopy(moment({ kind: 'bottle', tier: 'champagne', label: 'Champagne', emoji: '🍾', to: FEMI })).line).toBe('@ada → @femi: Champagne 🍾');
    expect(momentCopy(moment({ kind: 'birthday', tier: 'birthday', to: FEMI })).name).toBe('@femi');
    expect(momentCopy(moment({ kind: 'birthday', tier: 'birthday', to: null })).name).toBe('@ada');
    expect(momentCopy(moment({ kind: 'tip', tier: 'tip-dj', emoji: '🎧' })).line).toContain('tipped the DJ');
  });
});
