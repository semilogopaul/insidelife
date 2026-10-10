'use client';

import {
  VEHICLE_PAINTS,
  deliveryByLabel,
  findVenue,
  isVenueOpen,
  toDateParts,
  vehicleDeliveryPromise,
  type VehicleCatalogEntryDto,
  type VehiclePaintId,
} from '@insidelife/shared';
import { HoldButton, Money, Sheet } from '@/common/components';
import { gameClock } from '@/common/game/game-clock';
import { gameEvents } from '@/common/game/game-events';
import { useSnapshot } from '@/common/game/snapshot';
import { useGameMinute } from '@/common/game/use-game-clock';
import { formatHour } from '@/common/places';
import { useVehicleCommands } from '../../hooks/use-vehicles';
import { announce, complain } from '@/common/game/feedback';
import { purchaseLines } from '../../services/motors-rules';
import { CarArt } from '../CarArt';
import { MakeBadge } from '../MakeBadge';
import { GoThere } from '@/common/components';
import { Receipt } from '@/common/components';

export interface BuyChoice {
  readonly entry: VehicleCatalogEntryDto;
  readonly paint: VehiclePaintId;
}

/** In person at the dealer (drive off today) or ordered for delivery (+fee) — price, paint and a hold to buy. */
export function BuyCarSheet({
  choice,
  onClose,
}: {
  readonly choice: BuyChoice | null;
  readonly onClose: () => void;
}) {
  const { purchase } = useVehicleCommands();
  const { data: snapshot } = useSnapshot();
  const entry = choice?.entry;
  const inPerson = entry?.buyHere ?? false;
  const paintFee = entry && choice ? (entry.paintFees[choice.paint] ?? 0) : 0;
  const { lines, total } = entry && choice
    ? purchaseLines(entry.price, entry.deliveryFee, inPerson, { label: VEHICLE_PAINTS[choice.paint].label, fee: paintFee })
    : { lines: [], total: 0 };
  const short = snapshot ? total - snapshot.wallet.balance : 0;
  const dealer = entry ? findVenue(entry.dealerIds[0] ?? '') : undefined;
  const minute = useGameMinute(5000);
  // Standing in a dealer that sells it, after hours: no directions to where you already are.
  const here = snapshot ? findVenue(snapshot.character.locationId) : undefined;
  const closedHere =
    !inPerson && entry && here?.hours && entry.dealerIds.includes(here.id) && !isVenueOpen(here, toDateParts(minute).hour)
      ? here.hours[0]
      : null;

  return (
    <Sheet
      open={choice !== null}
      onClose={onClose}
      title={entry ? entry.vehicle.name : ''}
      description={entry ? `“${entry.vehicle.nickname}”` : undefined}
    >
      {choice && entry && (
        <div className="flex flex-col gap-4 pb-2">
          <div className="relative rounded-card bg-paper-2 px-6 py-3">
            <MakeBadge make={entry.vehicle.make} className="absolute left-3 top-3" />
            <CarArt model={entry.vehicle.model} color={VEHICLE_PAINTS[choice.paint].hex} />
            <p className="mt-1 text-center text-xs font-bold text-text-soft">
              {VEHICLE_PAINTS[choice.paint].label}
            </p>
          </div>
          <Receipt
            lines={lines}
            total={{ label: inPerson ? 'Pay at the dealer' : 'Pay now', amount: total }}
            caption={
              inPerson
                ? 'You’re at the dealer: drive it off the lot today.'
                : `Delivered to your gate ${vehicleDeliveryPromise(minute)}. Buy in person to skip the fee.`
            }
          />
          {closedHere !== null && (
            <p className="rounded-card bg-paper-2 p-3 text-sm">
              <span className="font-bold">Closed until {formatHour(closedHere)}.</span> Order it delivered now, or come back
              then to drive it off the lot without the fee.
            </p>
          )}
          {!inPerson && closedHere === null && dealer && (
            <div className="flex flex-col gap-2 text-sm">
              <p className="text-text-soft">
                On the lot at {entry.dealerIds.map((id) => findVenue(id)?.name ?? id).join(' and ')}.
              </p>
              <GoThere venueId={dealer.id} venueName={dealer.name} />
            </div>
          )}
          {short > 0 && (
            <p className="text-sm font-bold text-okada">
              You’re short by <Money amount={short} />.
            </p>
          )}
          <HoldButton
            disabled={short > 0 || purchase.isPending}
            onConfirm={() =>
              purchase.mutate(
                { vehicleId: entry.vehicle.id, colour: choice.paint },
                {
                  onSuccess: (result) => {
                    const now = gameClock.now();
                    if (result.channel === 'in-person') {
                      gameEvents.emit('celebrate', {
                        kind: 'milestone',
                        title: 'New ride!',
                        body: `${result.vehicle.name} · ${result.vehicle.plate}`,
                      });
                      announce('Keys in hand 🔑', {
                        body: `Your ${result.vehicle.name} is parked outside. Plate ${result.vehicle.plate}.`,
                        amount: -(result.price + result.paintFee),
                        sfx: 'car-start',
                      });
                    } else {
                      announce('Car ordered', {
                        body: `The dealer’s driver brings it ${result.vehicle.arrivesAt !== null ? deliveryByLabel(result.vehicle.arrivesAt, now) : 'soon'}.`,
                        amount: -(result.price + result.paintFee + result.deliveryFee),
                      });
                    }
                    onClose();
                  },
                  onError: (error) => complain('Purchase didn’t go through', error),
                },
              )
            }
          >
            Hold to {inPerson ? 'buy' : 'order'} · <Money amount={total} compact />
          </HoldButton>
        </div>
      )}
    </Sheet>
  );
}
