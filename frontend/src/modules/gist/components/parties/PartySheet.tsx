'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Crown, Navigation, PartyPopper, Shirt, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import type { CharacterSnapshotDto, PartyDetailDto } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { Button, Money, Sheet, Spinner, toast } from '@/common/components';
import { gameEvents } from '@/common/game/game-events';
import { useNavigation } from '@/common/game/navigation-store';
import { useUi } from '@/common/game/ui-store';
import { useGameMinute } from '@/common/game/use-game-clock';
import { useAttendParty, useCancelParty, useParty } from '../../hooks/use-parties';
import { useGistNav } from '../../hooks/use-gist-nav';
import { gistKeys } from '../../services/gist-keys';
import { PlayerAvatar } from '../PlayerAvatar';
import { MoneyRain } from './MoneyRain';
import { partyWhen } from './party-time';
import { SprayPanel } from './SprayPanel';

/** One party: who's there, who's spraying, and what you can do (go, join, spray, or cancel if it's yours). */
export function PartySheet({ snapshot }: { readonly snapshot: CharacterSnapshotDto }) {
  const partyId = useGistNav((state) => state.partyId);
  const close = useGistNav((state) => state.closeParty);
  const party = useParty(partyId);
  const data = party.data;
  return (
    <Sheet open={partyId !== null} onClose={close} title={data?.title ?? 'Party'} description={data ? `${data.tierLabel} at ${data.venueName}` : undefined} size="md">
      {party.isPending && (
        <div className="grid place-items-center py-12 text-text-soft">
          <Spinner />
        </div>
      )}
      {party.isError && <p className="py-8 text-center text-sm text-okada">{errorMessage(party.error)}</p>}
      {data && <PartyBody party={data} snapshot={snapshot} onClose={close} />}
    </Sheet>
  );
}

