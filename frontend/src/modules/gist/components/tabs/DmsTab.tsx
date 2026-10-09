'use client';

import { ChevronDown, ChevronLeft, MailQuestion, MessageCirclePlus, UserRound } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { DmThreadDto } from '@insidelife/shared';
import { EmptyState, LoadingRows } from '@/common/components';
import { cn } from '@/common/utils/cn';
import { useDmThreads } from '../../hooks/use-chat';
import { useGistNav, type DmPartner } from '../../hooks/use-gist-nav';
import { useFriends } from '../../hooks/use-social';
import { dmChannel } from '../../services/chat-channels';
import { chatTime } from '../../services/chat-time';
import { ChatThread } from '../chat/ChatThread';
import { PlayerAvatar } from '../PlayerAvatar';

interface Me {
  readonly id: string;
  readonly handle: string;
}

/**
 * Private conversations: your friends and anyone you've messaged, newest first; tap to open the thread. Messages from
 * people who aren't your friends wait under "Message requests" until you accept them.
 */
export function DmsTab({ me }: { readonly me: Me }) {
  const thread = useGistNav((state) => state.thread);
  const closeThread = useGistNav((state) => state.closeThread);
  const openProfile = useGistNav((state) => state.openProfile);

  if (thread) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <button type="button" onClick={closeThread} aria-label="Back to conversations" className="grid size-10 place-items-center rounded-full hover:bg-paper-2">
            <ChevronLeft size={22} aria-hidden />
          </button>
          <PlayerAvatar name={thread.name} handle={thread.handle} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold leading-tight">{thread.name}</p>
            <p className="truncate text-xs text-text-soft">@{thread.handle}</p>
          </div>
          <button type="button" onClick={() => openProfile(thread.handle)} aria-label={`View ${thread.name}’s profile`} className="grid size-10 place-items-center rounded-full hover:bg-paper-2">
            <UserRound size={20} aria-hidden />
          </button>
        </div>
        <ChatThread
          channel={dmChannel(me.id, thread.id)}
          me={me}
          placeholder={`Message ${thread.name.split(' ')[0] ?? thread.name}…`}
          emptyTitle="Start the gist"
          emptyBody="Only the two of you can see this chat."
          candidates={[{ handle: thread.handle, name: thread.name }]}
          onOpenProfile={openProfile}
          partner={{ handle: thread.handle, name: thread.name }}
        />
      </div>
    );
  }
  return <Conversations />;
}

interface ConversationItem {
  readonly partner: DmPartner;
  readonly thread: DmThreadDto | null;
  readonly online: boolean | undefined;
}

function Conversations() {
  const friends = useFriends();
  const threads = useDmThreads();
  const partners = useGistNav((state) => state.partners);
  const setTab = useGistNav((state) => state.setTab);
  const [showRequests, setShowRequests] = useState(false);
  // Conversations from the server (newest first, including people who messaged you first), then friends and people
  // you just opened a chat with who have no messages yet.
  const list = useMemo(() => {
    const online = new Map((friends.data?.friends ?? []).map((friend) => [friend.id, friend.online]));
    const items = new Map<string, ConversationItem>();
    for (const thread of threads.data ?? []) {
      if (thread.request === 'incoming') continue;
      const { characterId, handle, firstName, lastName } = thread.counterpart;
      items.set(characterId, { partner: { id: characterId, handle, name: `${firstName} ${lastName}` }, thread, online: online.get(characterId) });
    }
    for (const partner of partners) if (!items.has(partner.id)) items.set(partner.id, { partner, thread: null, online: online.get(partner.id) });
    for (const friend of friends.data?.friends ?? []) {
      if (!items.has(friend.id)) items.set(friend.id, { partner: { id: friend.id, handle: friend.handle, name: `${friend.firstName} ${friend.lastName}` }, thread: null, online: friend.online });
    }
    return [...items.values()];
  }, [friends.data, threads.data, partners]);
  const requests = useMemo(() => (threads.data ?? []).filter((thread) => thread.request === 'incoming'), [threads.data]);
  const unreadRequests = requests.filter((thread) => thread.unread).length;

  const requestsSection =
    requests.length > 0 ? (
      <div className="mb-2">
        <button
          type="button"
          onClick={() => setShowRequests((open) => !open)}
          aria-expanded={showRequests}
          className="flex w-full items-center gap-3 rounded-card bg-paper-2 px-3 py-2.5 text-left ring-1 ring-line hover:bg-paper-3"
        >
          <MailQuestion size={20} aria-hidden />
          <span className="flex-1 font-bold">Message requests</span>
          <span className={cn('tabular rounded-full px-2 py-0.5 text-xs font-bold', unreadRequests > 0 ? 'bg-danfo text-ink' : 'bg-paper-3 text-text-soft')}>{requests.length}</span>
          <ChevronDown size={18} aria-hidden className={cn('transition-transform', showRequests && 'rotate-180')} />
        </button>
        {showRequests && (
          <ul className="mt-1 flex flex-col gap-1" aria-label="Message requests">
            {requests.map((thread) => (
              <ConversationRow
                key={thread.channel}
                item={{
                  partner: { id: thread.counterpart.characterId, handle: thread.counterpart.handle, name: `${thread.counterpart.firstName} ${thread.counterpart.lastName}` },
                  thread,
                  online: undefined,
                }}
              />
            ))}
          </ul>
        )}
      </div>
    ) : null;

  if (list.length === 0 && requests.length > 0) return requestsSection;
  if (list.length === 0) {
    if (threads.isPending) return <LoadingRows rows={4} />;
    return (
      <EmptyState
        icon={MessageCirclePlus}
        title="No conversations yet"
        body="Add friends, or tap anyone’s name in Lagos chat to message them."
        action={
          <button type="button" onClick={() => setTab('friends')} className="h-11 rounded-card bg-danfo px-4 font-bold text-ink">
            Find friends
          </button>
        }
      />
    );
  }
  return (
    <>
      {requestsSection}
      <ul className="flex flex-col gap-1" aria-label="Conversations">
        {list.map((item) => (
          <ConversationRow key={item.partner.id} item={item} />
        ))}
      </ul>
    </>
  );
}

function ConversationRow({ item }: { readonly item: ConversationItem }) {
  const { partner, thread, online } = item;
  const openThread = useGistNav((state) => state.openThread);
  const unread = thread?.unread ?? false;
  return (
    <li>
      <button type="button" onClick={() => openThread(partner)} className="flex w-full items-center gap-3 rounded-card px-2 py-2.5 text-left hover:bg-paper-2">
        <PlayerAvatar name={partner.name} handle={partner.handle} online={online} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold">{partner.name}</span>
          <span className={cn('block truncate text-sm', unread ? 'font-bold text-text' : 'text-text-soft')}>
            {thread ? `${thread.request === 'outgoing' ? 'Request sent · ' : thread.lastFromMe ? 'You: ' : ''}${thread.preview}` : `Say hi to @${partner.handle}`}
          </span>
        </span>
        {thread && <span className="shrink-0 text-2xs text-text-faint">{chatTime(thread.lastMessageAt)}</span>}
        {unread && <span aria-label="Unread" role="img" className="size-2.5 shrink-0 rounded-full bg-danfo ring-2 ring-ink/10" />}
      </button>
    </li>
  );
}
