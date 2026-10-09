'use client';

import { MessagesSquare, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ChatMediaKind, ChatMessageDto } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { Button, EmptyState, Spinner } from '@/common/components';
import { gameEvents } from '@/common/game/game-events';
import { cn } from '@/common/utils/cn';
import { ChatSendError, useChatHistory, useDmState, useMarkDmRead, useSendMedia, useSendMessage } from '../../hooks/use-chat';
import type { VoiceClip } from '../../hooks/use-voice-recorder';
import { mentionsHandle } from '../../services/chat-channels';
import { chatTime } from '../../services/chat-time';
import { shrinkPhoto } from '../../services/photo';
import { Composer, type ComposerMedia, type MentionCandidate } from './Composer';
import { MessageBody } from './MessageBody';
import { PhotoMessage } from './PhotoMessage';
import { RequestBanner } from './RequestBanner';
import { VoiceNote } from './VoiceNote';

export interface ChatThreadProps {
  readonly channel: string;
  readonly me: { readonly id: string; readonly handle: string };
  readonly placeholder: string;
  readonly emptyTitle: string;
  readonly emptyBody: string;
  /** Extra @mention candidates (friends, people here). Recent senders are added automatically. */
  readonly candidates?: readonly MentionCandidate[];
  readonly onOpenProfile: (handle: string) => void;
  /** Private chats: the other person (message requests, voice notes and photos). */
  readonly partner?: { readonly handle: string; readonly name: string };
}

interface PendingPhoto {
  readonly file: File;
  readonly previewUrl: string;
}

/** Nearest scrolling ancestor (the phone screen). */
function scrollParent(node: HTMLElement | null): HTMLElement | null {
  let current = node?.parentElement ?? null;
  while (current) {
    const { overflowY } = getComputedStyle(current);
    if (overflowY === 'auto' || overflowY === 'scroll') return current;
    current = current.parentElement;
  }
  return null;
}


/**
 * A chat log (live region) with history paging and a composer pinned to the bottom of the phone screen. New
 * messages keep you at the bottom unless you've scrolled up to read history.
 */
export function ChatThread({ channel, me, placeholder, emptyTitle, emptyBody, candidates = [], onOpenProfile, partner }: ChatThreadProps) {
  const history = useChatHistory(channel);
  const send = useSendMessage(channel);
  const sendMedia = useSendMedia(partner ? channel : null);
  const dmState = useDmState(partner ? channel : null);
  const [pendingPhoto, setPendingPhoto] = useState<PendingPhoto | null>(null);
  const { mutate: markDmRead } = useMarkDmRead();
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const messages = history.messages;
  const lastId = messages.at(-1)?.id;

  const allCandidates = useMemo(() => {
    const seen = new Map<string, MentionCandidate>();
    for (const message of messages.toReversed()) {
      if (message.sender.handle !== me.handle && !seen.has(message.sender.handle)) seen.set(message.sender.handle, { handle: message.sender.handle, name: message.sender.firstName });
    }
    for (const candidate of candidates) if (candidate.handle !== me.handle && !seen.has(candidate.handle)) seen.set(candidate.handle, candidate);
    return [...seen.values()];
  }, [messages, candidates, me.handle]);

  // Track whether the reader is near the bottom of the phone screen.
  useEffect(() => {
    const parent = scrollParent(endRef.current);
    if (!parent) return;
    const onScroll = (): void => {
      stickToBottom.current = parent.scrollHeight - parent.scrollTop - parent.clientHeight < 120;
    };
    parent.addEventListener('scroll', onScroll, { passive: true });
    return () => parent.removeEventListener('scroll', onScroll);
  }, [history.isSuccess]);

  // Reading a DM (opening it, or new messages while it's open) clears its unread dot everywhere.
  useLayoutEffect(() => {
    if (!lastId) return;
    if (stickToBottom.current) endRef.current?.scrollIntoView({ block: 'end' });
    if (channel.startsWith('dm:')) markDmRead(channel);
  }, [lastId, channel, markDmRead]);

  const onSend = async (body: string): Promise<boolean> => {
    setError(null);
    try {
      await send.mutateAsync(body);
      stickToBottom.current = true;
      gameEvents.emit('sfx', { id: 'ui-click', volume: 0.5 });
      return true;
    } catch (caught) {
      setError(caught instanceof ChatSendError ? caught.message : 'Message not sent. Try again.');
      gameEvents.emit('sfx', { id: 'ui-error' });
      return false;
    }
  };

  // Object URLs for the photo preview are released when it's sent or cancelled.
  useEffect(() => (pendingPhoto ? () => URL.revokeObjectURL(pendingPhoto.previewUrl) : undefined), [pendingPhoto]);

  const uploadMedia = (kind: ChatMediaKind, file: File): void => {
    setError(null);
    sendMedia.mutate(
      { kind, file },
      {
        onSuccess: () => {
          stickToBottom.current = true;
          gameEvents.emit('sfx', { id: 'ui-click', volume: 0.5 });
        },
        onError: (caught) => {
          setError(errorMessage(caught));
          gameEvents.emit('sfx', { id: 'ui-error' });
        },
      },
    );
  };

  const sendPhoto = async (): Promise<void> => {
    if (!pendingPhoto) return;
    const { file } = pendingPhoto;
    setPendingPhoto(null);
    try {
      uploadMedia('image', await shrinkPhoto(file));
    } catch {
      setError('We couldn’t open that photo. Try another one.');
    }
  };

  const state = dmState.data;
  const media: ComposerMedia | undefined = partner
    ? {
        enabled: state?.canSendMedia ?? false,
        lockedHint: state?.request === 'incoming' ? 'Accept the request to send voice notes and photos' : 'Voice notes and photos unlock when they accept your message request',
        sending: sendMedia.isPending,
        onVoice: (clip: VoiceClip) => uploadMedia('voice', clip.file),
        onPhoto: (file: File) => setPendingPhoto({ file, previewUrl: URL.createObjectURL(file) }),
      }
    : undefined;

  return (
    <div className="flex min-h-[60dvh] flex-col">
      {partner && state && state.request !== 'none' && <RequestBanner state={state} handle={partner.handle} name={partner.name} />}
      {history.isPending && (
        <div className="grid flex-1 place-items-center py-12 text-text-soft">
          <Spinner />
        </div>
      )}
      {history.isError && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
          <p className="text-sm text-okada">{errorMessage(history.error)}</p>
          <Button variant="paper" size="sm" onClick={() => void history.refetch()}>
            Try again
          </Button>
        </div>
      )}
      {history.isSuccess && (
        <>
          {history.hasNextPage && (
            <Button
              variant="paper"
              size="sm"
              className="mb-2 self-center"
              loading={history.isFetchingNextPage}
              onClick={() => {
                stickToBottom.current = false;
                void history.fetchNextPage();
              }}
            >
              Earlier messages
            </Button>
          )}
          {messages.length === 0 ? (
            <div className="flex-1">
              <EmptyState icon={MessagesSquare} title={emptyTitle} body={emptyBody} />
            </div>
          ) : (
            <ol role="log" aria-live="polite" aria-relevant="additions" aria-label="Messages" className="flex flex-1 flex-col gap-1 pb-3">
              {messages.map((message, index) => (
                <MessageRow
                  key={message.id}
                  message={message}
                  mine={message.sender.characterId === me.id}
                  grouped={messages[index - 1]?.sender.characterId === message.sender.characterId && messages[index - 1]?.kind !== 'system'}
                  mentionsMe={mentionsHandle(message.body, me.handle)}
                  onOpenProfile={onOpenProfile}
                />
              ))}
            </ol>
          )}
        </>
      )}
      <div ref={endRef} />
      <div className="sticky bottom-0 -mx-1 mt-auto bg-paper px-1 pb-1 pt-2">
        {pendingPhoto && (
          <div className="mb-2 flex items-center gap-3 rounded-card bg-paper-2 p-2 ring-1 ring-line">
            {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
            <img src={pendingPhoto.previewUrl} alt="Photo to send" className="size-16 shrink-0 rounded-[10px] object-cover" />
            <p className="min-w-0 flex-1 text-sm text-text-soft">Send this photo? Photos are checked automatically; nudity isn’t allowed.</p>
            <Button size="sm" onClick={() => void sendPhoto()}>
              Send
            </Button>
            <button type="button" onClick={() => setPendingPhoto(null)} aria-label="Don’t send this photo" className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-paper-3">
              <X size={18} aria-hidden />
            </button>
          </div>
        )}
        {sendMedia.isPending && (
          <p role="status" className="mb-1.5 flex items-center gap-2 px-2 text-sm text-text-soft">
            <Spinner size={14} /> Sending {sendMedia.variables?.kind === 'voice' ? 'voice note' : 'photo'}…
          </p>
        )}
        <Composer
          placeholder={placeholder}
          sending={send.isPending}
          error={error}
          candidates={allCandidates}
          onSend={onSend}
          onTyping={() => error && setError(null)}
          media={media}
        />
      </div>
    </div>
  );
}

