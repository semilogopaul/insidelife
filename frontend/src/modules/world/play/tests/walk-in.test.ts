import { describe, expect, it } from 'vitest';
import { WALK_IN_COOLDOWN, WALK_IN_DWELL, WalkInGate, isHeadingToward } from '@/common/game/walk-in';

const DT = 0.1;
const run = (gate: WalkInGate, seconds: number, key: string | null, pushing: boolean): boolean => {
  let fired = false;
  for (let t = 0; t < seconds - 1e-9; t += DT) fired = gate.update(DT, key, pushing) || fired;
  return fired;
};

describe('heading toward a door', () => {
  it('needs real movement roughly at the door', () => {
    expect(isHeadingToward(2, 0, 1, 0)).toBe(true);
    expect(isHeadingToward(2, 0.5, 1, 0)).toBe(true);
    expect(isHeadingToward(2, 0, 0, 1)).toBe(false);
    expect(isHeadingToward(-2, 0, 1, 0)).toBe(false);
    expect(isHeadingToward(0.1, 0, 1, 0)).toBe(false);
  });
});

describe('walk-in gate', () => {
  const fresh = (): WalkInGate => {
    const gate = new WalkInGate();
    gate.update(DT, null, false);
    return gate;
  };

  it('opens after the dwell, not before', () => {
    const gate = fresh();
    expect(run(gate, WALK_IN_DWELL - 0.2, 'home', true)).toBe(false);
    expect(run(gate, 0.3, 'home', true)).toBe(true);
  });

  it('does not open while standing still or moving away; a brush resets the dwell', () => {
    const gate = fresh();
    expect(run(gate, 3, 'home', false)).toBe(false);
    expect(run(gate, 0.3, 'home', true)).toBe(false);
    expect(run(gate, 1, 'home', false)).toBe(false);
    expect(run(gate, 0.3, 'home', true)).toBe(false);
  });

  it('is inert for a door you start beside until you step away (spawn, or just leaving a building)', () => {
    const gate = new WalkInGate();
    expect(run(gate, 3, 'home', true)).toBe(false);
    run(gate, 0.2, null, false);
    expect(run(gate, 1, 'home', true)).toBe(true);
  });

  it('does not re-enter straight after: cooldown, and the door must be walked away from', () => {
    const gate = fresh();
    expect(run(gate, 1, 'home', true)).toBe(true);
    expect(run(gate, WALK_IN_COOLDOWN + 2, 'home', true)).toBe(false);
    run(gate, 0.2, null, false);
    expect(run(gate, 1, 'home', true)).toBe(true);
  });

  it('works for the exit door of a place the same way (keyed by the door)', () => {
    const gate = new WalkInGate();
    expect(run(gate, 2, 'front', true)).toBe(false);
    run(gate, 0.2, null, false);
    expect(run(gate, 0.2, 'front', true)).toBe(false);
    expect(run(gate, 0.5, 'front', true)).toBe(true);
  });
});
