'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import type { ChatMediaKind, ChatMessageDto, DmStateDto, DmThreadDto, Paginated } from '@insidelife/shared';
import { getSocket } from '@/common/realtime/socket';
import { gistApi } from '../services/gist.api';
import { gistKeys } from '../services/gist-keys';

type ChatPages = InfiniteData<Paginated<ChatMessageDto>, string | null>;

const SEND_TIMEOUT_MS = 8_000;

/** Chat history for a channel (newest page first in the cache), flattened oldest → newest for rendering. */
export function useChatHistory(channel: string | null) {
  const query = useInfiniteQuery({
    queryKey: gistKeys.chat(channel ?? ''),
    queryFn: ({ pageParam }) => gistApi.history(channel ?? '', pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: channel !== null,
    staleTime: 30_000,
  });
  const pages = query.data?.pages;
  const messages = useMemo(() => (pages ? [...pages].reverse().flatMap((page) => page.items) : []), [pages]);
  return { ...query, messages };
}

/** Your private conversations, newest first, with unread state (shared with the phone's badges). */
export { useDmThreads } from '@/common/chat';

/** Message-request state of a DM: who may write what (refreshed when messages arrive or a request is answered). */
export function useDmState(channel: string | null) {
  return useQuery({
    queryKey: gistKeys.dmState(channel ?? ''),
    queryFn: () => gistApi.dmState(channel ?? ''),
    enabled: channel?.startsWith('dm:') ?? false,
    staleTime: 15_000,
  });
}

/** Accept (`true`) or delete (`false`) a message request someone sent me. */
export function useRespondToRequest(channel: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (accept: boolean) => (accept ? gistApi.acceptRequest(channel) : gistApi.declineRequest(channel)),
    onSuccess: (state: DmStateDto) => {
      client.setQueryData(gistKeys.dmState(channel), state);
      void client.invalidateQueries({ queryKey: gistKeys.dmThreads });
    },
  });
}

/** Upload a voice note or photo to a DM; the server also pushes it to both of you over the socket. */
export function useSendMedia(channel: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, file }: { readonly kind: ChatMediaKind; readonly file: File }) => {
      if (!channel) throw new ChatSendError('Pick a chat first.');
      return gistApi.sendMedia(channel, kind, file);
    },
    onSuccess: (message) => {
      appendMessage(client, message);
      void client.invalidateQueries({ queryKey: gistKeys.dmThreads });
    },
  });
}

/** Mark a DM conversation read on the server (unread state follows you across devices). */
export function useMarkDmRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (channel: string) => gistApi.markDmRead(channel),
    onMutate: (channel) => {
      client.setQueryData<DmThreadDto[]>(gistKeys.dmThreads, (threads) => threads?.map((thread) => (thread.channel === channel ? { ...thread, unread: false } : thread)));
    },
  });
}

/** Append a realtime message to its channel's cached history (if that history is loaded). */
export function appendMessage(client: QueryClient, message: ChatMessageDto): void {
  client.setQueryData<ChatPages>(gistKeys.chat(message.channel), (data) => {
    if (!data || data.pages.length === 0) return data;
    const [newest, ...older] = data.pages;
    if (!newest || newest.items.some((item) => item.id === message.id)) return data;
    return { ...data, pages: [{ ...newest, items: [...newest.items, message] }, ...older] };
  });
}

/** Thrown when a send isn't acknowledged; `message` is player-facing (server text such as the rate limit). */
export class ChatSendError extends Error {}

/** Send over the socket and wait for the server's ack (rate limits and permissions come back as errors). */
export function useSendMessage(channel: string | null) {
  return useMutation({
    mutationFn: (body: string) =>
      new Promise<void>((resolve, reject) => {
        const socket = getSocket();
        if (!channel) {
          reject(new ChatSendError('Pick a chat first.'));
          return;
        }
        if (!socket.connected) {
          reject(new ChatSendError('You’re offline — we’re reconnecting. Try again in a moment.'));
          return;
        }
        const timer = window.setTimeout(() => reject(new ChatSendError('Message not sent. Check your connection and try again.')), SEND_TIMEOUT_MS);
        socket.emit('chat:send', { channel, body }, (ack) => {
          window.clearTimeout(timer);
          if (ack.ok) resolve();
          else reject(new ChatSendError(ack.error));
        });
      }),
  });
}

/** Join a room-based channel (venue chat) while mounted; re-joins after reconnects and leaves on unmount. */
export function useJoinedChannel(channel: string | null): void {
  const client = useQueryClient();
  useEffect(() => {
    if (!channel) return;
    const socket = getSocket();
    const join = (): void => {
      socket.emit('chat:join', { channel }, (ack) => {
        if (ack.ok) void client.invalidateQueries({ queryKey: gistKeys.chat(channel) });
      });
    };
    if (socket.connected) join();
    socket.on('connect', join);
    return () => {
      socket.off('connect', join);
      socket.emit('chat:leave', { channel });
    };
  }, [channel, client]);
}
