import { BoxGeometry, BufferAttribute, BufferGeometry, Color, CylinderGeometry, Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { PartBuilder, type ColorSource, type Surface } from '@/common/three/geometry/part-builder';
import { loft, type LoftRing } from '@/common/three/geometry/primitives';
import type { AircraftClass, AircraftLivery } from '../contract';
import { AIRCRAFT_SPECS, bodyHeight, type AircraftSpec } from './aircraft-spec';

/**
 * Procedural low-poly aircraft: one merged geometry (one draw call) with colour and roughness baked per vertex, in the
 * livery's two colours; propellers come as a second small geometry that the component spins. Nose +Z, up +Y.
 */

const GLOSS: Surface = [0.32, 0.1];
const METAL: Surface = [0.35, 0.8];
const RUBBER: Surface = [0.95, 0];
const GLASS: Surface = [0.12, 0.2];
const SLOT = 'body';

const GLASS_COLOR = '#16222e';
const DARK = '#1d2126';
const STEEL = '#aeb5bd';

const tmpE = new Euler();
const tmpQ = new Quaternion();
const tmpS = new Vector3();
const tmpP = new Vector3();

type V3 = readonly [number, number, number];

function compose(position: V3, rotation: V3 = [0, 0, 0], scale: V3 = [1, 1, 1]): Matrix4 {
  tmpE.set(rotation[0], rotation[1], rotation[2]);
  tmpQ.setFromEuler(tmpE);
  return new Matrix4().compose(tmpP.set(position[0], position[1], position[2]), tmpQ, tmpS.set(scale[0], scale[1], scale[2]));
}

const HALF_PI = Math.PI / 2;

/** Both wing-like surfaces: a tapered, swept panel from the root (x = 0) out to `halfSpan` (right side, +x). Flat shaded. */
export function panel(halfSpan: number, rootChord: number, tipChord: number, sweep: number, thickness: number, rise = 0): BufferGeometry {
  // Leading edge at +z. Tip leading edge is swept back (-z) by `sweep` and lifted by `rise`.
  const t = thickness / 2;
  const tipT = t * 0.55;
  const c: number[][] = [
    [0, -t, rootChord / 2], // 0 root front bottom
    [0, t, rootChord / 2], // 1 root front top
    [0, t, -rootChord / 2], // 2 root back top
    [0, -t, -rootChord / 2], // 3 root back bottom
    [halfSpan, rise - tipT, rootChord / 2 - sweep], // 4 tip front bottom
    [halfSpan, rise + tipT, rootChord / 2 - sweep], // 5 tip front top
    [halfSpan, rise + tipT, rootChord / 2 - sweep - tipChord], // 6 tip back top
    [halfSpan, rise - tipT, rootChord / 2 - sweep - tipChord], // 7 tip back bottom
  ];
  // Quads (counter-clockwise seen from outside).
  const faces: ReadonlyArray<readonly [number, number, number, number]> = [
    [1, 5, 6, 2], // top
    [0, 3, 7, 4], // bottom
    [0, 4, 5, 1], // leading edge
    [3, 2, 6, 7], // trailing edge
    [4, 7, 6, 5], // tip
  ];
  const positions: number[] = [];
  for (const [a, b, d, e] of faces) {
    for (const index of [a, b, d, a, d, e]) positions.push(...(c[index] as number[]));
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** The same panel on both sides of the centreline. */
function mirrored(builder: PartBuilder, geometryOf: () => BufferGeometry, style: { color: ColorSource; surface: Surface; shade?: number }, position: V3): void {
  builder.add(geometryOf(), { slot: SLOT, ...style }, compose(position));
  builder.add(flipX(geometryOf()), { slot: SLOT, ...style }, compose([-position[0], position[1], position[2]]));
}

/** Mirror a non-indexed geometry across x = 0 (swapping triangle winding so it still faces outward). */
function flipX(geometry: BufferGeometry): BufferGeometry {
  const position = geometry.getAttribute('position');
  const flipped = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i += 3) {
    // Triangle (a, b, c) becomes (a, c, b) with x negated.
    for (const [from, to] of [[0, 0], [2, 1], [1, 2]] as const) {
      flipped[(i + to) * 3] = -position.getX(i + from);
      flipped[(i + to) * 3 + 1] = position.getY(i + from);
      flipped[(i + to) * 3 + 2] = position.getZ(i + from);
    }
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new BufferAttribute(flipped, 3));
  out.computeVertexNormals();
  geometry.dispose();
  return out;
}

const color = (hex: string): Color => new Color().setStyle(hex);

export interface AircraftGeometry {
  /** Everything but the propellers. */
  readonly body: BufferGeometry;
  /** Propeller blades and spinners (empty `null` for jets), positioned at the engines; spin them about their hub. */
  readonly propellers: readonly PropellerHub[];
  readonly triangles: number;
}

export interface PropellerHub {
  readonly position: V3;
  readonly geometry: BufferGeometry;
}

/** Loft rings along the fuselage (tail first), as `[t, widthScale, heightScale, lift]` stations. */
function fuselageStations(spec: AircraftSpec): ReadonlyArray<readonly [number, number, number, number]> {
  const piston = spec.engine.kind === 'prop-nose' || spec.engine.kind === 'prop-wing';
  const noseLen = piston ? 0.14 : 0.2;
  const tailLen = piston ? 0.5 : 0.3;
  const lift = piston ? 0.3 : 0.2;
  return [
    [0, 0.07, 0.07, lift],
    [tailLen * 0.4, 0.4, 0.42, lift * 0.62],
    [tailLen * 0.75, 0.72, 0.74, lift * 0.28],
    [tailLen, 1, 1, 0],
    [1 - noseLen, 1, 1, 0],
    [1 - noseLen * 0.55, 0.86, 0.88, -0.04],
    [1 - noseLen * 0.18, 0.55, 0.6, -0.08],
    [1, piston ? 0.5 : 0.1, piston ? 0.5 : 0.12, piston ? -0.06 : -0.1],
  ];
}

/** Builds the model for a class in a livery. Caller owns (and disposes) the geometries. */
export function buildAircraft(cls: AircraftClass, livery: Pick<AircraftLivery, 'base' | 'accent'>): AircraftGeometry {
  const spec = AIRCRAFT_SPECS[cls];
  const builder = new PartBuilder({ skinned: false });
  const base = color(livery.base);
  const accent = color(livery.accent);
  const { length: L, span, fuselage: F } = spec;
  const y0 = bodyHeight(spec);
  const topY = y0 + F.h / 2;

  const box = (size: V3, position: V3, hex: string | Color, surface: Surface = GLOSS, rotation: V3 = [0, 0, 0], shade = 0.1): void => {
    builder.add(new BoxGeometry(size[0], size[1], size[2]), { slot: SLOT, color: typeof hex === 'string' ? color(hex) : hex, surface, shade }, compose(position, rotation));
  };
  /** A cylinder lying along z (a nacelle, an exhaust). */
  const tube = (r0: number, r1: number, length: number, position: V3, hex: string | Color, surface: Surface = GLOSS, segments = 10): void => {
    builder.add(new CylinderGeometry(r1, r0, length, segments, 1), { slot: SLOT, color: typeof hex === 'string' ? color(hex) : hex, surface, shade: 0.12 }, compose(position, [HALF_PI, 0, 0]));
  };
  /** A wheel (axis along x). */
  const wheel = (r: number, width: number, position: V3): void => {
    builder.add(new CylinderGeometry(r, r, width, 10, 1), { slot: SLOT, color: color(DARK), surface: RUBBER, shade: 0 }, compose(position, [0, 0, HALF_PI]));
  };

  // --- Fuselage: a loft along z with a cheatline in the accent colour and a light belly. --------------------------
  const rings: LoftRing[] = fuselageStations(spec).map(([t, sw, sh, lift]) => ({ y: t * L - L / 2, w: F.w * sw, d: F.h * sh, z: -lift * F.h }));
  const stripeY = y0 - F.h * 0.27;
  const stripe = F.h * 0.07;
  const fuselageColor = (_x: number, y: number, z: number, out: Color): void => {
    const onStripe = Math.abs(y - stripeY) < stripe && z > -L * 0.46 && z < L * 0.4;
    out.copy(onStripe ? accent : base);
  };
  builder.add(loft(rings, { segments: 16, exponent: 2.4, capStart: true, capEnd: true }), { slot: SLOT, color: fuselageColor, surface: GLOSS, shade: 0.22 }, compose([0, y0, 0], [HALF_PI, 0, 0]));

  // --- Windows (both sides) and the boarding door (left). ---------------------------------------------------------
  const winY = y0 + F.h * 0.1;
  const winH = Math.min(0.55, F.h * 0.2);
  const pitch = spec.windows.size * 1.9;
  for (let i = 0; i < spec.windows.count; i++) {
    const z = spec.windows.centre + (i - (spec.windows.count - 1) / 2) * pitch;
    // Leave the door clear.
    if (Math.abs(z - spec.doorZ) < Math.max(0.7, spec.windows.size * 1.3)) continue;
    for (const side of [-1, 1] as const) {
      box([0.05, winH, spec.windows.size * 0.9], [side * (F.w / 2 - 0.005), winY, z], GLASS_COLOR, GLASS, [0, 0, 0], 0);
    }
  }
  // Cockpit windscreen.
  const noseLen = spec.engine.kind === 'prop-nose' || spec.engine.kind === 'prop-wing' ? 0.14 : 0.2;
  box([F.w * 0.7, F.h * 0.22, 0.9], [0, y0 + F.h * 0.2, L * (0.5 - noseLen * 0.62)], GLASS_COLOR, GLASS, [-0.35, 0, 0], 0);
  // Door: a slightly proud panel on the left side, with airstairs on the jets.
  const doorH = Math.min(F.h * 0.62, 1.75);
  const doorW = Math.min(0.85, F.w * 0.55);
  box([0.06, doorH, doorW], [F.w / 2 - 0.01, y0 - F.h * 0.08, spec.doorZ], '#7d848c', GLOSS, [0, 0, 0], 0);
  if (spec.airstair) {
    const run = Math.max(0.9, y0 - F.h * 0.4) * 1.1;
    const lean = Math.atan2(y0 - F.h * 0.36, run);
    box([doorW * 0.9, 0.05, run], [F.w / 2 + 0.05 + (run / 2) * 0.12, (y0 - F.h * 0.36) / 2, spec.doorZ], '#d8d6cf', METAL, [lean, 0, 0], 0);
  }

  // --- Wings. ------------------------------------------------------------------------------------------------------
  const halfSpan = span / 2 - F.w * 0.35;
  const wingCentre = spec.wing.z * L;
  const wingY = spec.wing.position === 'high' ? topY - 0.12 : y0 - F.h * 0.28;
  const thick = Math.max(0.16, spec.wing.rootChord * 0.09);
  const rise = spec.wing.position === 'high' ? 0 : spec.cls === 'airliner-jet' || spec.cls === 'long-range-jet' ? 0.9 : 0.35;
  const wingColor = (x: number, _y: number, _z: number, out: Color): void => {
    out.copy(Math.abs(x) > span * 0.455 ? accent : base);
  };
  mirrored(builder, () => panel(halfSpan, spec.wing.rootChord, spec.wing.tipChord, spec.wing.sweep, thick, rise), { color: wingColor, surface: GLOSS, shade: 0.12 }, [F.w * 0.3, wingY, wingCentre + spec.wing.rootChord / 2]);
  if (spec.wing.winglets) {
    const tipZ = wingCentre + spec.wing.rootChord / 2 - spec.wing.sweep - spec.wing.tipChord * 0.5;
    for (const side of [-1, 1] as const) {
      box([0.08, span * 0.07, spec.wing.tipChord * 0.55], [side * (F.w * 0.3 + halfSpan), wingY + rise + span * 0.035, tipZ], accent, GLOSS, [0, 0, side * -0.18], 0.05);
    }
  }
  // Wing struts on high-wing pistons.
  if (spec.wing.position === 'high') {
    for (const side of [-1, 1] as const) box([0.07, F.h * 0.9, 0.12], [side * (F.w / 2 + halfSpan * 0.32), y0 + F.h * 0.1, wingCentre + 0.2], STEEL, METAL, [0, 0, side * 0.62], 0);
  }

  // --- Tail. --------------------------------------------------------------------------------------------------------
  const tailZ = -L / 2 + L * 0.075;
  const finBase = y0 + F.h * 0.1;
  const fin = spec.tail.finHeight;
  const finChord = Math.max(1.0, L * 0.11);
  builder.add(
    panel(fin, finChord, finChord * 0.5, finChord * 0.45, 0.14, 0),
    { slot: SLOT, color: (_x, y, _z, out) => out.copy(y > finBase + fin * 0.04 ? accent : base), surface: GLOSS, shade: 0.1 },
    compose([0, finBase, tailZ - finChord * 0.1 + (L > 20 ? finChord * 0.3 : 0)], [0, 0, HALF_PI]),
  );
  const stabY = spec.tail.tType ? finBase + fin : finBase + 0.1 + (spec.cls === 'airliner-jet' ? 0.2 : 0);
  const stabChord = finChord * 0.78;
  mirrored(
    builder,
    () => panel(spec.tail.stabSpan / 2, stabChord, stabChord * 0.55, stabChord * 0.4, 0.1, 0),
    { color: base, surface: GLOSS, shade: 0.08 },
    [0, stabY, tailZ - finChord * 0.1 + (spec.tail.tType ? finChord * 0.4 : 0.0) + (L > 20 && !spec.tail.tType ? finChord * 0.2 : 0)],
  );

  // --- Engines. -----------------------------------------------------------------------------------------------------
  const propellers: PropellerHub[] = [];
  const e = spec.engine;
  const nacelle = (x: number, y: number, z: number, r: number, length: number, intake: boolean): void => {
    tube(r, r * 0.8, length, [x, y, z], base, GLOSS, 12);
    box([r * 0.5, r * 0.12, length * 0.95], [x, y + r * 0.0, z], accent, GLOSS, [0, 0, 0], 0);
    if (intake) tube(r * 0.72, r * 0.72, 0.05, [x, y, z + length / 2 + 0.01], DARK, METAL, 12);
    else tube(r * 0.55, r * 0.55, 0.05, [x, y, z - length / 2 - 0.01], DARK, METAL, 10);
  };
  if (e.kind === 'prop-nose') {
    const noseTip = L / 2;
    tube(F.w * 0.32, F.w * 0.4, 0.55, [0, y0 - F.h * 0.06, noseTip - 0.35], base, GLOSS, 12);
    propellers.push({ position: [0, y0 - F.h * 0.06, noseTip - 0.02], geometry: propeller(e.radius, 2) });
  } else if (e.kind === 'prop-wing') {
    const x = F.w / 2 + halfSpan * (spec.cls === 'turboprop' ? 0.34 : 0.4);
    const r = spec.cls === 'turboprop' ? 0.42 : 0.3;
    const length = spec.cls === 'turboprop' ? 3.0 : 1.9;
    const ny = wingY + 0.2 + r * 0.2;
    const nz = wingCentre + spec.wing.rootChord / 2 + length * 0.12 - 0.3;
    for (const side of [-1, 1] as const) {
      nacelle(side * x, ny, nz, r, length, false);
      propellers.push({ position: [side * x, ny, nz + length / 2 + 0.02], geometry: propeller(e.radius, spec.cls === 'turboprop' ? 4 : 2) });
    }
  } else if (e.kind === 'jet-rear') {
    const r = e.radius;
    const x = F.w / 2 + r * 0.95;
    const z = -L * 0.3;
    for (const side of [-1, 1] as const) {
      nacelle(side * x, y0 + F.h * 0.12, z, r, r * 3.4, true);
      box([x - F.w / 2, r * 0.2, r * 1.6], [side * (F.w / 2 + (x - F.w / 2) / 2), y0 + F.h * 0.12, z], base, GLOSS, [0, 0, 0], 0);
    }
  } else {
    const r = e.radius;
    const x = F.w / 2 + halfSpan * 0.32;
    for (const side of [-1, 1] as const) {
      const nz = wingCentre + spec.wing.rootChord / 2 - spec.wing.sweep * 0.32 + 0.9;
      const ny = wingY + rise * 0.32 - r * 1.05;
      nacelle(side * x, ny, nz, r, r * 3.0, true);
      box([0.2, r * 0.9, r * 1.5], [side * x, ny + r * 0.85, nz - r * 0.1], base, GLOSS, [0, 0, 0], 0);
    }
  }

  // --- Landing gear (parked: down). ----------------------------------------------------------------------------------
  const wr = Math.max(0.2, spec.clearance * 0.34);
  const mainZ = wingCentre - (spec.cls === 'airliner-jet' ? 1.0 : 0.2);
  const noseGearZ = L * (spec.engine.kind === 'prop-nose' ? 0.2 : 0.3);
  const gearSpread = F.w / 2 + (spec.wing.position === 'high' ? 0.6 : 0.5) + (spec.cls === 'airliner-jet' ? 1.6 : 0);
  for (const side of [-1, 1] as const) {
    const strutTop = wingY;
    box([0.1, strutTop - wr, 0.14], [side * gearSpread, (strutTop + wr) / 2, mainZ], STEEL, METAL, [0, 0, 0], 0);
    wheel(wr, wr * 0.55, [side * gearSpread, wr, mainZ]);
  }
  box([0.09, y0 - F.h * 0.4 - wr * 0.9, 0.12], [0, (y0 - F.h * 0.4 + wr * 0.9) / 2, noseGearZ], STEEL, METAL, [0, 0, 0], 0);
  wheel(wr * 0.85, wr * 0.5, [0, wr * 0.85, noseGearZ]);

  const built = builder.build();
  return { body: built.geometry, propellers, triangles: built.triangleCount + propellers.reduce((sum, p) => sum + (p.geometry.getIndex() ? (p.geometry.getIndex()?.count ?? 0) / 3 : p.geometry.getAttribute('position').count / 3), 0) };
}

/** Blades (and a spinner), in the xy plane facing +z, centred on the hub. */
function propeller(radius: number, blades: 2 | 4): BufferGeometry {
  const builder = new PartBuilder({ skinned: false });
  for (let i = 0; i < blades; i++) {
    const angle = (i / blades) * Math.PI * 2;
    builder.add(new BoxGeometry(0.12, radius, 0.035), { slot: SLOT, color: color('#2a2d31'), surface: GLOSS, shade: 0 }, compose([-Math.sin(angle) * radius * 0.5, Math.cos(angle) * radius * 0.5, 0], [0, 0, angle]));
  }
  builder.add(new CylinderGeometry(0.0, 0.14, 0.34, 10, 1), { slot: SLOT, color: color('#d7d9dc'), surface: METAL, shade: 0 }, compose([0, 0, 0.1], [HALF_PI, 0, 0]));
  return builder.build().geometry;
}
