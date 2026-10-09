'use client';

import { ArrowDownRight, ArrowUpRight, DoorOpen, Eye, Footprints, Layers } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { findAction, type ActionDefinition } from '@insidelife/shared';
import { toast } from '@/common/components';
import { gameEvents } from '@/common/game/game-events';
import { useUi } from '@/common/game/ui-store';
import { useTouchUi } from '@/common/hooks/use-touch-ui';
import { serviceOfInteractable, useStartAction, type PlaceService } from '@/common/places';
import { cn } from '@/common/utils/cn';
import { PointerLayer } from '../../play/overlay/PointerLayer';
import { actionOfInteractable } from '../hotspots/hotspots';
import { levelLabel } from '../layouts/geometry';
import {
  hotspotLabelElements,
  portalLabelElements,
  useHomeView,
  type HotspotTag,
  type PortalTag,
} from '../walk/home-view-store';

/** Room kept clear at the bottom of a phone for the venue sheet ("Things to do here") and the phone button row. */
const SHEET_RESERVE_PX = 104;

export interface InteriorOverlayProps {
  /**
   * Start an action chosen at a hotspot (the HUD context button emits `interact` with its id). Defaults to the
   * server (`POST /characters/me/actions`, like the venue sheet); previews without a session pass their own.
   */
  readonly onStartAction?: (action: ActionDefinition) => void;
  /** Open a place service (defaults to its phone app on the right tab). */
  readonly onOpenService?: (service: PlaceService) => void;
}

/**
 * The DOM half of walking around a home or venue, layered over the canvas (and under the HUD): the touch stick and
 * look pad (walk camera), door/stairs labels, the hotspot markers (tap one to walk there; its action shows on the HUD
 * context button), the camera switch (walk ↔ overview), the rooms menu for bigger homes and the dip to dark between
 * rooms. Starts hotspot actions. Renders nothing outside a walkable place.
 */
export function InteriorOverlay({ onStartAction, onOpenService }: InteriorOverlayProps = {}) {
  const house = useHomeView((state) => state.house);
  const camera = useHomeView((state) => state.camera);
  const fading = useHomeView((state) => state.fading);
  const phoneOpen = useUi((state) => state.phoneOpen);
  const touchUi = useTouchUi();
  useHotspotActions(onStartAction, onOpenService);
  if (!house) return null;
  return (
    <>
      {camera === 'walk' && (
        <PointerLayer
          walking
          touchUi={touchUi}
          reserveBottom={touchUi ? SHEET_RESERVE_PX : 0}
          hintClassName="border-white/50 bg-ink/55"
        />
      )}
      <PortalLabels />
      {!phoneOpen && <HotspotMarkers />}
      {!phoneOpen && <HomeControls />}
      {camera === 'walk' && !touchUi && <KeysHint key={house} />}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-0 bg-ink transition-opacity duration-200',
          fading ? 'opacity-100' : 'opacity-0',
        )}
      />
    </>
  );
}

function PortalIcon({ kind }: { readonly kind: PortalTag['kind'] }) {
  if (kind === 'stairs-up') return <ArrowUpRight size={14} aria-hidden strokeWidth={2.6} />;
  if (kind === 'stairs-down') return <ArrowDownRight size={14} aria-hidden strokeWidth={2.6} />;
  return <DoorOpen size={14} aria-hidden strokeWidth={2.4} />;
}

function PortalLabel({ tag }: { readonly tag: PortalTag }) {
  const ref = useCallback(
    (element: HTMLDivElement | null) => {
      if (element) portalLabelElements.set(tag.id, element);
      else portalLabelElements.delete(tag.id);
    },
    [tag.id],
  );
  return (
    <div
      ref={ref}
      className="pointer-events-none absolute left-0 top-0 flex items-center gap-1 whitespace-nowrap rounded-full bg-ink/80 py-1 pl-2 pr-2.5 text-xs font-bold text-on-ink opacity-0 shadow-[var(--shadow-glass)] will-change-transform"
    >
      <span className="text-danfo">
        <PortalIcon kind={tag.kind} />
      </span>
      {tag.label}
    </div>
  );
}

