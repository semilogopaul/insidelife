'use client';

import { ArrowLeftRight, Check, Coins, Hammer, Move, PackageOpen, Palette, RotateCw, ShoppingBag, Sofa, Undo2, Wand2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ONLINE_DELIVERY_FEE_RATE,
  aircraftRoomIssue,
  findAircraftDecorRoom,
  findDecorItem,
  findDecorVariant,
  findItem,
  formatNaira,
  furnitureDecorId,
  FURNITURE_FN_LABELS,
  FURNITURE_SPECS,
  homeChecklist,
  homeFurnishing,
  homeLocationId,
  isAircraftDecorTemplate,
  isDecorTemplate,
  isSmallPiece,
  type DecorItem,
  type DecorPieceDto,
  type DecorPlaceRequest,
  type DecorSpotDto,
  type DecorStateDto,
} from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { toast } from '@/common/components';
import { arrivalMessage, asRoomed, groupPieces, offerReplace, piecesInTemplate, unplacedForCabin, unplacedPieces, useAircraftDecor, useDecor, useDecorCommands, useDecorEdit } from '@/common/decor';
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
 * Can this player decorate the room on screen? Your own home (one of the home layouts; the family house and hostels take
 * small pieces only), or a cabin of an aircraft you own (the scene says which aircraft it is drawing:
 * `useDecorEdit.cabinId`).
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
/** The big buttons on a selected piece: icon over a word, a thumb wide. */
const bigBtn = 'pointer-events-auto flex min-h-16 flex-col items-center justify-center gap-1 rounded-card bg-white/10 px-1 text-xs font-bold enabled:hover:bg-white/15 disabled:opacity-40';

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

const spotRequest = (spot: DecorSpotDto): DecorPlaceRequest => ({ templateId: spot.templateId, roomId: spot.roomId, x: spot.x, z: spot.z, y: spot.y, rot: spot.rot, wall: spot.wall, onId: spot.onId });

/** What a piece is for, in a few words ("Your bed · sleeps 80%"). */
function jobOf(item: DecorItem, inUse: boolean | null): string | null {
  if (!item.fn) return null;
  const what = item.fn === 'sleep' ? `Bed · sleeps ${Math.round((item.quality ?? 0) * 100)}%` : item.fn === 'eat' ? 'Table to eat at' : item.fn === 'sit' ? 'Somewhere to sit' : item.fn === 'tv' ? 'TV' : item.fn === 'study' ? 'Desk' : 'Wardrobe';
  return inUse === null ? what : inUse ? `${what} · in use` : `${what} · spare`;
}

/**
 * Decorate mode's panel: where you are (the rooms, one tap each), what the home still needs, your things to pick from
 * and the furniture store, or the piece you selected with its big buttons — Move, Rotate, Colour, Store, Sell — and
 * Undo for the last change. The scene does the placing; this is the DOM half.
 */
