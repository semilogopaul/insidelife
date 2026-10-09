import { BoxGeometry, CylinderGeometry, ExtrudeGeometry, Group, Mesh, Object3D, Shape, Vector4, type BufferGeometry, type Material } from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import type { LuxuryBodyModel } from '@insidelife/shared';
import { LUXURY_SPECS as SPECS, topAt, type BodySpec, type Point } from './luxury-specs';
import { box, merge, tint, type SwatchName } from './proc-vehicles';

/**
 * Procedural luxury bodies (see `luxury-specs.ts` for the shapes): side profiles extruded with a small bevel in the
 * same chunky low-poly style and scale as the Kenney kit, plus glasshouse, roof, lights, grille, badges and wheels.
 * Authored in metres, +z forward, textured through the kit colormap so they batch with every other vehicle. Paint
 * parts use the `paint` swatch, which the player's paint shader recolours (LUXURY_PAINT_RECT).
 */

/** Colormap rectangle of the `paint` swatch (column 8, row 2) — what createPaintedMaterial recolours. */
export const LUXURY_PAINT_RECT = new Vector4(8 / 16, 0.5, 9 / 16, 0.75);

const BEVEL = 0.05;
const WHEEL_WIDTH = 0.36;

/** Extrude a side profile (z, y) across the car's width (centred on x = 0). */
function extrudeProfile(points: readonly Point[], width: number, swatch: SwatchName, bevel = BEVEL): BufferGeometry {
  const shape = new Shape();
  points.forEach(([z, y], index) => (index === 0 ? shape.moveTo(z, y) : shape.lineTo(z, y)));
  shape.closePath();
  const depth = Math.max(0.02, width - bevel * 2);
  const geometry = new ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 6 });
  // Shape x → +z (forward), extrusion → x, centred.
  geometry.rotateY(-Math.PI / 2).translate(depth / 2, 0, 0);
  geometry.deleteAttribute('uv');
  return mergeVertices(tint(geometry, swatch));
}

/** Body side outline: rear face, beltline under the glass, bonnet and nose, then the underside with wheel arches. */
function bodyOutline(spec: BodySpec): Point[] {
  const outline: Point[] = [...spec.rear, ...spec.front];
  const archRadius = spec.wheelRadius + 0.08;
  const front = spec.front[spec.front.length - 1] as Point;
  const rear = spec.rear[0] as Point;
  const bottom: Point[] = [];
  for (const axle of [spec.frontAxle, spec.rearAxle]) {
    // Low cars: flatten the arch so it never breaks through the bonnet or boot line.
    const rise = Math.min(archRadius, topAt(spec, axle) - spec.wheelRadius - 0.1);
    bottom.push([axle + archRadius, spec.clearance], [axle + archRadius, spec.wheelRadius]);
    for (let step = 1; step < 8; step++) {
      const angle = (step / 8) * Math.PI;
      bottom.push([axle + archRadius * Math.cos(angle), spec.wheelRadius + rise * Math.sin(angle)]);
    }
    bottom.push([axle - archRadius, spec.wheelRadius], [axle - archRadius, spec.clearance]);
  }
  return [...outline, [front[0], spec.clearance], ...bottom, [rear[0], spec.clearance]];
}

/** Side-window band: the glasshouse shrunk inside its pillars and roof, sitting just above the beltline. */
function windowOutline(spec: BodySpec): Point[] {
  const cabin = spec.cabin;
  const start = cabin[0] as Point;
  const end = cabin[cabin.length - 1] as Point;
  const belt = Math.max(start[1], end[1]) + 0.07;
  const roof = cabin.slice(1, -1).map(([z, y], index, all): Point => [z + (index === 0 ? 0.1 : index === all.length - 1 ? -0.1 : 0), y - 0.11]);
  const first = roof[0] as Point;
  const last = roof[roof.length - 1] as Point;
  // Pillars follow the rear and front glass slopes, set in by 12 cm.
  const along = (from: Point, to: Point, y: number): number => (to[1] === from[1] ? from[0] : from[0] + ((y - from[1]) / (to[1] - from[1])) * (to[0] - from[0]));
  return [[along(start, first, belt) + 0.12, belt], ...roof, [along(end, last, belt) - 0.12, belt]];
}

