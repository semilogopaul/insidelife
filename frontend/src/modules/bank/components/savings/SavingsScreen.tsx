'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDownToLine, ArrowUpFromLine, PiggyBank } from 'lucide-react';
import { useState } from 'react';
import { formatNaira, formatPercent, type SavingsTransferDirection, type WalletDto } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { queryKeys } from '@/common/api/query-keys';
import { Button, Money, Spinner, Tabs, toast } from '@/common/components';
import { gameEvents } from '@/common/game/game-events';
import { useWorldState } from '@/common/game/use-game-clock';
import { useRefreshMoney, useWallet } from '../../hooks/use-wallet';
import { newIdempotencyKey } from '@/common/utils/money-input';
import { bankApi } from '../../services/bank.api';
import { AmountField } from '../AmountField';
import { ScreenHeader } from '../ScreenHeader';

const DIRECTIONS = [
  { id: 'deposit', label: 'Put money in' },
  { id: 'withdraw', label: 'Take money out' },
] as const;

/** Move money between cash and savings. Savings earn interest monthly and can't be spent by accident. */
export function SavingsScreen({ onBack }: { readonly onBack: () => void }) {
  const wallet = useWallet();
  const world = useWorldState();
  const [direction, setDirection] = useState<SavingsTransferDirection>('deposit');
  const [amount, setAmount] = useState<number | null>(null);
  const move = useSavingsMove();

  if (!wallet.data) {
    return (
      <div className="flex flex-col gap-4">
        <ScreenHeader title="Savings" onBack={onBack} backLabel="Back to Bank" />
        <div className="grid place-items-center py-16 text-text-soft">{wallet.isError ? errorMessage(wallet.error) : <Spinner />}</div>
      </div>
    );
  }

  const source = direction === 'deposit' ? wallet.data.balance : wallet.data.savings;
  const tooMuch = amount !== null && amount > source;
  const rate = world.data?.economy.savingsRate;
  const submit = (): void => {
    if (amount === null || tooMuch) return;
    move.mutate(
      { direction, amount, idempotencyKey: newIdempotencyKey() },
      {
        onSuccess: () => {
          toast({ title: direction === 'deposit' ? 'Moved to savings' : 'Moved to cash', body: `${formatNaira(amount)} is in your ${direction === 'deposit' ? 'savings' : 'cash'} now.`, tone: 'good' });
          setAmount(null);
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <ScreenHeader title="Savings" onBack={onBack} backLabel="Back to Bank" />
      <div className="flex items-center gap-4 rounded-sheet bg-naira-soft p-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-naira text-white">
          <PiggyBank size={24} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-naira">In savings</p>
          <p className="type-figure text-3xl leading-tight">
            <Money amount={wallet.data.savings} />
          </p>
          <p className="text-xs text-text-soft">
            {rate !== undefined ? `Earning ${formatPercent(rate, 2)} a year, paid at month end (minus 10% tax).` : 'Earns interest every month.'}
          </p>
        </div>
      </div>

      <Tabs items={DIRECTIONS} value={direction} onChange={(next) => { setDirection(next); move.reset(); }} label="Savings direction" />
      <div role="tabpanel" aria-label={direction === 'deposit' ? 'Put money in' : 'Take money out'} className="flex flex-col gap-4">
        <AmountField
          label={direction === 'deposit' ? 'Move from cash' : 'Move to cash'}
          value={amount}
          onChange={(value) => {
            setAmount(value);
            move.reset();
          }}
          invalid={tooMuch}
          hint={tooMuch ? `You only have ${formatNaira(source)} in ${direction === 'deposit' ? 'cash' : 'savings'}.` : `Available: ${formatNaira(source)}`}
        />
        <div className="flex justify-center gap-1.5">
          {[0.25, 0.5, 1].map((share) => (
            <button
              key={share}
              type="button"
              disabled={source <= 0}
              onClick={() => setAmount(Math.floor(source * share) || null)}
              className="h-8 rounded-full bg-paper px-3 text-sm font-bold ring-1 ring-line hover:bg-paper-2 disabled:opacity-40"
            >
              {share === 1 ? 'All' : `${share * 100}%`}
            </button>
          ))}
        </div>
        {move.isError && (
          <p role="alert" className="rounded-card bg-okada-soft p-3 text-sm text-okada">
            {errorMessage(move.error)}
          </p>
        )}
        <Button
          size="lg"
          block
          disabled={amount === null || tooMuch}
          loading={move.isPending}
          icon={direction === 'deposit' ? <ArrowDownToLine size={20} aria-hidden /> : <ArrowUpFromLine size={20} aria-hidden />}
          onClick={submit}
        >
          {amount === null ? 'Enter an amount' : direction === 'deposit' ? `Save ${formatNaira(amount)}` : `Withdraw ${formatNaira(amount)}`}
        </Button>
        <p className="text-center text-xs text-text-soft">No fees between your own accounts. Pension stays locked until retirement.</p>
      </div>
    </div>
  );
}

function useSavingsMove() {
  const client = useQueryClient();
  const refresh = useRefreshMoney();
  return useMutation({
    mutationFn: bankApi.moveSavings,
    onSuccess: (wallet: WalletDto) => {
      client.setQueryData(queryKeys.wallet, wallet);
      gameEvents.emit('sfx', { id: 'ui-success' });
      void refresh();
    },
    onError: () => gameEvents.emit('sfx', { id: 'ui-error' }),
  });
}
