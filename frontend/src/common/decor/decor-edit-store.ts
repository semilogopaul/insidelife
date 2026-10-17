'use client';

import { create } from 'zustand';

/**
 * Decorate mode, as the 3D room and its DOM overlay share it. Client-only view state: which piece is in hand
 * (an inventory piece waiting for a spot) or selected (a placed piece you can drag, turn, re-colour or put back).
 * Never written per frame: the drag itself lives in the scene.
 */
interface DecorEditState {
  readonly active: boolean;
  /** An inventory piece chosen to place: the next tap on the floor, a wall or a surface puts it down. */
  readonly holdingId: string | null;
  /** Rotation (degrees) the held piece will be put down with. */
  readonly holdingRot: number;
  /** A placed piece selected for moving, turning, re-colouring or putting back. */
  readonly selectedId: string | null;
  /** A placed piece being dragged right now (drawn as the ghost instead). */
  readonly draggingId: string | null;
  /** The overlay asks the scene to turn the selected piece (the scene knows what fits). */
  readonly turnRequest: { readonly seq: number; readonly delta: number } | null;
  readonly trayOpen: boolean;
  enter(): void;
  exit(): void;
  hold(pieceId: string | null): void;
  turnHeld(delta: number): void;
  select(pieceId: string | null): void;
  setDragging(pieceId: string | null): void;
  turnSelected(delta: number): void;
  setTray(open: boolean): void;
}

export const useDecorEdit = create<DecorEditState>()((set, get) => ({
  active: false,
  holdingId: null,
  holdingRot: 0,
  selectedId: null,
  draggingId: null,
  turnRequest: null,
  trayOpen: true,
  enter: () => set({ active: true, holdingId: null, holdingRot: 0, selectedId: null, draggingId: null, trayOpen: true }),
  exit: () => set({ active: false, holdingId: null, holdingRot: 0, selectedId: null, draggingId: null }),
  hold: (pieceId) => set({ holdingId: pieceId, holdingRot: 0, selectedId: null, trayOpen: pieceId === null }),
  turnHeld: (delta) => set({ holdingRot: (((get().holdingRot + delta) % 360) + 360) % 360 }),
  select: (pieceId) => set({ selectedId: pieceId, holdingId: null, trayOpen: pieceId === null }),
  setDragging: (pieceId) => set({ draggingId: pieceId }),
  turnSelected: (delta) => set({ turnRequest: { seq: (get().turnRequest?.seq ?? 0) + 1, delta } }),
  setTray: (open) => set({ trayOpen: open }),
}));
