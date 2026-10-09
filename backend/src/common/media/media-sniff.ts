import type { ChatVoiceType, CreativeSourceType, TrackContentType } from '@insidelife/shared';

/**
 * Identify uploads by their leading bytes. The declared Content-Type and file name are attacker-controlled and are
 * never trusted; anything that isn't one of these signatures is refused before a decoder ever sees it.
 */
export type SniffedMedia = CreativeSourceType | TrackContentType | ChatVoiceType;

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const JPEG = [0xff, 0xd8, 0xff] as const;
const RIFF = [0x52, 0x49, 0x46, 0x46] as const; // "RIFF"
const WEBP = [0x57, 0x45, 0x42, 0x50] as const; // "WEBP"
const OGG = [0x4f, 0x67, 0x67, 0x53] as const; // "OggS"
const ID3 = [0x49, 0x44, 0x33] as const; // "ID3"
const EBML = [0x1a, 0x45, 0xdf, 0xa3] as const; // Matroska/WebM
const FTYP = [0x66, 0x74, 0x79, 0x70] as const; // "ftyp" (ISO BMFF / MP4, at offset 4)

function hasBytes(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((value, index) => bytes[offset + index] === value);
}

/** MPEG-1/2/2.5 Layer III frame header (an MP3 without an ID3 tag). Rejects ADTS/AAC and reserved values. */
function isMp3FrameHeader(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  const [b0 = 0, b1 = 0, b2 = 0] = bytes;
  if (b0 !== 0xff || (b1 & 0xe0) !== 0xe0) return false;
  const version = (b1 >> 3) & 0x03; // 01 = reserved
  const layer = (b1 >> 1) & 0x03; // 01 = Layer III
  const bitrate = (b2 >> 4) & 0x0f; // 1111 = bad
  const sampleRate = (b2 >> 2) & 0x03; // 11 = reserved
  return version !== 0x01 && layer === 0x01 && bitrate !== 0x0f && sampleRate !== 0x03;
}

/** ID3v2 header: "ID3", major version 2-4, revision < 0xFF, then four sync-safe size bytes (high bit clear). */
function isId3Header(bytes: Uint8Array): boolean {
  if (!hasBytes(bytes, ID3) || bytes.length < 10) return false;
  const major = bytes[3] ?? 0;
  const revision = bytes[4] ?? 0xff;
  const sizeBytes = [bytes[6] ?? 0x80, bytes[7] ?? 0x80, bytes[8] ?? 0x80, bytes[9] ?? 0x80];
  return major >= 2 && major <= 4 && revision !== 0xff && sizeBytes.every((value) => value < 0x80);
}

export function sniffMedia(bytes: Uint8Array): SniffedMedia | null {
  if (hasBytes(bytes, PNG)) return 'image/png';
  if (hasBytes(bytes, JPEG)) return 'image/jpeg';
  if (hasBytes(bytes, RIFF) && hasBytes(bytes, WEBP, 8)) return 'image/webp';
  if (hasBytes(bytes, OGG)) return 'audio/ogg';
  if (isId3Header(bytes) || isMp3FrameHeader(bytes)) return 'audio/mpeg';
  if (hasBytes(bytes, EBML)) return 'audio/webm';
  if (hasBytes(bytes, FTYP, 4)) return 'audio/mp4';
  return null;
}

export function isCreativeSource(type: SniffedMedia | null): type is CreativeSourceType {
  return type === 'image/png' || type === 'image/jpeg' || type === 'image/webp';
}

export function isTrackType(type: SniffedMedia | null): type is TrackContentType {
  return type === 'audio/mpeg' || type === 'audio/ogg';
}

/** Voice-note recordings: what browsers' MediaRecorder produces (WebM/Opus, Ogg/Opus, MP4/AAC on Safari). */
export function isChatVoiceType(type: SniffedMedia | null): type is ChatVoiceType {
  return type === 'audio/webm' || type === 'audio/ogg' || type === 'audio/mp4';
}
