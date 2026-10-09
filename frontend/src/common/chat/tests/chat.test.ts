import { describe, expect, it } from 'vitest';
import { dmLink, dmPreview, parseDmLink } from '../index';

describe('DM alerts', () => {
  it('previews text, voice notes and photos', () => {
    expect(dmPreview({ kind: 'text', body: '  how far? ' })).toBe('how far?');
    expect(dmPreview({ kind: 'voice', body: '' })).toBe('🎤 Voice note');
    expect(dmPreview({ kind: 'image', body: '' })).toBe('📷 Photo');
    expect(dmPreview({ kind: 'text', body: 'a'.repeat(200) })).toHaveLength(90);
  });

  it('round-trips a conversation link (names may have spaces or colons)', () => {
    const sender = { id: '5f0c2c1e-0000-4000-8000-000000000001', handle: 'ada_demo', name: 'Ada: the Boss' };
    expect(parseDmLink(dmLink(sender))).toEqual(sender);
    expect(parseDmLink('@ada_demo')).toBeNull();
    expect(parseDmLink(null)).toBeNull();
    expect(parseDmLink('dm:')).toBeNull();
  });
});
