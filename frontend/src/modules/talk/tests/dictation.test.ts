import { describe, expect, it, vi } from 'vitest';
import { dictationError, dictationLanguages, findLocalDictation, recognitionConstructor, transcriptOf, type RecognitionConstructor } from '../services/dictation';

type Writable = { available?: unknown; install?: unknown };

function ctorWith(available?: (lang: string) => string, install = true): RecognitionConstructor {
  const ctor = vi.fn() as unknown as Writable;
  if (available) ctor.available = vi.fn(async ({ langs }: { langs: readonly string[] }) => available(langs[0]!));
  if (install) ctor.install = vi.fn(async () => true);
  return ctor as unknown as RecognitionConstructor;
}

describe('on-device dictation', () => {
  it('finds the recogniser under either name', () => {
    const ctor = ctorWith();
    expect(recognitionConstructor({ webkitSpeechRecognition: ctor })).toBe(ctor);
    expect(recognitionConstructor({ SpeechRecognition: ctor })).toBe(ctor);
    expect(recognitionConstructor({})).toBeNull();
  });

  it('tries the browser’s English first, then Nigerian, British and US English', () => {
    expect(dictationLanguages(['en-US', 'yo-NG', 'fr'])).toEqual(['en-US', 'en-NG', 'en-GB']);
    expect(dictationLanguages([])).toEqual(['en-NG', 'en-GB', 'en-US']);
  });

  it('offers no mic when the browser can only recognise speech on a server', async () => {
    expect(await findLocalDictation(null, ['en-NG'])).toBeNull();
    // A recogniser without the on-device API (it would stream audio to the vendor's cloud).
    expect(await findLocalDictation(ctorWith(), ['en-NG'])).toBeNull();
    expect(await findLocalDictation(ctorWith(() => 'unavailable'), ['en-NG'])).toBeNull();
  });

  it('uses the first language available on the device, fetching its model once if needed', async () => {
    expect(await findLocalDictation(ctorWith((lang) => (lang === 'en-US' ? 'available' : 'unavailable')), [])).toEqual({ lang: 'en-US', needsInstall: false });
    expect(await findLocalDictation(ctorWith((lang) => (lang === 'en-GB' ? 'downloadable' : 'unavailable')), [])).toEqual({ lang: 'en-GB', needsInstall: true });
    expect(await findLocalDictation(ctorWith(() => 'downloadable', false), [])).toBeNull();
  });

  it('skips languages the browser rejects', async () => {
    const ctor = ctorWith();
    (ctor as unknown as Writable).available = vi.fn(async ({ langs }: { langs: readonly string[] }) => {
      if (langs[0] === 'en-NG') throw new Error('bad language');
      return 'available';
    });
    expect(await findLocalDictation(ctor, [])).toEqual({ lang: 'en-GB', needsInstall: false });
  });

  it('joins the transcript so far', () => {
    const results = [Object.assign([{ transcript: 'how far ' }], { isFinal: true }), Object.assign([{ transcript: ' my  guy' }], { isFinal: false })];
    expect(transcriptOf({ results })).toEqual({ text: 'how far my guy', final: false });
  });

  it('explains errors in plain words (and keeps quiet when you stopped it)', () => {
    expect(dictationError('not-allowed')).toMatch(/microphone is blocked/);
    expect(dictationError('no-speech')).toMatch(/Didn’t catch that/);
    expect(dictationError('aborted')).toBeNull();
    expect(dictationError('network')).toMatch(/Type it instead/);
  });
});
