'use client';

import { featuredHeadline, findVenue, type FeaturedPlace } from '@insidelife/shared';
import { Sheet, TakeMeThere } from '@/common/components';

/**
 * "OBO Mansion and Dangote Refinery are now live!" with the Map app's ways to get there. Gets only places whose venue
 * exists (see `liveFeaturedPlaces`), so an option never points at nothing. Using any option closes the prompt.
 */
export function FeaturedPlacesPrompt({ open, places, onDone }: { readonly open: boolean; readonly places: readonly FeaturedPlace[]; readonly onDone: () => void }) {
  if (places.length === 0) return null;
  return (
    <Sheet open={open} onClose={onDone} title={featuredHeadline(places)} description="Go and see them. How do you want to get there?" size="sm">
      <div className="flex flex-col gap-5 pb-2" onClickCapture={(event) => (event.target as HTMLElement).closest('button') && onDone()}>
        {places.map((place) => (
          <section key={place.venueId} aria-label={place.name} className="flex flex-col gap-2">
            <h3 className="font-bold">{place.name}</h3>
            <TakeMeThere destinationId={place.venueId} destinationName={place.name} rideVenueId={place.venueId} rideVenueName={findVenue(place.venueId)?.name ?? place.name} />
          </section>
        ))}
      </div>
    </Sheet>
  );
}
