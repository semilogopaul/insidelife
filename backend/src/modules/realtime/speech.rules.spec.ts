import { SPEECH_MAX_LENGTH } from '@insidelife/shared';
import { describe, expect, it } from 'vitest';
import { SPEECH_RATE, checkSpeech, nextSpeechSlot } from './speech.rules.js';

const code = (raw: unknown): string | null => {
  const result = checkSpeech(raw);
  return result.ok ? null : result.code;
};

describe('checkSpeech', () => {
  it('cleans what you say: whitespace collapsed, control and zero-width characters out', () => {
    expect(checkSpeech('  How   far​,\n my   guy? \u0007')).toEqual({ ok: true, text: 'How far, my guy?' });
  });

  it('refuses an empty line or a payload that is not text', () => {
    expect(code('   ')).toBe('EMPTY_MESSAGE');
    expect(code('​​')).toBe('EMPTY_MESSAGE');
    expect(code(undefined)).toBe('EMPTY_MESSAGE');
    expect(code(42)).toBe('EMPTY_MESSAGE');
    expect(code({ text: 'hi' })).toBe('EMPTY_MESSAGE');
  });

  it(`allows up to ${SPEECH_MAX_LENGTH} characters and refuses more`, () => {
    expect(checkSpeech('a'.repeat(SPEECH_MAX_LENGTH)).ok).toBe(true);
    expect(code('a'.repeat(SPEECH_MAX_LENGTH + 1))).toBe('SPEECH_TOO_LONG');
    // Collapsing whitespace happens first: padding doesn't count.
    expect(checkSpeech(`  ${'a'.repeat(SPEECH_MAX_LENGTH)}   `).ok).toBe(true);
    expect(code('x'.repeat(10_000))).toBe('SPEECH_TOO_LONG');
  });

  it('refuses links', () => {
    expect(code('follow me www.example.com')).toBe('SPEECH_LINK');
    expect(code('see https://scam.ng')).toBe('SPEECH_LINK');
    expect(code('cashapp.ng/ada')).toBe('SPEECH_LINK');
  });

  it('refuses phone and account numbers, spaced or not', () => {
    expect(code('call me 0803 123 4567')).toBe('SPEECH_NUMBER');
    expect(code('+2348031234567')).toBe('SPEECH_NUMBER');
    expect(code('send to 0123456789 GTB')).toBe('SPEECH_NUMBER');
    expect(code('0-8-0-3-1-2-3-4-5-6-7')).toBe('SPEECH_NUMBER');
  });

  it('lets ordinary numbers through', () => {
    expect(checkSpeech('I dey Yaba, 2 mins away. ₦5,000 for the bole').ok).toBe(true);
  });

  it('masks swear words like chat does', () => {
    expect(checkSpeech('this traffic is shit')).toEqual({ ok: true, text: 'this traffic is ****' });
  });
});

describe('nextSpeechSlot (1 line every 2 s, bursts of 5)', () => {
  it('allows a burst of 5 back to back, then refuses with the wait', () => {
    let tat: number | null = null;
    for (let i = 0; i < SPEECH_RATE.burst; i++) {
      const slot = nextSpeechSlot(tat, 1_000);
      expect(slot.allowed).toBe(true);
      if (slot.allowed) tat = slot.tat;
    }
    expect(nextSpeechSlot(tat, 1_000)).toEqual({ allowed: false, retryInMs: SPEECH_RATE.intervalMs });
  });

  it('refills one line every interval after the burst', () => {
    let tat: number | null = null;
    for (let i = 0; i < SPEECH_RATE.burst; i++) {
      const slot = nextSpeechSlot(tat, 0);
      if (slot.allowed) tat = slot.tat;
    }
    expect(nextSpeechSlot(tat, 1_999).allowed).toBe(false);
    const next = nextSpeechSlot(tat, 2_000);
    expect(next.allowed).toBe(true);
    if (next.allowed) expect(nextSpeechSlot(next.tat, 2_000).allowed).toBe(false);
  });

  it('a quiet speaker gets the whole burst back', () => {
    const slot = nextSpeechSlot(10_000, 60_000);
    expect(slot).toEqual({ allowed: true, tat: 60_000 + SPEECH_RATE.intervalMs });
  });
});
