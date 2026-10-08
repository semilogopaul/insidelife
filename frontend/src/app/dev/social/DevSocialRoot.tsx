'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { LastLifeDto, SuccessionDto } from '@insidelife/shared';
import { ApiError } from '@/common/api/api-error';
import { queryKeys } from '@/common/api/query-keys';
import { useSession } from '@/common/auth/session-store';
import { toast } from '@/common/components';
import { gameEvents } from '@/common/game/game-events';
import { useSnapshot } from '@/common/game/snapshot';
import { useClockSync } from '@/common/game/use-game-clock';
import { connectSocket, disconnectSocket } from '@/common/realtime/socket';
import { useRealtimeEvent } from '@/common/realtime/use-realtime';
import { AwayReport } from '@/modules/away-report';
import { CelebrationLayer } from '@/modules/celebrations';
import { EpitaphGate, EpitaphLayer, EpitaphScreen } from '@/modules/epitaph';
import { Hud } from '@/modules/hud';
import { LifeEventsLayer, PendingDecisionsChip } from '@/modules/life-events';
import { NotificationBell, NotificationCenter } from '@/modules/notifications';
import { Phone } from '@/modules/phone';
import { VenueSheet } from '@/modules/venue';
import { PHONE_APPS } from '../../play/_components/phone-apps';

/**
 * Dev composition root mirroring GameRoot without the WorldCanvas, so the social/meta layers can be exercised
 * (and screenshotted) on any machine. Not shipped: the route 404s in production.
 */
export function DevSocialRoot() {
  const router = useRouter();
  const client = useQueryClient();
  const status = useSession((state) => state.status);
  const clockReady = useClockSync();
  const snapshot = useSnapshot();
  const hasCharacter = snapshot.data !== undefined;
  const noCharacter = snapshot.error instanceof ApiError && snapshot.error.code === 'NO_CHARACTER';

  useEffect(() => {
    if (status === 'anonymous') router.replace('/sign-in?next=/dev/social');
  }, [status, router]);

  useEffect(() => {
    if (!hasCharacter) return;
    connectSocket();
    return () => disconnectSocket();
  }, [hasCharacter]);

  useRealtimeEvent('character:invalidate', () => {
    void client.invalidateQueries({ queryKey: queryKeys.snapshot });
    void client.invalidateQueries({ queryKey: queryKeys.lifeEvents });
  });

  useRealtimeEvent('notification', (notification) => {
    // Achievements get their own celebration (CelebrationLayer); everything else is a toast.
    if (notification.kind !== 'achievement') toast({ title: notification.title, body: notification.body, tone: notification.tone, amount: notification.amount });
    gameEvents.emit('sfx', { id: notification.amount && notification.amount > 0 ? 'cash-in' : 'notification' });
    void client.invalidateQueries({ queryKey: queryKeys.notifications });
  });

  if (noCharacter) return <EpitaphGate />;
  if (status !== 'authenticated' || !clockReady || !snapshot.data) {
    return <div className="fixed inset-0 grid place-items-center bg-ink text-on-ink-soft">Loading Lagos…</div>;
  }

  return (
    <main className="fixed inset-0 overflow-hidden bg-ink touch-none select-none">
      <FakeWorld />
      <Hud
        tray={
          <>
            <NotificationBell />
            <PendingDecisionsChip />
          </>
        }
      />
      <VenueSheet />
      <Phone apps={PHONE_APPS} />
      <LifeEventsLayer />
      <NotificationCenter />
      <AwayReport />
      <CelebrationLayer />
      <EpitaphLayer />
      <DevTools />
    </main>
  );
}

