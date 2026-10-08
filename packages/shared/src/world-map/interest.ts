import type { WorldPoint } from './types.js';

/**
 * Interest management for open-world positions: the city is cut into square cells; a player publishes to the cell
 * they stand in and listens to the 3×3 block around it, so anyone within roughly one to two cells is visible —
 * across district borders — while far-away traffic never reaches them.
 */
export const INTEREST_CELL_METRES = 120;

const cellCoord = (value: number): number => Math.floor(value / INTEREST_CELL_METRES);

/** Room name of the interest cell containing `p`. */
export function interestCell(p: WorldPoint): string {
  return `cell:${cellCoord(p.x)}:${cellCoord(p.z)}`;
}

/** Room names of the 3×3 cells around (and including) the one containing `p`. */
export function interestNeighbourhood(p: WorldPoint): string[] {
  const cx = cellCoord(p.x);
  const cz = cellCoord(p.z);
  const rooms: string[] = [];
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) rooms.push(`cell:${cx + dx}:${cz + dz}`);
  return rooms;
}