/** Floating labels over the doors and stairs of the current room (positioned by the frame loop). */
function PortalLabels() {
  const portals = useHomeView((state) => state.portals);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {portals.map((tag) => (
        <PortalLabel key={tag.id} tag={tag} />
      ))}
    </div>
  );
}

/** A service opens its phone app on the right tab. */
function openService(service: PlaceService): void {
  gameEvents.emit('sfx', { id: 'ui-open' });
  useUi.getState().openPhone(service.app, service.param ?? null);
}

/**
 * Context-button presses on a hotspot: an action starts (the avatar then walks to its spot), a service opens its app,
 * something greyed out explains why not.
 */
function useHotspotActions(
  onStartAction: InteriorOverlayProps['onStartAction'],
  onOpenService: InteriorOverlayProps['onOpenService'],
): void {
  const { start } = useStartAction();
  const handler = useRef<(action: ActionDefinition) => void>(start);
  const opener = useRef<(service: PlaceService) => void>(openService);
  useEffect(() => {
    handler.current = onStartAction ?? ((action: ActionDefinition) => start(action));
    opener.current = onOpenService ?? openService;
  });
  useEffect(
    () =>
      gameEvents.on('interact', ({ interactableId }) => {
        const service = serviceOfInteractable(interactableId);
        if (service) {
          opener.current(service);
          return;
        }
        const actionId = actionOfInteractable(interactableId);
        const action = actionId ? findAction(actionId) : undefined;
        if (!action) return;
        // Greyed out on the HUD: say why instead of asking the server.
        const offer = useHomeView.getState().offer;
        const shown = offer
          ? [offer, ...(offer.more ?? [])].find((option) => option.id === interactableId)
          : undefined;
        if (shown?.disabled) {
          gameEvents.emit('sfx', { id: 'ui-error' });
          toast({
            title: `Can’t ${action.label.toLowerCase()} right now`,
            body: shown.disabled,
            tone: 'neutral',
          });
          return;
        }
        handler.current(action);
      }),
    [],
  );
}

function HotspotMarker({ tag, offered }: { readonly tag: HotspotTag; readonly offered: boolean }) {
  const ref = useCallback(
    (element: HTMLButtonElement | null) => {
      if (element) hotspotLabelElements.set(tag.id, element);
      else hotspotLabelElements.delete(tag.id);
    },
    [tag.id],
  );
  const more = tag.count > 1 ? ` +${tag.count - 1}` : '';
  return (
    <button
      ref={ref}
      type="button"
      data-hotspot={tag.id}
      aria-label={tag.count > 1 ? `${tag.label} and ${tag.count - 1} more here` : tag.label}
      onClick={() => {
        gameEvents.emit('sfx', { id: 'ui-click' });
        useHomeView.getState().pickHotspot(tag.id);
      }}
      // Hidden until the frame loop has placed it; it then owns visibility, opacity and transform.
      style={{ visibility: 'hidden' }}
      data-side="right"
      className="group pointer-events-auto absolute left-0 top-0 flex flex-col items-center will-change-transform"
    >
      <span
        className={cn(
          'grid size-10 place-items-center rounded-full border-2 text-xl leading-none shadow-[var(--shadow-glass)] transition-[transform,background-color,border-color] duration-200',
          offered ? 'scale-110 border-danfo bg-ink/85' : 'border-white/45 bg-ink/55',
        )}
      >
        <span aria-hidden>{tag.emoji}</span>
      </span>
      <span
        aria-hidden
        className={cn(
          '-mt-1 size-2.5 rotate-45 border-b-2 border-r-2',
          offered ? 'border-danfo bg-ink/85' : 'border-white/45 bg-ink/55',
        )}
      />
      {offered && (
        <span
          aria-hidden
          className="absolute top-1.5 whitespace-nowrap rounded-full bg-ink/85 px-2.5 py-1 text-xs font-bold text-on-ink shadow-[var(--shadow-glass)] group-data-[side=left]:right-full group-data-[side=left]:mr-1.5 group-data-[side=right]:left-full group-data-[side=right]:ml-1.5"
        >
          {tag.label}
          {more && <span className="text-danfo">{more}</span>}
        </span>
      )}
    </button>
  );
}

