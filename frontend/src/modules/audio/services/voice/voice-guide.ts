import { clamp01 } from '../engine/gain';

/**
 * GPS / voice lines through the free Web Speech API (no paid TTS). Latest line wins, music ducks while speaking,
 * nothing is spoken while the tab is hidden or voice guidance is off.
 */

export interface VoiceLike {
  readonly name: string;
  readonly lang: string;
  readonly localService: boolean;
  readonly default: boolean;
}

/** macOS/iOS novelty voices that would turn "turn left" into a joke. */
const NOVELTY = /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|deranged|hysterical|pipe organ)\b/i;

/** Prefer a Nigerian English voice, then British, then American, then any English; offline voices first. */
export function pickVoice<T extends VoiceLike>(voices: readonly T[]): T | null {
  let best: T | null = null;
  let bestScore = -1;
  for (const voice of voices) {
    const lang = voice.lang.replace('_', '-').toLowerCase();
    let score = lang === 'en-ng' ? 100 : lang === 'en-gb' ? 80 : lang === 'en-us' ? 60 : lang.startsWith('en') ? 40 : -1;
    if (score < 0) continue;
    if (NOVELTY.test(voice.name)) score -= 60;
    if (voice.localService) score += 5;
    if (voice.default) score += 1;
    if (score > bestScore) {
      best = voice;
      bestScore = score;
    }
  }
  return bestScore >= 0 ? best : null;
}

export interface SayOptions {
  readonly rate?: number;
  readonly pitch?: number;
  /** Multiplies the voice volume (the danfo conductor is a background voice). */
  readonly volumeScale?: number;
  /** Interrupt a line already being spoken (GPS lines do; ambient chatter doesn't). */
  readonly interrupt?: boolean;
}

export class VoiceGuide {
  private voice: SpeechSynthesisVoice | null = null;
  private volume = 0;
  private current: SpeechSynthesisUtterance | null = null;
  private releaseDuck: (() => void) | null = null;
  private safetyTimer: number | null = null;

  constructor(
    private readonly synth: SpeechSynthesis | null,
    /** Starts a music duck; returns its release. */
    private readonly duck: () => () => void,
    /** Global gate (tab visible, engine attached). */
    private readonly canSpeak: () => boolean,
  ) {
    synth?.addEventListener('voiceschanged', this.refreshVoice);
    this.refreshVoice();
  }

  get supported(): boolean {
    return this.synth !== null;
  }

  get speaking(): boolean {
    return this.current !== null;
  }

  /** 0 disables speech (voice guidance off or muted). */
  setVolume(volume: number): void {
    this.volume = clamp01(volume);
    if (this.volume === 0) this.cancel();
  }

  say(text: string, options: SayOptions = {}): boolean {
    const synth = this.synth;
    const line = text.replace(/\s+/g, ' ').trim().slice(0, 240);
    if (!synth || !line || this.volume <= 0 || !this.canSpeak()) return false;
    if (options.interrupt === false && (synth.speaking || synth.pending || this.current)) return false;

    // Latest wins: drop whatever is queued or mid-sentence.
    this.finish();
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(line);
    if (this.voice) utterance.voice = this.voice;
    utterance.lang = this.voice?.lang ?? 'en-GB';
    utterance.rate = options.rate ?? 1;
    utterance.pitch = options.pitch ?? 1;
    utterance.volume = clamp01(this.volume * (options.volumeScale ?? 1));
    const done = (): void => {
      if (this.current === utterance) this.finish();
    };
    utterance.onend = done;
    utterance.onerror = done;
    this.current = utterance;
    // Duck now rather than on `onstart` (which can lag a few hundred ms on some engines).
    this.releaseDuck = this.duck();
    // Some engines never fire `end` (Chrome after long idle, Safari when interrupted): release the duck anyway.
    this.safetyTimer = window.setTimeout(done, Math.max(4000, line.length * 110));
    synth.speak(utterance);
    return true;
  }

  cancel(): void {
    if (!this.synth) return;
    this.finish();
    if (this.synth.speaking || this.synth.pending) this.synth.cancel();
  }

  dispose(): void {
    this.cancel();
    this.synth?.removeEventListener('voiceschanged', this.refreshVoice);
  }

  private finish(): void {
    if (this.safetyTimer !== null) window.clearTimeout(this.safetyTimer);
    this.safetyTimer = null;
    this.releaseDuck?.();
    this.releaseDuck = null;
    this.current = null;
  }

  private readonly refreshVoice = (): void => {
    if (!this.synth) return;
    try {
      this.voice = pickVoice(this.synth.getVoices());
    } catch {
      this.voice = null;
    }
  };
}
