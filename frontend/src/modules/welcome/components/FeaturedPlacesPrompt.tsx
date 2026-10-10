'use client';

import { featuredHeadline, findVenue, type FeaturedPlace } from '@insidelife/shared';
import { Button, Sheet } from '@/common/components';

/**
 * "OBO Mansion and Dangote Refinery are now live!": an announcement only (no travel options; the walkthrough that
 * follows shows how to get around). Gets only places whose venue exists (see `liveFeaturedPlaces`).
 */
export function FeaturedPlacesPrompt({ open, places, onDone }: { readonly open: boolean; readonly places: readonly FeaturedPlace[]; readonly onDone: () => void }) {
  if (places.length === 0) return null;
  return (
    <Sheet open={open} onClose={onDone} title={featuredHeadline(places)} description="New in Lagos. Find them on the Map whenever you're ready." size="sm">
      <div className="flex flex-col gap-4 pb-2">
        <ul className="flex flex-col gap-3">
          {places.map((place) => (
            <li key={place.venueId} className="rounded-card bg-paper-2 p-3">
              <p className="font-bold">{place.name}</p>
              {findVenue(place.venueId)?.blurb && <p className="mt-0.5 text-sm text-text-soft">{findVenue(place.venueId)?.blurb}</p>}
            </li>
          ))}
        </ul>
        <Button block onClick={onDone}>
          Got it
        </Button>
      </div>
    </Sheet>
  );
}