/** A thin glass pane along one cabin edge (windscreen or rear window), set just proud of the paint. */
function pane(from: Point, to: Point, width: number): BufferGeometry {
  const dz = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dz, dy) * 0.86;
  const angle = Math.atan2(dy, dz);
  // Outward normal of the edge (the cabin is above/inside it).
  const nz = -dy / Math.hypot(dz, dy);
  const ny = dz / Math.hypot(dz, dy);
  const flip = ny < 0 ? -1 : 1;
  const geometry = new BoxGeometry(width, 0.03, length).rotateX(-angle).translate(0, (from[1] + to[1]) / 2 + ny * flip * 0.02, (from[0] + to[0]) / 2 + nz * flip * 0.02);
  return tint(geometry, 'glass');
}

function lights(spec: BodySpec, width: number, frontZ: number, frontY: number, rearZ: number, rearY: number): BufferGeometry[] {
  const size = spec.lights === 'slim' ? { w: 0.55, h: 0.1 } : spec.lights === 'tall' ? { w: 0.32, h: 0.34 } : { w: 0.42, h: 0.2 };
  const x = width / 2 - size.w / 2 - 0.08;
  return [
    box(size.w, size.h, 0.08, x, frontY, frontZ, 'white'),
    box(size.w, size.h, 0.08, -x, frontY, frontZ, 'white'),
    box(size.w, size.h * 0.9, 0.08, x, rearY, rearZ, 'red'),
    box(size.w, size.h * 0.9, 0.08, -x, rearY, rearZ, 'red'),
  ];
}

/** A tyre with its rim, centred on its axle (x). */
export function buildLuxuryWheel(model: LuxuryBodyModel): BufferGeometry {
  const spec = SPECS[model];
  const tyre = tint(new CylinderGeometry(spec.wheelRadius, spec.wheelRadius, WHEEL_WIDTH, 16).rotateZ(Math.PI / 2), 'tyre');
  const rim = tint(new CylinderGeometry(spec.wheelRadius * 0.64, spec.wheelRadius * 0.64, WHEEL_WIDTH + 0.02, 10).rotateZ(Math.PI / 2), spec.rims);
  const hub = tint(new CylinderGeometry(spec.wheelRadius * 0.16, spec.wheelRadius * 0.16, WHEEL_WIDTH + 0.05, 8).rotateZ(Math.PI / 2), 'grey');
  return merge([tyre, rim, hub]);
}

/** Wheel centres (x, y, z) — front-left, front-right, back-left, back-right (left = +x). */
function wheelCentres(spec: BodySpec): readonly (readonly [number, number, number])[] {
  const x = spec.width / 2 - WHEEL_WIDTH / 2 + 0.04;
  return [
    [x, spec.wheelRadius, spec.frontAxle],
    [-x, spec.wheelRadius, spec.frontAxle],
    [x, spec.wheelRadius, spec.rearAxle],
    [-x, spec.wheelRadius, spec.rearAxle],
  ];
}

