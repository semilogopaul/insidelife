import { describe, expect, it } from 'vitest';
import type { RelationshipDto } from '@insidelife/shared';
import { interactionsFor, previewInteraction, ritesFor, weddingCost, type PreviewContext } from '../services/interaction-preview';

const ctx: PreviewContext = {
  now: 10_000,
  selfAge: 27,
  selfGender: 'male',
  selfStateOfOrigin: 'lagos',
  charisma: 20,
  status: 0,
  priceIndex: 1,
  venueType: null,
  committedElsewhere: false,
};

const rel = (patch: Partial<RelationshipDto> = {}): RelationshipDto => ({
  id: 'r1',
  personId: 'p1',
  characterId: null,
  handle: null,
  isPlayer: false,
  firstName: 'Ngozi',
  lastName: 'Eze',
  gender: 'female',
  age: 26,
  alive: true,
  deceasedAt: null,
  ethnicity: 'igbo',
  traits: [],
  occupation: null,
  wealth: 'comfortable',
  kind: 'partner',
  closeness: 50,
  romance: 50,
  since: 0,
  lastContactAt: 0,
  metAt: null,
  datingSince: 0,
  engagedAt: null,
  introductionDone: false,
  traditionalWeddingDone: false,
  whiteWeddingDone: false,
  expectingAt: null,
  cooldowns: {},
  ...patch,
});

describe('interaction preview', () => {
  it('lists only interactions that fit the relationship', () => {
    expect(interactionsFor(rel({ kind: 'mother' }))).not.toContain('flirt');
    expect(interactionsFor(rel({ kind: 'spouse' }))).toContain('divorce');
    expect(interactionsFor(rel({ alive: false }))).toEqual([]);
  });

  it('explains blocks: age, cooldown, place and the order of ceremonies', () => {
    expect(previewInteraction('flirt', rel({ age: 17 }), ctx).blocked).toMatch(/18\+/);
    expect(previewInteraction('chat', rel({ cooldowns: { chat: 10_090 } }), ctx).blocked).toMatch(/try again in 1h 30m/);
    const date = previewInteraction('date', rel(), ctx);
    expect(date.blocked).toMatch(/somewhere nice/);
    expect(date.fix).toBe('map');
    expect(previewInteraction('traditional-wedding', rel({ kind: 'fiance' }), ctx).blocked).toMatch(/introduction first/);
  });

  it('prices ceremonies by the bride’s culture and the partner family’s contribution', () => {
    expect(ritesFor({ ethnicity: 'igbo' }, ctx).rites.ethnicity).toBe('igbo');
    expect(ritesFor({ ethnicity: 'igbo' }, { selfGender: 'female', selfStateOfOrigin: 'lagos' }).side).toBe('bride');
    expect(weddingCost('modest', { wealth: 'comfortable', isPlayer: false }, 1)).toBe(2_400_000);
    expect(weddingCost('modest', { wealth: 'comfortable', isPlayer: true }, 1)).toBe(3_000_000);
    const intro = previewInteraction('introduction', rel({ kind: 'fiance' }), { ...ctx, priceIndex: 1.1 });
    expect(intro.cost).toBe(440_000);
  });

  it('estimates odds within 5-95% and sends proposals to real players', () => {
    const flirt = previewInteraction('flirt', rel({ closeness: 100, romance: 100, traits: ['romantic'] }), ctx);
    expect(flirt.odds).toBe(0.95);
    expect(previewInteraction('chat', rel(), ctx).odds).toBeNull();
    const player = previewInteraction('ask-out', rel({ kind: 'friend', isPlayer: true, closeness: 40, romance: 40 }), ctx);
    expect(player.viaProposal).toBe(true);
    expect(player.odds).toBeNull();
  });
});
