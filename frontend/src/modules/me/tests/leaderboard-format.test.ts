import { describe, expect, it } from 'vitest';
import type { LeaderboardDto, LeaderboardEntryDto } from '@insidelife/shared';
import { entryName, pinnedYou, podiumOf, rankLabel } from '../services/leaderboard-format';

const entry = (rank: number, characterId: string): LeaderboardEntryDto => ({
  rank,
  characterId,
  handle: `p${rank}`,
  firstName: 'Ada',
  lastName: 'Okafor',
  status: 100,
  statusTier: { id: 'known', label: 'Known in the area' },
  value: null,
  display: '₦10M+',
  detail: null,
});

const board = (you: LeaderboardDto['you'], entries: readonly LeaderboardEntryDto[] = [entry(1, 'a'), entry(2, 'b')]): LeaderboardDto => ({
  board: 'self-made',
  title: 'Self-made rich list',
  blurb: '',
  entries,
  you,
  generatedAt: '2026-10-08T00:00:00.000Z',
});

describe('leaderboard formatting', () => {
  it('labels ranks and podiums', () => {
    expect(rankLabel(1)).toBe('#1');
    expect(rankLabel(1204)).toBe('#1,204');
    expect(rankLabel(null)).toBe('—');
    expect([1, 2, 3, 4].map(podiumOf)).toEqual(['gold', 'silver', 'bronze', null]);
    expect(entryName({ firstName: 'Ada', lastName: 'Okafor' })).toBe('Ada Okafor');
  });

  it('pins your rank and knows when you are already in the top list', () => {
    expect(pinnedYou(board({ rank: 2, value: null, display: '₦10M+' }), 'b')).toEqual({ headline: 'You’re #2', detail: '₦10M+', inList: true, rank: 2 });
    expect(pinnedYou(board({ rank: 140, value: null, display: '₦1M+' }), 'z')).toEqual({ headline: 'You’re #140', detail: '₦1M+', inList: false, rank: 140 });
  });

  it('encourages unranked players without shaming them', () => {
    expect(pinnedYou(board({ rank: null, value: null, display: 'Not ranked yet — keep grinding' }), 'z')).toEqual({
      headline: 'Not ranked yet',
      detail: 'Not ranked yet — keep grinding',
      inList: false,
      rank: null,
    });
    expect(pinnedYou(board(null), 'z')).toBeNull();
  });
});
