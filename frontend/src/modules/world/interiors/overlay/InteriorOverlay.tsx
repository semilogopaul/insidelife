'use client';

import { ArrowDownRight, ArrowUpRight, DoorOpen, Eye, Footprints, Layers } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from '@/common/components';
import { gameEvents } from '@/common/game/game-events';
import { useUi } from '@/common/game/ui-store';
import { useTouchUi } from '@/common/hooks/use-touch-ui';
import { cn } from '@/common/utils/cn';
import { isTypingTarget } from '../../play/input/controls';
import { PointerLayer } from '../../play/overlay/PointerLayer';
import { levelLabel } from '../layouts/geometry';
import { HotspotCardPanel } from './HotspotCardPanel';
import { useHotspotDo, type HotspotHandlers } from './use-hotspot-do';
import {
  CONTROLS_COLUMN,
  hotspotLabelElements,
  portalLabelElements,
  useHomeView,
  type HotspotTag,
  type PortalTag,
} from '../walk/home-view-store';

/** Room kept clear at the bottom of a phone for the venue sheet ("Things to do here") and the phone button row. */
const SHEET_RESERVE_PX = 104;

/** How hotspot choices are carried out (defaults: the server and your phone apps; previews pass their own). */
export type InteriorOverlayProps = HotspotHandlers;

/**
 * The DOM half of walking around a home or venue, layered over the canvas (and under the HUD): the touch stick and
 * look pad (walk camera; things under the mouse get a pointer), door/stairs labels, the hotspot markers, a thing's
 * card (tap it in 3D, tap its marker, or Enter at it), the camera switch (walk ↔ overview), the rooms menu for bigger
 * homes and the dip to dark between rooms. Does what's chosen at a hotspot. Renders nothing outside a walkable place.
 */
export function InteriorOverlay({ onStartAction, onOpenService }: InteriorOverlayProps = {}) {
  const house = useHomeView((state) => state.house);
  const camera = useHomeView((state) => state.camera);
  const fading = useHomeView((state) => state.fading);
  const hover = useHomeView((state) => state.hover);
  const phoneOpen = useUi((state) => state.phoneOpen);
  // Clean screen: markers, the camera/rooms controls and key hints go with the HUD (tapping a thing still works).
  const hudHidden = useUi((state) => state.settings.hudHidden);
  const touchUi = useTouchUi();
  const run = useHotspotDo({ onStartAction, onOpenService });
  useHotspotKeys();
  useGoalArrival();
  if (!house) return null;
  return (
    <>
      {camera === 'walk' && (
        <div className="absolute inset-0" style={hover ? { cursor: 'pointer' } : undefined}>
          <PointerLayer
            walking
            touchUi={touchUi}
            reserveBottom={touchUi ? SHEET_RESERVE_PX : 0}
            hintClassName="border-white/50 bg-ink/55"
          />
        </div>
      )}
      <PortalLabels />
      {!phoneOpen && !hudHidden && <HotspotMarkers />}
      {!phoneOpen && !hudHidden && <HomeControls />}
      {!phoneOpen && <HotspotCardPanel run={run} />}
      {camera === 'walk' && !touchUi && !hudHidden && <KeysHint key={house} />}
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

function HotspotMarker({
  tag,
  offered,
  hovered,
}: {
  readonly tag: HotspotTag;
  readonly offered: boolean;
  readonly hovered: boolean;
}) {
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
      aria-label={`${tag.name}: ${tag.count > 1 ? `${tag.label} and ${tag.count - 1} more` : tag.label}${tag.goal ? ` (for your goal: ${tag.goal})` : ''}`}
      onClick={() => {
        gameEvents.emit('sfx', { id: 'ui-click' });
        useHomeView.getState().select(tag.id);
      }}
      onFocus={() => useHomeView.getState().setHover(tag.id)}
      onBlur={() => {
        if (useHomeView.getState().hover === tag.id) useHomeView.getState().setHover(null);
      }}
      // Hidden until the frame loop has placed it; it then owns visibility, opacity and transform.
      style={{ visibility: 'hidden' }}
      data-side="right"
      className="group pointer-events-auto absolute left-0 top-0 flex flex-col items-center will-change-transform"
    >
      <span
        className={cn(
          'grid size-10 place-items-center rounded-full border-2 text-xl leading-none shadow-[var(--shadow-glass)] transition-[transform,background-color,border-color] duration-200',
          offered || tag.goal ? 'border-danfo bg-ink/85' : 'border-white/45 bg-ink/55',
          offered && 'scale-110',
          tag.goal && 'ring-4 ring-danfo/40',
        )}
      >
        <span aria-hidden>{tag.emoji}</span>
      </span>
      {tag.goal && (
        <span
          aria-hidden
          className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-danfo text-2xs"
        >
          🎯
        </span>
      )}
      <span
        aria-hidden
        className={cn(
          '-mt-1 size-2.5 rotate-45 border-b-2 border-r-2',
          offered ? 'border-danfo bg-ink/85' : 'border-white/45 bg-ink/55',
        )}
      />
      {(offered || hovered || tag.goal) && (
        <span
          aria-hidden
          className="absolute top-1.5 whitespace-nowrap rounded-full bg-ink/85 px-2.5 py-1 text-xs font-bold text-on-ink shadow-[var(--shadow-glass)] group-data-[side=left]:right-full group-data-[side=left]:mr-1.5 group-data-[side=right]:left-full group-data-[side=right]:ml-1.5"
        >
          {tag.goal && !offered && !hovered ? (
            <span className="text-danfo">For your goal</span>
          ) : (
            <>
              {tag.name}
              <span className="font-normal text-on-ink-soft"> · {tag.label}</span>
              {more && <span className="text-danfo">{more}</span>}
            </>
          )}
        </span>
      )}
    </button>
  );
}

/** Floating markers over the room's hotspots (positioned by the frame loop). */
function HotspotMarkers() {
  const hotspots = useHomeView((state) => state.hotspots);
  const offerId = useHomeView((state) => state.offerId);
  const hover = useHomeView((state) => state.hover);
  const selected = useHomeView((state) => state.selected);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {hotspots.map((tag) => (
        <HotspotMarker
          key={tag.id}
          tag={tag}
          offered={tag.id === offerId}
          hovered={tag.id === hover || tag.id === selected}
        />
      ))}
    </div>
  );
}

