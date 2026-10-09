import sharp from 'sharp';
import { BILLBOARD_FORMAT_SPECS, findAdSlot, PROMOTION_UPLOAD_FIELD, type CreativeDto } from '@insidelife/shared';
import { ok, type Player } from './players.js';

/** A PNG at the exact size a slot's format needs. */
export async function creativeFor(slotId: string, colour = '#1f8a4c'): Promise<Buffer> {
  const slot = findAdSlot(slotId);
  if (!slot) throw new RangeError(`Unknown slot ${slotId}`);
  const spec = BILLBOARD_FORMAT_SPECS[slot.format];
  return sharp({ create: { width: spec.width, height: spec.height, channels: 3, background: colour } }).png().toBuffer();
}

/** Upload an ad image for a slot through the API (multipart, like the phone app). */
export async function uploadCreative(player: Player, slotId: string): Promise<CreativeDto> {
  const image = await creativeFor(slotId);
  return ok<CreativeDto>(await player.post('/promotions/creatives').field('slotId', slotId).attach(PROMOTION_UPLOAD_FIELD, image, { filename: 'ad.png', contentType: 'image/png' }));
}

/**
 * MPEG-1 Layer III, 128 kbps, 44.1 kHz frames (417 bytes, 1152 samples each, silent payload): a valid MP3 that
 * players and parsers read as `seconds` long.
 */
const FRAME_HEADER = [0xff, 0xfb, 0x90, 0x64];
const framesFor = (seconds: number): number => Math.ceil((seconds * 44_100) / 1_152);

export function synthMp3(seconds: number): Buffer {
  const frame = Buffer.alloc(417);
  frame.set(FRAME_HEADER);
  return Buffer.concat(Array.from({ length: framesFor(seconds) }, () => frame));
}

/**
 * A forged MP3: `actualSeconds` of audio frames behind a Xing header that claims `claimedSeconds` (what a tampered
 * file would do to sneak a long track under the limit).
 */
export function forgedMp3(actualSeconds: number, claimedSeconds: number): Buffer {
  const tag = Buffer.alloc(417);
  tag.set(FRAME_HEADER);
  tag.write('Xing', 36, 'latin1');
  tag.writeUInt32BE(1, 40); // flags: frame count present
  tag.writeUInt32BE(framesFor(claimedSeconds), 44);
  return Buffer.concat([tag, synthMp3(actualSeconds)]);
}

/** An honest MP3 with a Xing header that tells the truth. */
export function taggedMp3(seconds: number): Buffer {
  return forgedMp3(seconds, seconds);
}

export async function uploadTrack(player: Player, audio: Buffer, title = 'Lagos Vibes') {
  return player
    .post('/promotions/tracks')
    .field('artistName', 'DJ Test')
    .field('title', title)
    .attach(PROMOTION_UPLOAD_FIELD, audio, { filename: 'song.mp3', contentType: 'audio/mpeg' });
}
