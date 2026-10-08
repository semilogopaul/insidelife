'use client';

import { CloudRain, ShieldAlert, Sofa, Zap } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatDate, type RentalListingDto } from '@insidelife/shared';
import { Badge, HoldButton, Money, Sheet } from '@/common/components';
import { useSnapshot } from '@/common/game/snapshot';
import { useHousingCommands } from '../../hooks/use-housing';
import { looksSuspicious, marketLabel, upfrontLines } from '../../services/homes-rules';
import { Receipt } from '@/common/components';

/** One flat: what it's like, the full day-one breakdown, a scam warning if the price is too sweet, hold to sign. */
export function ListingSheet({
  listing,
  onClose,
}: {
  readonly listing: RentalListingDto | null;
  readonly onClose: () => void;
}) {
  const { signLease } = useHousingCommands();
  const { data: snapshot } = useSnapshot();
  return (
    <Sheet
      open={listing !== null}
      onClose={onClose}
      title={listing?.typeLabel ?? ''}
      description={listing ? `${listing.street}, ${listing.districtName}` : undefined}
    >
      {listing && (
        <div className="flex flex-col gap-4 pb-2">
          <div className="flex flex-wrap gap-1.5">
            {listing.features.map((feature) => (
              <Badge key={feature}>{feature}</Badge>
            ))}
          </div>
          <dl className="grid grid-cols-3 gap-2 text-sm">
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
          {looksSuspicious(listing) && (
            <p className="flex items-start gap-2.5 rounded-card bg-danfo-soft p-3 text-sm">
              <ShieldAlert size={18} aria-hidden className="mt-0.5 shrink-0 text-okada" />
              <span>
                <strong>Too good to be true?</strong> This place is {marketLabel(listing).toLowerCase()}. Some
                agents collect the inspection fee and switch off their phone. If it’s real, it’s a bargain.
              </span>
            </p>
          )}
          <Receipt
            lines={upfrontLines(listing.upfront).lines}
            total={{ label: 'Due on day one', amount: listing.upfront.total }}
            caption={`Listing open until ${formatDate(listing.availableUntil)}. Rent renews yearly — no agency or legal fees then.`}
          />
          {!listing.affordable && snapshot && (
            <p className="text-sm font-bold text-okada">
              You’re short by <Money amount={Math.max(0, listing.upfront.total - snapshot.wallet.balance)} />.
            </p>
          )}
          <HoldButton
            disabled={!listing.affordable || signLease.isPending}
            onConfirm={() => signLease.mutate(listing.id, { onSuccess: onClose })}
          >
            Hold to pay <Money amount={listing.upfront.total} /> and sign
          </HoldButton>
        </div>
      )}
    </Sheet>
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
