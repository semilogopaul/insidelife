import type { InteriorTemplate } from '../../../interiors/templates/types';

export type Vec3 = readonly [number, number, number];

/** A flat panel on a wall (the club's LED screen, the VIP sign) to draw over. */
export interface WallPanel {
  /** Centre of the panel's face, pushed a few cm off the wall. */
  readonly at: Vec3;
  /** Radians about +Y (0 faces the camera side, +Z). */
  readonly rotY: number;
  readonly size: readonly [number, number];
}

/** Where moments happen in a room (room space, metres). Derived from the template; never edits it. */
export interface RoomAnchors {
  /** Middle of the dance floor (or the room), on the floor. */
  readonly floor: Vec3;
  /** Front edge of the stage / DJ booth, on its deck. */
  readonly stage: Vec3;
  /** The DJ booth (top). */
  readonly dj: Vec3;
  /** The bar counter top. */
  readonly bar: Vec3;
  /** Where the VIP crowd sits (a bottle lands here). */
  readonly table: Vec3;
  /** Two spots either side of the stage for cannons and CO2 jets. */
  readonly sides: readonly [Vec3, Vec3];
  readonly ceiling: number;
  /** The biggest screen on a wall: the LED wall. */
  readonly led: WallPanel | null;
  /** The VIP sign (null: a standing sign is drawn near the table instead). */
  readonly vip: WallPanel | null;
}

const DEG = Math.PI / 180;
const WALL_OFFSET = 0.035;

function panel(spec: { readonly at: readonly [number, number]; readonly y?: number; readonly rot?: number; readonly size: readonly [number, number] }): WallPanel {
  const rotY = (spec.rot ?? 0) * DEG;
  return {
    at: [spec.at[0] + Math.sin(rotY) * WALL_OFFSET, spec.y ?? 2, spec.at[1] + Math.cos(rotY) * WALL_OFFSET],
    rotY,
    size: spec.size,
  };
}

/** Anchors for club/bar/event-centre templates (works for any room: sensible fallbacks). Pure. */
export function roomAnchors(template: Pick<InteriorTemplate, 'room' | 'props' | 'extras'>): RoomAnchors {
  const { width, depth, height } = template.room;
  const props = template.props;
  const djBooth = props.find((prop) => prop.kind === 'dj-booth');
  const stageProp = props.find((prop) => prop.kind === 'stage');
  const barCounter = props.find((prop) => prop.kind === 'bar-counter');
  const glass = props.find((prop) => prop.kind === 'bottles');
  const floorAt = template.extras?.clubLights?.at ?? [0, 0.4];

  const stageHeight = stageProp?.kind === 'stage' ? (stageProp.height ?? 0.4) : 0;
  const stageAt = stageProp?.at ?? djBooth?.at ?? [0, -depth / 2 + 1];
  const stageDepth = stageProp?.kind === 'stage' ? stageProp.size[1] : 0.8;
  const stageWidth = stageProp?.kind === 'stage' ? stageProp.size[0] : 3;
  const stage: Vec3 = [stageAt[0], stageHeight, stageAt[1] + stageDepth / 2 - 0.15];
  const dj: Vec3 = djBooth ? [djBooth.at[0], (djBooth.y ?? 0) + 1.1, djBooth.at[1]] : [stage[0], stageHeight + 1.1, stage[2] - 0.3];
  const bar: Vec3 = barCounter ? [barCounter.at[0], 1.1, barCounter.at[1]] : [-width / 2 + 1, 1.1, 0];
  const table: Vec3 = glass ? [glass.at[0], (glass.y ?? 0.4) + 0.05, glass.at[1]] : [width / 2 - 1.5, 0.45, -depth / 2 + 2];
  const sideOffset = Math.min(width / 2 - 0.6, stageWidth / 2 + 0.5);
  const sides: [Vec3, Vec3] = [
    [stage[0] - sideOffset, stageHeight, stage[2]],
    [stage[0] + sideOffset, stageHeight, stage[2]],
  ];

  const screens = props.flatMap((prop) => (prop.kind === 'sign' && prop.wall ? [prop] : []));
  const led = screens
    .filter((sign) => sign.style === 'screen' && !sign.lines.some((line) => /VIP/i.test(line)))
    .toSorted((a, b) => b.size[0] * b.size[1] - a.size[0] * a.size[1])[0];
  const vip = screens.find((sign) => sign.lines.some((line) => /VIP/i.test(line)));

  return {
    floor: [floorAt[0], 0, floorAt[1]],
    stage,
    dj,
    bar,
    table,
    sides,
    ceiling: height,
    led: led ? panel(led) : null,
    vip: vip ? panel(vip) : null,
  };
}
