'use client';

import { Ticket } from 'lucide-react';
import { useState } from 'react';
import { formatNaira, type BetSlipDto, type BetSlipStatus, type BettingClubDto } from '@insidelife/shared';
import { EmptyState, ErrorState, FilterChips, LoadingRows, Money } from '@/common/components';
import { cn } from '@/common/utils/cn';
import { useBetSlips } from '../hooks/use-betting';
import { clubName, formatOdds, pickLabel } from '../services/betting-format';
import { StatusPill } from './parts';

function SlipCard({ slip, clubs }: { readonly slip: BetSlipDto; readonly clubs: ReadonlyMap<string, BettingClubDto> }) {
  return (
    <li className="flex flex-col gap-2 rounded-card bg-paper p-3 ring-1 ring-line">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-black">{slip.legs.length === 1 ? 'Single' : `${slip.legs.length}-leg accumulator`}</span>
        <StatusPill status={slip.status} />
      </div>
      <ul className="flex flex-col gap-1">
        {slip.legs.map((leg) => {
          const home = clubName(clubs, leg.homeId);
          const away = clubName(clubs, leg.awayId);
          return (
            <li key={leg.matchId} className="flex items-center gap-2 text-xs">
              <span
                aria-hidden
                className={cn('size-2 shrink-0 rounded-full', leg.result === 'won' ? 'bg-naira' : leg.result === 'lost' ? 'bg-okada' : 'bg-paper-3')}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{pickLabel(leg.selection, home, away)}</span>
                <span className="block truncate text-text-soft">
                  {home} {leg.score ? `${leg.score.home}-${leg.score.away}` : 'v'} {away}
                  {leg.result !== 'pending' && <span className="sr-only">: {leg.result}</span>}
                </span>
              </span>
              <span className="tabular font-bold">{formatOdds(leg.odds)}</span>
            </li>
          );
        })}
      </ul>
      <dl className="grid grid-cols-3 gap-1 border-t border-line pt-2 text-xs">
        <div>
          <dt className="text-text-soft">Stake</dt>
          <dd className="font-bold">
            <Money amount={slip.stake} />
          </dd>
        </div>
        <div>
          <dt className="text-text-soft">Odds</dt>
          <dd className="tabular font-bold">{formatOdds(slip.totalOdds)}</dd>
        </div>
        <div className="text-right">
          <dt className="text-text-soft">{slip.status === 'won' ? 'Paid' : slip.status === 'lost' ? 'Returns' : 'To return'}</dt>
          <dd className={cn('font-black', slip.status === 'won' && 'text-naira')}>
            {slip.status === 'lost' ? formatNaira(0) : <Money amount={slip.status === 'won' ? slip.payout : slip.potentialReturns} />}
          </dd>
        </div>
      </dl>
    </li>
  );
}

/** Your slips: open ones settle on their own at full time (and pay into your wallet), won and lost below. */
export function MyBetsTab({ clubs }: { readonly clubs: ReadonlyMap<string, BettingClubDto> }) {
  const [filter, setFilter] = useState<BetSlipStatus>('open');
  const slips = useBetSlips();
  if (slips.isError) return <ErrorState error={slips.error} onRetry={() => void slips.refetch()} />;
  if (!slips.data) return <LoadingRows label="Loading your bets" />;
  const all = slips.data.slips;
  const shown = all.filter((slip) => slip.status === filter);
  const count = (status: BetSlipStatus): number => all.filter((slip) => slip.status === status).length;
  return (
    <div className="flex flex-col gap-3">
      <FilterChips<BetSlipStatus>
        label="Show"
        value={filter}
        onChange={setFilter}
        options={[
          { id: 'open', label: 'Open', count: count('open') },
          { id: 'won', label: 'Won', count: count('won') },
          { id: 'lost', label: 'Lost', count: count('lost') },
        ]}
      />
      {shown.length === 0 ? (
        <EmptyState
          icon={Ticket}
          title={filter === 'open' ? 'No open bets' : filter === 'won' ? 'No wins yet' : 'Nothing lost here'}
          body={filter === 'open' ? 'Pick a price on the board to start a slip.' : undefined}
        />
      ) : (
        <ul aria-label={`${filter} bets`} className="flex flex-col gap-2.5">
          {shown.map((slip) => (
            <SlipCard key={slip.id} slip={slip} clubs={clubs} />
          ))}
        </ul>
      )}
    </div>
  );
}