function PartyBody({ party, snapshot, onClose }: { readonly party: PartyDetailDto; readonly snapshot: CharacterSnapshotDto; readonly onClose: () => void }) {
  const client = useQueryClient();
  const now = useGameMinute(5_000);
  const attend = useAttendParty();
  const cancel = useCancelParty();
  const setDestination = useNavigation((state) => state.setDestination);
  const closePhone = useUi((state) => state.closePhone);
  const openProfile = useGistNav((state) => state.openProfile);
  const live = party.phase === 'live';
  const locationId = snapshot.character.locationId;
  // Same rule as the server: at the venue, or for a street owambe, at the host's house or on that district's streets.
  const atVenue = snapshot.travel === null && (locationId === party.venueId || (party.venueKind === 'home' && locationId === `street:${party.districtId}`));
  const me = { id: snapshot.character.id, handle: snapshot.character.handle };

  return (
    <div className="relative flex flex-col gap-4 pb-3">
      {live && <MoneyRain venueId={party.venueId} onSpray={() => void client.invalidateQueries({ queryKey: gistKeys.party(party.id) })} />}

      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Guests" value={`${party.guestCount}/${party.capacity}`} />
        <Stat label="Sprayed" value={<Money amount={party.totalSprayed} compact />} />
        <Stat label={live ? 'Ends' : 'When'} value={partyWhen(party, now).replace(/^Live — ends |^Starts /, '').replace(/ \(in .*\)$/, '')} />
      </div>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-soft">
        <span className="flex items-center gap-1">
          <Crown size={15} aria-hidden /> Hosted by{' '}
          <button type="button" className="font-bold text-text underline-offset-2 hover:underline" onClick={() => openProfile(party.host.handle)}>
            @{party.host.handle}
          </button>
        </span>
        <span className="flex items-center gap-1">
          <Shirt size={15} aria-hidden /> {party.dressCodeLabel}
        </span>
      </p>

      {live && party.attending && <SprayPanel party={party} me={me} cash={snapshot.wallet.balance} />}

      {live && !party.attending && atVenue && (
        <Button
          size="lg"
          block
          icon={<PartyPopper size={20} aria-hidden />}
          loading={attend.isPending}
          onClick={() =>
            attend.mutate(party.id, {
              onSuccess: () => {
                gameEvents.emit('sfx', { id: 'celebration' });
                gameEvents.emit('music-context', { context: 'party', venueId: party.venueId });
                toast({ title: `You’ve joined ${party.title}`, body: 'Mood up. Get your notes ready.', tone: 'good' });
              },
              onError: (error) => toast({ title: 'Couldn’t join', body: errorMessage(error), tone: 'bad' }),
            })
          }
        >
          Join the party
        </Button>
      )}

      {!atVenue && party.phase !== 'ended' && party.phase !== 'cancelled' && (
        <div className="flex flex-col gap-1.5">
          <Button
            size="lg"
            block
            icon={<Navigation size={20} aria-hidden />}
            onClick={() => {
              setDestination(party.venueId, party.venueName);
              gameEvents.emit('sfx', { id: 'ui-success' });
              onClose();
              closePhone();
            }}
          >
            {party.venueKind === 'home' ? `Get directions to ${party.host.firstName}’s street` : `Get directions to ${party.venueName}`}
          </Button>
          <p className="text-center text-xs text-text-soft">{live ? 'You need to be there to join and spray.' : 'Be there when it starts to join the fun.'}</p>
        </div>
      )}

      {party.isHost && party.phase === 'upcoming' && (
        <Button
          variant="paper"
          loading={cancel.isPending}
          onClick={() =>
            cancel.mutate(party.id, {
              onSuccess: () => {
                toast({ title: 'Party cancelled', body: 'The caterer kept half. Na so Lagos be.', tone: 'neutral' });
                onClose();
              },
              onError: (error) => toast({ title: 'Couldn’t cancel', body: errorMessage(error), tone: 'bad' }),
            })
          }
        >
          Cancel party (caterer keeps half)
        </Button>
      )}

      {party.topSprayers.length > 0 && (
        <section aria-label="Top sprayers">
          <h3 className="type-title text-lg">Money rain leaders</h3>
          <ol className="mt-1.5 flex flex-col gap-1">
            {party.topSprayers.map((entry, index) => (
              <li key={entry.player.id} className="flex items-center gap-2.5 rounded-card bg-paper-2 px-3 py-2">
                <span className="type-figure w-5 text-sm text-text-soft">{index + 1}</span>
                <PlayerAvatar name={`${entry.player.firstName} ${entry.player.lastName}`} handle={entry.player.handle} size="sm" />
                <span className="min-w-0 flex-1 truncate font-bold">{entry.player.firstName}</span>
                <Money amount={entry.amount} compact className="type-figure text-sm text-naira" />
              </li>
            ))}
          </ol>
        </section>
      )}

      <section aria-label="Guests">
        <h3 className="type-title flex items-center gap-1.5 text-lg">
          <Users size={18} aria-hidden /> On the guest list
        </h3>
        {party.guests.length === 0 ? (
          <p className="mt-1 text-sm text-text-soft">No guests yet — be the first through the gate.</p>
        ) : (
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {party.guests.map((guest) => (
              <li key={guest.id}>
                <button type="button" onClick={() => openProfile(guest.handle)} className="flex items-center gap-1.5 rounded-full bg-paper-2 py-1 pl-1 pr-3 text-sm font-bold hover:bg-paper-3">
                  <PlayerAvatar name={`${guest.firstName} ${guest.lastName}`} handle={guest.handle} online={guest.online} size="sm" />
                  {guest.firstName}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { readonly label: string; readonly value: ReactNode }) {
  return (
    <div className="rounded-card bg-paper-2 px-2 py-2.5">
      <p className="text-2xs font-bold text-text-soft">{label}</p>
      <p className="type-figure truncate text-base">{value}</p>
    </div>
  );
}