export function DecorPanel() {
  const { available, state, templateId, roomId, roomLabel, aircraftId } = useDecorAccess();
  const active = useDecorEdit((s) => s.active);
  const holdingId = useDecorEdit((s) => s.holdingId);
  const selectedId = useDecorEdit((s) => s.selectedId);
  const tray = useDecorEdit((s) => s.tray);
  const undoable = useDecorEdit((s) => s.history.length > 0);
  const camera = useHomeView((s) => s.camera);
  const rooms = useHomeView((s) => s.rooms);
  const openPhone = useUi((s) => s.openPhone);
  const { putBack, recolour, sell, place, arrange } = useDecorCommands();
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

  const storeAway = (piece: DecorPieceDto): void => {
    const edit = useDecorEdit.getState();
    if (piece.spot) edit.remember({ pieceId: piece.id, was: spotRequest(piece.spot), ...(piece.aircraftId ? { aircraftId: piece.aircraftId } : {}) });
    putBack.mutate(piece.id);
    edit.select(null);
  };
  const undo = (): void => {
    const edit = useDecorEdit.getState();
    const entry = edit.popUndo();
    if (!entry) return;
    const done = { onError: (error: unknown) => toast({ title: 'Couldn’t undo that', body: errorMessage(error), tone: 'bad' as const }) };
    if (entry.was === null) putBack.mutate(entry.pieceId, done);
    else place.mutate({ pieceId: entry.pieceId, request: entry.was, ...(entry.aircraftId ? { aircraftId: entry.aircraftId } : {}) }, done);
    edit.select(entry.pieceId);
  };

  // Keys: R turns, M moves, Delete stores, Ctrl/Cmd+Z undoes, Escape steps back out.
  const keyed = useRef<{ storeAway: typeof storeAway; undo: typeof undo; pieces: readonly DecorPieceDto[] }>({ storeAway, undo, pieces: [] });
  useEffect(() => {
    keyed.current = { storeAway, undo, pieces: state?.pieces ?? [] };
  });
  useEffect(() => {
    if (!on) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.altKey || isTypingTarget(event.target) || useUi.getState().phoneOpen) return;
      const edit = useDecorEdit.getState();
      if ((event.metaKey || event.ctrlKey) && event.code === 'KeyZ') {
        keyed.current.undo();
      } else if (event.metaKey || event.ctrlKey) {
        return;
      } else if (event.code === 'KeyR') {
        if (edit.holdingId) edit.turnHeld(event.shiftKey ? -45 : 45);
        else if (edit.selectedId) edit.turnSelected(event.shiftKey ? -45 : 45);
      } else if (event.code === 'KeyM' && edit.selectedId) {
        edit.carry(edit.selectedId);
      } else if ((event.code === 'Delete' || event.code === 'Backspace') && edit.selectedId) {
        const piece = keyed.current.pieces.find((candidate) => candidate.id === edit.selectedId);
        if (piece) keyed.current.storeAway(piece);
      } else if (event.code === 'Escape') {
        if (edit.holdingId) edit.hold(null);
        else if (edit.selectedId) edit.select(null);
        else edit.exit();
      } else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [on]);

  const pieces = state?.pieces;
  const scope = state?.home.scope ?? 'full';
  const inventory = useMemo(() => {
    if (!pieces || !templateId) return [];
    if (!aircraftId) {
      // The family's furniture stays: only your small pieces can go in the family house or a hostel.
      const loose = unplacedPieces(pieces, templateId).filter((piece) => {
        const item = findDecorItem(piece.itemId);
        return scope === 'full' || (item !== undefined && isSmallPiece(item));
      });
      return groupPieces(loose);
    }
    // A cabin: only what its room may hold (secured for flight, a bed only in a suite…), the same rule the server applies.
    const room = findAircraftDecorRoom(templateId, roomId);
    const fits = (itemId: string): boolean => {
      const item = findDecorItem(itemId);
      return item !== undefined && room !== undefined && aircraftRoomIssue(roomId, room, item) === null;
    };
    return groupPieces(unplacedForCabin(pieces, aircraftId, roomId, fits));
  }, [pieces, templateId, roomId, aircraftId, scope]);
  const waiting = useMemo(() => (pieces && templateId && !aircraftId ? unplacedPieces(pieces, templateId).length - inventory.reduce((sum, group) => sum + group.pieces.length, 0) : 0), [pieces, templateId, aircraftId, inventory]);
  // What the home has and lacks, from the pieces as they stand right now.
  const checklist = useMemo(() => {
    if (!pieces || !templateId || aircraftId || scope === 'small') return [];
    return homeChecklist(homeFurnishing(templateId, asRoomed(piecesInTemplate(pieces, templateId))));
  }, [pieces, templateId, aircraftId, scope]);
  if (!on || !state) return null;

  const holding = holdingId ? state.pieces.find((piece) => piece.id === holdingId) : undefined;
  const selected = selectedId ? state.pieces.find((piece) => piece.id === selectedId) : undefined;
  const heldItem = holding ? findDecorItem(holding.itemId) : undefined;
  const selectedItem = selected ? findDecorItem(selected.itemId) : undefined;
  const missing = checklist.filter((entry) => !entry.ok && entry.essential);
  const furnishing = templateId && !aircraftId && scope === 'full' ? homeFurnishing(templateId, asRoomed(piecesInTemplate(state.pieces, templateId))) : null;
  const unassigned = inventory.reduce((sum, group) => sum + group.pieces.length, 0);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[6.5rem] z-10 flex justify-center px-3 pb-[env(safe-area-inset-bottom)]">
      <section aria-label="Decorate" className="glass pointer-events-auto flex max-h-[62dvh] w-full max-w-xl flex-col gap-2 overflow-y-auto rounded-card p-3 text-on-ink">
        <header className="flex items-center gap-2">
          <Sofa size={18} aria-hidden className="shrink-0 text-danfo" />
          <h2 className="min-w-0 flex-1 truncate text-sm font-bold">Decorate · {roomLabel}</h2>
          <button type="button" onClick={undo} disabled={!undoable} aria-label="Undo the last change" className={cn(btn, 'bg-white/10 disabled:opacity-40')}>
            <Undo2 size={16} aria-hidden /> Undo
          </button>
          <button type="button" onClick={() => useDecorEdit.getState().exit()} className={cn(btn, 'bg-danfo text-ink')}>
            <Check size={16} aria-hidden /> Done
          </button>
        </header>

        {rooms.length > 1 && (
          <nav aria-label="Rooms" className="-mx-1 flex gap-1.5 overflow-x-auto px-1">
            {rooms.map((room) => (
              <button
                key={room.id}
                type="button"
                aria-current={room.id === roomId ? 'page' : undefined}
                onClick={() => {
                  gameEvents.emit('sfx', { id: 'ui-click' });
                  useDecorEdit.getState().select(null);
                  useHomeView.getState().travel(room.id);
                }}
                className={cn('pointer-events-auto flex min-h-9 shrink-0 items-center gap-1 rounded-chip px-3 text-xs font-bold', room.id === roomId ? 'bg-danfo text-ink' : 'bg-white/10')}
              >
                {room.id === roomId ? null : <ArrowLeftRight size={12} aria-hidden />}
                {room.label}
              </button>
            ))}
          </nav>
        )}

        {missing.length > 0 && !selected && !holding && (
          <ul aria-label="What this home still needs" className="flex flex-wrap gap-1.5">
            {missing.map((entry) => (
              <li key={entry.fn} className="flex items-center gap-1 rounded-chip bg-okada/25 px-2.5 py-1 text-xs font-bold">
                <span aria-hidden>⚠</span> {entry.text}
                <span className="font-normal text-on-ink-soft"> · {FURNITURE_FN_LABELS[entry.fn]}</span>
              </li>
            ))}
          </ul>
        )}
        {scope === 'small' && !selected && !holding && (
          <p className="text-xs text-on-ink-soft">The family’s furniture stays where it is. Your own small things — plants, art, lamps — go wherever you like. Beds, sofas and tables wait for a place of your own.</p>
        )}

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
            inUse={selectedItem.fn && furnishing ? furnishing[selectedItem.fn]?.pieceId === selected.id : null}
            recolourPrice={state.recolourPrices[selectedItem.id] ?? 0}
            sellBack={state.sellBacks[selected.id] ?? 0}
            busy={recolour.isPending || sell.isPending}
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
            onStore={() => storeAway(selected)}
            onSell={() =>
              sell.mutate(selected.id, {
                onSuccess: (result) => {
                  useDecorEdit.getState().forgetPiece(selected.id);
                  useDecorEdit.getState().select(null);
                  toast({ title: 'Sold back', body: `${selectedItem.name} fetched ${formatNaira(result.amount)}.`, tone: 'good', amount: result.amount });
                },
                onError: (error) => toast({ title: 'Couldn’t sell it', body: errorMessage(error), tone: 'bad' }),
              })
            }
          />
        ) : (
          <div className="flex flex-col gap-2">
            <div role="tablist" aria-label="Things to put down" className="flex gap-1.5">
              {(
                [
                  ['mine', `Your things${unassigned > 0 ? ` (${unassigned})` : ''}`],
                  ['furniture', 'Furniture store'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tray === id}
                  onClick={() => useDecorEdit.getState().showTray(id)}
                  className={cn(btn, 'min-h-9 flex-1', tray === id ? 'bg-white/20' : 'bg-white/5')}
                >
                  {id === 'furniture' ? <ShoppingBag size={14} aria-hidden /> : <PackageOpen size={14} aria-hidden />} {label}
                </button>
              ))}
            </div>
            {tray === 'furniture' && !aircraftId ? (
              <FurnitureShelf state={state} roomId={roomId} templateId={templateId} locked={scope === 'small'} />
            ) : inventory.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs text-on-ink-soft">Pick something, then tap or drag it into the room. Tap anything placed to move, turn, re-finish, store or sell it.</p>
                <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                  {inventory.map((group) => (
                    <li key={group.key} className="shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          gameEvents.emit('sfx', { id: 'ui-click' });
                          useDecorEdit.getState().hold(group.pieces[0]!.id);
                        }}
                        className="flex min-h-14 w-40 items-center gap-2 rounded-chip bg-white/10 p-2 text-left enabled:hover:bg-white/15"
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
                {!aircraftId && scope === 'full' && (
                  <button
                    type="button"
                    disabled={arrange.isPending}
                    onClick={() =>
                      arrange.mutate(roomId, {
                        onSuccess: (result) => toast({ title: 'Arranged', body: result.left > 0 ? `${result.left} didn’t fit and stay in storage.` : 'Everything is in its place.', tone: 'good' }),
                        onError: (error) => toast({ title: 'Couldn’t arrange', body: errorMessage(error), tone: 'bad' }),
                      })
                    }
                    className={cn(btn, 'bg-danfo text-ink disabled:opacity-50')}
                  >
                    <Wand2 size={16} aria-hidden /> Arrange everything for me
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <PackageOpen size={20} aria-hidden className="shrink-0 text-danfo" />
                <p className="min-w-0 flex-1 text-sm">
                  {aircraftId ? 'Nothing cabin-ready to fit yet. ' : waiting > 0 ? 'Your bigger pieces are waiting for a place of your own. ' : 'Nothing in storage. '}
                  <span className="text-on-ink-soft">
                    {aircraftId ? 'The Decor store’s Cabin & aviation shelf is made for aircraft: rugs, throws, a minibar, art.' : 'Beds, sofas and TVs are in the Furniture store; rugs, plants, art and lamps in the Decor store.'}
                  </span>
                </p>
                {!aircraftId && (
                  <button type="button" onClick={() => useDecorEdit.getState().showTray('furniture')} className={cn(btn, 'bg-danfo text-ink')}>
                    <ShoppingBag size={16} aria-hidden /> Furniture
                  </button>
                )}
                <button type="button" onClick={() => openPhone('homes', 'decor')} className={cn(btn, 'bg-white/10')}>
                  <Hammer size={16} aria-hidden /> Decor
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function SelectedPiece({
  piece,
  item,
  inUse,
  recolourPrice,
  sellBack,
  busy,
  onRecolour,
  onStore,
  onSell,
}: {
  readonly piece: DecorPieceDto;
  readonly item: DecorItem;
  readonly inUse: boolean | null;
  readonly recolourPrice: number;
  readonly sellBack: number;
  readonly busy: boolean;
  readonly onRecolour: (variant: string, done: () => void) => void;
  readonly onStore: () => void;
  readonly onSell: () => void;
}) {
  const [panel, setPanel] = useState<'colour' | 'sell' | null>(null);
  const [pendingVariant, onPick] = useState<string | null>(null);
  const current = findDecorVariant(item, piece.variant) ?? item.variants[0]!;
  const pending = pendingVariant && pendingVariant !== piece.variant ? findDecorVariant(item, pendingVariant) : undefined;
  const job = jobOf(item, inUse);
  const refinishable = item.variants.length > 1;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">
        <strong>{item.name}</strong>
        <span className="block text-xs text-on-ink-soft">
          {current.label}
          {job ? ` · ${job}` : ''} · drag it, or tap Move
        </span>
      </p>
      <div className="grid grid-cols-5 gap-1.5">
        <button type="button" onClick={() => useDecorEdit.getState().carry(piece.id)} className={bigBtn}>
          <Move size={20} aria-hidden /> Move
        </button>
        <button type="button" disabled={item.placement === 'wall'} onClick={() => useDecorEdit.getState().turnSelected(45)} className={bigBtn}>
          <RotateCw size={20} aria-hidden /> Rotate
        </button>
        <button type="button" disabled={!refinishable} aria-pressed={panel === 'colour'} onClick={() => setPanel(panel === 'colour' ? null : 'colour')} className={cn(bigBtn, panel === 'colour' && 'ring-2 ring-danfo')}>
          <Palette size={20} aria-hidden /> Colour
        </button>
        <button type="button" onClick={onStore} className={bigBtn}>
          <PackageOpen size={20} aria-hidden /> Store
        </button>
        <button type="button" aria-pressed={panel === 'sell'} onClick={() => setPanel(panel === 'sell' ? null : 'sell')} className={cn(bigBtn, panel === 'sell' && 'ring-2 ring-danfo')}>
          <Coins size={20} aria-hidden /> Sell
        </button>
      </div>
      {panel === 'colour' && (
        <div className="flex flex-wrap items-center gap-2">
          <ul className="flex flex-wrap gap-1.5">
            {item.variants.map((variant) => (
              <li key={variant.id}>
                <button
                  type="button"
                  aria-label={`${variant.label}${variant.id === piece.variant ? ' (current)' : ''}`}
                  aria-pressed={variant.id === (pending?.id ?? piece.variant)}
                  onClick={() => onPick(variant.id === piece.variant ? null : variant.id)}
                  className={cn('size-10 rounded-full border-2', variant.id === (pending?.id ?? piece.variant) ? 'border-danfo' : 'border-white/40')}
                  style={{ background: variant.hex, boxShadow: `inset 0 0 0 4px ${variant.accent}` }}
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
      )}
      {panel === 'sell' && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 text-sm">
            Sell the {item.name.toLowerCase()} back for <strong>{formatNaira(sellBack)}</strong>?
          </p>
          <button type="button" disabled={busy} onClick={onSell} className={cn(btn, 'bg-danfo text-ink disabled:opacity-50')}>
            <Coins size={16} aria-hidden /> Sell it
          </button>
          <button type="button" onClick={() => setPanel(null)} className={cn(btn, 'bg-white/10')}>
            Keep it
          </button>
        </div>
      )}
    </div>
  );
}

/** Group heading by what the furniture is for. */
const SHELVES: ReadonlyArray<{ readonly title: string; readonly ids: readonly string[] }> = [
  { title: 'Beds', ids: ['bed-foam-mattress', 'bed-spring', 'bed-orthopedic', 'bed-super-king'] },
  { title: 'Sofas & chairs', ids: ['chairs-plastic', 'sofa-fabric', 'sofa-leather', 'sofa-italian'] },
  { title: 'Eating, studying & clothes', ids: ['dining-set', 'desk-study', 'wardrobe-wooden'] },
  { title: 'TVs', ids: ['tv-32', 'tv-55', 'tv-75'] },
  { title: 'Rugs & plants', ids: ['rug-persian', 'plants-snake'] },
];

/**
 * The furniture store in the Decorate tray: buy and the piece lands in this room at a free spot (or in storage when
 * there is no room), visible at once. Ordering from home carries the shop's delivery fee.
 */
function FurnitureShelf({ state, roomId, templateId, locked }: { readonly state: DecorStateDto; readonly roomId: string; readonly templateId: string | null; readonly locked: boolean }) {
  const { buyFurniture } = useDecorCommands();
  const owned = useMemo(() => {
    const counts = new Map<string, number>();
    for (const piece of state.pieces) counts.set(piece.itemId, (counts.get(piece.itemId) ?? 0) + 1);
    return counts;
  }, [state.pieces]);
  return (
    <div className="flex flex-col gap-2">
      {locked && <p className="text-xs text-on-ink-soft">Beds, sofas and tables you buy here wait in storage until you have a place of your own.</p>}
      <div className="flex max-h-[34dvh] flex-col gap-2 overflow-y-auto pr-1">
        {SHELVES.map((shelf) => (
          <section key={shelf.title} aria-label={shelf.title} className="flex flex-col gap-1">
            <h3 className="text-2xs font-bold uppercase tracking-wide text-on-ink-soft">{shelf.title}</h3>
            <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {shelf.ids.map((shopId) => {
                const item = findDecorItem(furnitureDecorId(shopId));
                const product = findItem(shopId);
                const spec = FURNITURE_SPECS.find((entry) => entry.shopItemId === shopId);
                if (!item || !product || !spec) return null;
                const price = state.prices[item.id] ?? item.price;
                const haveAll = (owned.get(item.id) ?? 0) >= product.maxQuantity;
                const delivery = Math.round((price * ONLINE_DELIVERY_FEE_RATE) / 50) * 50;
                return (
                  <li key={shopId} className="flex items-center gap-2 rounded-chip bg-white/10 p-2">
                    <span aria-hidden className="text-xl">
                      {product.emoji}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-bold">{product.name}</span>
                      <span className="block truncate text-2xs text-on-ink-soft">
                        {formatNaira(price)}
                        {item.fn === 'sleep' ? ` · sleeps ${Math.round((item.quality ?? 0) * 100)}%` : ''}
                        {delivery > 0 ? ` · +${formatNaira(delivery)} delivery` : ''}
                      </span>
                    </span>
                    <button
                      type="button"
                      disabled={haveAll || buyFurniture.isPending}
                      onClick={() =>
                        buyFurniture.mutate(
                          { itemId: shopId, roomId: templateId ? roomId : undefined },
                          {
                            onSuccess: (result) => {
                              gameEvents.emit('sfx', { id: 'cash-out' });
                              toast({ title: 'Bought!', body: arrivalMessage(result.furniture, product.name), tone: 'good', amount: -result.order.total });
                              const piece = result.furniture?.pieces[0];
                              if (piece?.spot) useDecorEdit.getState().select(piece.id);
                              offerReplace(result.furniture);
                            },
                            onError: (error) => toast({ title: 'Purchase didn’t go through', body: errorMessage(error), tone: 'bad' }),
                          },
                        )
                      }
                      className={cn(btn, 'min-h-9 shrink-0 bg-danfo text-ink disabled:opacity-40')}
                    >
                      {haveAll ? 'Have it' : 'Buy'}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
