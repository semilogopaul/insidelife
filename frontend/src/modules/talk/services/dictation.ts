/**
 * Speech-to-text for the Talk box with the browser's Web Speech API, **on the device only**: we ask for local
 * processing (`processLocally`) and offer the mic only where the browser says it can recognise speech without a server.
 * Browsers that would stream the audio to their vendor's cloud (most do by default) get no mic button; phone keyboards'
 * own dictation still works in the box. Inside Life never receives audio: only the typed or dictated text is sent.
 */

/** The bits of `SpeechRecognition` we use (not in TypeScript's DOM library). */
export interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  processLocally?: boolean;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: { readonly error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export interface RecognitionResultEvent {
  readonly results: ArrayLike<ArrayLike<{ readonly transcript: string }> & { readonly isFinal: boolean }>;
}

type Availability = 'available' | 'downloadable' | 'downloading' | 'unavailable';

interface LocalOptions {
  readonly langs: readonly string[];
  readonly processLocally: true;
}

export interface RecognitionConstructor {
  new (): Recognition;
  available?(options: LocalOptions): Promise<Availability>;
  install?(options: LocalOptions): Promise<boolean>;
}

/** On-device recognition this browser can do: the language, and whether its model must be fetched (once) first. */
export interface LocalDictation {
  readonly lang: string;
  readonly needsInstall: boolean;
}

export function recognitionConstructor(scope: object = globalThis): RecognitionConstructor | null {
  const candidates = scope as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return candidates.SpeechRecognition ?? candidates.webkitSpeechRecognition ?? null;
}

/** Languages to try, most specific first ("en-NG", then the browser's, then English). */
export function dictationLanguages(preferred: readonly string[]): string[] {
  return [...new Set([...preferred.filter((lang) => /^en\b/i.test(lang)), 'en-NG', 'en-GB', 'en-US'])];
}

/** Whether (and in which language) this browser recognises speech on the device. Null: no mic. */
export async function findLocalDictation(ctor: RecognitionConstructor | null, preferred: readonly string[]): Promise<LocalDictation | null> {
  if (!ctor || typeof ctor.available !== 'function') return null;
  for (const lang of dictationLanguages(preferred)) {
    try {
      const status = await ctor.available({ langs: [lang], processLocally: true });
      if (status === 'available') return { lang, needsInstall: false };
      if ((status === 'downloadable' || status === 'downloading') && typeof ctor.install === 'function') return { lang, needsInstall: true };
    } catch {
      // A language the browser doesn't know: try the next one.
    }
  }
  return null;
}

/** All the text recognised so far in this session (interim results included). */
export function transcriptOf(event: RecognitionResultEvent): { readonly text: string; readonly final: boolean } {
  let text = '';
  let final = false;
  for (let i = 0; i < event.results.length; i++) {
    const result = event.results[i];
    if (!result) continue;
    text += result[0]?.transcript ?? '';
    final = result.isFinal;
  }
  return { text: text.replace(/\s+/g, ' ').trim(), final };
}

/** A player-facing reason for a recognition error (null when it's not worth saying). */
export function dictationError(code: string): string | null {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'The microphone is blocked. Allow it for this site to dictate.';
    case 'no-speech':
      return 'Didn’t catch that. Tap the mic and talk.';
    case 'audio-capture':
      return 'No microphone found.';
    case 'language-not-supported':
      return 'Dictation isn’t available in this language on your device.';
    case 'aborted':
      return null;
    default:
      return 'Dictation stopped. Type it instead.';
  }
}
