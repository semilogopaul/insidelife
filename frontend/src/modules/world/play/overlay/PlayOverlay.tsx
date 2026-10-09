'use client';

import { ExternalLink } from 'lucide-react';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { Button, Sheet } from '@/common/components';
import { gameEvents } from '@/common/game/game-events';
import { useWorld } from '@/common/game/world-store';
import { cn } from '@/common/utils/cn';
import type { WorldPresence } from '../flow/use-play-bridge';
import { tagElements, usePlayUi, type RemoteTag } from '../state/play-ui-store';
import { DriveControls } from './DriveControls';
import { PointerLayer } from './PointerLayer';

const COARSE_QUERY = '(pointer: coarse)';

function subscribeCoarse(listener: () => void): () => void {
  try {
    const query = window.matchMedia(COARSE_QUERY);
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  } catch {
    return () => undefined;
  }
}

function coarseSnapshot(): boolean {
  try {
    return window.matchMedia(COARSE_QUERY).matches || navigator.maxTouchPoints > 0;
  } catch {
    return false;
  }
}

/** Touch-first device (phones, tablets): show on-screen controls. */
export function useTouchUi(): boolean {
  return useSyncExternalStore(subscribeCoarse, coarseSnapshot, () => false);
}

function NameTag({ tag }: { readonly tag: RemoteTag }) {
  const ref = useCallback(
    (element: HTMLDivElement | null) => {
      if (element) tagElements.set(tag.id, element);
      else tagElements.delete(tag.id);
    },
    [tag.id],
  );
  return (
    <div ref={ref} className="pointer-events-none absolute left-0 top-0 whitespace-nowrap rounded-full bg-ink/75 px-2.5 py-0.5 text-xs font-bold text-on-ink opacity-0 shadow-[var(--shadow-glass)] will-change-transform">
      @{tag.handle}
    </div>
  );
}

function SponsorSheet() {
  const sponsor = usePlayUi((state) => state.sponsor);
  const setSponsor = usePlayUi((state) => state.setSponsor);
  const close = useCallback(() => setSponsor(null), [setSponsor]);
  return (
    <Sheet open={sponsor !== null} onClose={close} title="Open sponsor link?" description="You’re leaving Inside Life for an advertiser’s website." size="sm">
      {sponsor && (
        <div className="flex flex-col gap-4 pb-1">
          <div className="rounded-card bg-paper-2 p-3">
            <p className="font-bold leading-tight">{sponsor.title}</p>
            <p className="mt-0.5 break-all text-sm text-text-soft">{sponsor.host}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="paper" block onClick={close}>
              Stay in Lagos
            </Button>
            <Button
              block
              icon={<ExternalLink size={18} aria-hidden />}
              onClick={() => {
                window.open(sponsor.url, '_blank', 'noopener,noreferrer');
                gameEvents.emit('sfx', { id: 'ui-click' });
                close();
              }}
            >
              Open link
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

/**
 * The play layer's DOM half, layered over the canvas (and under the HUD): the input surface (drag/zoom/tap, touch
 * joystick), on-screen driving controls on touch screens, other players' name tags, the sponsor-link sheet and the
 * dip to dark when walking through a door. Mounted by `WorldCanvas` next to the canvas.
 */
export function PlayOverlay({ presence }: { readonly presence: WorldPresence }) {
  const active = usePlayUi((state) => state.active);
  const fading = usePlayUi((state) => state.fading);
  const tags = usePlayUi((state) => state.tags);
  const mode = useWorld((state) => state.mode);
  const touchUi = useTouchUi();

  // A new place has rendered: lift the dip to dark.
  useEffect(() => {
    const id = window.setTimeout(() => usePlayUi.getState().setFading(false), 120);
    return () => window.clearTimeout(id);
  }, [presence]);

  const outside = active && presence !== 'inside';
  return (
    <>
      {outside && (
        <div className="absolute inset-0">
          <PointerLayer walking={mode === 'walking'} touchUi={touchUi} />
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
            {tags.map((tag) => (
              <NameTag key={tag.id} tag={tag} />
            ))}
          </div>
          {touchUi && mode === 'driving' && <DriveControls />}
        </div>
      )}
      <SponsorSheet />
      <div aria-hidden className={cn('pointer-events-none absolute inset-0 bg-ink transition-opacity duration-200', fading ? 'opacity-100' : 'opacity-0')} />
    </>
  );
}
