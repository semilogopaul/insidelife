import { describe, expect, it } from 'vitest';
import { initials, isValidHandle, normaliseHandle } from '../services/handles';

describe('handles', () => {
  it('normalises what people type into an API handle', () => {
    expect(normaliseHandle('  @Tolu_9 ')).toBe('tolu_9');
    expect(normaliseHandle('@@kemi')).toBe('kemi');
    expect(isValidHandle('tolu_9')).toBe(true);
    expect(isValidHandle('to')).toBe(false);
    expect(isValidHandle('tolu-9')).toBe(false);
    expect(initials('Adaeze ', 'okafor')).toBe('AO');
  });
});
