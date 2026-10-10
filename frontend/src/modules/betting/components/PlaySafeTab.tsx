'use client';

import { ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { BETTING_APP_NAME, BETTING_RULES, formatNaira, type BettingAccountDto, type SelfExclusionDays } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { Button, ConfirmSheet, FilterChips, Money, toast } from '@/common/components';
import { groupDigits, parseNairaInput } from '@/common/utils/money-input';
import { useBettingSettings } from '../hooks/use-betting';
import { GameNairaNote } from './parts';

const realDate = (iso: string): string =>
  new Date(iso).toLocaleString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** Limits and breaks: your daily loss limit, the reality-check reminder and self-exclusion. */
export function PlaySafeTab({ account }: { readonly account: BettingAccountDto }) {
  const settings = useBettingSettings();
  const [limit, setLimit] = useState<number | null>(account.limits.dailyLossLimit);
  const [breakDays, setBreakDays] = useState<SelfExclusionDays | null>(null);
  const { today, limits } = account;

  const saveLimit = (): void => {
    if (limit === null) return;
    settings.limits.mutate(
      { dailyLossLimit: limit },
      {
        onSuccess: (next) =>
          toast({
            title: next.limits.pendingDailyLossLimit ? 'Raise booked' : 'Limit saved',
            body: next.limits.pendingDailyLossLimit
              ? `Your limit goes up to ${formatNaira(next.limits.pendingDailyLossLimit.amount)} after ${BETTING_RULES.limitRaiseDelayHours} hours.`
              : `You can lose at most ${formatNaira(next.limits.dailyLossLimit)} a game day.`,
            tone: 'neutral',
          }),
      },
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="today-heading" className="rounded-card bg-pitch-soft p-3 text-pitch-deep">
        <h3 id="today-heading" className="text-2xs font-black uppercase tracking-wide">
          Today (game day)
        </h3>
        <dl className="mt-1 grid grid-cols-3 gap-2 text-sm">
          <div>
            <dt className="text-2xs">Staked</dt>
            <dd className="font-black">
              <Money amount={today.staked} />
            </dd>
          </div>
          <div>
            <dt className="text-2xs">Won</dt>
            <dd className="font-black">
              <Money amount={today.won} />
            </dd>
          </div>
          <div>
            <dt className="text-2xs">Can still lose</dt>
            <dd className="font-black">
              <Money amount={today.lossLeft} />
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="limit-heading" className="flex flex-col gap-2">
        <h3 id="limit-heading" className="type-title text-lg">
          Daily loss limit
        </h3>
        <p className="text-sm text-text-soft">
          The most you can lose in a game day (stakes minus winnings). Lowering it works at once; raising it waits {BETTING_RULES.limitRaiseDelayHours} hours.
        </p>
        <div className="flex items-center gap-2">
          <label htmlFor="loss-limit" className="sr-only">
            Daily loss limit in naira
          </label>
          <div className="flex h-11 min-w-0 flex-1 items-center rounded-card bg-paper-2 px-3 ring-1 ring-line focus-within:ring-2 focus-within:ring-ink">
            <span aria-hidden className="text-text-soft">
              ₦
            </span>
            <input
              id="loss-limit"
              inputMode="numeric"
              value={groupDigits(limit)}
              onChange={(event) => setLimit(parseNairaInput(event.target.value))}
              className="tabular h-full min-w-0 flex-1 bg-transparent px-1 font-bold outline-none"
            />
          </div>
          <Button size="md" onClick={saveLimit} loading={settings.limits.isPending} disabled={limit === null || limit === limits.dailyLossLimit}>
            Save
          </Button>
        </div>
        <p className="text-xs text-text-soft">
          Now {formatNaira(limits.dailyLossLimit)} · highest allowed {formatNaira(limits.maxDailyLossLimit)}
          {limits.pendingDailyLossLimit && (
            <>
              {' '}
              · going up to {formatNaira(limits.pendingDailyLossLimit.amount)} on {realDate(limits.pendingDailyLossLimit.effectiveAt)}
            </>
          )}
        </p>
        {settings.limits.error && (
          <p role="alert" className="text-sm font-bold text-okada">
            {errorMessage(settings.limits.error)}
          </p>
        )}
      </section>

      <section aria-labelledby="reality-heading" className="flex flex-col gap-2">
        <h3 id="reality-heading" className="type-title text-lg">
          Reality check
        </h3>
        <p className="text-sm text-text-soft">A reminder of how long you’ve been here and what today has cost.</p>
        <FilterChips<string>
          label="Remind me every"
          value={String(limits.realityCheckMinutes)}
          onChange={(id) => settings.limits.mutate({ realityCheckMinutes: Number(id) })}
          options={BETTING_RULES.realityCheckMinutes.map((minutes) => ({ id: String(minutes), label: `${minutes} min` }))}
        />
      </section>

      <section aria-labelledby="break-heading" className="flex flex-col gap-2">
        <h3 id="break-heading" className="type-title text-lg">
          Take a break
        </h3>
        {account.excludedUntil ? (
          <p className="rounded-chip bg-paper-2 px-3 py-2 text-sm font-bold">You’re on a break until {realDate(account.excludedUntil)}.</p>
        ) : (
          <p className="text-sm text-text-soft">Lock yourself out of betting for a while. Once it starts it can’t be undone early (your open slips still settle).</p>
        )}
        <div className="flex gap-2">
          {BETTING_RULES.selfExclusionDays.map((days) => (
            <Button key={days} variant="paper" size="sm" className="flex-1" onClick={() => setBreakDays(days)}>
              {days === 1 ? '1 day' : `${days} days`}
            </Button>
          ))}
        </div>
      </section>

      <p className="flex gap-2 rounded-card bg-paper-2 p-3 text-xs text-text-soft">
        <ShieldCheck size={16} aria-hidden className="shrink-0 text-pitch" />
        <span>
          {BETTING_APP_NAME} is a game. If betting with real money is causing problems for you or someone close to you, talk to someone you trust or a support service near
          you.
        </span>
      </p>
      <GameNairaNote />

      <ConfirmSheet
        open={breakDays !== null}
        onClose={() => setBreakDays(null)}
        title={`Take a ${breakDays === 1 ? '1-day' : `${breakDays}-day`} break?`}
        description="You won’t be able to place bets until it ends, and it can’t be cut short. Open slips still settle and pay."
        confirmLabel="Start my break"
        loading={settings.selfExclude.isPending}
        onConfirm={() => {
          if (breakDays === null) return;
          settings.selfExclude.mutate(breakDays, {
            onSuccess: () => {
              setBreakDays(null);
              toast({ title: 'Break started', body: 'See you when it’s over. Lagos has plenty more going on.', tone: 'neutral' });
            },
          });
        }}
      />
    </div>
  );
}