/** Stand-in for the 3D city: a dusk sky over a lagoon skyline. */
function FakeWorld() {
  return (
    <div aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,#1b3f55_0%,#3d5f6e_45%,#d98a3a_78%,#f2b04f_100%)]">
      <div className="absolute inset-x-0 bottom-0 h-[38%] bg-[linear-gradient(180deg,#0e2733_0%,#08161d_100%)]" />
      <div className="absolute inset-x-0 bottom-[38%] flex h-40 items-end gap-1 px-4 opacity-80">
        {[38, 70, 52, 96, 60, 120, 84, 46, 130, 72, 58, 104, 66, 40, 88, 54].map((height, index) => (
          <span key={index} className="flex-1 rounded-t-sm bg-[#0b1f29]" style={{ height }} />
        ))}
      </div>
    </div>
  );
}

/** Tiny dev helpers: fire a celebration, preview the epitaph. */
function DevTools() {
  const [open, setOpen] = useState(false);
  const [epitaph, setEpitaph] = useState(false);
  if (epitaph) return <EpitaphScreen lastLife={SAMPLE_LAST_LIFE} legacy={SAMPLE_LEGACY} onContinue={() => setEpitaph(false)} onStartNewLife={() => setEpitaph(false)} />;
  return (
    <div className="absolute left-1/2 top-1 z-30 -translate-x-1/2 text-xs">
      {open ? (
        <div className="glass flex gap-1.5 rounded-card p-1.5 text-on-ink">
          <button type="button" className="rounded-chip bg-white/10 px-2 py-1" onClick={() => {
              setOpen(false);
              gameEvents.emit('celebrate', { kind: 'milestone', title: 'Alert don land!', body: 'Your first salary just landed. Screenshot am — this one na history.' });
            }}>
            Moment
          </button>
          <button type="button" className="rounded-chip bg-white/10 px-2 py-1" onClick={() => {
              setOpen(false);
              gameEvents.emit('celebrate', { kind: 'achievement', title: 'Omo Lagos', body: 'Stepped out into the Lagos madness.' });
            }}>
            Badge
          </button>
          <button type="button" className="rounded-chip bg-white/10 px-2 py-1" onClick={() => {
              setOpen(false);
              setEpitaph(true);
            }}>
            Epitaph
          </button>
          <button type="button" className="rounded-chip bg-white/10 px-2 py-1" onClick={() => setOpen(false)}>
            ×
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="glass rounded-full px-2.5 py-1 text-on-ink-soft">
          dev
        </button>
      )}
    </div>
  );
}

const MINUTES_PER_YEAR = 365 * 24 * 60;

/** Sample data for previewing the epitaph (a death can't be triggered on demand). */
const SAMPLE_LAST_LIFE: LastLifeDto = {
  characterId: 'sample-1',
  name: 'Adebayo Bakare',
  handle: 'bayo',
  ageAtDeath: 71,
  bornAt: 0,
  diedAt: 71 * MINUTES_PER_YEAR,
  causeOfDeath: 'Heart failure',
  generation: 2,
  netWorth: 486_000_000,
  selfMadeNetWorth: 312_000_000,
  heirContinues: true,
};

const SAMPLE_LEGACY: readonly SuccessionDto[] = [
  {
    id: 's2',
    generation: 2,
    deceased: { characterId: 'sample-1', name: 'Adebayo Bakare', diedAt: 71 * MINUTES_PER_YEAR, causeOfDeath: 'Heart failure' },
    heir: { characterId: 'sample-2', name: 'Kemi Bakare', agedUp: false },
    estate: { gross: 486_000_000, funeral: 15_000_000, funeralTier: 'lagos-burial', probate: 9_400_000, inherited: 461_600_000 },
    createdAt: 71 * MINUTES_PER_YEAR,
  },
  {
    id: 's1',
    generation: 1,
    deceased: { characterId: 'sample-0', name: 'Tolu Bakare', diedAt: 40 * MINUTES_PER_YEAR, causeOfDeath: 'Malaria complications' },
    heir: { characterId: 'sample-1', name: 'Adebayo Bakare', agedUp: true },
    estate: { gross: 52_000_000, funeral: 6_000_000, funeralTier: 'befitting', probate: 1_000_000, inherited: 45_000_000 },
    createdAt: 40 * MINUTES_PER_YEAR,
  },
];
