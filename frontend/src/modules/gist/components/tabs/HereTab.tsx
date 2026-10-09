'use client';

import { Banknote, DoorClosed, Map as MapIcon } from 'lucide-react';
import { useState } from 'react';
import { SPRAY_VENUE_TYPES, findVenue, isHomeLocation, isStreetLocation, type CharacterSnapshotDto } from '@insidelife/shared';
import { PlaceIcon, venuePlaceKind } from '@/common/brand/place-icons';
import { Button, EmptyState, Spinner } from '@/common/components';
import { useUi } from '@/common/game/ui-store';
import { useGistNav } from '../../hooks/use-gist-nav';
import { useVenuePlayers } from '../../hooks/use-social';
import { venueChannel } from '../../services/chat-channels';
import { ChatThread } from '../chat/ChatThread';
import { PlayerAvatar } from '../PlayerAvatar';
import { VenueSprayPanel } from '../spray/VenueSprayPanel';

/** Chat with whoever is in the same place, see who's here, and (at clubs and bars) spray them or the DJ. */
export function HereTab({ snapshot }: { readonly snapshot: CharacterSnapshotDto }) {
  const openPhone = useUi((state) => state.openPhone);
  const openProfile = useGistNav((state) => state.openProfile);
  const locationId = snapshot.character.locationId;
  const venue = snapshot.travel === null && !isStreetLocation(locationId) && !isHomeLocation(locationId) ? (findVenue(locationId) ?? null) : null;
  const players = useVenuePlayers(venue?.id ?? null);
  const [spraying, setSpraying] = useState(false);

  if (!venue) {
    return (
      <EmptyState
        icon={DoorClosed}
        title={isHomeLocation(locationId) ? 'You’re at home' : snapshot.travel ? 'You’re on the move' : 'You’re out on the street'}
        body="Venue chat opens when you’re inside a place — a buka, a club, campus. Everyone inside can talk."
        action={
          <Button variant="paper" icon={<MapIcon size={18} aria-hidden />} onClick={() => openPhone('map')}>
            Find a place
          </Button>
        }
      />
    );
  }

  const here = players.data?.players ?? [];
  const sprayable = (SPRAY_VENUE_TYPES as readonly string[]).includes(venue.type);
  return (
    <div className="flex flex-col gap-3">
      <section aria-label={`Who’s at ${venue.name}`} className="rounded-card bg-paper-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="type-title flex min-w-0 items-center gap-2 text-lg">
            <PlaceIcon kind={venuePlaceKind(venue)} size={28} decorative />
            <span className="truncate">At {venue.name}</span>
          </h3>
          <span className="text-xs font-bold text-text-soft">{players.data ? `${players.data.total} here` : ''}</span>
        </div>
        {players.isPending ? (
          <Spinner className="mt-2 text-text-soft" />
        ) : here.length === 0 ? (
          <p className="mt-1 text-sm text-text-soft">Just you (and the NPCs) for now. Invite a friend over.</p>
        ) : (
          <ul className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-1">
            {here.map((player) => (
              <li key={player.id}>
                <button type="button" onClick={() => openProfile(player.handle)} className="flex w-20 flex-col items-center gap-1 rounded-card p-1.5 text-center hover:bg-paper-3">
                  <PlayerAvatar name={`${player.firstName} ${player.lastName}`} handle={player.handle} online={player.online} />
                  <span className="w-full truncate text-xs font-bold">{player.firstName}</span>
                  <span className="w-full truncate text-2xs text-text-soft">{player.isFriend ? 'Friend' : (player.activity ?? player.statusTier.label)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {sprayable && (
          <Button
            variant={spraying ? 'paper' : 'danfo'}
            block
            className="mt-2"
            icon={<Banknote size={18} aria-hidden />}
            aria-expanded={spraying}
            onClick={() => setSpraying((open) => !open)}
          >
            {spraying ? 'Done spraying' : 'Spray money'}
          </Button>
        )}
      </section>
      {sprayable && spraying && <VenueSprayPanel venue={venue} players={here} cash={snapshot.wallet.balance} />}
      <ChatThread
        channel={venueChannel(venue.id)}
        me={{ id: snapshot.character.id, handle: snapshot.character.handle }}
        placeholder={`Talk to everyone at ${venue.name}…`}
        emptyTitle="Nobody’s talking yet"
        emptyBody="Break the ice. Na so friendship dey start."
        candidates={here.map((player) => ({ handle: player.handle, name: player.firstName }))}
        onOpenProfile={openProfile}
      />
    </div>
  );
}
