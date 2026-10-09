'use client';

import { useQueryClient } from '@tanstack/react-query';
import type { ChatMessageDto } from '@insidelife/shared';
import { toast } from '@/common/components';
import { gameEvents } from '@/common/game/game-events';
import { useRealtimeEvent } from '@/common/realtime/use-realtime';
import { useDmFocus } from './dm-focus';
import { dmThreadsKey } from './dm-threads';

/** Someone who sent you a DM. */
export interface DmSender {
  readonly id: string;
  readonly handle: string;
  readonly name: string;
}

/** One-line preview of a message for an alert. */
export function dmPreview(message: Pick<ChatMessageDto, 'kind' | 'body'>): string {
  if (message.kind === 'voice') return '🎤 Voice note';
  if (message.kind === 'image') return '📷 Photo';
  const text = message.body.trim();
  return text.length > 90 ? `${text.slice(0, 89)}…` : text;
}

/**
 * New DMs anywhere in the game: refresh the inbox (badges) and, unless that conversation is on screen, ping and show
 * an alert that opens it. Mount once, in the game root.
 */
export function useDmAlerts(meId: string | null, openThread: (sender: DmSender) => void): void {
  const client = useQueryClient();
  useRealtimeEvent('chat:message', (message) => {
    if (!message.channel.startsWith('dm:')) return;
    void client.invalidateQueries({ queryKey: dmThreadsKey });
    if (!meId || message.sender.characterId === meId) return;
    if (useDmFocus.getState().channel === message.channel) return;
    const sender: DmSender = { id: message.sender.characterId, handle: message.sender.handle, name: message.sender.firstName };
    gameEvents.emit('sfx', { id: 'notification', volume: 0.7 });
    toast({ title: `💬 ${sender.name} (@${sender.handle})`, body: dmPreview(message), tone: 'neutral', actionLabel: 'Reply', onOpen: () => openThread(sender) });
  });
}
