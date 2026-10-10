'use client';

import { Expand, Handshake, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { DISTRICTS, type OwnedBusinessDto } from '@insidelife/shared';
import { Badge, Button, HoldButton, Money, Sheet } from '@/common/components';
import { useSnapshotMutation } from '@/common/game/snapshot';
import { useBusinessCommands } from '../../hooks/use-jobs-data';
import { useCurrentPlace } from '@/common/hooks/use-current-place';
import { announce, complain } from '@/common/game/feedback';
import { jobsApi } from '../../services/jobs.api';
import { ConfirmSheet } from '@/common/components';
import { Receipt } from '@/common/components';
import { Meter } from '../Meter';
import { PnlChart } from './PnlChart';

type Exit = 'sell' | 'close' | null;

/** One business you own: value, the last six months, hands-on hours, and expand / sell / close. */
export function BusinessCard({ business }: { readonly business: OwnedBusinessDto }) {
  const { expand, sell, close } = useBusinessCommands();
  const place = useCurrentPlace();
  const manage = useSnapshotMutation(() => jobsApi.startAction('manage-business', 60));
  const [expandOpen, setExpandOpen] = useState(false);
  const [exit, setExit] = useState<Exit>(null);
  const active = business.status === 'active';

  return (
    <li className="flex flex-col gap-3.5 rounded-card bg-paper-2 p-3.5">
      <header className="flex items-start gap-3">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-card bg-paper text-2xl">
          {business.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className="type-title truncate text-lg leading-tight">{business.name}</p>
          <p className="truncate text-sm text-text-soft">
            {business.label} · {DISTRICTS[business.districtId].name} · {business.units} of {business.maxUnits}
          </p>
        </div>
        {!active && (
          <Badge>
            {business.status === 'folded' ? 'Folded' : business.status === 'sold' ? 'Sold' : 'Closed'}
          </Badge>
        )}
        {active && business.traction !== null && (
          <Badge tone={business.traction >= 1 ? 'good' : 'warn'} className="shrink-0">
            Traction ×{business.traction.toFixed(1)}
          </Badge>
        )}
      </header>

      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-chip bg-paper px-3 py-2">
          <dt className="text-xs font-bold text-text-soft">Worth today</dt>
          <dd className="type-figure text-lg">
            <Money amount={business.valuation} compact />
          </dd>
        </div>
        <div className="rounded-chip bg-paper px-3 py-2">
          <dt className="text-xs font-bold text-text-soft">Last 12 months</dt>
          <dd className="type-figure text-lg">
            <Money amount={business.trailingAnnualProfit} compact signed />
          </dd>
        </div>
      </dl>

      <PnlChart history={business.recentPnl} />

      {business.debt > 0 && (
        <p className="flex items-start gap-2 text-sm text-okada">
          <TriangleAlert size={16} aria-hidden className="mt-0.5 shrink-0" />
          <span>
            Owing suppliers <Money amount={business.debt} className="font-bold" />. Profits pay it down first.
          </span>
        </p>
      )}

      {active && (
        <>
          <Meter
            label="Hands-on hours this month"
            ratio={
              business.managementHoursTarget > 0
                ? business.managementHoursThisMonth / business.managementHoursTarget
                : 1
            }
            detail={`${Math.round(business.managementHoursThisMonth)} of ${business.managementHoursTarget}h — owners who show up earn more.`}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="ink"
              icon={<Handshake size={16} aria-hidden />}
              disabled={place.busyWith !== null || place.travelling}
              loading={manage.isPending}
              onClick={() =>
                manage.mutate(undefined, {
                  onSuccess: () =>
                    announce('Managing your businesses', {
                      body: 'An hour of calls with suppliers, staff and customers.',
                    }),
                  onError: (error) => complain('Couldn’t start managing', error),
                })
              }
            >
              Manage 1h
            </Button>
            {business.expansionCost !== null && (
              <Button
                size="sm"
                variant="paper"
                icon={<Expand size={16} aria-hidden />}
                onClick={() => setExpandOpen(true)}
              >
                {business.expansionLabel} · <Money amount={business.expansionCost} compact />
              </Button>
            )}
            <Button size="sm" variant="paper" onClick={() => setExit('sell')}>
              Sell
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-okada hover:bg-okada-soft"
              onClick={() => setExit('close')}
            >
              Close down
            </Button>
          </div>
        </>
      )}

      <Sheet
        open={expandOpen}
        onClose={() => setExpandOpen(false)}
        title={business.expansionLabel}
        description={`${business.name} grows to ${business.units + 1} of ${business.maxUnits}.`}
        size="sm"
      >
        <div className="flex flex-col gap-4 pb-1">
          <Receipt
            lines={[{ label: business.expansionLabel, amount: business.expansionCost ?? 0 }]}
            total={{ label: 'You pay now', amount: business.expansionCost ?? 0 }}
            caption="More units, more revenue — and more costs. Busy districts pay back faster."
          />
          <HoldButton
            disabled={expand.isPending}
            onConfirm={() =>
              expand.mutate(business.id, {
                onSuccess: () => {
                  setExpandOpen(false);
                  announce(`${business.name} expanded`, {
                    amount: -(business.expansionCost ?? 0),
                    serverNotifies: true,
                  });
                },
                onError: (error) => complain('Couldn’t expand', error),
              })
            }
          >
            Hold to pay <Money amount={business.expansionCost ?? 0} />
          </HoldButton>
        </div>
      </Sheet>

      <ConfirmSheet
        open={exit !== null}
        onClose={() => setExit(null)}
        title={exit === 'sell' ? `Sell ${business.name}?` : `Close ${business.name}?`}
        description={
          exit === 'sell'
            ? 'A buyer pays cash now. Debts are settled from the proceeds.'
            : 'You sell off the stock for what it fetches and settle debts. No buyer, no goodwill.'
        }
        confirmLabel={exit === 'sell' ? 'Sell the business' : 'Close it down'}
        tone={exit === 'sell' ? 'danfo' : 'danger'}
        loading={sell.isPending || close.isPending}
        onConfirm={() => {
          const command = exit === 'sell' ? sell : close;
          command.mutate(business.id, {
            onSuccess: (result) => {
              setExit(null);
              announce(exit === 'sell' ? 'Business sold' : 'Business closed', {
                body: result.message,
                amount: result.proceeds,
                tone: 'neutral',
                serverNotifies: true,
              });
            },
            onError: (error) => complain('That didn’t go through', error),
          });
        }}
      >
        {exit === 'sell' && (
          <p className="rounded-card bg-paper-2 p-3 text-sm">
            Buyers are offering <Money amount={business.saleEstimate.low} compact className="font-bold" /> –{' '}
            <Money amount={business.saleEstimate.high} compact className="font-bold" /> today.
          </p>
        )}
      </ConfirmSheet>
    </li>
  );
}
