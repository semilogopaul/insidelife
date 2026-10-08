'use client';

import { BusFront, Navigation } from 'lucide-react';
import { Button } from './Button';
import { toast } from './toast-store';
import { gameEvents } from '@/common/game/game-events';
import { useNavigation } from '@/common/game/navigation-store';
import { useUi } from '@/common/game/ui-store';
import { cn } from '@/common/utils/cn';

export interface GoThereProps {
  readonly venueId: string;
  readonly venueName: string;
  /** `ink` when placed on a dark NextStep panel. */
  readonly tone?: 'paper' | 'ink';
  /** Hide "Book a ride" (e.g. remote work). */
  readonly rideOption?: boolean;
  readonly className?: string;
}

/** "You need to be there": set the GPS and close the phone, or open Map to book a ride to the venue. */
export function GoThere({ venueId, venueName, tone = 'paper', rideOption = true, className }: GoThereProps) {
  const setDestination = useNavigation((state) => state.setDestination);
  const openPhone = useUi((state) => state.openPhone);
  const closePhone = useUi((state) => state.closePhone);

  const directions = (): void => {
    setDestination(venueId, venueName);
    gameEvents.emit('sfx', { id: 'ui-success' });
    toast({ title: `GPS set: ${venueName}`, body: 'Follow the route on your minimap.', tone: 'neutral' });
    closePhone();
  };

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      <Button
        variant={tone === 'ink' ? 'danfo' : 'ink'}
        icon={<Navigation size={17} aria-hidden />}
        onClick={directions}
      >
        Get directions
      </Button>
      {rideOption && (
        <Button
          variant={tone === 'ink' ? 'ghost' : 'paper'}
          className={tone === 'ink' ? 'ring-1 ring-white/25' : undefined}
          icon={<BusFront size={17} aria-hidden />}
          onClick={() => {
            gameEvents.emit('sfx', { id: 'ui-click' });
            openPhone('map', venueId);
          }}
        >
          Book a ride
        </Button>
      )}
    </div>
  );
}
