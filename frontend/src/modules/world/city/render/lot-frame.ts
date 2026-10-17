import { Matrix4, Vector3 } from 'three';
import type { LotFrame } from '../layout/placements';

/** Local (x right, z towards the road) → world for a lot frame; a proper rotation (no mirroring). */
export function frameMatrix(frame: LotFrame): Matrix4 {
  return new Matrix4().makeBasis(new Vector3(frame.fz, 0, -frame.fx), new Vector3(0, 1, 0), new Vector3(frame.fx, 0, frame.fz)).setPosition(frame.cx, 0, frame.cz);
}