/** Enter at a thing opens its card (E does its first thing, through the HUD context button). */
function useHotspotKeys(): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Enter' || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target) || useUi.getState().phoneOpen) return;
      if (event.target instanceof HTMLElement && event.target.closest('button, a, [role="button"]')) return;
      const { offerId, selected, select } = useHomeView.getState();
      if (!offerId || selected) return;
      event.preventDefault();
      gameEvents.emit('sfx', { id: 'ui-click' });
      select(offerId);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** Goals already announced this session (`<place>|<goal>`), so coming and going doesn't repeat it. */
const announcedGoals = new Set<string>();

/** Arriving where a life goal sent you: say what to do for it and where (its hotspot is highlighted too). */
function useGoalArrival(): void {
  const house = useHomeView((state) => state.house);
  const goalCard = useHomeView((state) => state.hotspots.find((hotspot) => hotspot.goal !== null) ?? null);
  useEffect(() => {
    if (!house || !goalCard?.goal) return;
    const key = `${house}|${goalCard.goal}`;
    if (announcedGoals.has(key)) return;
    announcedGoals.add(key);
    const entry = goalCard.entries.find((candidate) => candidate.goal) ?? goalCard.entries[0];
    toast({
      title: `For your goal: ${goalCard.goal}`,
      body: `${entry?.emoji ?? ''} ${entry?.label ?? ''} — at the ${goalCard.name.toLowerCase()}. Tap it or walk up to it.`,
      tone: 'neutral',
    });
  }, [house, goalCard]);
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
    <div
      className="pointer-events-none absolute right-[max(env(safe-area-inset-right),0.75rem)] top-1/2 z-10 flex -translate-y-1/2 flex-col items-end gap-2"
      style={{ maxWidth: CONTROLS_COLUMN.width }}
    >
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
              // Centred on the button and scrolling when long: it never reaches down over Step outside and Talk.
              className="pointer-events-auto absolute right-full top-1/2 mr-2 max-h-[min(22rem,calc(100dvh-16rem))] w-52 -translate-y-1/2 overflow-y-auto overscroll-contain rounded-card bg-ink/95 p-1.5 text-on-ink shadow-[var(--shadow-glass)] ring-1 ring-white/10"
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
