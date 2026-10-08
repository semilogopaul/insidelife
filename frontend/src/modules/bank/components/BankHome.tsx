'use client';

import { errorMessage } from '@/common/api/api-error';
import { Button, Section } from '@/common/components';
import { useStatement, useWallet } from '../hooks/use-wallet';
import type { BankScreen } from '../types/bank';
import { BalanceCard } from './BalanceCard';
import { LimitMeter } from './LimitMeter';
import { QuickActions } from './QuickActions';
import { StatementList } from './statement/StatementList';

const RECENT = 6;

/** Balance, the four actions, today's limit and the latest transactions. */
export function BankHome({ onOpen }: { readonly onOpen: (screen: Exclude<BankScreen, 'home'>) => void }) {
  const wallet = useWallet();
  const statement = useStatement();

  return (
    <div className="flex flex-col gap-5 pb-2">
      {wallet.data ? (
        <BalanceCard wallet={wallet.data} />
      ) : wallet.isError ? (
        <div className="rounded-sheet bg-okada-soft p-5">
          <p className="font-bold text-okada">Couldn’t reach your bank</p>
          <p className="mt-1 text-sm text-text-soft">{errorMessage(wallet.error)}</p>
          <Button variant="paper" size="sm" className="mt-3" onClick={() => void wallet.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <div aria-label="Loading balances" className="h-44.5 animate-pulse rounded-sheet bg-ink/90" />
      )}
      <QuickActions onOpen={onOpen} />
      {wallet.data && <LimitMeter wallet={wallet.data} showHint={false} />}
      <Section
        title="Recent"
        aside={
          statement.entries.length > RECENT ? (
            <button type="button" onClick={() => onOpen('statement')} className="font-bold text-text underline-offset-2 hover:underline">
              See all
            </button>
          ) : null
        }
      >
        <StatementList
          entries={statement.entries}
          limit={RECENT}
          isPending={statement.isPending}
          error={statement.error}
          hasNextPage={false}
          isFetchingNextPage={false}
          fetchNextPage={() => undefined}
          refetch={() => void statement.refetch()}
        />
      </Section>
    </div>
  );
}
