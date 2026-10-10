'use client';

import { Ticket, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { BETTING_RULES, formatNaira, type BetFixtureDto, type BettingAccountDto, type BettingClubDto, type BettingLeagueDto } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { Button, Money, Sheet, toast } from '@/common/components';
import { gameEvents } from '@/common/game/game-events';
import { groupDigits, parseNairaInput } from '@/common/utils/money-input';
import { usePlaceBet, useSlipQuote } from '../hooks/use-betting';
import { clubName, formatOdds, pickLabel } from '../services/betting-format';
import { useSlip } from '../services/slip-store';
import { GameNairaNote } from './parts';

const QUICK_STAKES = [100, 500, 1_000, 5_000, 10_000] as const;

export interface SlipDrawerProps {
  readonly league: BettingLeagueDto;
  readonly clubs: ReadonlyMap<string, BettingClubDto>;
  readonly account: BettingAccountDto | undefined;
}

/**
 * The slip: a bar at the foot of the board while you have picks, opening into the drawer where you set the stake.
 * Total odds, potential returns and any reason it can't go on come from the server's quote; this only shows them.
 */
export function SlipDrawer({ league, clubs, account }: SlipDrawerProps) {
  const [open, setOpen] = useState(false);
  const picks = useSlip((state) => state.picks);
  const stake = useSlip((state) => state.stake);
  const { setStake, remove, clear } = useSlip.getState();
  const quote = useSlipQuote(picks, stake);
  const place = usePlaceBet();
  const fixtures = new Map<string, BetFixtureDto>(league.upcoming.flatMap((week) => week.fixtures.map((fixture) => [fixture.matchId, fixture] as const)));

  if (picks.length === 0) return null;
  const priced = quote.data && quote.data.legs.length === picks.length && quote.data.stake === stake ? quote.data : null;
  const problem = priced?.problem ?? null;
  const maxStake = account?.limits.maxStake ?? BETTING_RULES.defaultMaxStake;

  const submit = (): void => {
    place.mutate(
      { legs: picks, stake },
      {
        onSuccess: (result) => {
          gameEvents.emit('sfx', { id: 'cash-out' });
          toast({ title: 'Slip placed', body: `${formatNaira(result.slip.stake)} at ${formatOdds(result.slip.totalOdds)}. Good luck!`, tone: 'good', amount: -result.slip.stake });
          clear();
          setOpen(false);
        },
        onError: () => gameEvents.emit('sfx', { id: 'ui-error' }),
      },
    );
  };

  return (
    <>
      <div className="sticky bottom-0 z-10 -mx-1 pt-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-3 rounded-card bg-pitch-deep px-4 py-3 text-left text-on-ink shadow-[var(--shadow-lift)]"
        >
          <span className="grid size-9 place-items-center rounded-full bg-danfo text-sm font-black text-ink">{picks.length}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-black">{picks.length === 1 ? 'Single' : `${picks.length}-leg accumulator`}</span>
            <span className="block text-xs text-on-ink-soft">
              {priced ? (
                <>
                  Odds {formatOdds(priced.totalOdds)} · returns <Money amount={priced.potentialReturns} />
                </>
              ) : (
                'Getting the price…'
              )}
            </span>
          </span>
          <span className="flex items-center gap-1 text-sm font-bold text-danfo">
            <Ticket size={16} aria-hidden /> Open slip
          </span>
        </button>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title="Your slip" description={picks.length === 1 ? 'A single' : `${picks.length} picks, all must win`}>
        <div className="flex flex-col gap-4 pb-1">
          <ul aria-label="Picks" className="flex flex-col divide-y divide-line rounded-card ring-1 ring-line">
            {picks.map((pick) => {
              const fixture = fixtures.get(pick.matchId);
              const home = fixture ? clubName(clubs, fixture.homeId) : 'Match';
              const away = fixture ? clubName(clubs, fixture.awayId) : '';
              const leg = priced?.legs.find((item) => item.matchId === pick.matchId);
              return (
                <li key={pick.matchId} className="flex items-center gap-2 px-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{pickLabel(pick.selection, home, away)}</span>
                    <span className="block truncate text-xs text-text-soft">
                      {home} v {away}
                    </span>
                  </span>
                  <span className="tabular text-sm font-black">{leg ? formatOdds(leg.odds) : '…'}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${pickLabel(pick.selection, home, away)}`}
                    onClick={() => remove(pick.matchId)}
                    className="grid size-9 place-items-center rounded-full text-text-soft hover:bg-paper-2"
                  >
                    <X size={16} aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-col gap-2">
            <label htmlFor="bet-stake" className="text-sm font-bold">
              Stake
            </label>
            <div className="flex h-12 items-center rounded-card bg-paper-2 px-3 ring-1 ring-line focus-within:ring-2 focus-within:ring-ink">
              <span aria-hidden className="text-text-soft">
                ₦
              </span>
              <input
                id="bet-stake"
                inputMode="numeric"
                autoComplete="off"
                value={stake === 0 ? '' : groupDigits(stake)}
                onChange={(event) => setStake(parseNairaInput(event.target.value) ?? 0)}
                aria-describedby="bet-stake-hint"
                className="tabular h-full min-w-0 flex-1 bg-transparent px-1 text-lg font-bold outline-none"
              />
            </div>
            <p id="bet-stake-hint" className="text-xs text-text-soft">
              {formatNaira(BETTING_RULES.minStake)} to {formatNaira(maxStake)} per slip
              {account && <> · {formatNaira(account.limits.dailyLossLimit)} daily loss limit, {formatNaira(Math.min(account.today.lossLeft, account.limits.dailyLossLimit))} left today</>}
            </p>
            <div role="group" aria-label="Quick stakes" className="flex flex-wrap gap-1.5">
              {QUICK_STAKES.map((amount) => (
                <button
                  key={amount}
                  type="button"
                  onClick={() => setStake(amount)}
                  aria-pressed={stake === amount}
                  className="rounded-full bg-paper-2 px-3 py-1 text-xs font-bold ring-1 ring-line aria-pressed:bg-ink aria-pressed:text-on-ink"
                >
                  {formatNaira(amount)}
                </button>
              ))}
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-2 rounded-card bg-pitch-soft p-3 text-pitch-deep" aria-live="polite" aria-busy={quote.isFetching || undefined}>
            <div>
              <dt className="text-2xs font-bold uppercase">Total odds</dt>
              <dd className="tabular text-xl font-black">{priced ? formatOdds(priced.totalOdds) : '…'}</dd>
            </div>
            <div className="text-right">
              <dt className="text-2xs font-bold uppercase">Potential returns</dt>
              <dd className="text-xl font-black">{priced ? <Money amount={priced.potentialReturns} /> : '…'}</dd>
            </div>
            {priced?.capped && (
              <dd className="col-span-2 text-xs">Capped at {formatNaira(BETTING_RULES.maxPayout)}, the most one slip can pay.</dd>
            )}
          </dl>

          {(problem || place.error) && (
            <p role="alert" className="rounded-chip bg-okada-soft px-3 py-2 text-sm font-bold text-okada">
              {place.error ? errorMessage(place.error) : problem}
            </p>
          )}

          <div className="flex flex-col gap-2">
            <Button size="lg" block loading={place.isPending} disabled={!priced || problem !== null} onClick={submit}>
              Place bet · {formatNaira(stake)}
            </Button>
            <Button variant="paper" block icon={<Trash2 size={16} aria-hidden />} onClick={clear} disabled={place.isPending}>
              Clear slip
            </Button>
          </div>
          <GameNairaNote />
        </div>
      </Sheet>
    </>
  );
}
