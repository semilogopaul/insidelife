'use client';

import { ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import {
  HMO_WAITING_DAYS,
  formatDate,
  formatNairaCompact,
  type GameMinute,
  type HealthViewDto,
  type HmoPlanDto,
} from '@insidelife/shared';
import { Badge, Button, Money, ProgressBar } from '@/common/components';
import { cn } from '@/common/utils/cn';
import { useHealthCommands } from '../../hooks/use-health';
import { announce, complain } from '@/common/game/feedback';
import { relativeGameTime } from '@/common/utils/game-time';
import { percent } from '../../services/health-rules';
import { ConfirmSheet } from '@/common/components';

const ROWS: ReadonlyArray<{ readonly label: string; readonly value: (plan: HmoPlanDto) => string }> = [
  { label: 'Monthly', value: (plan) => formatNairaCompact(plan.monthlyPremium) },
  { label: 'Pharmacy', value: (plan) => percent(plan.coverage.pharmacy) },
  { label: 'Public hosp.', value: (plan) => percent(plan.coverage['hospital-public']) },
  { label: 'Private hosp.', value: (plan) => percent(plan.coverage['hospital-private']) },
  { label: 'Yearly limit', value: (plan) => formatNairaCompact(plan.annualLimit) },
  { label: 'Maternity', value: (plan) => (plan.maternityCover > 0 ? percent(plan.maternityCover) : 'None') },
];

/** HMO: your plan (cover used, waiting period) and a side-by-side comparison to join or switch. */
export function HmoTab({ view, now }: { readonly view: HealthViewDto; readonly now: GameMinute }) {
  const { joinHmo, cancelHmo } = useHealthCommands();
  const [joining, setJoining] = useState<HmoPlanDto | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const membership = view.insurance?.status === 'active' ? view.insurance : null;

  return (
    <div className="flex flex-col gap-5">
      {membership ? (
        <div className="flex flex-col gap-2.5 rounded-card bg-ink p-3.5 text-on-ink">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-bold text-on-ink-soft">Your HMO</p>
              <p className="type-title text-2xl text-danfo">{membership.label}</p>
            </div>
            <ShieldCheck size={26} aria-hidden className="text-danfo" />
          </div>
          <p className="text-sm text-on-ink-soft">
            <Money amount={membership.monthlyPremium} className="font-bold text-on-ink" /> a month ·{' '}
            {membership.coveredFrom > now
              ? `cover starts ${relativeGameTime(membership.coveredFrom, now)}`
              : `covered since ${formatDate(membership.coveredFrom)}`}
          </p>
          <ProgressBar
            value={membership.coverUsedThisYear}
            max={membership.annualLimit}
            label="Cover used this year"
            tone="danfo"
            className="bg-white/10"
          />
          <p className="text-xs text-on-ink-soft">
            Used <Money amount={membership.coverUsedThisYear} compact /> of{' '}
            <Money amount={membership.annualLimit} compact /> this year
          </p>
        </div>
      ) : (
        <p className="rounded-card bg-paper-2 p-3.5 text-sm">
          <strong>No HMO.</strong> You pay every hospital bill in full. Plans cover a share of treatment after
          a {HMO_WAITING_DAYS}-day waiting period.
        </p>
      )}

      <div className="-mx-5 overflow-x-auto px-5">
        <table className="w-full min-w-[22rem] border-separate border-spacing-0 text-sm">
          <caption className="sr-only">HMO plans compared</caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 bg-paper pb-2 text-left text-xs font-bold text-text-soft"
              >
                Plan
              </th>
              {view.plans.map((plan) => (
                <th
                  key={plan.id}
                  scope="col"
                  className={cn(
                    'px-1 pb-2 text-center font-bold',
                    membership?.planId === plan.id && 'rounded-t-chip bg-danfo-soft',
                  )}
                >
                  {plan.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.label}>
                <th
                  scope="row"
                  className="sticky left-0 border-t border-line bg-paper py-2 pr-2 text-left text-xs font-bold text-text-soft"
                >
                  {row.label}
                </th>
                {view.plans.map((plan) => (
                  <td
                    key={plan.id}
                    className={cn(
                      'tabular border-t border-line px-1 py-2 text-center font-bold',
                      membership?.planId === plan.id && 'bg-danfo-soft',
                    )}
                  >
                    {row.value(plan)}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td className="sticky left-0 bg-paper" />
              {view.plans.map((plan) => (
                <td
                  key={plan.id}
                  className={cn(
                    'px-1 pb-1 pt-2 text-center',
                    membership?.planId === plan.id && 'rounded-b-chip bg-danfo-soft',
                  )}
                >
                  {membership?.planId === plan.id ? (
                    <Badge tone="good">Yours</Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="paper"
                      className="w-full px-1"
                      onClick={() => setJoining(plan)}
                      aria-label={`${membership ? 'Switch to' : 'Join'} ${plan.label}`}
                    >
                      {membership ? 'Switch' : 'Join'}
                    </Button>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {membership && (
        <Button
          variant="ghost"
          className="self-start text-okada hover:bg-okada-soft"
          onClick={() => setCancelling(true)}
        >
          Cancel my HMO
        </Button>
      )}

      <ConfirmSheet
        open={joining !== null}
        onClose={() => setJoining(null)}
        tone="danfo"
        title={joining ? `${membership ? 'Switch to' : 'Join'} ${joining.label}?` : ''}
        description={joining?.blurb}
        confirmLabel={
          joining ? `Pay ${formatNairaCompact(joining.monthlyPremium)} for the first month` : 'Join'
        }
        loading={joinHmo.isPending}
        onConfirm={() =>
          joining &&
          joinHmo.mutate(joining.id, {
            onSuccess: () => {
              announce(`You’re on ${joining.label}`, {
                body: `Cover starts in ${HMO_WAITING_DAYS} days. Premium is taken monthly.`,
                amount: -joining.monthlyPremium,
              });
              setJoining(null);
            },
            onError: (error) => complain('Couldn’t join the plan', error),
          })
        }
      >
        <p className="text-sm text-text-soft">
          The first month is charged now; the rest monthly. Claims are honoured after a {HMO_WAITING_DAYS}-day
          waiting period.
        </p>
      </ConfirmSheet>
      <ConfirmSheet
        open={cancelling}
        onClose={() => setCancelling(false)}
        title="Cancel your HMO?"
        description="No more premiums — and no more cover. Every bill is yours again."
        confirmLabel="Cancel the plan"
        loading={cancelHmo.isPending}
        onConfirm={() =>
          cancelHmo.mutate(undefined, {
            onSuccess: () => {
              setCancelling(false);
              announce('HMO cancelled', { tone: 'neutral' });
            },
            onError: (error) => complain('Couldn’t cancel', error),
          })
        }
      />
    </div>
  );
}
