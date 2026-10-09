'use client';

import { useConnection } from '@/common/realtime/socket';
import { GLOBAL_CHANNEL } from '../../services/chat-channels';
import { useGistNav } from '../../hooks/use-gist-nav';
import { ChatThread } from '../chat/ChatThread';
import type { MentionCandidate } from '../chat/Composer';

/** Lagos chat: everyone in your Lagos instance (the ~200 people you share the streets with). */
export function LagosTab({ me, candidates }: { readonly me: { readonly id: string; readonly handle: string }; readonly candidates: readonly MentionCandidate[] }) {
  const openProfile = useGistNav((state) => state.openProfile);
  const instance = useConnection((state) => state.instance);
  const number = instance?.id.replace(/^lagos-/, '');
  return (
    <div className="flex flex-col gap-2">
      <p className="rounded-card bg-paper-2 px-3 py-2 text-xs text-text-soft">
        {instance ? (
          <>
            <span className="font-bold text-text">Lagos #{number}</span> · {instance.players} {instance.players === 1 ? 'player' : 'players'} on your streets. Everyone here can read this.
          </>
        ) : (
          'Everybody on your streets can read this.'
        )}{' '}
        Keep it friendly — reports are reviewed by real people.
      </p>
      <ChatThread
        channel={GLOBAL_CHANNEL}
        me={me}
        placeholder="Talk to Lagos… (@ to mention)"
        emptyTitle="Lagos is quiet"
        emptyBody="Say how far — somebody will answer."
        candidates={candidates}
        onOpenProfile={openProfile}
      />
    </div>
  );
}
