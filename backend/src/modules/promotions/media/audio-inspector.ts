import { parseBuffer } from 'music-metadata';
import { TRACK_MAX_SECONDS, TRACK_MIN_SECONDS, type TrackContentType } from '@insidelife/shared';
import { InvalidMediaException } from '../promotions.errors.js';

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

/**
 * Confirm a sniffed MP3/OGG really is playable audio of an acceptable length (30 s to under 5 minutes, measured from
 * the file's own frames/pages, never from what the browser says). The file is stored as-is afterwards,
 * so the parser's view (container, codec, duration, no video) must agree with the magic bytes.
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

  const duration = format.duration ?? Number.NaN;
  if (!Number.isFinite(duration) || duration <= 0) throw new InvalidMediaException('We couldn’t tell how long that song is. Export it again as MP3 or OGG');
  if (duration < TRACK_MIN_SECONDS) throw new InvalidMediaException(`Songs must be at least ${TRACK_MIN_SECONDS} seconds long`);
  if (duration >= TRACK_MAX_SECONDS) {
    throw new InvalidMediaException(`Songs must be under ${TRACK_MAX_SECONDS / 60} minutes (this one is ${clock(duration)}). Trim it or upload a radio edit`);
  }

  return { contentType: sniffed, durationSeconds: Math.min(Math.round(duration), TRACK_MAX_SECONDS - 1) };
}
