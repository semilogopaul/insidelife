'use client';

import { BusFront, Car, Footprints } from 'lucide-react';
import { Button } from './Button';
import { toast } from './toast-store';
import { gameEvents } from '@/common/game/game-events';
import { useNavigation } from '@/common/game/navigation-store';
import { useUi } from '@/common/game/ui-store';
import { carAvailability, useTravelQuotes } from '@/common/travel/travel-quotes';
import { cn } from '@/common/utils/cn';

export interface TakeMeThereProps {
  /** Navigation destination id (a venue id, `home:<id>`, `ad:<slotId>`…): what the GPS leads to. */
  readonly destinationId: string;
  readonly destinationName: string;
  /** Where a ride can drop you (rides go to venues): the destination itself, or the venue nearest to it. */
  readonly rideVenueId: string;
  readonly rideVenueName: string;
  /** Shown under "Order a ride" when the drop-off isn't the destination ("2 min walk to the board"). */
  readonly rideNote?: string;
  readonly className?: string;
}

/**
 * "Take me there" with the Map app's three ways: walk with the GPS, drive your own car with the GPS (only if you have
 * one), or order a ride (opens Map on the drop-off venue, where danfo, keke, okada and Bolt are priced). For a ride
 * that drops you near, not at, the destination, the GPS is set to the destination first so you walk the last bit.
 */
export function TakeMeThere({ destinationId, destinationName, rideVenueId, rideVenueName, rideNote, className }: TakeMeThereProps) {
  const setDestination = useNavigation((state) => state.setDestination);
  const openPhone = useUi((state) => state.openPhone);
  const closePhone = useUi((state) => state.closePhone);
  const quotes = useTravelQuotes(rideVenueId);
  const car = quotes.data?.find((quote) => quote.mode === 'car');
  const { hasCar, why: noCarWhy } = carAvailability(car);

  const guide = (how: 'walk' | 'drive'): void => {
    setDestination(destinationId, destinationName);
    gameEvents.emit('sfx', { id: 'ui-success' });
    toast({
      title: `GPS set: ${destinationName}`,
      body: how === 'drive' ? 'Get in your car and follow the route on your minimap.' : 'Follow the route on your minimap.',
      tone: 'neutral',
    });
    closePhone();
  };

  const ride = (): void => {
    if (rideVenueId !== destinationId) setDestination(destinationId, destinationName);
    gameEvents.emit('sfx', { id: 'ui-click' });
    openPhone('map', rideVenueId);
  };

  return (
    <div className={cn('grid gap-2', className)} role="group" aria-label={`Ways to get to ${destinationName}`}>
      <Button variant="ink" icon={<Footprints size={18} aria-hidden />} onClick={() => guide('walk')} className="justify-start">
        Walk there with GPS
      </Button>
      <Button
        variant="paper"
        icon={<Car size={18} aria-hidden />}
        disabled={!hasCar}
        onClick={() => guide('drive')}
        className="justify-start"
        aria-describedby={hasCar ? undefined : `${destinationId}-no-car`}
      >
        Drive my car with GPS
      </Button>
      {!hasCar && !quotes.isPending && (
        <p id={`${destinationId}-no-car`} className="-mt-1 px-1 text-xs text-text-soft">
          {noCarWhy}
        </p>
      )}
      <Button variant="paper" icon={<BusFront size={18} aria-hidden />} onClick={ride} className="justify-start">
        Order a ride{rideVenueId !== destinationId ? ` to ${rideVenueName}` : ''}
      </Button>
      {rideNote && <p className="-mt-1 px-1 text-xs text-text-soft">{rideNote}</p>}
    </div>
  );
}
