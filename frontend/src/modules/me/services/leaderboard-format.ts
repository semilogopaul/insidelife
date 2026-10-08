import type { LeaderboardDto, LeaderboardEntryDto } from '@insidelife/shared';

export type Podium = 'gold' | 'silver' | 'bronze';

export function podiumOf(rank: number): Podium | null {
  return rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : null;
}

/** "#1", "#1,204". */
export function rankLabel(rank: number | null): string {
  return rank === null ? '—' : `#${rank.toLocaleString('en-NG')}`;
}

export function entryName(entry: Pick<LeaderboardEntryDto, 'firstName' | 'lastName'>): string {
  return `${entry.firstName} ${entry.lastName}`.trim();
}

export interface PinnedYou {
  /** Shown in the pinned bar: "You’re #12" or "Not ranked yet". */
  readonly headline: string;
  /** The value line: "₦10M+" or the server's encouragement. */
  readonly detail: string;
  /** Your row is already in the visible top list (highlight it rather than duplicate). */
  readonly inList: boolean;
  readonly rank: number | null;
}

/** What the pinned "you" bar says for a board. */
export function pinnedYou(board: LeaderboardDto, characterId: string | null): PinnedYou | null {
  if (!board.you) return null;
  const inList = characterId !== null && board.entries.some((entry) => entry.characterId === characterId);
  if (board.you.rank === null) return { headline: 'Not ranked yet', detail: board.you.display, inList, rank: null };
  return { headline: `You’re ${rankLabel(board.you.rank)}`, detail: board.you.display, inList, rank: board.you.rank };
}
