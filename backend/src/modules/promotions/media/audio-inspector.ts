import { parseBuffer } from 'music-metadata';
import { TRACK_MAX_SECONDS, TRACK_MIN_SECONDS, type TrackContentType } from '@insidelife/shared';
import { InvalidMediaException } from '../promotions.errors.js';
import { countMp3, countOgg } from './audio-frames.js';

export interface InspectedAudio {
  readonly contentType: TrackContentType;
  readonly durationSeconds: number;
}

const EXPECTED_CONTAINER: Readonly<Record<TrackContentType, string>> = { 'audio/mpeg': 'MPEG', 'audio/ogg': 'Ogg' };
const OGG_AUDIO_CODECS: ReadonlySet<string> = new Set(['Opus', 'Vorbis I']);

/** "5:03" (rounded down, so a 4:59.6 song never reads as "5:00" in a refusal). */
const clock = (seconds: number): string => {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

/** How far the length a file declares may differ from the length counted from its frames. */
const DECLARED_TOLERANCE = 0.05;

const disagree = (a: number, b: number): boolean => Math.abs(a - b) > DECLARED_TOLERANCE * Math.max(a, b);

/**
 * Confirm a sniffed MP3/OGG really is playable audio of an acceptable length (30 s to 3 minutes). The length is
 * counted from every frame (MP3) or packet (Ogg) in the file (`audio-frames.ts`), never taken from a header or from
 * what the browser says: a file whose declared length (Xing/Info/VBRI frame count, granule position, or the parser's
 * reading) differs from the counted one by more than 5% is refused as forged or broken. The file is stored as-is
 * afterwards, so the parser's view (container, codec, no video) must agree with the magic bytes.
 */
export async function inspectTrack(input: Buffer, sniffed: TrackContentType): Promise<InspectedAudio> {
  let format: { container?: string; codec?: string; duration?: number; hasAudio?: boolean; hasVideo?: boolean };
  try {
    ({ format } = await parseBuffer(new Uint8Array(input.buffer, input.byteOffset, input.length), { mimeType: sniffed, size: input.length }, { duration: true, skipCovers: true }));
  } catch {
    throw new InvalidMediaException('We couldn’t read that audio file. Export it again as MP3 or OGG');
  }

  const codecOk = sniffed === 'audio/ogg' ? OGG_AUDIO_CODECS.has(format.codec ?? '') : (format.codec ?? '').includes('Layer 3');
  if (format.container !== EXPECTED_CONTAINER[sniffed] || !codecOk || format.hasAudio === false || format.hasVideo === true) {
    throw new InvalidMediaException('That file isn’t a plain MP3 or OGG song');
  }

  const counted = sniffed === 'audio/mpeg' ? countMp3(input) : countOgg(input);
  const parsed = format.duration ?? Number.NaN;
  if (!counted || counted.seconds <= 0 || !Number.isFinite(parsed) || parsed <= 0) {
    throw new InvalidMediaException('We couldn’t tell how long that song is. Export it again as MP3 or OGG');
  }
  const declared = counted.declaredSeconds;
  if (disagree(parsed, counted.seconds) || (declared !== null && disagree(declared, counted.seconds))) {
    throw new InvalidMediaException('That file’s length information doesn’t match its audio. Export it again as MP3 or OGG');
  }
  const duration = counted.seconds;
  if (duration < TRACK_MIN_SECONDS) throw new InvalidMediaException(`Songs must be at least ${TRACK_MIN_SECONDS} seconds long`);
  if (duration > TRACK_MAX_SECONDS + 0.5) {
    throw new InvalidMediaException(`Songs can be at most ${TRACK_MAX_SECONDS / 60} minutes (this one is ${clock(duration)}). Trim it or upload a radio edit`);
  }

  return { contentType: sniffed, durationSeconds: Math.min(Math.round(duration), TRACK_MAX_SECONDS) };
}
