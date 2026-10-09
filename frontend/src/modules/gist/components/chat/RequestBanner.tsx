'use client';

import { MailQuestion, ShieldBan } from 'lucide-react';
import { useState } from 'react';
import type { DmStateDto } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { Button, ConfirmSheet, toast } from '@/common/components';
import { gameEvents } from '@/common/game/game-events';
import { useRespondToRequest } from '../../hooks/use-chat';
import { useFriendActions } from '../../hooks/use-social';
import { useGistNav } from '../../hooks/use-gist-nav';

interface RequestBannerProps {
  readonly state: DmStateDto;
  readonly handle: string;
  readonly name: string;
}

/**
 * Message requests in a DM. Incoming: Accept (normal chat, voice notes and photos unlock), Delete (hidden; they can't
 * keep writing) or Block. Outgoing: how many messages you have left until they accept.
 */
export function RequestBanner({ state, handle, name }: RequestBannerProps) {
  const respond = useRespondToRequest(state.channel);
  const { block } = useFriendActions();
  const closeThread = useGistNav((s) => s.closeThread);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const first = name.split(' ')[0] ?? name;

  if (state.request === 'outgoing') {
    const left = state.requestMessagesLeft ?? 0;
    return (
      <p role="status" className="mb-2 flex items-start gap-2 rounded-card bg-paper-2 px-3 py-2.5 text-sm text-text-soft">
        <MailQuestion size={18} aria-hidden className="mt-0.5 shrink-0" />
        <span>
          {left > 0 ? (
            <>
              <strong className="text-text">Message request.</strong> {first} isn’t your friend yet, so this lands in their requests. You can send{' '}
              {left} more {left === 1 ? 'message' : 'messages'}; voice notes and photos unlock when they accept.
            </>
          ) : (
            <>
              <strong className="text-text">Request sent.</strong> Wait for {first} to accept before you send more.
            </>
          )}
        </span>
      </p>
    );
  }
  if (state.request !== 'incoming') return null;

  const answer = (accept: boolean): void => {
    respond.mutate(accept, {
      onSuccess: () => {
        gameEvents.emit('sfx', { id: accept ? 'ui-success' : 'ui-click' });
        if (!accept) {
          toast({ title: 'Request deleted', body: `@${handle} can’t message you again unless you become friends.`, tone: 'neutral' });
          closeThread();
        }
      },
      onError: (error) => toast({ title: 'Couldn’t do that', body: errorMessage(error), tone: 'bad' }),
    });
  };

  return (
    <section aria-label="Message request" className="mb-2 rounded-card bg-danfo-soft p-3 ring-1 ring-danfo">
      <p className="font-bold">{first} wants to message you</p>
      <p className="mt-0.5 text-sm text-text-soft">You’re not friends. Accept to reply and swap voice notes and photos. They won’t be told if you delete it.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => answer(true)} loading={respond.isPending && respond.variables === true}>
          Accept
        </Button>
        <Button size="sm" variant="paper" onClick={() => answer(false)} loading={respond.isPending && respond.variables === false}>
          Delete
        </Button>
        <Button size="sm" variant="paper" className="text-okada" icon={<ShieldBan size={16} aria-hidden />} onClick={() => setConfirmBlock(true)}>
          Block
        </Button>
      </div>
      <ConfirmSheet
        open={confirmBlock}
        onClose={() => setConfirmBlock(false)}
        title={`Block @${handle}?`}
        description="They won’t be able to message you, send you money or invite you anywhere. You can unblock them later in Friends."
        confirmLabel="Block"
        loading={block.isPending}
        onConfirm={() =>
          block.mutate(handle, {
            onSuccess: () => {
              setConfirmBlock(false);
              toast({ title: `Blocked @${handle}`, tone: 'neutral' });
              closeThread();
            },
            onError: (error) => toast({ title: 'Couldn’t block', body: errorMessage(error), tone: 'bad' }),
          })
        }
      />
    </section>
  );
}
