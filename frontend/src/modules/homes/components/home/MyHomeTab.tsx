'use client';

import { House, KeyRound, PaintRoller, Sofa } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import {
  HOUSING_TYPES,
  BLUEPRINTS,
  formatDate,
  type HousingOverviewDto,
  type GameMinute,
  type LeaseStatus,
} from '@insidelife/shared';
import { Badge, Button, Money, Section } from '@/common/components';
import { useSnapshot } from '@/common/game/snapshot';
import { useUi } from '@/common/game/ui-store';
import { useHousingCommands } from '../../hooks/use-housing';
import { relativeGameTime } from '@/common/utils/game-time';
import { homeNextStep } from '../../services/homes-rules';
import { ConfirmSheet } from '@/common/components';
import { NextStep } from '@/common/components';
import { ComfortBreakdown } from './ComfortBreakdown';
import { PowerCard } from './PowerCard';
import { DecorSheet } from '../style/DecorSheet';

const OWNERSHIP = { family: 'Family house', rented: 'Renting', owned: 'Your own house' } as const;
const LEASE_BADGE: Record<
  LeaseStatus,
  { readonly tone: 'good' | 'warn' | 'bad' | 'neutral'; readonly label: string }
> = {
  active: { tone: 'good', label: 'Lease active' },
  grace: { tone: 'warn', label: 'Rent overdue' },
  notice: { tone: 'bad', label: 'Quit notice' },
  ended: { tone: 'neutral', label: 'Ended' },
  evicted: { tone: 'bad', label: 'Evicted' },
  scammed: { tone: 'bad', label: 'Scammed' },
};

interface MoveOption {
  readonly to: string;
  readonly label: string;
  readonly detail: string;
}

