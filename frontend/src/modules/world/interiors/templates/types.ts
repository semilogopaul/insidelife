import type { Gender } from '@insidelife/shared';
import type { AvatarClip, AvatarStance, OutfitTheme } from '@/common/three/avatar';
import type { Palette } from '../kit/furniture-kit';
import type { KitModel, ShowroomCar } from '../kit/kit-manifest';
import type { PropSpec } from '../props/prop-types';

/** Degrees about +Y. 0 faces +Z (towards the dollhouse camera). */
export type Deg = number;

/** Floor-plane position [x, z] (room centred at the origin; back wall at -z, left wall at -x). */
export type At = readonly [number, number];

export interface FurniturePlacement {
  readonly model: KitModel;
  readonly at: At;
  readonly rot?: Deg;
  /** Lift off the floor (e.g. on a counter). */
  readonly y?: number;
  /** Extra scale on top of the kit scale. */
  readonly scale?: number;
  readonly palette?: Palette;
}

export type FloorStyle = 'tiles' | 'terrazzo' | 'wood' | 'cement' | 'carpet' | 'vinyl' | 'marble' | 'sand' | 'grass' | 'asphalt' | 'dark';
export type WallStyle = 'paint' | 'tiles' | 'plaster' | 'panel' | 'wallpaper' | 'brick' | 'none';

export interface WallSpec {
  readonly style: WallStyle;
  readonly color: string;
  /** Lower band colour (wainscot / tiles) — optional. */
  readonly band?: string;
}

export interface Opening {
  readonly wall: 'back' | 'left';
  /** Centre along the wall (x for the back wall, z for the left wall). */
  readonly at: number;
  readonly width: number;
}

export interface WindowSpec extends Opening {
  readonly height?: number;
  readonly sill?: number;
  /** Lagos burglar-proof bars. */
  readonly bars?: boolean;
}

export interface RoomSpec {
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly floor: FloorStyle;
  readonly floorColor: string;
  readonly wall: WallSpec;
  readonly windows?: readonly WindowSpec[];
  readonly doors?: readonly Opening[];
  /** Open-air venues (beach, park, motor park): no walls, a sky backdrop. */
  readonly outdoor?: boolean;
  /** Window curtain colour (omit for bare windows). */
  readonly curtain?: string;
}

export interface Spot {
  /** [x, z] on the floor or [x, y, z] (e.g. seated on a bed). */
  readonly at: At | readonly [number, number, number];
  readonly rot?: Deg;
  readonly animation: AvatarClip;
  readonly stance?: AvatarStance;
  /** Hide hand props (e.g. typing at a desk computer instead of a lap laptop). */
  readonly props?: boolean;
}

export interface NpcSpot extends Spot {
  readonly theme: OutfitTheme;
  readonly gender?: Gender;
  readonly lod?: 'high' | 'low';
}

export type LightingMood = 'home' | 'office' | 'clinic' | 'club' | 'worship' | 'outdoor' | 'hall' | 'shop' | 'bar';

export interface LightingSpec {
  readonly mood: LightingMood;
  /** Warm practical lights (bulbs, lamps) in room space. */
  readonly practicals?: ReadonlyArray<readonly [number, number, number]>;
  /** Override the practical light colour. */
  readonly practicalColor?: string;
}

export interface CarPlacement {
  readonly model: ShowroomCar;
  readonly at: At;
  readonly rot?: Deg;
  /** Turntable spin. */
  readonly spin?: boolean;
}

export type PlayerSpots = Readonly<Partial<Record<AvatarClip | 'default', Spot>>>;

export interface InteriorTemplate {
  readonly id: string;
  readonly label: string;
  readonly room: RoomSpec;
  readonly furniture: readonly FurniturePlacement[];
  readonly props: readonly PropSpec[];
  /** Where the player stands/sits per animation (`default` when nothing more specific fits). */
  readonly player: PlayerSpots;
  readonly npcs: readonly NpcSpot[];
  /** Free spots for other players present. */
  readonly guests: readonly Spot[];
  readonly lighting: LightingSpec;
  readonly extras?: {
    /** Animated dance floor + beams + disco ball over this area. */
    readonly clubLights?: { readonly at: At; readonly size: readonly [number, number] };
    readonly cars?: readonly CarPlacement[];
    readonly ceilingFans?: ReadonlyArray<readonly [number, number]>;
  };
}
