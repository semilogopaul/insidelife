'use client';

import { BedDouble, ConciergeBell, Dumbbell, GlassWater, Utensils, Waves } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import {
  HOTEL_AMENITY_LABELS,
  getCity,
  type HotelAmenity,
  type HotelOfferDto,
  type HotelStayDto,
  type HotelsDto,
} from '@insidelife/shared';
import { Badge, Button, ConfirmSheet, EmptyState, ErrorState, GoThere, LoadingRows, Money, Stepper } from '@/common/components';
import { announce, complain } from '@/common/game/feedback';
import { useSnapshot } from '@/common/game/snapshot';
import { useGameMinute } from '@/common/game/use-game-clock';
import { useHotels, useStayCommands } from '../hooks/use-stay';
import { checkoutLabel, nightsLabel, stayTotal } from '../services/stay-format';

const AMENITY_ICON: Readonly<Record<HotelAmenity, ReactNode>> = {
  bar: <GlassWater size={14} aria-hidden />,
  restaurant: <Utensils size={14} aria-hidden />,
  pool: <Waves size={14} aria-hidden />,
  gym: <Dumbbell size={14} aria-hidden />,
};

/**
 * Stay: hotels in Lagos and Abuja. Book a night or several at the reception of the hotel you are standing in (price by
 * tier), extend your stay, or check out. A booked room is your home until checkout: sleep there (real sleep), and the
 * hotel's bar, restaurant, pool and gym are on its menu. The server decides every price and rule.
 */
