'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { findVenue, isHomeLocation, isStreetLocation } from '@insidelife/shared';
import { Tabs } from '@/common/components';
import { gameEvents } from '@/common/game/game-events';
import { useSnapshot } from '@/common/game/snapshot';
import { useUi } from '@/common/game/ui-store';
import { useRealtimeEvent } from '@/common/realtime/use-realtime';
import { appendMessage, useDmThreads, useJoinedChannel } from '../hooks/use-chat';
import { useGistNav, type GistTab } from '../hooks/use-gist-nav';
import { useParties } from '../hooks/use-parties';
import { useFriends } from '../hooks/use-social';
import { channelKind, dmChannel, venueChannel } from '../services/chat-channels';
import { gistKeys } from '../services/gist-keys';
import { PartySheet } from './parties/PartySheet';
import { PlayerProfileSheet } from './profile/PlayerProfileSheet';
import { DmsTab } from './tabs/DmsTab';
import { FriendsTab } from './tabs/FriendsTab';
import { HereTab } from './tabs/HereTab';
import { LagosTab } from './tabs/LagosTab';
import { PartiesTab } from './tabs/PartiesTab';

/**
 * Gist: Lagos-wide chat, the venue you're in (and who's there), DMs, friends and owambes. Deep links via
 * `useUi.openPhone('gist', param)`: `@handle` opens a profile, `party:<id>` a party, `friends|parties|dms` a tab.
 */
export function GistApp() {
  const { data: snapshot } = useSnapshot();
  const client = useQueryClient();
  const phoneParam = useUi((state) => state.phoneParam);
  const nav = useGistNav();
  const friends = useFriends();
  const parties = useParties();
  const dmThreads = useDmThreads();

  const locationId = snapshot?.character.locationId ?? null;
  const venueId = snapshot && !snapshot.travel && locationId && !isStreetLocation(locationId) && !isHomeLocation(locationId) && findVenue(locationId) ? locationId : null;
  useJoinedChannel(venueId ? venueChannel(venueId) : null);

  // Deep links from other apps (leaderboards → profile, notifications → party).
  useEffect(() => {
    if (!phoneParam) return;
    const { openProfile, openParty, setTab } = useGistNav.getState();
    if (phoneParam.startsWith('@')) openProfile(phoneParam);
    else if (phoneParam.startsWith('party:')) openParty(phoneParam.slice('party:'.length));
    else if (phoneParam === 'friends' || phoneParam === 'parties' || phoneParam === 'dms' || phoneParam === 'here' || phoneParam === 'lagos') setTab(phoneParam);
  }, [phoneParam]);

  const meId = snapshot?.character.id ?? null;
  useRealtimeEvent('chat:message', (message) => {
    appendMessage(client, message);
    if (message.channel.startsWith('dm:')) {
      void client.invalidateQueries({ queryKey: gistKeys.dmThreads });
      // A reply accepts a request; my own sends use up a pending request's allowance.
      void client.invalidateQueries({ queryKey: gistKeys.dmState(message.channel) });
    }
    if (!meId || channelKind(message.channel) !== 'dm' || message.sender.characterId === meId) return;
    const { thread, rememberPartner } = useGistNav.getState();
    rememberPartner({ id: message.sender.characterId, handle: message.sender.handle, name: message.sender.firstName });
    if (!thread || dmChannel(meId, thread.id) !== message.channel) gameEvents.emit('sfx', { id: 'notification', volume: 0.6 });
  });

  const candidates = useMemo(
    () => (friends.data?.friends ?? []).map((friend) => ({ handle: friend.handle, name: `${friend.firstName} ${friend.lastName}` })),
    [friends.data],
  );
  if (!snapshot) return null;
  const me = { id: snapshot.character.id, handle: snapshot.character.handle };
  const liveParties = (parties.data ?? []).filter((party) => party.phase === 'live').length;
  const requests = friends.data?.incoming.length ?? 0;
  const unreadDms = (dmThreads.data ?? []).filter((thread) => thread.unread).length;

  return (
    <div className="flex flex-col gap-3">
      <Tabs<GistTab>
        label="Gist"
        value={nav.tab}
        onChange={nav.setTab}
        items={[
          { id: 'lagos', label: 'Lagos' },
          { id: 'here', label: 'Here' },
          { id: 'dms', label: 'DMs', badge: unreadDms },
          { id: 'friends', label: 'Friends', badge: requests },
          { id: 'parties', label: 'Parties', badge: liveParties },
        ]}
      />
      <div role="tabpanel" aria-label={nav.tab}>
        {nav.tab === 'lagos' && <LagosTab me={me} candidates={candidates} />}
        {nav.tab === 'here' && <HereTab snapshot={snapshot} />}
        {nav.tab === 'dms' && <DmsTab me={me} />}
        {nav.tab === 'friends' && <FriendsTab myHandle={snapshot.character.handle} />}
        {nav.tab === 'parties' && <PartiesTab snapshot={snapshot} />}
      </div>
      <PlayerProfileSheet />
      <PartySheet snapshot={snapshot} />
    </div>
  );
}
