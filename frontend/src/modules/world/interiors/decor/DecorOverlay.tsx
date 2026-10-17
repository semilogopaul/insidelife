'use client';

import { Check, PackageOpen, RotateCcw, RotateCw, ShoppingBag, Sofa, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  aircraftRoomIssue,
  findAircraftDecorRoom,
  findDecorItem,
  findDecorVariant,
  formatNaira,
  homeLocationId,
  isAircraftDecorTemplate,
  isDecorTemplate,
  type DecorItem,
  type DecorPieceDto,
} from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { toast } from '@/common/components';
import { groupPieces, unplacedForCabin, unplacedPieces, useAircraftDecor, useDecor, useDecorCommands, useDecorEdit } from '@/common/decor';
import { gameEvents } from '@/common/game/game-events';
import { useSnapshot } from '@/common/game/snapshot';
import { useUi } from '@/common/game/ui-store';
import { cn } from '@/common/utils/cn';
import { isTypingTarget } from '../../play/input/controls';
import { useHomeView } from '../walk/home-view-store';

const PLACE_HINT: Readonly<Record<DecorItem['placement'], string>> = {
  floor: 'Tap or drag onto the floor',
  wall: 'Tap or drag onto a wall',
  tabletop: 'Tap or drag onto a table, bed or shelf',
};

/**
 * Can this player decorate the room on screen? Your own rented or owned home (one of the decorable layouts), or a cabin
 * of an aircraft you own (the scene says which aircraft it is drawing: `useDecorEdit.cabinId`).
 */
export function useDecorAccess() {
  const house = useHomeView((state) => state.house);
  const layout = useHomeView((state) => state.layout);
  const roomId = useHomeView((state) => state.roomId);
  const cabinId = useDecorEdit((state) => state.cabinId);
  const snapshot = useSnapshot().data;
  const own = snapshot !== undefined && house !== null && house.startsWith(`${homeLocationId(snapshot.character.id)}|`);
  const decorates = layout !== null && isDecorTemplate(layout.id);
  const inCabin = layout !== null && cabinId !== null && isAircraftDecorTemplate(layout.id);
  const plane = useAircraftDecor(inCabin ? cabinId : null);
  const ownsPlane = inCabin && plane.data !== undefined && plane.data.ownerId === snapshot?.character.id;
  const state = useDecor((own && decorates) || ownsPlane);
  const available = inCabin ? ownsPlane : own && decorates && state.data?.home.eligible === true;
  const roomLabel = layout?.rooms.find((room) => room.id === roomId)?.label ?? '';
  return { available, state: state.data, templateId: layout?.id ?? null, roomId: roomId ?? '', roomLabel, aircraftId: inCabin ? cabinId : null };
}

const btn = 'pointer-events-auto flex min-h-11 items-center justify-center gap-1.5 rounded-chip px-3 text-sm font-bold';

/** The "Decorate" button in the room's control column. */
export function DecorateButton() {
  const { available } = useDecorAccess();
  const active = useDecorEdit((state) => state.active);
  if (!available) return null;
  return (
    <button
      type="button"
      onClick={() => {
        gameEvents.emit('sfx', { id: 'ui-click' });
        const edit = useDecorEdit.getState();
        if (edit.active) edit.exit();
        else edit.enter();
      }}
      aria-pressed={active}
      aria-label={active ? 'Finish decorating' : 'Decorate this room'}
      title="Decorate this room"
      className={cn('glass pointer-events-auto flex size-14 flex-col items-center justify-center gap-0.5 rounded-card text-on-ink', active && 'ring-2 ring-danfo')}
    >
      <Sofa size={20} aria-hidden />
      <span className="text-2xs font-bold">Decorate</span>
    </button>
  );
}

/**
 * Decorate mode's panel: your decor inventory to pick from, what you're putting down, or the piece you selected
 * (turn it, re-finish it, put it back). The scene does the placing; this is the DOM half.
 */
