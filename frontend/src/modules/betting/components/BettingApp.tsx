'use client';

import { useEffect, useMemo, useState } from 'react';
import { BETTING_APP_NAME, BETTING_LEAGUE_NAME, BETTING_RULES, type BettingClubDto } from '@insidelife/shared';
import { ErrorState, LoadingRows, Money, Tabs } from '@/common/components';
import { useBettingAccount, useBettingLeague } from '../hooks/use-betting';
import { useRealityCheck } from '../hooks/use-reality-check';
import { useSlip } from '../services/slip-store';
import { BoardTab } from './BoardTab';
import { Blocked, ConfirmBirthDate, RealityCheckSheet } from './Gates';
import { LiveTab } from './LiveTab';
import { MyBetsTab } from './MyBetsTab';
import { PlaySafeTab } from './PlaySafeTab';
import { SlipDrawer } from './SlipDrawer';
import { TableTab } from './TableTab';

type BettingTab = 'bet' | 'live' | 'mine' | 'table' | 'safe';

const TABS: ReadonlyArray<{ readonly id: BettingTab; readonly label: string }> = [
  { id: 'bet', label: 'Bet' },
  { id: 'live', label: 'Live' },
  { id: 'mine', label: 'My bets' },
  { id: 'table', label: 'Table' },
  { id: 'safe', label: 'Play safe' },
];

function Masthead({ cash }: { readonly cash: number | undefined }) {
  return (
    <header className="-mx-1 flex items-end justify-between gap-2 rounded-card bg-pitch-deep bg-linear-160 from-pitch to-pitch-deep px-4 pb-3 pt-4 text-on-ink">
      <div>
        <p className="type-slogan text-4xl leading-none text-danfo">{BETTING_APP_NAME}</p>
        <p className="mt-1 text-2xs font-bold uppercase tracking-[0.14em] text-on-ink-soft">Virtual football · {BETTING_LEAGUE_NAME} · 18+</p>
      </div>
      {cash !== undefined && (
        <p className="text-right text-xs text-on-ink-soft">
          Wallet
          <span className="block text-base font-black text-on-ink">
            <Money amount={cash} compact />
          </span>
        </p>
      )}
    </header>
  );
}

/**
 * The betting phone app: a virtual Lagos League on the game clock, always against the house. The board (odds), the
 * slip, live matches, My bets, the table and Play safe (limits, reality checks, breaks). 18+ by real age; game naira
 * only. Every price, result and payout is the server's.
 */
export function BettingApp() {
  const [tab, setTab] = useState<BettingTab>('bet');
  const league = useBettingLeague();
  const account = useBettingAccount();
  const keepOnly = useSlip((state) => state.keepOnly);
  const clubs = useMemo(() => new Map<string, BettingClubDto>((league.data?.clubs ?? []).map((club) => [club.id, club])), [league.data?.clubs]);
  const reality = useRealityCheck(account.data?.limits.realityCheckMinutes ?? BETTING_RULES.defaultRealityCheckMinutes);

  // A pick whose match has kicked off leaves the slip (the server would refuse it anyway).
  useEffect(() => {
    if (league.data) keepOnly(new Set(league.data.upcoming.flatMap((week) => week.fixtures.map((fixture) => fixture.matchId))));
  }, [league.data, keepOnly]);

  const me = account.data;
  const block = me?.block ?? null;
  // Under-age players see nothing but the reason; a break still lets you check your slips and limits.
  const tabs = block === 'self-excluded' ? TABS.filter((item) => item.id !== 'bet') : TABS;
  const current = tabs.some((item) => item.id === tab) ? tab : (tabs[0]?.id ?? 'mine');

  let body;
  if (account.isError) body = <ErrorState error={account.error} onRetry={() => void account.refetch()} />;
  else if (!me) body = <LoadingRows label="Loading" />;
  else if (block === 'confirm-birth-date') body = <ConfirmBirthDate message={me.blockMessage} />;
  else if (block === 'under-age' || block === 'character-under-age') body = <Blocked account={me} />;
  else
    body = (
      <>
        <Tabs label={`${BETTING_APP_NAME} sections`} value={current} onChange={setTab} items={tabs} />
        <div role="tabpanel" aria-label={tabs.find((item) => item.id === current)?.label} className="flex flex-col gap-3">
          {block === 'self-excluded' && current !== 'safe' && <Blocked account={me} />}
          {(current === 'bet' || current === 'live') && !league.data && (league.isError ? <ErrorState error={league.error} onRetry={() => void league.refetch()} /> : <LoadingRows label="Loading the board" />)}
          {current === 'bet' && league.data && <BoardTab league={league.data} clubs={clubs} />}
          {current === 'live' && league.data && <LiveTab league={league.data} clubs={clubs} />}
          {current === 'mine' && <MyBetsTab clubs={clubs} />}
          {current === 'table' && <TableTab clubs={clubs} />}
          {current === 'safe' && <PlaySafeTab account={me} />}
        </div>
        {block === null && league.data && <SlipDrawer league={league.data} clubs={clubs} account={me} />}
        <RealityCheckSheet open={reality.due} minutes={reality.minutes} account={me} onContinue={reality.dismiss} />
      </>
    );

  return (
    <div className="flex flex-col gap-4">
      <Masthead cash={me?.cash} />
      {body}
    </div>
  );
}
