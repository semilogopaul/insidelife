'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRealtimeEvent } from '@/common/realtime/use-realtime';
import { channelKind } from '../services/chat-channels';
import { gistKeys } from '../services/gist-keys';
import { appendMessage } from './use-chat';
import { useGistNav } from './use-gist-nav';

/**
 * Keep open chats live: new messages go straight into the cache, DM state refreshes, and people who write to you are
 * remembered for the conversation list. Alerts and sounds for DMs are global (`useDmAlerts` in the game root).
 */
export function useLiveChat(meId: string | null): void {
  const client = useQueryClient();
  useRealtimeEvent('chat:message', (message) => {
    appendMessage(client, message);
    if (message.channel.startsWith('dm:')) {
      // A reply accepts a request; my own sends use up a pending request's allowance.
      void client.invalidateQueries({ queryKey: gistKeys.dmState(message.channel) });
    }
    if (!meId || channelKind(message.channel) !== 'dm' || message.sender.characterId === meId) return;
    useGistNav.getState().rememberPartner({ id: message.sender.characterId, handle: message.sender.handle, name: message.sender.firstName });
  });
}
