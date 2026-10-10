'use client';

import { MapPin, Tv } from 'lucide-react';
import { useMemo } from 'react';
import { DISTRICTS, adSpotGeometry, adViewingPoint, findVenue, nearestVenueToAd, type AdSlot } from '@insidelife/shared';
import { AppIcon } from '@/common/brand/app-icons';
import { TakeMeThere } from '@/common/components';
import { adDestinationId } from '@/common/promotions/ad-focus';
import { CityMiniMap } from './CityMiniMap';

/** Rough walking speed for "2 min walk": game pace doesn't matter here, it's about distance. */
const WALK_METRES_PER_MINUTE = 80;

export interface SeeItInLagosProps {
  readonly slot: AdSlot;
  readonly creativeUrl: string;
  readonly title: string;
  readonly tagline: string | null;
}

/**
 * Where to see what you paid for. A physical spot gets a map of its streets and "Take me there" (walk or drive with
 * the GPS, or a ride to the nearest venue and a short walk); the board glows when you arrive. A Sponsored app shows how
 * it sits on every player's home screen; Lagos TV explains where it plays.
 */
export function SeeItInLagos({ slot, creativeUrl, title, tagline }: SeeItInLagosProps) {
  if (slot.kind === 'phone-app') return <PhonePreview creativeUrl={creativeUrl} title={title} tagline={tagline} />;
  if (slot.kind === 'lagos-tv') return <TvPreview creativeUrl={creativeUrl} title={title} />;
  return <PhysicalSpot slot={slot} />;
}

function PhysicalSpot({ slot }: { readonly slot: AdSlot }) {
  const spot = useMemo(() => adSpotGeometry(slot.id), [slot.id]);
  const viewing = useMemo(() => adViewingPoint(slot.id), [slot.id]);
  const ride = useMemo(() => nearestVenueToAd(slot.id), [slot.id]);
  if (!spot) return null;
  const district = DISTRICTS[spot.districtId].name;
  const where = viewing?.street ? `${viewing.street}, ${district}` : district;
  const rideVenue = ride ? findVenue(ride.venueId) : undefined;
  const walk = ride ? Math.max(1, Math.round(ride.metres / WALK_METRES_PER_MINUTE)) : null;
  return (
    <div className="flex flex-col gap-3">
      <CityMiniMap spot={spot} standAt={viewing?.position ?? null} label={`Map: ${slot.name} on ${where}. The ring is where to stand to see it.`} />
      <p className="flex items-start gap-1.5 text-sm">
        <MapPin size={16} aria-hidden className="mt-0.5 shrink-0 text-lagoon" />
        <span>
          <strong>{slot.name}</strong>, {where}. Stand in the ring and look for the yellow arrow’s side of the board: it glows when you get
          there.
        </span>
      </p>
      {rideVenue && ride ? (
        <TakeMeThere
          destinationId={adDestinationId(slot.id)}
          destinationName={slot.name}
          rideVenueId={rideVenue.id}
          rideVenueName={rideVenue.name}
          rideNote={walk !== null ? `Rides stop at venues: ${rideVenue.name} is about a ${walk} min walk from the board. The GPS shows you the rest.` : undefined}
        />
      ) : null}
    </div>
  );
}

/** The phone's home screen with your app on the Sponsored shelf, as every player sees it. */
function PhonePreview({ creativeUrl, title, tagline }: { readonly creativeUrl: string; readonly title: string; readonly tagline: string | null }) {
  const apps = ['map', 'bank', 'jobs', 'gist'] as const;
  return (
    <div className="flex flex-col items-center gap-3">
      <figure className="w-56 rounded-[2.2rem] bg-ink p-2.5 shadow-[var(--shadow-lift)]" aria-label={`Preview: ${title} on a player’s phone home screen`}>
        <div className="rounded-[1.7rem] bg-paper px-3.5 pb-5 pt-6">
          <div className="grid grid-cols-4 gap-x-2 gap-y-3" aria-hidden>
            {apps.map((app) => (
              <span key={app} className="flex flex-col items-center gap-1">
                <AppIcon app={app} size={34} decorative />
                <span className="h-1.5 w-7 rounded-full bg-paper-3" />
              </span>
            ))}
          </div>
          <p className="mb-1.5 mt-4 text-[0.55rem] font-bold uppercase tracking-wide text-text-faint">Sponsored</p>
          <div className="grid grid-cols-4 gap-x-2">
            <span className="flex flex-col items-center gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element -- the advertiser's icon from the media server */}
              <img src={creativeUrl} alt="" className="size-[34px] rounded-[11px] bg-paper-2 object-cover ring-2 ring-danfo" />
              <span className="line-clamp-1 max-w-full text-[0.55rem] font-bold">{title}</span>
            </span>
          </div>
        </div>
      </figure>
      <p className="text-center text-sm text-text-soft">
        Your app sits on the Sponsored shelf of every player’s home screen. Tapping it opens your page{tagline ? ` (“${tagline}”)` : ''} with a button
        to your website. Each player counts as a view when the shelf shows it, once per game hour.
      </p>
    </div>
  );
}

/** Lagos TV: the ad in a TV frame and where it plays. */
function TvPreview({ creativeUrl, title }: { readonly creativeUrl: string; readonly title: string }) {
  return (
    <div className="flex flex-col gap-3">
      <figure className="mx-auto w-full max-w-xs rounded-card bg-ink p-2 pb-3 shadow-[var(--shadow-lift)]" aria-label={`Preview: ${title} on Lagos TV`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- the advertiser's creative from the media server */}
        <img src={creativeUrl} alt="" className="aspect-video w-full rounded-[0.4rem] object-cover" />
        <span aria-hidden className="mx-auto mt-2 block h-1 w-10 rounded-full bg-on-ink-soft/40" />
      </figure>
      <p className="flex items-start gap-1.5 text-sm text-text-soft">
        <Tv size={16} aria-hidden className="mt-0.5 shrink-0 text-lagoon" />
        <span>
          Lagos TV plays on <strong className="text-text">every TV in the game</strong>: players’ homes, bukas, bars and offices. Your ad takes turns with
          the others on the channel, 10 seconds at a time; a player in the room counts as a view once it has been on screen, once per game hour. There’s
          nowhere to go: turn on any TV.
        </span>
      </p>
    </div>
  );
}
