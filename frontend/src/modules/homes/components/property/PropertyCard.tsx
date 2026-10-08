'use client';

import { Gavel, ScrollText, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import {
  LAND_TITLES,
  PROPERTY_AGENT_RATE,
  formatDate,
  type GameMinute,
  type Occupancy,
  type PropertyDto,
} from '@insidelife/shared';
import { Badge, Button, Money } from '@/common/components';
import { useHousingCommands } from '../../hooks/use-housing';
import { relativeGameTime } from '@/common/utils/game-time';
import { ConfirmSheet } from '@/common/components';
import { ConstructionProgress } from './ConstructionProgress';

type Pending = 'perfect' | 'sell' | 'let' | 'vacate' | 'move-in' | null;

const OCCUPANCY: Record<Occupancy, string> = {
  'owner-occupied': 'You live here',
  let: 'Let to tenants',
  vacant: 'Empty',
};

/** One property: value vs what you paid, title and wahala, the building (or the build), and what you can do with it. */
export function PropertyCard({
  property,
  now,
  onBuild,
}: {
  readonly property: PropertyDto;
  readonly now: GameMinute;
  readonly onBuild: () => void;
}) {
  const { perfectTitle, listForSale, cancelSale, tenancy, move } = useHousingCommands();
  const [pending, setPending] = useState<Pending>(null);
  const building = property.building;
  const gain = property.value - property.costBasis;
  const title = LAND_TITLES[property.title];
  const perfection = title.perfection;
  const perfectionFee = perfection
    ? Math.max(
        100_000,
        Math.round(((property.landValue / title.priceMultiplier) * perfection.feeRate) / 10_000) * 10_000,
      )
    : 0;
  const owned = property.status === 'owned';
  const complete = building?.status === 'complete';
  const busy =
    perfectTitle.isPending ||
    listForSale.isPending ||
    cancelSale.isPending ||
    tenancy.isPending ||
    move.isPending;

  const confirm = (): void => {
    const done = { onSuccess: () => setPending(null) };
    if (pending === 'perfect') perfectTitle.mutate(property.id, done);
    if (pending === 'sell') listForSale.mutate(property.id, done);
    if (pending === 'let') tenancy.mutate({ propertyId: property.id, action: 'let' }, done);
    if (pending === 'vacate') tenancy.mutate({ propertyId: property.id, action: 'vacate' }, done);
    if (pending === 'move-in') move.mutate(property.id, done);
  };

  return (
    <li className="flex flex-col gap-3 rounded-card bg-paper-2 p-3.5">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="type-title text-lg leading-tight">{building?.label ?? property.label}</p>
          <p className="text-sm text-text-soft">
            {property.districtName} · {property.plots} plot{property.plots === 1 ? '' : 's'} (
            {property.sizeSqm.toLocaleString('en-NG')} m²)
          </p>
        </div>
        <Badge
          tone={property.title === 'c-of-o' ? 'good' : property.title === 'survey' ? 'bad' : 'warn'}
          className="shrink-0"
        >
          {property.titleLabel}
        </Badge>
      </header>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-chip bg-paper px-3 py-2">
          <p className="text-xs font-bold text-text-soft">Worth today</p>
          <p className="type-figure text-lg">
            <Money amount={property.value} compact />
          </p>
        </div>
        <div className="rounded-chip bg-paper px-3 py-2">
          <p className="text-xs font-bold text-text-soft">Gain so far</p>
          <p className="type-figure text-lg">
            <Money amount={gain} compact signed />
          </p>
        </div>
      </div>

      {property.dispute && (
        <p className="flex items-start gap-2 rounded-card bg-okada-soft p-3 text-sm">
          <Gavel size={17} aria-hidden className="mt-0.5 shrink-0 text-okada" />
          <span>
            <strong>
              {property.dispute.kind === 'omonile' ? 'Omonile wahala' : 'LASG demolition notice'}
            </strong>{' '}
            — they want <Money amount={property.dispute.demand} className="font-bold" />.{' '}
            {property.dispute.stage === 'court' && property.dispute.courtUntil !== null
              ? `In court until ${formatDate(property.dispute.courtUntil)}.`
              : 'Answer the life-event card to settle or fight it.'}
          </span>
        </p>
      )}
      {property.arrears > 0 && (
        <p className="flex items-start gap-2 text-sm text-okada">
          <TriangleAlert size={16} aria-hidden className="mt-0.5 shrink-0" />
          Land use charge owed: <Money amount={property.arrears} className="font-bold" />
        </p>
      )}
      {property.titlePerfection && (
        <p className="flex items-start gap-2 text-sm">
          <ScrollText size={16} aria-hidden className="mt-0.5 shrink-0 text-cobalt" />
          Upgrading to {LAND_TITLES[property.titlePerfection.to].shortLabel} — papers ready{' '}
          {formatDate(property.titlePerfection.readyAt)} (
          {relativeGameTime(property.titlePerfection.readyAt, now)}).
        </p>
      )}

      {building?.construction && <ConstructionProgress construction={building.construction} now={now} />}
      {building && complete && (
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <dt className="text-xs font-bold text-text-soft">Who’s inside</dt>
            <dd className="font-bold">
              {building.occupancy ? OCCUPANCY[building.occupancy] : '—'}
              {building.units > 1 && ` · ${building.unitsLet}/${building.units} let`}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-bold text-text-soft">Rent roll</dt>
            <dd className="font-bold">
              <Money amount={building.annualRentRoll} compact />
              /yr
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs font-bold text-text-soft">Condition</dt>
            <dd className="font-bold">{Math.round(building.condition)}/100</dd>
          </div>
        </dl>
      )}

      {property.sale && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-card bg-cobalt-soft p-3 text-sm">
          <span>
            Listed at <Money amount={property.sale.askingPrice} compact className="font-bold" /> · buyer
            expected by {formatDate(property.sale.closesAt)}
          </span>
          <Button
            size="sm"
            variant="paper"
            loading={cancelSale.isPending}
            onClick={() => cancelSale.mutate(property.id)}
          >
            Cancel sale
          </Button>
        </div>
      )}

      {owned && (
        <div className="flex flex-wrap gap-2">
          {!building && !property.dispute && (
            <Button size="sm" variant="ink" onClick={onBuild}>
              Build
            </Button>
          )}
          {complete && building.occupancy === 'vacant' && (
            <>
              <Button size="sm" variant="ink" onClick={() => setPending('move-in')}>
                Move in
              </Button>
              <Button size="sm" variant="paper" onClick={() => setPending('let')}>
                Let it out
              </Button>
            </>
          )}
          {complete && building.occupancy === 'let' && (
            <Button size="sm" variant="paper" onClick={() => setPending('vacate')}>
              End tenancies
            </Button>
          )}
          {perfection && !property.titlePerfection && !property.dispute && (
            <Button size="sm" variant="paper" onClick={() => setPending('perfect')}>
              Perfect title
            </Button>
          )}
          {building?.status !== 'under-construction' &&
            building?.occupancy !== 'owner-occupied' &&
            !property.dispute && (
              <Button
                size="sm"
                variant="ghost"
                className="text-okada hover:bg-okada-soft"
                onClick={() => setPending('sell')}
              >
                Sell
              </Button>
            )}
        </div>
      )}

      <ConfirmSheet
        open={pending !== null}
        onClose={() => setPending(null)}
        tone={pending === 'sell' || pending === 'vacate' ? 'danger' : 'danfo'}
        loading={busy}
        onConfirm={confirm}
        title={
          pending === 'perfect'
            ? `Perfect title to ${perfection ? LAND_TITLES[perfection.to].shortLabel : ''}?`
            : pending === 'sell'
              ? `Sell ${building?.label ?? property.label}?`
              : pending === 'let'
                ? 'Let it to tenants?'
                : pending === 'vacate'
                  ? 'End the tenancies?'
                  : 'Move in?'
        }
        description={
          pending === 'perfect'
            ? `About ${Math.round((perfection?.feeRate ?? 0) * 100)}% of the plot’s value in fees and “processing” (around ₦${Math.round(perfectionFee / 1e6)}M). Papers take ${perfection?.days ?? 0} days. Safer land is worth more.`
            : pending === 'sell'
              ? `An agent lists it at market value and takes ${Math.round(PROPERTY_AGENT_RATE * 100)}%. Buyers usually come within 1–3 game months.`
              : pending === 'let'
                ? 'An agent finds tenants who pay a year upfront. Empty months happen.'
                : pending === 'vacate'
                  ? 'Tenants who paid ahead get refunded their unused rent.'
                  : 'Your current home (or lease) ends and you move into your own house.'
        }
        confirmLabel={
          pending === 'perfect'
            ? 'Start the paperwork'
            : pending === 'sell'
              ? 'List for sale'
              : pending === 'let'
                ? 'Find tenants'
                : pending === 'vacate'
                  ? 'End tenancies'
                  : 'Move in'
        }
      />
    </li>
  );
}