function MessageRow({
  message,
  mine,
  grouped,
  mentionsMe,
  onOpenProfile,
}: {
  readonly message: ChatMessageDto;
  readonly mine: boolean;
  readonly grouped: boolean;
  readonly mentionsMe: boolean;
  readonly onOpenProfile: (handle: string) => void;
}) {
  if (message.kind === 'system') {
    // Something a player paid for here (a DJ shoutout, a bottle sent): a centred line, not a bubble.
    return (
      <li className="my-1.5 flex justify-center">
        <p className="max-w-[92%] rounded-full bg-ink px-3.5 py-1.5 text-center text-sm font-bold text-on-ink">
          <MessageBody body={message.body} onMention={onOpenProfile} onDark />
        </p>
      </li>
    );
  }
  return (
    <li className={cn('flex flex-col', mine ? 'items-end' : 'items-start', !grouped && 'mt-2')}>
      {!mine && !grouped && (
        <button type="button" onClick={() => onOpenProfile(message.sender.handle)} className="mb-0.5 px-1 text-xs font-bold text-text-soft hover:text-text">
          {message.sender.firstName} <span className="font-normal text-text-faint">@{message.sender.handle}</span>
        </button>
      )}
      <div
        className={cn(
          'max-w-[85%] rounded-[18px] px-3.5 py-2 text-[0.95rem] leading-snug',
          mine ? 'rounded-br-md bg-ink text-on-ink' : 'rounded-bl-md bg-paper-2 text-text',
          mentionsMe && !mine && 'bg-danfo-soft ring-2 ring-danfo',
        )}
      >
        {message.kind === 'voice' && message.media ? (
          <VoiceNote media={message.media} onDark={mine} from={mine ? 'you' : message.sender.firstName} />
        ) : message.kind === 'image' && message.media ? (
          <PhotoMessage media={message.media} from={mine ? 'you' : message.sender.firstName} />
        ) : (
          <p className="whitespace-pre-wrap break-words">
            <MessageBody body={message.body} onMention={onOpenProfile} onDark={mine} />
          </p>
        )}
        <p className={cn('mt-0.5 text-right text-2xs', mine ? 'text-on-ink-soft' : 'text-text-faint')}>
          <time dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString('en-NG')}>
            {chatTime(message.createdAt)}
          </time>
        </p>
      </div>
    </li>
  );
}
