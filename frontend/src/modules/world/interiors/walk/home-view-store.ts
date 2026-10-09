'use client';

import { create } from 'zustand';
import { arrivalPortal } from '../layouts/geometry';
import type { Arrival, HomeLayout, PortalGeometry } from '../layouts/types';

/**
 * Client-side view state of the home on screen, shared by the 3D scene and its DOM overlay: walk or overview camera,
 * which room you're in (the server only knows you're at home), the dip to dark between rooms. Never written per frame.
 */

export type HomeCamera = 'walk' | 'overview';

export interface RoomTab {
  readonly id: string;
  readonly label: string;
  readonly level: number;
}

export interface PortalTag {
  readonly id: string;
  readonly label: string;
  readonly kind: PortalGeometry['kind'];
}

interface HomeViewState {
  readonly camera: HomeCamera;
  /** The walkable home on screen (`<locationId>|<layout id>`), or null. */
  readonly house: string | null;
  readonly layout: HomeLayout | null;
  readonly rooms: readonly RoomTab[];
  readonly roomId: string | null;
  /** How the player appears in `roomId`; `arrivalSeq` bumps on every room load. */
  readonly arrival: Arrival;
  readonly arrivalSeq: number;
  /** Dipping to dark (between rooms). */
  readonly fading: boolean;
  /** An activity is running: the player stays at its spot and room travel waits. */
  readonly busy: boolean;
  /** Doors and stairs of the current room, for their floating labels. */
  readonly portals: readonly PortalTag[];
  enterHouse(house: string, layout: HomeLayout, roomId: string, arrival: Arrival): void;
  leaveHouse(house: string): void;
  /** Fade to another room; false when a change is already under way (or there's no such room). */
  go(roomId: string, arrival: Arrival): boolean;
  /** Jump to a room from the rooms menu (you come in by the door you'd have used). */
  travel(roomId: string): boolean;
  setCamera(camera: HomeCamera): void;
  toggleCamera(): void;
  setBusy(busy: boolean): void;
  setPortals(portals: readonly PortalTag[]): void;
}

/** Dark-in, then the new room renders under cover; then the cover lifts. */
export const FADE_IN_MS = 200;
export const FADE_HOLD_MS = 160;
const CAMERA_KEY = 'il:home-camera';

function savedCamera(): HomeCamera {
  try {
    return window.localStorage.getItem(CAMERA_KEY) === 'overview' ? 'overview' : 'walk';
  } catch {
    return 'walk';
  }
}

function saveCamera(camera: HomeCamera): void {
  try {
    window.localStorage.setItem(CAMERA_KEY, camera);
  } catch {
    // Private mode / blocked storage: the choice just isn't remembered.
  }
}

export const useHomeView = create<HomeViewState>()((set, get) => ({
  camera: typeof window === 'undefined' ? 'walk' : savedCamera(),
  house: null,
  layout: null,
  rooms: [],
  roomId: null,
  arrival: { kind: 'enter' },
  arrivalSeq: 0,
  fading: false,
  busy: false,
  portals: [],
  enterHouse: (house, layout, roomId, arrival) =>
    set((state) => ({
      house,
      layout,
      rooms: layout.rooms.map((room) => ({ id: room.id, label: room.label, level: room.level })),
      roomId,
      arrival,
      arrivalSeq: state.arrivalSeq + 1,
      fading: false,
      busy: false,
    })),
  leaveHouse: (house) => {
    if (get().house === house)
      set({ house: null, layout: null, rooms: [], roomId: null, fading: false, busy: false, portals: [] });
  },
  go: (roomId, arrival) => {
    const state = get();
    const house = state.house;
    if (!house || state.fading || !state.rooms.some((room) => room.id === roomId)) return false;
    set({ fading: true });
    setTimeout(() => {
      if (get().house !== house) return;
      set((current) => ({ roomId, arrival, arrivalSeq: current.arrivalSeq + 1 }));
      setTimeout(() => {
        if (get().house === house) set({ fading: false });
      }, FADE_HOLD_MS);
    }, FADE_IN_MS);
    return true;
  },
  travel: (roomId) => {
    const { layout, roomId: current } = get();
    if (!layout || roomId === current) return false;
    const portal = arrivalPortal(layout, current, roomId);
    return get().go(roomId, portal ? { kind: 'portal', portal } : { kind: 'enter' });
  },
  setCamera: (camera) => {
    saveCamera(camera);
    set({ camera });
  },
  toggleCamera: () => get().setCamera(get().camera === 'walk' ? 'overview' : 'walk'),
  setBusy: (busy) => {
    if (get().busy !== busy) set({ busy });
  },
  setPortals: (portals) => set({ portals }),
}));

/** DOM elements of the portal labels, positioned by the frame loop (keyed by portal id). */
export const portalLabelElements = new Map<string, HTMLElement>();
