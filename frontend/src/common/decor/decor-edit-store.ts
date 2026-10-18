'use client';

import { create } from 'zustand';
import type { DecorPlaceRequest } from '@insidelife/shared';

/**
 * Decorate mode, as the 3D room and its DOM overlay share it. Client-only view state: which piece is in hand
 * (a piece waiting for a spot — new from the inventory, or one you chose to move) or selected (a placed piece with
 * its big buttons: Move, Rotate, Colour, Store, Sell), the last changes you can undo, and which room is on screen.
 * Never written per frame: the drag itself lives in the scene.
 */

/** One change that can be taken back: where a piece was (a spot to put it back at, or null: it was in storage). */
export interface UndoEntry {
  readonly pieceId: string;
  readonly was: DecorPlaceRequest | null;
  /** Aircraft cabins place through the aircraft's endpoint. */
  readonly aircraftId?: string;
}

/** Most changes kept for undo. */
export const UNDO_DEPTH = 20;

/** Which tray the Decorate panel shows when nothing is selected. */
export type DecorTray = 'mine' | 'furniture';

interface DecorEditState {
  readonly active: boolean;
  /** A piece in hand: the next tap on the floor, a wall or a surface puts it down. */
  readonly holdingId: string | null;
  /** Rotation (degrees) the held piece will be put down with. */
  readonly holdingRot: number;
  /** A placed piece selected for moving, turning, re-colouring, storing or selling. */
  readonly selectedId: string | null;
  /** A placed piece being dragged (or carried in hand) right now (drawn as the ghost instead). */
  readonly draggingId: string | null;
  /** The overlay asks the scene to turn the selected piece (the scene knows what fits). */
  readonly turnRequest: { readonly seq: number; readonly delta: number } | null;
  readonly trayOpen: boolean;
  readonly tray: DecorTray;
  /** The aircraft whose cabin is on screen (set by the 3D scene while one is), or null: homes and venues. */
  readonly cabinId: string | null;
  /** The room of your home on screen (set by the 3D scene): where bought furniture is put straight away. */
  readonly homeRoom: { readonly templateId: string; readonly roomId: string } | null;
  readonly history: readonly UndoEntry[];
  setCabin(aircraftId: string | null): void;
  setHomeRoom(room: { readonly templateId: string; readonly roomId: string } | null): void;
  enter(): void;
  exit(): void;
  hold(pieceId: string | null): void;
  /** Pick a placed piece up to move it: it stays where it is until you put it down. */
  carry(pieceId: string): void;
  turnHeld(delta: number): void;
  select(pieceId: string | null): void;
  setDragging(pieceId: string | null): void;
  turnSelected(delta: number): void;
  setTray(open: boolean): void;
  showTray(tray: DecorTray): void;
  remember(entry: UndoEntry): void;
  /** Take the last change back: returns it (the caller puts the piece there), or null when there is nothing to undo. */
  popUndo(): UndoEntry | null;
  forgetPiece(pieceId: string): void;
}

export const useDecorEdit = create<DecorEditState>()((set, get) => ({
  active: false,
  holdingId: null,
  holdingRot: 0,
  selectedId: null,
  draggingId: null,
  turnRequest: null,
  trayOpen: true,
  tray: 'mine',
  cabinId: null,
  homeRoom: null,
  history: [],
  setCabin: (aircraftId) => set({ cabinId: aircraftId }),
  setHomeRoom: (room) => {
    const current = get().homeRoom;
    if (current?.templateId === room?.templateId && current?.roomId === room?.roomId) return;
    set({ homeRoom: room });
  },
  enter: () => set({ active: true, holdingId: null, holdingRot: 0, selectedId: null, draggingId: null, trayOpen: true, tray: 'mine', history: [] }),
  exit: () => set({ active: false, holdingId: null, holdingRot: 0, selectedId: null, draggingId: null, history: [] }),
  hold: (pieceId) => set({ holdingId: pieceId, holdingRot: 0, selectedId: null, draggingId: null, trayOpen: pieceId === null }),
  carry: (pieceId) => set({ holdingId: pieceId, holdingRot: 0, selectedId: null, draggingId: pieceId, trayOpen: false }),
  turnHeld: (delta) => set({ holdingRot: (((get().holdingRot + delta) % 360) + 360) % 360 }),
  select: (pieceId) => set({ selectedId: pieceId, holdingId: null, draggingId: null, trayOpen: pieceId === null }),
  setDragging: (pieceId) => set({ draggingId: pieceId }),
  turnSelected: (delta) => set({ turnRequest: { seq: (get().turnRequest?.seq ?? 0) + 1, delta } }),
  setTray: (open) => set({ trayOpen: open }),
  showTray: (tray) => set({ tray }),
  remember: (entry) => set((state) => ({ history: [...state.history.slice(-(UNDO_DEPTH - 1)), entry] })),
  popUndo: () => {
    const { history } = get();
    const last = history[history.length - 1];
    if (!last) return null;
    set({ history: history.slice(0, -1) });
    return last;
  },
  forgetPiece: (pieceId) => set((state) => ({ history: state.history.filter((entry) => entry.pieceId !== pieceId) })),
}));
