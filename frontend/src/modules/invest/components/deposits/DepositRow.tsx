'use client';

import { useState } from 'react';
import { formatDate, formatNaira, formatPercent, MINUTES_PER_DAY, withholdingTax, type DepositDto } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { Badge, Button, Money, ProgressBar, toast } from '@/common/components';
import { gameClock } from '@/common/game/game-clock';
import { useWithdrawDeposit } from '../../hooks/use-invest';

/** An open deposit: progress to maturity, interest so far, and a two-step early break that states the cost. */
export function DepositRow({ deposit }: { readonly deposit: DepositDto }) {
  const [confirming, setConfirming] = useState(false);
  const withdraw = useWithdrawDeposit();
  const now = gameClock.now();
  const matured = deposit.status === 'matured' || (deposit.maturesAt !== null && deposit.maturesAt <= now);
  const total = deposit.tenorDays ? deposit.tenorDays * MINUTES_PER_DAY : null;
  const elapsed = Math.max(0, now - deposit.startedAt);
  const breaking = !matured && deposit.earlyBreakPenalty > 0;

  const run = (): void =>
    withdraw.mutate(deposit.id, {
      onSuccess: (result) =>
        toast({
          title: matured || deposit.product === 'money-market' ? `${deposit.label} paid out` : `${deposit.label} broken`,
          body: `Interest ${formatNaira(result.interestPaid)} · tax ${formatNaira(result.withholdingTax)}${result.penalty ? ` · charge ${formatNaira(result.penalty)}` : ''}`,
          tone: 'good',
          amount: result.principalReturned + result.interestPaid - result.withholdingTax - result.penalty,
        }),
    });

  return (
    <li className="flex flex-col gap-2 rounded-sheet p-4 ring-1 ring-line">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold">{deposit.label}</p>
          <p className="text-xs text-text-soft">
            {formatPercent(deposit.annualRate, 2)} a year
            {deposit.maturesAt !== null ? ` · matures ${formatDate(deposit.maturesAt)}` : ' · withdraw any time'}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="type-figure">
            <Money amount={deposit.principal} />
          </p>
          <p className="text-xs font-bold text-naira">
            +<Money amount={deposit.accruedInterest} /> so far
          </p>
        </div>
      </div>
      {total !== null && <ProgressBar value={Math.min(elapsed, total)} max={total} tone={matured ? 'naira' : 'ink'} label={`${deposit.label} progress to maturity`} />}
      {matured && <Badge tone="good" className="self-start">Matured — ready to collect</Badge>}
      {withdraw.isError && (
        <p role="alert" className="text-sm text-okada">
          {errorMessage(withdraw.error)}
        </p>
      )}
      {confirming && breaking ? (
        <div className="rounded-card bg-okada-soft p-3 text-sm">
          <p className="font-bold text-okada">Break this {deposit.label.toLowerCase()} early?</p>
          <p className="mt-0.5 text-text-soft">
            {deposit.accruedInterest > 0 ? (
              <>
                You lose <Money amount={deposit.accruedInterest} /> interest and pay a <Money amount={deposit.earlyBreakPenalty} /> charge.
              </>
            ) : (
              <>
                You pay a <Money amount={deposit.earlyBreakPenalty} /> charge.
              </>
            )}{' '}
            You get back{' '}
            <strong>
              <Money amount={deposit.principal - deposit.earlyBreakPenalty} />
            </strong>
            .
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button variant="paper" size="sm" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
            <Button variant="danger" size="sm" loading={withdraw.isPending} onClick={run}>
              Break early
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant={matured ? 'danfo' : 'paper'}
          size="sm"
          className="self-start"
          loading={withdraw.isPending}
          onClick={() => (breaking ? setConfirming(true) : run())}
        >
          {matured ? `Collect ${formatNaira(collectable(deposit))}` : breaking ? 'Break early…' : 'Withdraw'}
        </Button>
      )}
    </li>
  );
}

/** Principal plus interest after the 10% withholding tax. */
function collectable(deposit: DepositDto): number {
  const interest = deposit.interestAtMaturity ?? deposit.accruedInterest;
  return deposit.principal + interest - withholdingTax(interest);
}
