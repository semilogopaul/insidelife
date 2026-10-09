'use client';

import { BedDouble, CloudRain, Gauge, KeyRound, LandPlot, Sofa, Zap } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { formatDate, type HouseListingDto, type HomeOwnership } from '@insidelife/shared';
import { Badge, Button, HoldButton, Money, Receipt, Sheet } from '@/common/components';
import { useSnapshot } from '@/common/game/snapshot';
import { useHousing, useHousingCommands } from '../../hooks/use-housing';
import { houseAge, houseCondition, houseLines, oddsPerYear } from '../../services/homes-rules';

/**
 * One house for sale: what it is, what it's worth, the full bill (agency, legal, survey) and hold-to-buy. Once the
 * keys are yours, the same sheet offers "Move in now" in one tap.
 */
export function HouseSheet({
  listing,
  onClose,
  onSeeProperty,
}: {
  readonly listing: HouseListingDto | null;
  readonly onClose: () => void;
  readonly onSeeProperty: () => void;
}) {
  return (
    <Sheet
      open={listing !== null}
      onClose={onClose}
      title={listing?.blueprintLabel ?? ''}
      description={listing ? `${listing.label}, ${listing.districtName}` : undefined}
    >
      {listing && (
        <HouseSheetBody key={listing.id} listing={listing} onClose={onClose} onSeeProperty={onSeeProperty} />
      )}
    </Sheet>
  );
}

function HouseSheetBody({
  listing,
  onClose,
  onSeeProperty,
}: {
  readonly listing: HouseListingDto;
  readonly onClose: () => void;
  readonly onSeeProperty: () => void;
}) {
  const [propertyId, setPropertyId] = useState<string | null>(null);
  if (propertyId)
    return <MoveInPanel propertyId={propertyId} onClose={onClose} onSeeProperty={onSeeProperty} />;
  return <HouseDetails listing={listing} onBought={setPropertyId} onSeeProperty={onSeeProperty} />;
}

function HouseDetails({
  listing,
  onBought,
  onSeeProperty,
}: {
  readonly listing: HouseListingDto;
  readonly onBought: (propertyId: string) => void;
  readonly onSeeProperty: () => void;
}) {
  const { buyHouse } = useHousingCommands();
  const { data: snapshot } = useSnapshot();
  const { lines, total } = houseLines(listing);
  const condition = houseCondition(listing.condition);
  const risky = listing.disputeRiskPerYear >= 0.08;
  const short = snapshot ? total - snapshot.wallet.balance : 0;

  return (
    <div className="flex flex-col gap-4 pb-2">
      <p className="text-sm text-text-soft">
        {listing.story}. {houseAge(listing.ageYears)}.
      </p>
      <div className="flex flex-wrap gap-1.5">
        <Badge tone={listing.title === 'c-of-o' ? 'good' : listing.title === 'survey' ? 'bad' : 'warn'}>
          {listing.titleLabel}
        </Badge>
        {listing.features.map((feature) => (
          <Badge key={feature}>{feature}</Badge>
        ))}
      </div>
      <dl className="grid grid-cols-3 gap-2 text-sm">
        <Stat
          icon={<BedDouble size={16} aria-hidden />}
          label={listing.units > 1 ? 'Flats' : 'Bedrooms'}
          value={listing.units > 1 ? `${listing.units} × ${listing.bedrooms}-bed` : String(listing.bedrooms)}
        />
        <Stat icon={<Gauge size={16} aria-hidden />} label="Condition" value={`${listing.condition}/100`} />
        <Stat
          icon={<LandPlot size={16} aria-hidden />}
          label="Land"
          value={`${listing.sizeSqm.toLocaleString('en-NG')} m²`}
        />
        <Stat
          icon={<Sofa size={16} aria-hidden />}
          label="Comfort"
          value={`+${listing.comfort.toFixed(0)}`}
        />
        <Stat
          icon={<Zap size={16} aria-hidden />}
          label="Light"
          value={`${Math.round(listing.gridHours)}h/day`}
        />
        <Stat
          icon={<CloudRain size={16} aria-hidden />}
          label="Flood risk"
          value={listing.floodRisk >= 0.25 ? 'High' : listing.floodRisk >= 0.1 ? 'Some' : 'Low'}
        />
      </dl>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-chip bg-paper-2 px-3 py-2">
          <p className="text-xs font-bold text-text-soft">Valued at</p>
          <p className="type-figure text-lg">
            <Money amount={listing.valuation} compact />
          </p>
          <p className="text-xs text-text-soft">
            {condition.label} · seller wants +{Math.round(listing.premium * 100)}%
          </p>
        </div>
        <div className="rounded-chip bg-paper-2 px-3 py-2">
          <p className="text-xs font-bold text-text-soft">Lets for about</p>
          <p className="type-figure text-lg">
            <Money amount={listing.annualRentRoll} compact />
          </p>
          <p className="text-xs text-text-soft">a year, every unit let</p>
        </div>
      </div>
      {risky && (
        <p className="rounded-card bg-okada-soft p-3 text-sm">
          <strong>Know what you’re buying.</strong> {listing.titleLabel} papers attract omonile disputes (
          {oddsPerYear(listing.disputeRiskPerYear).toLowerCase()})
          {listing.demolitionRiskPerYear > 0 && ' and LASG demolition notices'}. You can perfect the title
          later for a fee.
        </p>
      )}
      <Receipt
        lines={lines}
        total={{ label: 'Total today', amount: total }}
        caption={`Listing open until ${formatDate(listing.availableUntil)}. Land grows about ${Math.round(listing.expectedAppreciation * 100)}% a year here; land use charge and 1% a year upkeep apply.`}
      />
      {listing.bought ? (
        <div className="flex flex-col gap-2">
          <p className="flex items-start gap-2 text-sm">
            <KeyRound size={16} aria-hidden className="mt-0.5 shrink-0 text-cobalt" />
            You bought this house this week — it’s in your Property tab.
          </p>
          <Button variant="paper" block onClick={onSeeProperty}>
            See my property
          </Button>
        </div>
      ) : (
        <>
          {short > 0 && (
            <p className="text-sm font-bold text-okada">
              You’re short by <Money amount={short} />.
            </p>
          )}
          <HoldButton
            disabled={short > 0 || buyHouse.isPending}
            onConfirm={() =>
              buyHouse.mutate(listing.id, { onSuccess: (result) => onBought(result.propertyId) })
            }
          >
            Hold to buy for <Money amount={total} compact />
          </HoldButton>
        </>
      )}
    </div>
  );
}

