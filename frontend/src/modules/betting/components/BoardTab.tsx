'use client';

import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { BET_MARKETS, BET_SELECTIONS, type BetFixtureDto, type BettingClubDto, type BettingLeagueDto, type BetMarketId } from '@insidelife/shared';
import { FilterChips } from '@/common/components';
import { gameEvents } from '@/common/game/game-events';
import { gameClock } from '@/common/game/game-clock';
import { useGameMinute } from '@/common/game/use-game-clock';
import { cn } from '@/common/utils/cn';
import { clubName, countdown, pickLabel } from '../services/betting-format';
import { useSlip } from '../services/slip-store';
import { ClubBadge, OddsButton } from './parts';

const MORE_MARKETS: readonly BetMarketId[] = ['dc', 'ou15', 'ou25', 'ou35', 'btts'];

function FixtureCard({ fixture, clubs }: { readonly fixture: BetFixtureDto; readonly clubs: ReadonlyMap<string, BettingClubDto> }) {
  const [open, setOpen] = useState(false);
  const picked = useSlip((state) => state.picks.find((pick) => pick.matchId === fixture.matchId)?.selection ?? null);
  const toggle = useSlip((state) => state.toggle);
  const home = clubName(clubs, fixture.homeId);
  const away = clubName(clubs, fixture.awayId);
  const press = (selection: keyof BetFixtureDto['odds']): void => {
    gameEvents.emit('sfx', { id: 'ui-click' });
    toggle(fixture.matchId, selection);
  };
  const market = (id: BetMarketId) => (
    <div key={id} className="flex flex-col gap-1">
      <p className="text-2xs font-bold uppercase tracking-wide text-text-soft">{BET_MARKETS[id].label}</p>
      <div className="flex gap-1.5">
        {BET_MARKETS[id].selections.map((selection) => (
          <OddsButton
            key={selection}
            short={BET_SELECTIONS[selection].short}
            odds={fixture.odds[selection]}
            selected={picked === selection}
            label={`${home} v ${away}: ${pickLabel(selection, home, away)}`}
            onPress={() => press(selection)}
          />
        ))}
      </div>
    </div>
  );
  return (
    <li className={cn('flex flex-col gap-2.5 rounded-card bg-paper p-3 ring-1 ring-line', picked && 'ring-2 ring-danfo')}>
      <div className="flex items-center gap-2">
        <ClubBadge club={clubs.get(fixture.homeId)} />
        <p className="min-w-0 flex-1 text-sm font-bold leading-tight">
          <span className="block truncate">{home}</span>
          <span className="block truncate text-text-soft">{away}</span>
        </p>
        <ClubBadge club={clubs.get(fixture.awayId)} />
      </div>
      {market('1x2')}
      {open && <div className="flex flex-col gap-2.5">{MORE_MARKETS.map(market)}</div>}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex items-center justify-center gap-1 self-center rounded-full px-3 py-1 text-xs font-bold text-pitch hover:bg-pitch-soft"
      >
        {open ? 'Fewer markets' : 'More markets: double chance, goals, GG/NG'}
        <ChevronDown size={14} aria-hidden className={cn('transition-transform', open && 'rotate-180')} />
      </button>
    </li>
  );
}

/** Ticks once a second: only this line re-renders with the countdown. */
function Countdown({ kickoffAt }: { readonly kickoffAt: number }) {
  useGameMinute(1000);
  return <span className="tabular">{countdown(gameClock.localMsAt(kickoffAt) - Date.now())}</span>;
}

/** The weeks open for betting: fixtures with the house's odds (1X2 up front, the other markets a tap away). */
export function BoardTab({ league, clubs }: { readonly league: BettingLeagueDto; readonly clubs: ReadonlyMap<string, BettingClubDto> }) {
  const [chosen, setChosen] = useState<number | null>(null);
  const week = league.upcoming.find((item) => item.round === chosen) ?? league.upcoming[0];
  if (!week) return null;
  return (
    <div className="flex flex-col gap-3">
      <FilterChips<string>
        label="Week"
        value={String(week.round)}
        onChange={(id) => setChosen(Number(id))}
        options={league.upcoming.map((item) => ({ id: String(item.round), label: `Week ${item.week + 1}` }))}
      />
      <p className="flex items-center justify-between rounded-chip bg-pitch-soft px-3 py-2 text-sm font-bold text-pitch-deep" aria-live="off">
        <span>
          Season {week.season + 1} · Week {week.week + 1}
        </span>
        <span>
          Kicks off in <Countdown kickoffAt={week.kickoffAt} />
        </span>
      </p>
      <ul aria-label={`Week ${week.week + 1} fixtures`} className="flex flex-col gap-2.5">
        {week.fixtures.map((fixture) => (
          <FixtureCard key={fixture.matchId} fixture={fixture} clubs={clubs} />
        ))}
      </ul>
    </div>
  );
}
