'use client';

import { Minus, Plus } from 'lucide-react';
import { useId, useState } from 'react';
import {
  PARTY_DRESS_CODES,
  PARTY_DRESS_CODE_LABELS,
  PARTY_RULES,
  PARTY_TIERS,
  PARTY_TIER_IDS,
  PARTY_VENUES,
  VENUES,
  cityOfVenue,
  findVenue,
  formatNaira,
  partyVenueKindOf,
  type CharacterSnapshotDto,
  type CityId,
  type PartyDressCode,
  type PartyTierId,
  type PartyVenueKind,
  type VenueDefinition,
} from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { HoldButton, Money, Sheet, Spinner, TextField, toast } from '@/common/components';
import { gameEvents } from '@/common/game/game-events';
import { cn } from '@/common/utils/cn';
import { useGistNav } from '../../hooks/use-gist-nav';
import { useHostParty, usePartyQuote } from '../../hooks/use-parties';

/** Party venues of a city: you throw your owambe where you are. */
const partyVenuesIn = (cityId: CityId): readonly VenueDefinition[] =>
  (VENUES as readonly VenueDefinition[]).filter((venue) => cityOfVenue(venue) === cityId && partyVenueKindOf(venue.type) !== null);

const STARTS: ReadonlyArray<{ readonly minutes: number; readonly label: string }> = [
  { minutes: 0, label: 'Right now' },
  { minutes: 60, label: 'In 1 hour' },
  { minutes: 180, label: 'In 3 hours' },
  { minutes: 24 * 60, label: 'Tomorrow' },
];

function kindOf(venueId: string): PartyVenueKind | null {
  if (venueId === 'home') return 'home';
  const venue = findVenue(venueId);
  return venue ? partyVenueKindOf(venue.type) : null;
}

