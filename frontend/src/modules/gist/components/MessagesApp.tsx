'use client';

import { useEffect } from 'react';
import { parseDmLink } from '@/common/chat';
import { useSnapshot } from '@/common/game/snapshot';
import { useUi } from '@/common/game/ui-store';
import { useGistNav } from '../hooks/use-gist-nav';
import { useLiveChat } from '../hooks/use-live-chat';
import { PlayerProfileSheet } from './profile/PlayerProfileSheet';
import { DmsTab } from './tabs/DmsTab';

/**
 * Messages: private chats with real players, on its own phone icon (the same conversations as Gist → DMs). Deep links
 * via `useUi.openPhone('messages', dmLink(sender))` open a conversation; `@handle` opens a profile.
 */
export function MessagesApp() {
  const { data: snapshot } = useSnapshot();
  const phoneParam = useUi((state) => state.phoneParam);
  const meId = snapshot?.character.id ?? null;
  useLiveChat(meId);

  useEffect(() => {
    const nav = useGistNav.getState();
    const partner = parseDmLink(phoneParam);
    if (partner) nav.openThread(partner);
    else if (phoneParam?.startsWith('@')) nav.openProfile(phoneParam);
    // Opened from its icon: start on the conversation list, not inside the last chat.
    else nav.closeThread();
  }, [phoneParam]);

  if (!snapshot) return null;
  return (
    <div className="flex flex-col gap-3">
      <DmsTab me={{ id: snapshot.character.id, handle: snapshot.character.handle }} />
      <PlayerProfileSheet />
    </div>
  );
}
