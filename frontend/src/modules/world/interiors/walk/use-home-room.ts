'use client';

import { useEffect, useRef } from 'react';
import { findAction, type PresencePlayerDto } from '@insidelife/shared';
import type { AvatarClip } from '@/common/three/avatar';
import { findRoom, isFreeAnimation, roomForActivity, roomForPerson } from '../layouts/geometry';
import type { HomeLayout, LayoutRoom } from '../layouts/types';
import { useHomeView, type HomeCamera } from './home-view-store';

export interface HomeRoom {
  readonly layout: HomeLayout;
  readonly room: LayoutRoom;
  /** The player walks (a session player is shown and the scene owns the camera). */
  readonly walkable: boolean;
  readonly camera: HomeCamera;
}

/** Room to open a place with: where the running activity happens (you're found there), else the front door's room. */
function openingRoom(layout: HomeLayout, animation: AvatarClip, actionId: string | null): string {
  return isFreeAnimation(animation) ? layout.entry : roomForActivity(layout, animation, layout.entry, actionId);
}

/**
 * Which room of a home is on screen. Walkable homes keep it in the home view store (doors, stairs and the rooms menu
 * change it); others just show the room of the current activity. Registers the house while mounted.
 */
export function useHomeRoom(
  layout: HomeLayout | null,
  locationId: string,
  animation: AvatarClip,
  walkable: boolean,
  actionId: string | null = null,
): HomeRoom | null {
  const houseKey = layout ? `${locationId}|${layout.id}` : '';
  const house = useHomeView((state) => state.house);
  const roomId = useHomeView((state) => state.roomId);
  const camera = useHomeView((state) => state.camera);
  const animationRef = useRef({ animation, actionId });
  useEffect(() => {
    animationRef.current = { animation, actionId };
  });

  useEffect(() => {
    if (!layout || !walkable) return;
    const opening = animationRef.current;
    useHomeView
      .getState()
      .enterHouse(
        houseKey,
        layout,
        openingRoom(layout, opening.animation, opening.actionId),
        isFreeAnimation(opening.animation) ? { kind: 'enter' } : { kind: 'spot' },
      );
    return () => useHomeView.getState().leaveHouse(houseKey);
  }, [layout, houseKey, walkable]);

  if (!layout) return null;
  const current = walkable && house === houseKey ? findRoom(layout, roomId) : undefined;
  const room = current ?? findRoom(layout, openingRoom(layout, animation, actionId)) ?? (layout.rooms[0] as LayoutRoom);
  return { layout, room, walkable, camera };
}

/** Animation someone present is playing (by their running action), if any. */
export function presenceAnimation(player: PresencePlayerDto): AvatarClip | null {
  return player.activity ? (findAction(player.activity)?.animation ?? null) : null;
}

/** Others present (hosts, guests) shown in this room: the room their activity belongs to, else the entry room. */
export function peopleInRoom(
  layout: HomeLayout,
  roomId: string,
  players: readonly PresencePlayerDto[],
): readonly PresencePlayerDto[] {
  if (layout.rooms.length <= 1) return players;
  return players.filter((player) => roomForPerson(layout, presenceAnimation(player), player.activity) === roomId);
}