/** Where you live: the place, comfort (NEPA included), your lease, and moving. */
export function MyHomeTab({
  overview,
  now,
  onBrowseRentals,
}: {
  readonly overview: HousingOverviewDto;
  readonly now: GameMinute;
  readonly onBrowseRentals: () => void;
}) {
  const { home, lease, power } = overview;
  const openPhone = useUi((state) => state.openPhone);
  const { move } = useHousingCommands();
  const [moving, setMoving] = useState<MoveOption | null>(null);
  const [decorating, setDecorating] = useState(false);
  const homeItems = useSnapshot().data?.summary.homeItems;
  const step = homeNextStep(overview, now, homeItems);
  const typeLabel = home.typeId
    ? HOUSING_TYPES[home.typeId].label
    : home.blueprintId
      ? BLUEPRINTS[home.blueprintId].label
      : 'Home';

  const moveOptions: MoveOption[] = [
    ...(home.ownership !== 'family'
      ? [
          {
            to: 'family',
            label: 'Move back with family',
            detail: `${overview.family.label} · living costs ×${overview.family.livingCostMultiplier}`,
          },
        ]
      : []),
    ...overview.properties
      .filter(
        (property) =>
          property.building?.status === 'complete' &&
          property.building.occupancy === 'vacant' &&
          property.id !== home.propertyId,
      )
      .map((property) => ({
        to: property.id,
        label: `Move into ${property.building?.label ?? property.label}`,
        detail: property.districtName,
      })),
  ];

  return (
    <div className="flex flex-col gap-6">
      {step?.kind === 'move-out' && (
        <NextStep
          title="Get your own place"
          body="Family house is free, but no privacy (and Mummy dey watch). A room of your own starts from a year’s rent plus fees."
          actions={<Button onClick={onBrowseRentals}>Browse rentals</Button>}
        />
      )}
      {step?.kind === 'rent-overdue' && lease && (
        <NextStep
          kicker="Landlord is calling"
          title="Rent is overdue"
          body={
            <>
              Renewal of <Money amount={lease.renewalAmount} className="font-bold text-on-ink" /> was due.
              Keep that money in your account before{' '}
              {lease.graceUntil !== null ? formatDate(lease.graceUntil) : 'the grace period ends'} or you get
              a quit notice.
            </>
          }
        />
      )}
      {step?.kind === 'quit-notice' && lease && (
        <NextStep
          kicker="Quit notice"
          title="Pack your load"
          body={`You must leave ${lease.evictAt !== null ? `by ${formatDate(lease.evictAt)}` : 'soon'}. Find a new place now — or go back to family.`}
          actions={<Button onClick={onBrowseRentals}>Find a new place</Button>}
        />
      )}
      {step?.kind === 'renewal' && lease && (
        <NextStep
          kicker="Renewal coming"
          title={`Rent renews ${relativeGameTime(lease.endAt, now)}`}
          body={
            <>
              <Money amount={lease.renewalAmount} className="font-bold text-on-ink" /> for{' '}
              {lease.renewalYears} year{lease.renewalYears === 1 ? '' : 's'}
              {lease.nextAnnualRent !== null &&
                lease.nextAnnualRent > lease.annualRent &&
                ' (landlord increased it)'}
              . It’s taken from your account automatically.
            </>
          }
        />
      )}
      {step?.kind === 'furnish' && (
        <NextStep
          kicker="Moving in"
          title="Your place is empty — furnish it"
          body="New homes come bare: walls, floor, the kitchen sink. A bed, a fan, somewhere to sit — whatever you buy shows up in your house."
          actions={
            <Button icon={<Sofa size={16} aria-hidden />} onClick={() => openPhone('shop', 'furniture')}>
              Shop furniture
            </Button>
          }
        />
      )}
      {step?.kind === 'power' && (
        <NextStep
          kicker="NEPA wahala"
          title="Light no dey"
          body={`Blackouts are costing you ${power.comfortPenalty.toFixed(1)} comfort a day. A generator or inverter fixes most of it.`}
          actions={<Button onClick={() => openPhone('shop', 'power')}>Shop power</Button>}
        />
      )}

      <section aria-label="Your home" className="flex items-start gap-3">
        <span
          aria-hidden
          className="grid size-12 shrink-0 place-items-center rounded-card bg-paper-2 text-text-soft"
        >
          <House size={24} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="type-title text-2xl leading-tight">{home.label}</h3>
          <p className="text-sm text-text-soft">
            {typeLabel} · since {formatDate(home.movedInAt)}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge tone={home.ownership === 'owned' ? 'good' : 'info'}>{OWNERSHIP[home.ownership]}</Badge>
            {home.livingCostMultiplier < 1 && <Badge>Living costs ×{home.livingCostMultiplier}</Badge>}
          </div>
        </div>
      </section>

      <Section title="Comfort">
        <ComfortBreakdown comfort={home.comfort} />
      </Section>

      <Section title="Make it yours">
        {home.canDecorate ? (
          <div className="flex items-center justify-between gap-3 rounded-card bg-paper-2 p-3">
            <p className="text-sm text-text-soft">Repaint the walls or lay a new floor — tiles, parquet, marble.</p>
            <Button size="sm" variant="ink" icon={<PaintRoller size={16} aria-hidden />} onClick={() => setDecorating(true)}>
              Paint & floors
            </Button>
          </div>
        ) : (
          <p className="rounded-card bg-paper-2 p-3 text-sm text-text-soft">
            It’s not your house to repaint. Rent or buy your own place to choose the paint and floors.
          </p>
        )}
      </Section>
      {home.canDecorate && <DecorSheet home={home} open={decorating} onClose={() => setDecorating(false)} />}

      <Section title="Power">
        <PowerCard power={power} />
      </Section>

      {lease && (
        <Section
          title="Your lease"
          aside={<Badge tone={LEASE_BADGE[lease.status].tone}>{LEASE_BADGE[lease.status].label}</Badge>}
        >
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <Fact label="Rent a year">
              <Money amount={lease.annualRent} />
            </Fact>
            <Fact label="Lease ends">
              {formatDate(lease.endAt)}
              <span className="block text-xs font-normal text-text-soft">
                {relativeGameTime(lease.endAt, now)}
              </span>
            </Fact>
            <Fact label="Renewal">
              {lease.nonRenewing ? 'Not renewing' : <Money amount={lease.renewalAmount} />}
              {!lease.nonRenewing &&
                lease.nextAnnualRent !== null &&
                lease.nextAnnualRent !== lease.annualRent && (
                  <span className="block text-xs font-normal text-okada">
                    Rent {lease.nextAnnualRent > lease.annualRent ? 'up' : 'down'}{' '}
                    {Math.round(Math.abs(lease.nextAnnualRent / lease.annualRent - 1) * 100)}%
                    {lease.renewalYears > 1 && ` · ${lease.renewalYears} years upfront`}
                  </span>
                )}
            </Fact>
            <Fact label="Caution deposit">
              <Money amount={lease.cautionDeposit} />
              <span className="block text-xs font-normal text-text-soft">Refunded when you leave</span>
            </Fact>
          </dl>
        </Section>
      )}

      <Section title="Move">
        <ul className="flex flex-col gap-2">
          {moveOptions.map((option) => (
            <li key={option.to}>
              <button
                type="button"
                onClick={() => setMoving(option)}
                className="flex w-full items-center gap-3 rounded-card bg-paper-2 p-3 text-left hover:bg-paper-3"
              >
                <KeyRound size={20} aria-hidden className="shrink-0 text-text-soft" />
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{option.label}</span>
                  <span className="block truncate text-sm text-text-soft">{option.detail}</span>
                </span>
              </button>
            </li>
          ))}
          <li>
            <Button variant="paper" block onClick={onBrowseRentals}>
              Rent somewhere new
            </Button>
          </li>
        </ul>
      </Section>

      <ConfirmSheet
        open={moving !== null}
        onClose={() => setMoving(null)}
        title={moving?.label ?? ''}
        description={
          lease && lease.status !== 'ended'
            ? 'Your lease ends early: unused rent is gone, and the caution deposit comes back minus whatever “damages” the landlord finds.'
            : 'Moving day. Pack your things.'
        }
        confirmLabel="Move"
        tone="danfo"
        loading={move.isPending}
        onConfirm={() => moving && move.mutate(moving.to, { onSuccess: () => setMoving(null) })}
      />
    </div>
  );
}

function Fact({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="rounded-chip bg-paper-2 px-3 py-2.5">
      <dt className="text-xs font-bold text-text-soft">{label}</dt>
      <dd className="mt-0.5 font-bold">{children}</dd>
    </div>
  );
}
