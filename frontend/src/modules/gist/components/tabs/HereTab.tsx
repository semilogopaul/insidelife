'use client';

import { Banknote, DoorClosed, Map as MapIcon, PartyPopper } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NIGHT_OUT_VENUE_TYPES, SPRAY_VENUE_TYPES, findVenue, isHomeLocation, isStreetLocation, type CharacterSnapshotDto, type NightOutSection } from '@insidelife/shared';
import { PlaceIcon, venuePlaceKind } from '@/common/brand/place-icons';
import { Button, EmptyState, Spinner } from '@/common/components';
import { useUi } from '@/common/game/ui-store';
import { useNightOutNav } from '@/common/night-out';
import { useGistNav } from '../../hooks/use-gist-nav';
import { useVenuePlayers } from '../../hooks/use-social';
import { venueChannel } from '../../services/chat-channels';
import { ChatThread } from '../chat/ChatThread';
import { NightOutPanel } from '../night-out/NightOutPanel';
import { PlayerAvatar } from '../PlayerAvatar';
import { VenueSprayPanel } from '../spray/VenueSprayPanel';

type HerePanel = 'spray' | 'night-out' | null;

/**
 * Chat with whoever is in the same place, see who's here, and at clubs and bars: spray them or the DJ, or open
 * Night out (bottles for people, DJ shoutouts, experiences). `openNightOut(section)` from `@/common/night-out` opens
 * this tab on the Night out panel (3D hotspots use it).
 */
export function HereTab({ snapshot }: { readonly snapshot: CharacterSnapshotDto }) {
  const openPhone = useUi((state) => state.openPhone);
  const openProfile = useGistNav((state) => state.openProfile);
  const locationId = snapshot.character.locationId;
  const venue = snapshot.travel === null && !isStreetLocation(locationId) && !isHomeLocation(locationId) ? (findVenue(locationId) ?? null) : null;
  const players = useVenuePlayers(venue?.id ?? null);
  const [panel, setPanel] = useState<HerePanel>(null);
  const [section, setSection] = useState<NightOutSection>('bottles');
  // A hotspot (the bar, the DJ booth) or a deep link asked for Night out on a section: open it (adjusting state while
  // rendering, React's pattern for reacting to a changed input), then mark the request handled.
  const request = useNightOutNav((state) => state.request);
  const [handled, setHandled] = useState<number | null>(null);
  if (request && request.nonce !== handled) {
    setHandled(request.nonce);
    setPanel('night-out');
    setSection(request.section);
  }
  useEffect(() => {
    if (request) useNightOutNav.getState().consume();
  }, [request]);

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
  const nightlife = (NIGHT_OUT_VENUE_TYPES as readonly string[]).includes(venue.type);
  const toggle = (next: Exclude<HerePanel, null>): void => setPanel((open) => (open === next ? null : next));
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
        {(sprayable || nightlife) && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {sprayable && (
              <Button
                variant={panel === 'spray' ? 'paper' : 'danfo'}
                block
                icon={<Banknote size={18} aria-hidden />}
                aria-expanded={panel === 'spray'}
                onClick={() => toggle('spray')}
              >
                {panel === 'spray' ? 'Done spraying' : 'Spray money'}
              </Button>
            )}
            {nightlife && (
              <Button
                variant={panel === 'night-out' ? 'paper' : 'ink'}
                block
                icon={<PartyPopper size={18} aria-hidden />}
                aria-expanded={panel === 'night-out'}
                onClick={() => toggle('night-out')}
              >
                {panel === 'night-out' ? 'Close menu' : 'Night out'}
              </Button>
            )}
          </div>
        )}
      </section>
      {sprayable && panel === 'spray' && <VenueSprayPanel venue={venue} players={here} cash={snapshot.wallet.balance} />}
      {nightlife && panel === 'night-out' && (
        <NightOutPanel
          venue={venue}
          people={here}
          me={{ id: snapshot.character.id, handle: snapshot.character.handle, firstName: snapshot.character.firstName }}
          cash={snapshot.wallet.balance}
          section={section}
          onSectionChange={setSection}
        />
      )}
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