export function StayApp() {
  const query = useHotels();
  const now = useGameMinute(15_000);
  const { data: snapshot } = useSnapshot();
  const myCity = snapshot?.character.cityId ?? 'lagos';

  if (query.isPending) return <LoadingRows label="Loading hotels" />;
  if (query.isError || !query.data) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const data: HotelsDto = query.data;
  const here = data.hotels.filter((hotel) => hotel.cityId === myCity);
  const elsewhere = data.hotels.filter((hotel) => hotel.cityId !== myCity);

  return (
    <div className="flex flex-col gap-4">
      {data.stay ? (
        <StayCard stay={data.stay} now={now} data={data} />
      ) : (
        <p className="rounded-card bg-paper-2 p-3 text-sm text-text-soft">
          No room booked. Go to a hotel’s reception to book a night or several: the room is your home until checkout, so you can sleep away from home.
        </p>
      )}
      <section aria-label={`Hotels in ${getCity(myCity).name}`} className="flex flex-col gap-3">
        <h3 className="type-title text-lg">Hotels in {getCity(myCity).name}</h3>
        {here.length === 0 ? <EmptyState icon={BedDouble} title="No hotels here" body="Fly or take the bus to the other city." /> : here.map((hotel) => <HotelCard key={hotel.venueId} hotel={hotel} stay={data.stay} maxNights={data.maxNights} />)}
      </section>
      {elsewhere.length > 0 && (
        <section aria-label="Hotels in the other city" className="flex flex-col gap-3">
          <h3 className="type-title text-lg">In {getCity(elsewhere[0]!.cityId).name}</h3>
          <ul className="flex flex-col divide-y divide-line">
            {elsewhere.map((hotel) => (
              <li key={hotel.venueId} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate font-bold">{hotel.name}</span>
                  <span className="block truncate text-sm text-text-soft">{hotel.tierLabel}</span>
                </span>
                <span className="shrink-0 text-sm font-bold">
                  <Money amount={hotel.nightlyRate} compact />
                  <span className="font-normal text-text-soft"> / night</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-text-soft">Fly or take the bus there, then book at the hotel’s reception.</p>
        </section>
      )}
    </div>
  );
}

function StayCard({ stay, now, data }: { readonly stay: HotelStayDto; readonly now: number; readonly data: HotelsDto }) {
  const { checkout } = useStayCommands();
  const [confirming, setConfirming] = useState(false);
  const hotel = data.hotels.find((candidate) => candidate.venueId === stay.venueId);
  return (
    <div className="flex flex-col gap-2.5 rounded-card bg-danfo-soft p-3.5 ring-1 ring-danfo" data-testid="stay-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-text-soft">Your room</p>
          <p className="type-title truncate text-lg leading-tight">{stay.name}</p>
        </div>
        <Badge tone="good">
          <BedDouble size={13} aria-hidden /> Home until checkout
        </Badge>
      </div>
      <p className="text-sm">
        {nightsLabel(stay.nights)} · checkout {checkoutLabel(stay.checkoutAt, now)} · paid <Money amount={stay.totalPaid} compact />
      </p>
      <div className="flex flex-wrap gap-2">
        {hotel && !hotel.here && <GoThere venueId={hotel.venueId} venueName={hotel.name} />}
        <Button variant="paper" onClick={() => setConfirming(true)}>
          Check out
        </Button>
      </div>
      <ConfirmSheet
        open={confirming}
        onClose={() => setConfirming(false)}
        tone="danger"
        title={`Check out of ${stay.name}?`}
        description="You give the room back now. There is no refund for the nights you have not used."
        confirmLabel="Check out"
        loading={checkout.isPending}
        onConfirm={() =>
          checkout.mutate(undefined, {
            onSuccess: () => {
              setConfirming(false);
              announce('Checked out', { body: `${stay.name} says safe journey.` });
            },
            onError: (error) => complain('Couldn’t check out', error),
          })
        }
      />
    </div>
  );
}

function HotelCard({ hotel, stay, maxNights }: { readonly hotel: HotelOfferDto; readonly stay: HotelStayDto | null; readonly maxNights: number }) {
  const { book } = useStayCommands();
  const [nights, setNights] = useState(1);
  const [confirming, setConfirming] = useState(false);
  const mine = stay?.venueId === hotel.venueId;
  const blocked = stay !== null && !mine;
  const total = stayTotal(hotel.nightlyRate, nights);
  return (
    <article className="flex flex-col gap-2.5 rounded-card bg-paper-2 p-3.5" aria-label={hotel.name}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="type-title truncate text-lg leading-tight">{hotel.name}</p>
          <p className="text-sm text-text-soft">{hotel.tierLabel}</p>
        </div>
        <p className="shrink-0 text-right">
          <Money amount={hotel.nightlyRate} className="font-bold" />
          <span className="block text-xs text-text-soft">a night</span>
        </p>
      </div>
      <p className="text-sm">{hotel.tagline}</p>
      <ul className="flex flex-wrap gap-1.5" aria-label="Amenities">
        {hotel.amenities.map((amenity) => (
          <li key={amenity} className="flex items-center gap-1 rounded-full bg-paper px-2.5 py-1 text-xs font-bold">
            {AMENITY_ICON[amenity]} {HOTEL_AMENITY_LABELS[amenity]}
          </li>
        ))}
      </ul>
      {hotel.here ? (
        blocked ? (
          <p className="text-sm text-text-soft">You already have a room at {stay?.name}. Check out of it first.</p>
        ) : (
          <div className="flex flex-col gap-2.5 border-t border-line pt-2.5">
            <Stepper label="Nights" value={nights} min={1} max={maxNights} onChange={setNights} />
            <Button size="lg" block icon={<ConciergeBell size={18} aria-hidden />} onClick={() => setConfirming(true)}>
              {mine ? 'Extend' : 'Book'} {nightsLabel(nights)} · <Money amount={total} compact />
            </Button>
          </div>
        )
      ) : (
        <GoThere venueId={hotel.venueId} venueName={hotel.name} />
      )}
      <ConfirmSheet
        open={confirming}
        onClose={() => setConfirming(false)}
        tone="danfo"
        title={`${mine ? 'Extend your stay at' : 'Book'} ${hotel.name}?`}
        description="Paid at reception now. Checkout is at noon; the room is your home until then."
        confirmLabel={`Pay ${nightsLabel(nights)}`}
        loading={book.isPending}
        onConfirm={() =>
          book.mutate(
            { venueId: hotel.venueId, nights },
            {
              onSuccess: (result) => {
                setConfirming(false);
                setNights(1);
                announce(mine ? 'Stay extended' : 'Room booked', { body: `${hotel.name}: ${nightsLabel(result.nights)}.`, amount: -result.price, sfx: 'cash-out' });
              },
              onError: (error) => complain('Couldn’t book the room', error),
            },
          )
        }
      >
        <p className="rounded-card bg-paper-2 p-3 text-sm">
          {nightsLabel(nights)} at <Money amount={hotel.nightlyRate} /> = <Money amount={total} className="font-bold" />
        </p>
      </ConfirmSheet>
    </article>
  );
}