const LEAVING: Record<HomeOwnership, string> = {
  family: 'You’ll pack your load out of the family house — Mummy will cry, then visit every Sunday.',
  rented: 'Your lease ends when you move out; the landlord refunds your caution deposit (minus “damages”).',
  owned: 'You’ll move out of your current house; you can let it out from your Property tab.',
};

/** Right after buying: one tap to move in (the server ends a lease or leaves the family house cleanly). */
function MoveInPanel({
  propertyId,
  onClose,
  onSeeProperty,
}: {
  readonly propertyId: string;
  readonly onClose: () => void;
  readonly onSeeProperty: () => void;
}) {
  const { move } = useHousingCommands();
  const { data: overview } = useHousing();
  const ownership = overview?.home.ownership;
  return (
    <div className="flex flex-col gap-4 pb-2">
      <div className="flex items-start gap-3 rounded-card bg-danfo-soft p-3.5">
        <KeyRound size={22} aria-hidden className="mt-0.5 shrink-0" />
        <div>
          <p className="font-bold">The keys are yours.</p>
          <p className="text-sm">Move in today, or let it out to tenants from your Property tab.</p>
        </div>
      </div>
      {ownership && <p className="text-sm text-text-soft">{LEAVING[ownership]}</p>}
      <div className="flex flex-col gap-2">
        <Button
          size="lg"
          block
          loading={move.isPending}
          icon={<KeyRound size={20} aria-hidden />}
          onClick={() => move.mutate(propertyId, { onSuccess: onClose })}
        >
          Move in now
        </Button>
        <Button
          variant="paper"
          block
          disabled={move.isPending}
          onClick={() => {
            onClose();
            onSeeProperty();
          }}
        >
          Not now — see my property
        </Button>
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="rounded-chip bg-paper-2 px-2.5 py-2">
      <dt className="flex items-center gap-1 text-xs font-bold text-text-soft">
        {icon}
        {label}
      </dt>
      <dd className="mt-0.5 font-bold">{value}</dd>
    </div>
  );
}