export function DecorPanel() {
  const { available, state, templateId, roomId, roomLabel, aircraftId } = useDecorAccess();
  const active = useDecorEdit((s) => s.active);
  const holdingId = useDecorEdit((s) => s.holdingId);
  const selectedId = useDecorEdit((s) => s.selectedId);
  const camera = useHomeView((s) => s.camera);
  const openPhone = useUi((s) => s.openPhone);
  const { putBack, recolour } = useDecorCommands();
  const previousCamera = useRef<'walk' | 'overview' | null>(null);

  const on = active && available;

  // The dollhouse view is where you decorate; put the walk camera back after.
  useEffect(() => {
    if (on && camera === 'walk') {
      previousCamera.current ??= 'walk';
      useHomeView.getState().setCamera('overview');
    }
  }, [on, camera]);
  useEffect(() => {
    if (!on && previousCamera.current) {
      useHomeView.getState().setCamera(previousCamera.current);
      previousCamera.current = null;
    }
  }, [on]);
  useEffect(() => () => useDecorEdit.getState().exit(), []);

  // Keys: R turns, Delete puts back, Escape steps back out.
  useEffect(() => {
    if (!on) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target) || useUi.getState().phoneOpen) return;
      const edit = useDecorEdit.getState();
      if (event.code === 'KeyR') {
        if (edit.holdingId) edit.turnHeld(event.shiftKey ? -45 : 45);
        else if (edit.selectedId) edit.turnSelected(event.shiftKey ? -45 : 45);
      } else if ((event.code === 'Delete' || event.code === 'Backspace') && edit.selectedId) {
        putBack.mutate(edit.selectedId);
        edit.select(null);
      } else if (event.code === 'Escape') {
        if (edit.holdingId) edit.hold(null);
        else if (edit.selectedId) edit.select(null);
        else edit.exit();
      } else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [on, putBack]);

  const pieces = state?.pieces;
  const inventory = useMemo(() => {
    if (!pieces || !templateId) return [];
    if (!aircraftId) return groupPieces(unplacedPieces(pieces, templateId));
    // A cabin: only what its room may hold (secured for flight, a bed only in a suite…), the same rule the server applies.
    const room = findAircraftDecorRoom(templateId, roomId);
    const fits = (itemId: string): boolean => {
      const item = findDecorItem(itemId);
      return item !== undefined && room !== undefined && aircraftRoomIssue(roomId, room, item) === null;
    };
    return groupPieces(unplacedForCabin(pieces, aircraftId, roomId, fits));
  }, [pieces, templateId, roomId, aircraftId]);
  if (!on || !state) return null;

  const holding = holdingId ? state.pieces.find((piece) => piece.id === holdingId) : undefined;
  const selected = selectedId ? state.pieces.find((piece) => piece.id === selectedId) : undefined;
  const heldItem = holding ? findDecorItem(holding.itemId) : undefined;
  const selectedItem = selected ? findDecorItem(selected.itemId) : undefined;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[6.5rem] z-10 flex justify-center px-3 pb-[env(safe-area-inset-bottom)]">
      <section
        aria-label="Decorate"
        className="glass pointer-events-auto flex w-full max-w-xl flex-col gap-2 rounded-card p-3 text-on-ink"
      >
        <header className="flex items-center gap-2">
          <Sofa size={18} aria-hidden className="shrink-0 text-danfo" />
          <h2 className="min-w-0 flex-1 truncate text-sm font-bold">Decorate · {roomLabel}</h2>
          <button type="button" onClick={() => useDecorEdit.getState().exit()} className={cn(btn, 'bg-danfo text-ink')}>
            <Check size={16} aria-hidden /> Done
          </button>
        </header>

        {heldItem && holding ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 text-sm">
              <strong>{heldItem.name}</strong>
              <span className="block text-xs text-on-ink-soft">{PLACE_HINT[heldItem.placement]}. Green fits, red doesn’t.</span>
            </p>
            {heldItem.placement !== 'wall' && (
              <button type="button" aria-label="Turn it" onClick={() => useDecorEdit.getState().turnHeld(45)} className={cn(btn, 'bg-white/10')}>
                <RotateCw size={16} aria-hidden /> Turn
              </button>
            )}
            <button type="button" onClick={() => useDecorEdit.getState().hold(null)} className={cn(btn, 'bg-white/10')}>
              <X size={16} aria-hidden /> Cancel
            </button>
          </div>
        ) : selected && selectedItem ? (
          <SelectedPiece
            key={selected.id}
            piece={selected}
            item={selectedItem}
            recolourPrice={state.recolourPrices[selectedItem.id] ?? 0}
            busy={recolour.isPending}
            onRecolour={(variant, done) =>
              recolour.mutate(
                { pieceId: selected.id, variant },
                {
                  onSuccess: () => {
                    done();
                    toast({ title: 'Looks different now', tone: 'good' });
                  },
                  onError: (error) => toast({ title: 'Couldn’t re-finish it', body: errorMessage(error), tone: 'bad' }),
                },
              )
            }
            onPutBack={() => {
              putBack.mutate(selected.id);
              useDecorEdit.getState().select(null);
            }}
          />
        ) : inventory.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-on-ink-soft">Pick something, then tap or drag it into the room. Tap anything placed to move it.</p>
            <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {inventory.map((group) => (
                <li key={group.key} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      gameEvents.emit('sfx', { id: 'ui-click' });
                      useDecorEdit.getState().hold(group.pieces[0]!.id);
                    }}
                    className="flex min-h-14 w-36 items-center gap-2 rounded-chip bg-white/10 p-2 text-left enabled:hover:bg-white/15"
                  >
                    <span aria-hidden className="size-6 shrink-0 rounded-full border-2 border-white/60" style={{ background: group.variant.hex, boxShadow: `inset 0 0 0 3px ${group.variant.accent}` }} />
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-bold">{group.item.name}</span>
                      <span className="block truncate text-2xs text-on-ink-soft">
                        {group.variant.label}
                        {group.pieces.length > 1 ? ` · ×${group.pieces.length}` : ''}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <PackageOpen size={20} aria-hidden className="shrink-0 text-danfo" />
            <p className="min-w-0 flex-1 text-sm">
              {aircraftId ? 'Nothing cabin-ready to fit yet. ' : 'Nothing to put down yet. '}
              <span className="text-on-ink-soft">
                {aircraftId ? 'The Decor store’s Cabin & aviation shelf is made for aircraft: rugs, throws, a minibar, art.' : 'Rugs, plants, art and lamps are in the Decor store.'}
              </span>
            </p>
            <button type="button" onClick={() => openPhone('homes', 'decor')} className={cn(btn, 'bg-danfo text-ink')}>
              <ShoppingBag size={16} aria-hidden /> Shop
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function SelectedPiece({
  piece,
  item,
  recolourPrice,
  busy,
  onRecolour,
  onPutBack,
}: {
  readonly piece: DecorPieceDto;
  readonly item: DecorItem;
  readonly recolourPrice: number;
  readonly busy: boolean;
  readonly onRecolour: (variant: string, done: () => void) => void;
  readonly onPutBack: () => void;
}) {
  const [pendingVariant, onPick] = useState<string | null>(null);
  const current = findDecorVariant(item, piece.variant) ?? item.variants[0]!;
  const pending = pendingVariant && pendingVariant !== piece.variant ? findDecorVariant(item, pendingVariant) : undefined;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-sm">
          <strong>{item.name}</strong>
          <span className="block text-xs text-on-ink-soft">{current.label} · drag it to move it</span>
        </p>
        {item.placement !== 'wall' && (
          <>
            <button type="button" aria-label="Turn left" onClick={() => useDecorEdit.getState().turnSelected(-45)} className={cn(btn, 'bg-white/10')}>
              <RotateCcw size={16} aria-hidden />
            </button>
            <button type="button" aria-label="Turn right" onClick={() => useDecorEdit.getState().turnSelected(45)} className={cn(btn, 'bg-white/10')}>
              <RotateCw size={16} aria-hidden />
            </button>
          </>
        )}
        <button type="button" onClick={onPutBack} className={cn(btn, 'bg-white/10')}>
          <PackageOpen size={16} aria-hidden /> Put back
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-on-ink-soft">Finish</span>
        <ul className="flex flex-wrap gap-1.5">
          {item.variants.map((variant) => (
            <li key={variant.id}>
              <button
                type="button"
                aria-label={`${variant.label}${variant.id === piece.variant ? ' (current)' : ''}`}
                aria-pressed={variant.id === (pending?.id ?? piece.variant)}
                onClick={() => onPick(variant.id === piece.variant ? null : variant.id)}
                className={cn('size-8 rounded-full border-2', variant.id === (pending?.id ?? piece.variant) ? 'border-danfo' : 'border-white/40')}
                style={{ background: variant.hex, boxShadow: `inset 0 0 0 3px ${variant.accent}` }}
              />
            </li>
          ))}
        </ul>
        {pending && (
          <button type="button" disabled={busy} onClick={() => onRecolour(pending.id, () => onPick(null))} className={cn(btn, 'bg-danfo text-ink disabled:opacity-50')}>
            {pending.label} · {formatNaira(recolourPrice)}
          </button>
        )}
      </div>
    </div>
  );
}
