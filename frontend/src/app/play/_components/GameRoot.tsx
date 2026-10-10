'use client';

import { useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ApiError } from '@/common/api/api-error';
import { queryKeys } from '@/common/api/query-keys';
import { useSession } from '@/common/auth/session-store';
import { dmLink, useDmAlerts } from '@/common/chat';
import { ErrorBoundary, toast } from '@/common/components';
import { gameEvents } from '@/common/game/game-events';
import { useSnapshot } from '@/common/game/snapshot';
import { useUi } from '@/common/game/ui-store';
import { useClockSync } from '@/common/game/use-game-clock';
import { connectSocket, disconnectSocket } from '@/common/realtime/socket';
import { useRealtimeEvent } from '@/common/realtime/use-realtime';
import { useSpeechFeed } from '@/common/speech';
import { visitsKey } from '@/common/visits';
import { AudioDirector } from '@/modules/audio';
import { AwayReport } from '@/modules/away-report';
import { CelebrationLayer, isCelebratedNotification } from '@/modules/celebrations';
import { EpitaphGate, EpitaphLayer } from '@/modules/epitaph';
import { Hud } from '@/modules/hud';
import { LifeEventsLayer, PendingDecisionsChip } from '@/modules/life-events';
import { MomentLayer, VenueMomentLayer } from '@/modules/moments';
import { NotificationBell, NotificationCenter } from '@/modules/notifications';
import { Phone } from '@/modules/phone';
import { TalkButton, TalkFeed, TalkLayer } from '@/modules/talk';
import { VenueSheet } from '@/modules/venue';
import { VisitCards } from '@/modules/visits';
import { LoadingScreen } from './LoadingScreen';
import { PHONE_APPS } from './phone-apps';

/** The 3D world is the heaviest chunk: load it lazily and never on the server. */
const WorldCanvas = dynamic(() => import('@/modules/world').then((module) => module.WorldCanvas), {
  ssr: false,
  loading: () => <LoadingScreen message="Building Lagos…" />,
});
/** Lives in the world chunk too (importing it eagerly would pull three.js into the first load). */
const Minimap = dynamic(() => import('@/modules/world').then((module) => module.Minimap), { ssr: false });

/**
 * Composition root for the game. Features never import each other; this file wires them together and owns the
 * session-level effects (auth guard, clock sync, realtime connection, cache invalidation).
 */
export function GameRoot() {
  const router = useRouter();
  const client = useQueryClient();
  const status = useSession((state) => state.status);
  const unreachable = useSession((state) => state.unreachable);
  const mustVerifyEmail = useSession((state) => state.user?.mustVerifyEmail ?? false);
  const clockReady = useClockSync();
  const snapshot = useSnapshot();
  // After a death the player continues as their heir: a new character id means new private realtime rooms.
  const characterId = snapshot.data?.character.id ?? null;
  const noCharacter = snapshot.error instanceof ApiError && snapshot.error.code === 'NO_CHARACTER';
  const unverified = mustVerifyEmail || (snapshot.error instanceof ApiError && snapshot.error.isEmailUnverified);

  // Only a definitive sign-out (the server rejected the refresh cookie) leaves the game; an unreachable API retries.
  useEffect(() => {
    if (status === 'anonymous') router.replace('/sign-in?next=/play');
    if (status === 'authenticated' && unverified) router.replace('/verify-email?next=/play');
  }, [status, unverified, router]);

  useEffect(() => {
    if (!characterId) return;
    connectSocket();
    return () => disconnectSocket();
  }, [characterId]);

  // New DMs anywhere in the game: badge the phone and pop up an alert that opens the conversation in Messages.
  useDmAlerts(characterId, (sender) => useUi.getState().openPhone('messages', dmLink(sender)));
  // Speech bubbles and the Nearby log: what people around you say out loud.
  useSpeechFeed(characterId);

  useRealtimeEvent('character:invalidate', () => {
    void client.invalidateQueries({ queryKey: queryKeys.snapshot });
    void client.invalidateQueries({ queryKey: queryKeys.lifeEvents });
    void client.invalidateQueries({ queryKey: visitsKey });
  });

  useRealtimeEvent('notification', (notification) => {
    // Achievement unlocks get their own badge burst (CelebrationLayer); everything else is a toast.
    if (!isCelebratedNotification(notification)) {
      toast({ title: notification.title, body: notification.body, tone: notification.tone, amount: notification.amount });
    }
    gameEvents.emit('sfx', { id: notification.amount && notification.amount > 0 ? 'cash-in' : 'notification' });
    void client.invalidateQueries({ queryKey: queryKeys.notifications });
  });

  // No living character: show the last life's epitaph (or send a brand-new player to the creator).
  if (status === 'authenticated' && noCharacter) return <EpitaphGate />;

  if (status !== 'authenticated' || !clockReady || !snapshot.data) {
    const retrying = ((snapshot.isError || snapshot.failureCount > 0) && !unverified) || (status === 'unknown' && unreachable);
    return <LoadingScreen message={retrying ? 'Can’t reach Lagos right now. Retrying…' : undefined} />;
  }

  return (
    <main className="fixed inset-0 overflow-hidden bg-ink touch-none select-none">
      <ErrorBoundary fallback={(reset) => <WorldCrashed onRetry={reset} />}>
        <WorldCanvas />
      </ErrorBoundary>
      <Hud
        tray={
          <>
            <NotificationBell />
            <PendingDecisionsChip />
          </>
        }
        map={<Minimap className="w-[118px] sm:w-[188px]" />}
        notices={<VisitCards />}
        talk={<TalkButton />}
        feed={<TalkFeed />}
      />
      <VenueSheet />
      <VenueMomentLayer />
      <TalkLayer />
      <Phone apps={PHONE_APPS} />
      <LifeEventsLayer />
      <NotificationCenter />
      <AwayReport />
      <CelebrationLayer />
      <MomentLayer />
      <EpitaphLayer />
      <AudioDirector />
    </main>
  );
}

function WorldCrashed({ onRetry }: { readonly onRetry: () => void }) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-ink p-6 text-center text-on-ink">
      <div>
        <p className="type-title text-2xl">The 3D city stopped responding</p>
        <p className="mt-2 text-on-ink-soft">Your phone and progress still work. Try loading the city again.</p>
        <button type="button" onClick={onRetry} className="mt-5 h-11 rounded-card bg-danfo px-5 font-bold text-ink">
          Reload the city
        </button>
      </div>
    </div>
  );
}
