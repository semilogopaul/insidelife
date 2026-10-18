import type { HomeFurnishing } from '@insidelife/shared';
import type { AvatarClip } from '@/common/three/avatar';
import type { HomeLayout } from './types';

/**
 * Where things happen in a home you furnish: the bed you sleep in is in a room, the table you eat at in another. The
 * authored `activityRooms` are only the default (the bedroom, the parlour); once there are pieces, each activity
 * happens in the room of the piece that serves it — and with no table to eat at, eating is in the kitchen, never the
 * parlour. Pure.
 */
export function functionRooms(layout: HomeLayout, home: HomeFurnishing): Partial<Record<AvatarClip, string>> {
  const has = (roomId: string | undefined): roomId is string => roomId !== undefined && layout.rooms.some((room) => room.id === roomId);
  const rooms: Partial<Record<AvatarClip, string>> = { ...layout.activityRooms };
  const set = (clips: readonly AvatarClip[], roomId: string | undefined): void => {
    if (has(roomId)) for (const clip of clips) rooms[clip] = roomId;
  };
  set(['sleep'], home.sleep?.roomId);
  set(['sit', 'phone', 'talk'], home.sit?.roomId ?? home.tv?.roomId);
  set(['type', 'read'], home.study?.roomId ?? home.sit?.roomId);
  // The table you eat at; with none, the kitchen (a home with a kitchen is never eaten in at the parlour).
  set(['eat'], home.eat?.roomId ?? layout.rooms.find((room) => room.id === 'kitchen')?.id);
  return rooms;
}

/** The same layout with its activities moved to where your furniture is (the same object when nothing changes). */
export function withFunctionRooms(layout: HomeLayout, home: HomeFurnishing): HomeLayout {
  if (layout.rooms.length <= 1) return layout;
  const activityRooms = functionRooms(layout, home);
  const same = Object.keys({ ...layout.activityRooms, ...activityRooms }).every((key) => layout.activityRooms[key as AvatarClip] === activityRooms[key as AvatarClip]);
  return same ? layout : { ...layout, activityRooms };
}
