'use client';

import { Crown } from 'lucide-react';
import { useState } from 'react';
import { LEADERBOARDS, LEADERBOARD_BOARDS, type LeaderboardBoardId, type LeaderboardEntryDto } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { Button, Spinner, Tabs } from '@/common/components';
import { gameEvents } from '@/common/game/game-events';
import { useUi } from '@/common/game/ui-store';
import { cn } from '@/common/utils/cn';
import { useLeaderboard } from '../hooks/use-me';
import { entryName, pinnedYou, podiumOf, rankLabel, type Podium } from '../services/leaderboard-format';

const SHORT: Readonly<Record<LeaderboardBoardId, string>> = {
  'self-made': 'Self-made',
  earners: 'Earners',
  scholars: 'Scholars',
  influence: 'Influence',
  families: 'Families',
  dynasties: 'Dynasties',
};

const PODIUM: Readonly<Record<Podium, string>> = {
  gold: 'bg-danfo text-ink',
  silver: 'bg-[#cfd8dc] text-ink',
  bronze: 'bg-[#d9a066] text-ink',
};

/** Lagos rankings by board, with your own rank pinned at the bottom. Tap a player to see their profile. */
export function LeaderboardsPanel({ characterId }: { readonly characterId: string }) {
  const [board, setBoard] = useState<LeaderboardBoardId>('self-made');
  const query = useLeaderboard(board);
  const openPhone = useUi((state) => state.openPhone);
  const you = query.data ? pinnedYou(query.data, characterId) : null;

  const openProfile = (entry: LeaderboardEntryDto): void => {
    gameEvents.emit('sfx', { id: 'ui-click' });
    openPhone('gist', `@${entry.handle}`);
  };

  return (
    <div className="flex flex-col gap-3">
      <Tabs label="Leaderboards" value={board} onChange={setBoard} items={LEADERBOARD_BOARDS.map((id) => ({ id, label: SHORT[id] }))} />
      <div>
        <h3 className="type-title text-xl">{LEADERBOARDS[board].title}</h3>
        <p className="text-sm text-text-soft">{LEADERBOARDS[board].blurb}</p>
      </div>
      {query.isPending && (
        <div className="grid place-items-center py-12 text-text-soft">
          <Spinner />
        </div>
      )}
      {query.isError && (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <p className="text-sm text-okada">{errorMessage(query.error)}</p>
          <Button variant="paper" size="sm" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </div>
      )}
      {query.data && query.data.entries.length === 0 && (
        <p className="rounded-card bg-paper-2 p-4 text-center text-sm text-text-soft">Nobody on this board yet. The first name here could be yours.</p>
      )}
      {query.data && query.data.entries.length > 0 && (
        <ol className="flex flex-col gap-1" aria-label={`${LEADERBOARDS[board].title} top ${query.data.entries.length}`}>
          {query.data.entries.map((entry) => {
            const podium = podiumOf(entry.rank);
            const mine = entry.characterId === characterId;
            return (
              <li key={entry.characterId}>
                <button
                  type="button"
                  onClick={() => openProfile(entry)}
                  className={cn('flex w-full items-center gap-3 rounded-card px-3 py-2.5 text-left', mine ? 'bg-danfo-soft ring-2 ring-danfo' : 'bg-paper-2 hover:bg-paper-3')}
                >
                  <span className={cn('type-figure grid size-9 shrink-0 place-items-center rounded-full text-sm', podium ? PODIUM[podium] : 'text-text-soft')}>
                    {podium === 'gold' ? <Crown size={16} aria-label="1st" /> : rankLabel(entry.rank)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">
                      {entryName(entry)}
                      {mine && <span className="ml-1.5 text-xs text-[#7a5600]">(you)</span>}
                    </span>
                    <span className="block truncate text-xs text-text-soft">
                      @{entry.handle} — {entry.detail ?? entry.statusTier.label}
                    </span>
                  </span>
                  <span className="type-figure shrink-0 text-sm">{entry.display}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
      {you && !you.inList && (
        <div className="sticky bottom-0 -mx-1 mt-1 flex items-center gap-3 rounded-card bg-ink px-4 py-3 text-on-ink shadow-[var(--shadow-lift)]">
          <span className="type-figure text-lg text-danfo">{you.rank === null ? '—' : rankLabel(you.rank)}</span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold">{you.headline}</span>
            <span className="block truncate text-xs text-on-ink-soft">{you.detail}</span>
          </span>
        </div>
      )}
    </div>
  );
}