/** Plan an owambe: where, which package, how long and when — with the full quote before you pay. */
export function HostPartySheet({ open, onClose, snapshot }: { readonly open: boolean; readonly onClose: () => void; readonly snapshot: CharacterSnapshotDto }) {
  const here = findVenue(snapshot.character.locationId);
  const hereCanHost = here && partyVenueKindOf(here.type) !== null ? here.id : null;
  const [venueId, setVenueId] = useState<string>(hereCanHost ?? 'home');
  const kind = kindOf(venueId);
  const tiers = PARTY_TIER_IDS.filter((tier) => kind !== null && PARTY_TIERS[tier].venues.includes(kind));
  const [tierChoice, setTier] = useState<PartyTierId>('small-chops');
  const tier = tiers.includes(tierChoice) ? tierChoice : (tiers[0] ?? 'small-chops');
  const [hours, setHours] = useState(3);
  const [startsIn, setStartsIn] = useState(0);
  const [title, setTitle] = useState(`${snapshot.character.firstName}’s owambe`);
  const [dress, setDress] = useState<PartyDressCode | null>(null);
  const dressCode = dress ?? PARTY_TIERS[tier].defaultDressCode;
  const host = useHostParty();
  const openParty = useGistNav((state) => state.openParty);
  const venueSelectId = useId();
  const dressSelectId = useId();

  const request = open ? { venueId, tier, durationHours: hours, startsInMinutes: startsIn } : null;
  const quote = usePartyQuote(request);
  const cost = quote.data?.cost.total ?? null;
  const titleOk = title.trim().length >= 2 && title.trim().length <= PARTY_RULES.titleMaxLength && !/[<>]/.test(title);
  const affordable = cost === null || cost <= snapshot.wallet.balance;
  const canBook = quote.data?.available === true && titleOk && affordable && !host.isPending;

  const book = (): void => {
    if (!canBook) return;
    host.mutate(
      { venueId, tier, durationHours: hours, startsInMinutes: startsIn, title: title.trim(), dressCode },
      {
        onSuccess: (result) => {
          // The server sends the "Party booked" notification (shown as a toast by the game root).
          gameEvents.emit('sfx', { id: 'celebration' });
          onClose();
          openParty(result.party.id);
        },
        onError: (error) => {
          gameEvents.emit('sfx', { id: 'ui-error' });
          toast({ title: 'Couldn’t book the party', body: errorMessage(error), tone: 'bad' });
        },
      },
    );
  };

  return (
    <Sheet open={open} onClose={onClose} title="Host an owambe" description="Every cost is shown before you pay. Guests boost your clout when it ends." size="md">
      <div className="flex flex-col gap-4 pb-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={venueSelectId} className="text-sm font-bold">
            Where
          </label>
          <select id={venueSelectId} value={venueId} onChange={(event) => setVenueId(event.target.value)} className="h-12 rounded-card bg-paper-2 px-3 font-bold ring-1 ring-line">
            {hereCanHost && here && <option value={here.id}>Right here — {here.name}</option>}
            <option value="home">{PARTY_VENUES.home.label}</option>
            {partyVenuesIn(snapshot.character.cityId).filter((venue) => venue.id !== hereCanHost).map((venue) => (
              <option key={venue.id} value={venue.id}>
                {venue.name} ({PARTY_VENUES[partyVenueKindOf(venue.type) ?? 'bar'].label.toLowerCase()})
              </option>
            ))}
          </select>
          {kind && <p className="text-xs text-text-soft">{PARTY_VENUES[kind].blurb}</p>}
        </div>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-bold">Package</legend>
          {tiers.map((id) => (
            <label key={id} className={cn('flex cursor-pointer items-start gap-3 rounded-card p-3 ring-1', tier === id ? 'bg-danfo-soft ring-danfo' : 'bg-paper-2 ring-transparent')}>
              <input type="radio" name="tier" checked={tier === id} onChange={() => setTier(id)} className="mt-1 size-4 accent-[var(--color-ink)]" />
              <span className="min-w-0">
                <span className="block font-bold">{PARTY_TIERS[id].label}</span>
                <span className="block text-sm text-text-soft">{PARTY_TIERS[id].blurb}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-bold">How long</span>
            <div className="flex h-12 items-center justify-between rounded-card bg-paper-2 px-1 ring-1 ring-line">
              <button type="button" aria-label="Shorter" disabled={hours <= PARTY_RULES.minDurationHours} onClick={() => setHours((value) => value - 1)} className="grid size-10 place-items-center rounded-full hover:bg-paper-3 disabled:opacity-30">
                <Minus size={18} aria-hidden />
              </button>
              <span className="tabular font-bold" aria-live="polite">
                {hours} hours
              </span>
              <button type="button" aria-label="Longer" disabled={hours >= PARTY_RULES.maxDurationHours} onClick={() => setHours((value) => value + 1)} className="grid size-10 place-items-center rounded-full hover:bg-paper-3 disabled:opacity-30">
                <Plus size={18} aria-hidden />
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={dressSelectId} className="text-sm font-bold">
              Dress code
            </label>
            <select id={dressSelectId} value={dressCode} onChange={(event) => setDress(event.target.value as PartyDressCode)} className="h-12 rounded-card bg-paper-2 px-2 text-sm font-bold ring-1 ring-line">
              {PARTY_DRESS_CODES.map((code) => (
                <option key={code} value={code}>
                  {PARTY_DRESS_CODE_LABELS[code]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <fieldset>
          <legend className="mb-1.5 text-sm font-bold">When</legend>
          <div className="grid grid-cols-4 gap-1.5">
            {STARTS.map((start) => (
              <button
                key={start.minutes}
                type="button"
                aria-pressed={startsIn === start.minutes}
                onClick={() => setStartsIn(start.minutes)}
                className={cn('h-11 rounded-chip text-sm font-bold', startsIn === start.minutes ? 'bg-ink text-on-ink' : 'bg-paper-2 hover:bg-paper-3')}
              >
                {start.label}
              </button>
            ))}
          </div>
        </fieldset>

        <TextField label="Name it" value={title} maxLength={PARTY_RULES.titleMaxLength} onChange={(event) => setTitle(event.target.value)} error={titleOk ? null : 'Give it a name (2-60 characters, no < or >)'} />

        <section aria-label="Quote" aria-live="polite" className="rounded-card bg-ink p-3.5 text-on-ink">
          {quote.isPending ? (
            <Spinner className="text-on-ink-soft" />
          ) : quote.isError ? (
            <p className="text-sm text-[#ff9f8f]">{errorMessage(quote.error)}</p>
          ) : quote.data ? (
            <>
              <dl className="flex flex-col gap-1 text-sm">
                <QuoteLine label="Venue hire" value={quote.data.cost.venueHire} />
                <QuoteLine label="Setup (canopies, decor, gen)" value={quote.data.cost.setup} />
                <QuoteLine label="Food and drinks" value={quote.data.cost.catering} />
              </dl>
              <p className="mt-2 flex items-baseline justify-between border-t border-white/15 pt-2">
                <span className="font-bold">Total</span>
                <Money amount={quote.data.cost.total} className="type-figure text-2xl text-danfo" />
              </p>
              <p className="text-xs text-on-ink-soft">Up to {quote.data.capacity} guests. Cancel before it starts and the caterer keeps half.</p>
              {!quote.data.available && quote.data.reason && <p className="mt-2 text-sm font-bold text-[#ff9f8f]">{quote.data.reason}</p>}
              {quote.data.available && !affordable && <p className="mt-2 text-sm font-bold text-[#ff9f8f]">You’re short by <Money amount={(cost ?? 0) - snapshot.wallet.balance} /> in cash. Try a smaller package.</p>}
            </>
          ) : null}
        </section>

        <HoldButton disabled={!canBook} onConfirm={book}>
          {host.isPending ? 'Booking…' : cost !== null ? `Hold to book — pay ${formatNaira(cost)}` : 'Hold to book'}
        </HoldButton>
      </div>
    </Sheet>
  );
}

function QuoteLine({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-on-ink-soft">{label}</dt>
      <dd className="tabular">
        <Money amount={value} />
      </dd>
    </div>
  );
}
