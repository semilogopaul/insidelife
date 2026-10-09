import { findFloorFinish, findWallPaint, type HomeDecor } from '@insidelife/shared';
import type { InteriorTemplate } from './types';

/**
 * The paint and floor the player chose, on a home template: painted walls keep the template's lower band (tiles,
 * wainscot), the floor takes the finish's look and colour. Templates without a choice come back unchanged.
 */
export function applyDecor(
  template: InteriorTemplate,
  decor: HomeDecor | null | undefined,
): InteriorTemplate {
  const paint = findWallPaint(decor?.paint);
  const floor = findFloorFinish(decor?.floor);
  if (!paint && !floor) return template;
  const { room } = template;
  return {
    ...template,
    room: {
      ...room,
      wall: paint
        ? { ...room.wall, style: room.wall.style === 'none' ? 'none' : 'paint', color: paint.hex }
        : room.wall,
      floor: floor ? floor.style : room.floor,
      floorColor: floor ? floor.hex : room.floorColor,
    },
  };
}