/** Floating markers over the room's hotspots (positioned by the frame loop). */
function HotspotMarkers() {
  const hotspots = useHomeView((state) => state.hotspots);
  const offerId = useHomeView((state) => state.offerId);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {hotspots.map((tag) => (
        <HotspotMarker key={tag.id} tag={tag} offered={tag.id === offerId} />
      ))}
    </div>
  );
}

/** Right edge, middle: where you are (and the rooms menu), and the camera switch. Clear of the HUD's corners. */
function HomeControls() {
  const camera = useHomeView((state) => state.camera);
  const rooms = useHomeView((state) => state.rooms);
  const roomId = useHomeView((state) => state.roomId);
  const busy = useHomeView((state) => state.busy);
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const current = rooms.find((room) => room.id === roomId);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent): void => {
      if (menu.current && event.target instanceof Node && !menu.current.contains(event.target))
        setOpen(false);
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const walk = camera === 'walk';
  return (
    <div className="pointer-events-none absolute right-[max(env(safe-area-inset-right),0.75rem)] top-1/2 z-10 flex -translate-y-1/2 flex-col items-end gap-2">
      {rooms.length > 1 && current && (
        <div ref={menu} className="relative">
          <button
            type="button"
            onClick={() => {
              gameEvents.emit('sfx', { id: 'ui-click' });
              setOpen((value) => !value);
            }}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label={`${current.label}, ${levelLabel(current.level)}. Rooms`}
            className="glass pointer-events-auto flex max-w-[9.5rem] items-center gap-2 rounded-card py-2 pl-2.5 pr-3 text-left text-on-ink"
          >
            <Layers size={18} aria-hidden className="shrink-0 text-danfo" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold leading-tight">{current.label}</span>
              <span className="block text-2xs text-on-ink-soft">{levelLabel(current.level)}</span>
            </span>
          </button>
          {open && (
            <div
              role="menu"
              aria-label="Go to a room"
              className="glass pointer-events-auto absolute right-full top-0 mr-2 w-52 rounded-card p-1.5 text-on-ink"
            >
              {rooms.map((room) => (
                <button
                  key={room.id}
                  type="button"
                  role="menuitem"
                  disabled={busy || room.id === roomId}
                  onClick={() => {
                    if (useHomeView.getState().travel(room.id)) gameEvents.emit('sfx', { id: 'door-open' });
                    setOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-chip px-2.5 py-2 text-left text-sm font-bold enabled:hover:bg-white/10 disabled:opacity-45',
                    room.id === roomId && 'bg-white/10',
                  )}
                >
                  <span className="truncate">{room.label}</span>
                  <span className="shrink-0 text-2xs font-normal text-on-ink-soft">
                    {levelLabel(room.level)}
                  </span>
                </button>
              ))}
              {busy && (
                <p className="px-2.5 pb-1 pt-1.5 text-2xs text-on-ink-soft">
                  Finish what you’re doing first.
                </p>
              )}
            </div>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={() => {
          gameEvents.emit('sfx', { id: 'ui-click' });
          useHomeView.getState().toggleCamera();
        }}
        aria-label={walk ? 'See the whole room' : 'Walk around'}
        title={walk ? 'See the whole room (C)' : 'Walk around (C)'}
        className="glass pointer-events-auto flex size-14 flex-col items-center justify-center gap-0.5 rounded-card text-on-ink"
      >
        {walk ? <Eye size={20} aria-hidden /> : <Footprints size={20} aria-hidden />}
        <span className="text-2xs font-bold">{walk ? 'Overview' : 'Walk'}</span>
      </button>
    </div>
  );
}

/** Keyboard players: a short reminder of the controls when they come in. */
function KeysHint() {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    const id = window.setTimeout(() => setShown(false), 7000);
    return () => window.clearTimeout(id);
  }, []);
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute bottom-28 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-ink/75 px-3 py-1.5 text-xs font-bold text-on-ink shadow-[var(--shadow-glass)] transition-opacity duration-500',
        shown ? 'opacity-100' : 'opacity-0',
      )}
    >
      WASD to walk · drag to look · click the floor to go there · C for overview
    </div>
  );
}
