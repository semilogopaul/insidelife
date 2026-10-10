import { describe, expect, it } from 'vitest';
import { thingsToDo } from '../components/VenueSheet';

describe('thingsToDo', () => {
  it('counts things in plain English', () => {
    expect(thingsToDo(1)).toBe('1 thing to do here');
    expect(thingsToDo(4)).toBe('4 things to do here');
    expect(thingsToDo(0)).toBe('0 things to do here');
  });
});
