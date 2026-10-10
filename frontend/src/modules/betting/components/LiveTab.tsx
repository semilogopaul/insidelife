'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import type { BettingClubDto, BettingLeagueDto, PlayedMatchDto } from '@insidelife/shared';
import { Button, ErrorState, LoadingRows } from '@/common/components';
import { gameClock } from '@/common/game/game-clock';
import { useGameMinute } from '@/common/game/use-game-clock';
import { cn } from '@/common/utils/cn';
import { useRoundResults } from '../hooks/use-betting';
import { clubName, liveState } from '../services/betting-format';
import { ClubBadge } from './parts';

function MatchRow({ match, clubs, elapsed }: { readonly match: PlayedMatchDto; readonly clubs: ReadonlyMap<string, BettingClubDto>; readonly elapsed: number }) {
  const [open, setOpen] = useState(false);
  const state = liveState(match, elapsed);
  const home = clubName(clubs, match.homeId);
  const away = clubName(clubs, match.awayId);
  const live = state.phase !== 'full-time' && state.phase !== 'pre';
  return (
    <li className="rounded-card bg-paper ring-1 ring-line">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        aria-label={`${home} ${state.home}, ${away} ${state.away}, ${state.label === 'FT' ? 'full time' : state.label === 'HT' ? 'half time' : `minute ${state.label}`}`}
        className="flex w-full items-center gap-2 px-3 py-2.5"
      >
        <span className={cn('w-9 shrink-0 text-center text-xs font-black tabular', live ? 'text-naira' : 'text-text-soft')}>{state.label}</span>
        <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5 text-sm font-bold">
          <span className="truncate">{home}</span>
          <ClubBadge club={clubs.get(match.homeId)} size={24} />
        </span>
        <span className="tabular w-14 shrink-0 rounded-chip bg-ink py-1 text-center text-base font-black text-on-ink">
          {state.home} - {state.away}
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-bold">
          <ClubBadge club={clubs.get(match.awayId)} size={24} />
          <span className="truncate">{away}</span>
        </span>
      </button>
      {open && (
        <ol aria-label="Goals" className="flex flex-col gap-1 border-t border-line px-3 py-2 text-xs">
          {state.goals.length === 0 && <li className="text-text-soft">{state.phase === 'full-time' ? 'No goals.' : 'No goals yet.'}</li>}
          {state.goals.map((goal, index) => (
            <li key={`${goal.minute}-${index}`} className={cn('flex gap-2', goal.side === 'away' && 'flex-row-reverse text-right')}>
              <span aria-hidden>⚽</span>
              <span className="font-bold">
                {goal.minute}&apos; {goal.side === 'home' ? home : away}
              </span>
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}

/** The week live now (scores tick with the game clock) and earlier results, a week at a time. */
export function LiveTab({ league, clubs }: { readonly league: BettingLeagueDto; readonly clubs: ReadonlyMap<string, BettingClubDto> }) {
  const [round, setRound] = useState<number | null>(null);
  const live = league.live;
  const browsing = round !== null && round !== live?.round;
  const results = useRoundResults(browsing ? round : null);
  const now = useGameMinute(1000);
  const week = browsing ? results.data : live;
  if (!week) return browsing && results.isError ? <ErrorState error={results.error} onRetry={() => void results.refetch()} /> : <LoadingRows label="Loading results" />;
  // Live scores follow the game clock; earlier weeks are over.
  const elapsed = browsing ? Number.POSITIVE_INFINITY : now - week.kickoffAt;
  const previous = week.round - 1;
  const canGoBack = browsing ? results.data?.previous != null : previous >= 0;
  const over = gameClock.now() >= week.fullTimeAt;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Button variant="paper" size="sm" aria-label="Earlier week" icon={<ChevronLeft size={16} aria-hidden />} disabled={!canGoBack} onClick={() => setRound(previous)} />
        <p className="text-center">
          <span className="type-title block text-lg">
            Season {week.season + 1} · Week {week.week + 1}
          </span>
          <span className={cn('text-xs font-bold', over || browsing ? 'text-text-soft' : 'text-naira')}>{over || browsing ? 'Full time' : '● Live now'}</span>
        </p>
        <Button
          variant="paper"
          size="sm"
          aria-label="Later week"
          icon={<ChevronRight size={16} aria-hidden />}
          disabled={!browsing}
          onClick={() => setRound(live && week.round + 1 >= live.round ? null : week.round + 1)}
        />
      </div>
      <ul aria-label={`Week ${week.week + 1} results`} className="flex flex-col gap-2">
        {week.matches.map((match) => (
          <MatchRow key={match.matchId} match={match} clubs={clubs} elapsed={elapsed} />
        ))}
      </ul>
      <p className="text-center text-2xs text-text-soft">Tap a match for its goals. Results come from the house’s sealed draw and are revealed at kickoff.</p>
    </div>
  );
}
