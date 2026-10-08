import sharp from 'sharp';
import { BILLBOARD_MIN_UPLOAD_SCALE, type BillboardFormatSpec, type CreativeSourceType } from '@insidelife/shared';
import { InvalidMediaException } from '../promotions.errors.js';

/** Decompression-bomb guard: ~25 MP is far more than any billboard needs. */
const MAX_INPUT_PIXELS = 25_000_000;
const SHARP_FORMAT: Readonly<Record<CreativeSourceType, string>> = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/webp': 'webp' };

// Uploads are one-off; libvips' operation cache would only hold memory.
sharp.cache(false);

export interface RenderedCreative {
  readonly buffer: Buffer;
  readonly width: number;
  readonly height: number;
}

/**
 * Re-encode an upload to the billboard's exact size as WebP: auto-orient, cover-crop on the most interesting region,
 * flatten transparency, drop every byte of metadata. Re-encoding from decoded pixels is also what neutralises
 * polyglot files and payloads hidden in chunks/EXIF.
 */
export async function renderCreative(input: Buffer, sniffed: CreativeSourceType, target: BillboardFormatSpec): Promise<RenderedCreative> {
  const source = sharp(input, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS, animated: false, autoOrient: true });
  let width: number;
  let height: number;
  try {
    const metadata = await source.metadata();
    if (metadata.format !== SHARP_FORMAT[sniffed]) throw new InvalidMediaException('That image file is damaged or not what it says it is');
    width = metadata.autoOrient.width;
    height = metadata.autoOrient.height;
  } catch (error) {
    if (error instanceof InvalidMediaException) throw error;
    throw new InvalidMediaException('We couldn’t read that image. Try exporting it again as PNG or JPEG');
  }

  const minWidth = Math.ceil(target.width * BILLBOARD_MIN_UPLOAD_SCALE);
  const minHeight = Math.ceil(target.height * BILLBOARD_MIN_UPLOAD_SCALE);
  if (width < minWidth || height < minHeight) {
    throw new InvalidMediaException(`Image is too small for this board — upload at least ${minWidth}×${minHeight} (best: ${target.width}×${target.height})`);
  }

  try {
    const buffer = await source
      .resize(target.width, target.height, { fit: 'cover', position: sharp.strategy.attention })
      .flatten({ background: '#ffffff' })
      .webp({ quality: 82, effort: 4, smartSubsample: true })
      .toBuffer();
    return { buffer, width: target.width, height: target.height };
  } catch {
    throw new InvalidMediaException('We couldn’t process that image. Try exporting it again as PNG or JPEG');
  }
}
