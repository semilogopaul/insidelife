'use client';

import { MessageCircle } from 'lucide-react';
import { gameEvents } from '@/common/game/game-events';
import { useSpeech } from '@/common/speech';
import { cn } from '@/common/utils/cn';
import { openTalk } from '../services/talk-focus';

/**
 * The HUD's Talk button (and T on a keyboard): opens the Talk box, focused, so a phone's keyboard comes up in the
 * same tap. Counts what others nearby said since you last opened it.
 */
export function TalkButton({ className }: { readonly className?: string }) {
  const open = useSpeech((state) => state.composerOpen);
  const unread = useSpeech((state) => state.unread);
  if (open) return null;
  return (
    <button
      type="button"
      onClick={() => {
        gameEvents.emit('sfx', { id: 'ui-open' });
        openTalk();
      }}
      aria-label={unread > 0 ? `Talk to people nearby (${unread} new)` : 'Talk to people nearby'}
      aria-keyshortcuts="T"
      title="Talk (T)"
      className={cn(
        'glass relative flex h-12 items-center gap-1.5 rounded-full px-3.5 text-sm font-bold text-on-ink active:translate-y-0.5',
        className,
      )}
    >
      <MessageCircle size={20} aria-hidden strokeWidth={2.4} className="text-danfo" />
      Talk
      <kbd className="rounded bg-white/15 px-1.5 py-0.5 text-2xs pointer-coarse:hidden">T</kbd>
      {unread > 0 && (
        <span aria-hidden className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-danfo px-1 text-2xs font-bold text-ink ring-2 ring-ink">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </button>
  );
}