/** Everything except the wheels. */
export function buildLuxuryBody(model: LuxuryBodyModel): BufferGeometry {
  const spec = SPECS[model];
  const { width } = spec;
  const nose = spec.front[spec.front.length - 2] as Point;
  const tail = spec.rear[1] as Point;
  const frontZ = (spec.front[spec.front.length - 1] as Point)[0];
  const rearZ = (spec.rear[0] as Point)[0];
  const cabinStart = spec.cabin[0] as Point;
  const cabinEnd = spec.cabin[spec.cabin.length - 1] as Point;
  const glassTop = Math.max(...spec.cabin.map(([, y]) => y));
  const cabinWidth = width - spec.glassInset * 2;
  const cabin = spec.cabin;
  const parts: BufferGeometry[] = [
    extrudeProfile(bodyOutline(spec), width, 'paint'),
    // Glasshouse in body colour (roof and pillars), with glass side windows, windscreen and rear window on it.
    extrudeProfile(cabin, cabinWidth, 'paint', 0.03),
    extrudeProfile(windowOutline(spec), cabinWidth + 0.04, 'glass', 0),
    pane(cabin[cabin.length - 2] as Point, cabinEnd, cabinWidth - 0.22),
    pane(cabinStart, cabin[1] as Point, cabinWidth - 0.22),
    // B-pillars between the side windows, and door mirrors at the windscreen base.
    box(cabinWidth + 0.08, glassTop - cabinStart[1] - 0.12, 0.12, 0, cabinStart[1], (cabinStart[0] + cabinEnd[0]) / 2 + 0.1, 'paint'),
    box(0.22, 0.14, 0.16, width / 2 + 0.04, cabinEnd[1] + 0.06, cabinEnd[0] - 0.12, 'paint'),
    box(0.22, 0.14, 0.16, -width / 2 - 0.04, cabinEnd[1] + 0.06, cabinEnd[0] - 0.12, 'paint'),
    // Dark sills between the arches.
    box(width + 0.02, 0.12, spec.frontAxle - spec.rearAxle - (spec.wheelRadius + 0.1) * 2, 0, spec.clearance, (spec.frontAxle + spec.rearAxle) / 2, 'black'),
    ...lights(spec, width, frontZ + 0.02, Math.min(nose[1], spec.clearance + 0.55) - 0.12, rearZ - 0.02, Math.min(tail[1], spec.clearance + 0.75) - 0.16),
  ];
  const grilleY = spec.clearance + 0.12;
  if (spec.grille === 'chrome-block') parts.push(box(0.78, Math.min(0.62, nose[1] - grilleY - 0.04), 0.1, 0, grilleY, frontZ + 0.02, 'chrome'));
  else if (spec.grille === 'dark-block') parts.push(box(1.05, Math.min(0.32, nose[1] - grilleY - 0.04), 0.1, 0, grilleY + 0.06, frontZ + 0.02, 'black'));
  else parts.push(box(width * 0.62, 0.16, 0.1, 0, spec.clearance + 0.04, frontZ - 0.02, 'black'));
  // Badges: a small chrome emblem front and back (generic shape, no real logo).
  parts.push(box(0.16, 0.16, 0.05, 0, Math.min(nose[1], spec.clearance + 0.62), frontZ + 0.06, 'chrome'));
  parts.push(box(0.16, 0.16, 0.05, 0, Math.min(tail[1], spec.clearance + 0.82) - 0.02, rearZ - 0.06, 'chrome'));
  if (spec.ornament) parts.push(box(0.06, 0.16, 0.12, 0, topAt(spec, frontZ - 0.25) - 0.02, frontZ - 0.25, 'chrome'));
  if (spec.wing) {
    const wingZ = rearZ + 0.28;
    parts.push(box(width * 0.86, 0.06, 0.32, 0, tail[1] + 0.2, wingZ, 'black'));
    parts.push(box(0.08, 0.2, 0.12, width * 0.3, tail[1], wingZ, 'black'));
    parts.push(box(0.08, 0.2, 0.12, -width * 0.3, tail[1], wingZ, 'black'));
  }
  if (spec.flares) {
    for (const axle of [spec.frontAxle, spec.rearAxle]) {
      for (const side of [1, -1]) parts.push(box(0.12, 0.14, (spec.wheelRadius + 0.14) * 2, side * (width / 2 + 0.03), spec.wheelRadius * 2 - 0.02, axle, 'black'));
    }
  }
  return merge(parts);
}

/** Body + wheels in one geometry (traffic and other players' cars batch it). */
export function buildLuxuryGeometry(model: LuxuryBodyModel): BufferGeometry {
  const wheel = buildLuxuryWheel(model);
  const wheels = wheelCentres(SPECS[model]).map(([x, y, z]) => wheel.clone().translate(x, y, z));
  wheel.dispose();
  const merged = mergeGeometries([buildLuxuryBody(model), ...wheels], false);
  if (!merged) throw new Error(`Could not merge the ${model} body`);
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

const WHEEL_NODES = ['wheel-front-left', 'wheel-front-right', 'wheel-back-left', 'wheel-back-right'] as const;

/**
 * A drivable scene for the player's car, shaped like the kit GLBs: a `body` mesh and four named wheel nodes (pivots
 * at the axles) so PlayerCar can spin and steer them. Geometries are shared by clones; the caller paints the meshes.
 */
export function buildLuxuryScene(model: LuxuryBodyModel, material: Material): Group {
  const root = new Group();
  root.name = model;
  const body = new Mesh(buildLuxuryBody(model), material);
  body.name = 'body';
  root.add(body);
  const wheelGeometry = buildLuxuryWheel(model);
  wheelCentres(SPECS[model]).forEach(([x, y, z], index) => {
    const pivot = new Object3D();
    pivot.name = WHEEL_NODES[index] as string;
    pivot.position.set(x, y, z);
    pivot.add(new Mesh(wheelGeometry, material));
    root.add(pivot);
  });
  return root;
}

