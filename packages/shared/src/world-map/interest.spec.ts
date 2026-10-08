import { describe, expect, it } from 'vitest';
import { INTEREST_CELL_METRES, interestCell, interestNeighbourhood } from './interest.js';

describe('interest cells', () => {
  it('puts nearby players across a cell border in each other’s neighbourhood', () => {
    const a = { x: INTEREST_CELL_METRES - 5, z: 10 };
    const b = { x: INTEREST_CELL_METRES + 5, z: 10 };
    expect(interestCell(a)).not.toBe(interestCell(b));
    expect(interestNeighbourhood(a)).toContain(interestCell(b));
    expect(interestNeighbourhood(b)).toContain(interestCell(a));
  });

  it('handles negative coordinates and covers a 3×3 block', () => {
    const rooms = interestNeighbourhood({ x: -1, z: -1 });
    expect(rooms).toHaveLength(9);
    expect(new Set(rooms).size).toBe(9);
    expect(rooms).toContain('cell:-1:-1');
    expect(interestNeighbourhood({ x: 0, z: 0 })).not.toContain(interestCell({ x: 3 * INTEREST_CELL_METRES, z: 0 }));
  });
});
