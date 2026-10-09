import { describe, expect, it } from 'vitest';
import {
  formatVoiceDuration,
  linkExpiry,
  mediaPreview,
  signMediaLink,
  verifyMediaLink,
  voiceLengthProblem,
} from './chat-media.rules.js';

describe('chat media rules', () => {
  it('accepts voice notes from half a second to 1:30 (with a little recorder slack)', () => {
    expect(voiceLengthProblem(12_000)).toBeNull();
    expect(voiceLengthProblem(91_000)).toBeNull();
    expect(voiceLengthProblem(300)).toMatch(/too short/);
    expect(voiceLengthProblem(95_000)).toMatch(/1:30/);
    expect(voiceLengthProblem(null)).toMatch(/couldn’t read/);
  });

  it('previews media for the DM list', () => {
    expect(mediaPreview('voice', 72_400)).toBe('Voice note 1:12');
    expect(mediaPreview('image', null)).toBe('Photo');
    expect(formatVoiceDuration(5_000)).toBe('0:05');
  });

  it('signs links that expire and cannot be reused for another message', () => {
    const now = Date.UTC(2026, 9, 9, 10, 15);
    const expires = linkExpiry(now);
    expect(expires % 3_600_000).toBe(0);
    expect(expires - now).toBeGreaterThanOrEqual(6 * 3_600_000);
    const signature = signMediaLink('secret', 'message-a', expires);
    expect(verifyMediaLink('secret', 'message-a', expires, signature, now)).toBe(true);
    expect(verifyMediaLink('secret', 'message-b', expires, signature, now)).toBe(false);
    expect(verifyMediaLink('other-secret', 'message-a', expires, signature, now)).toBe(false);
    expect(verifyMediaLink('secret', 'message-a', expires, signature, expires + 1)).toBe(false);
    expect(verifyMediaLink('secret', 'message-a', expires, 'short', now)).toBe(false);
  });
});
