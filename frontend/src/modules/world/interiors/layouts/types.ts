import type { AvatarClip } from '@/common/three/avatar';
import type { InteriorTemplate } from '../templates/types';

/**
 * A home you can walk around: a set of single-room templates (each rendered on its own, like any interior) joined by
 * portals — doors in a room's walls and staircases between floors. Which room you're in is client-side view state;
 * the server only knows you're "at home".
 */

/** Where a portal is in its room: a door opening (index into `room.doors`) or a `stairs`/`stairwell` prop (index among props of that kind). */
export type PortalVia =
  { readonly door: number } | { readonly stairs: number } | { readonly stairwell: number };

export interface PortalSpec {
  readonly id: string;
  readonly via: PortalVia;
  /** The portal on the other side, or `null` for the front door (stepping outside goes through the HUD). */
  readonly to: { readonly room: string; readonly portal: string } | null;
}

export interface LayoutRoom {
  readonly id: string;
  readonly label: string;
  /** 0 = ground floor, 1 = upstairs. */
  readonly level: number;
  readonly template: InteriorTemplate;
  readonly portals: readonly PortalSpec[];
  /**
   * Place actions that happen in this room (multi-room venues, where several rooms play the same animation: you sit
   * in the cinema to watch a movie and on the gaming couch to play FIFA). Unlisted actions follow `activityRooms`.
   */
  readonly actions?: readonly string[];
}

export interface HomeLayout {
  /** The home template id this layout renders (`home-mansion`, …). */
  readonly id: string;
  readonly rooms: readonly LayoutRoom[];
  /** The room with the front door (where you arrive from the street). */
  readonly entry: string;
  /** Which room an activity happens in (sleep → bedroom, cook → kitchen…); anything else happens where you are. */
  readonly activityRooms: Readonly<Partial<Record<AvatarClip, string>>>;
}

/** Floor rectangle (x/z). */
export interface Rect {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** A portal resolved to room-space geometry. */
export interface PortalGeometry {
  readonly id: string;
  /** Where you go (null for the front door). */
  readonly to: PortalSpec['to'];
  readonly kind: 'door' | 'stairs-up' | 'stairs-down';
  /** Standing here and moving along `inward` takes you through. */
  readonly trigger: Rect;
  /** Unit direction you walk to go through (x, z). */
  readonly inward: readonly [number, number];
  /** Where someone coming through from the other side appears, and their heading (shared convention: (cos h, sin h)). */
  readonly arrival: { readonly x: number; readonly z: number; readonly heading: number };
  /** Floor marker: centre, width across the portal and depth along `inward`. */
  readonly marker: {
    readonly x: number;
    readonly z: number;
    readonly across: number;
    readonly along: number;
  };
  /** Anchor for the floating label (room space). */
  readonly label: readonly [number, number, number];
}

/** How the player appears when a room loads. */
export type Arrival =
  /** Through a portal of the new room. */
  | { readonly kind: 'portal'; readonly portal: string }
  /** At the activity spot (an activity is running here). */
  | { readonly kind: 'spot' }
  /** Entering the house from the street: the front door, else the room's first portal, else its default spot. */
  | { readonly kind: 'enter' };
