import sharp from 'sharp';
import { BILLBOARD_FORMAT_SPECS } from '@insidelife/shared';
import { InvalidMediaException } from '../promotions.errors.js';
import { inspectTrack } from './audio-inspector.js';
import { renderCreative } from './image-processor.js';

const landscape = BILLBOARD_FORMAT_SPECS.landscape;

/** MPEG-1 Layer III, 128 kbps, 44.1 kHz, no CRC/padding: 417-byte frames of 1152 samples (silent payload). */
function synthMp3(seconds: number): Buffer {
  const frames = Math.ceil((seconds * 44_100) / 1_152);
  const frame = Buffer.alloc(417);
  frame.set([0xff, 0xfb, 0x90, 0x64]);
  return Buffer.concat(Array.from({ length: frames }, () => frame));
}

describe('renderCreative', () => {
  it('re-encodes to WebP at the exact slot size and drops metadata', async () => {
    const input = await sharp({ create: { width: 1800, height: 900, channels: 4, background: { r: 10, g: 140, b: 60, alpha: 0.4 } } })
      .png()
      .withMetadata({ exif: { IFD0: { Copyright: 'secret-payload' } } })
      .toBuffer();
    const output = await renderCreative(input, 'image/png', landscape);
    const metadata = await sharp(output.buffer).metadata();
    expect(metadata.format).toBe('webp');
    expect([metadata.width, metadata.height]).toEqual([1500, 500]);
    expect(metadata.exif).toBeUndefined();
    expect(metadata.hasAlpha).toBe(false);
    expect(output.buffer.includes('secret-payload')).toBe(false);
  });

  it('neutralises payloads appended to a valid image (polyglots)', async () => {
    const image = await sharp({ create: { width: 1500, height: 500, channels: 3, background: '#222' } }).jpeg().toBuffer();
    const polyglot = Buffer.concat([image, Buffer.from('<script>alert(document.cookie)</script>')]);
    const output = await renderCreative(polyglot, 'image/jpeg', landscape);
    expect(output.buffer.includes('<script>')).toBe(false);
  });

  it('honours EXIF orientation when checking the size', async () => {
    // Stored 500×1500 but rotated 90° by EXIF → displays as 1500×500.
    const rotated = await sharp({ create: { width: 500, height: 1500, channels: 3, background: '#555' } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    await expect(renderCreative(rotated, 'image/jpeg', landscape)).resolves.toMatchObject({ width: 1500, height: 500 });
  });

  it('refuses images that are too small, corrupt, or not what the bytes claimed', async () => {
    const tiny = await sharp({ create: { width: 400, height: 200, channels: 3, background: '#fff' } }).png().toBuffer();
    await expect(renderCreative(tiny, 'image/png', landscape)).rejects.toThrow(/too small/);
    const png = await sharp({ create: { width: 1500, height: 500, channels: 3, background: '#fff' } }).png().toBuffer();
    await expect(renderCreative(png, 'image/jpeg', landscape)).rejects.toBeInstanceOf(InvalidMediaException);
    const truncated = png.subarray(0, 64);
    await expect(renderCreative(truncated, 'image/png', landscape)).rejects.toBeInstanceOf(InvalidMediaException);
  });
});

describe('inspectTrack', () => {
  it('accepts a real MP3 and measures it', async () => {
    await expect(inspectTrack(synthMp3(35), 'audio/mpeg')).resolves.toEqual({ contentType: 'audio/mpeg', durationSeconds: 35 });
  });

  it('refuses songs that are too short or too long', async () => {
    await expect(inspectTrack(synthMp3(5), 'audio/mpeg')).rejects.toThrow(/at least 30 seconds/);
    await expect(inspectTrack(synthMp3(6 * 60 + 5), 'audio/mpeg')).rejects.toThrow(/at most 6 minutes/);
  });

  it('refuses junk behind a valid-looking signature', async () => {
    const fakeId3 = Buffer.concat([Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]), Buffer.from('not really audio '.repeat(200))]);
    await expect(inspectTrack(fakeId3, 'audio/mpeg')).rejects.toBeInstanceOf(InvalidMediaException);
    const fakeOgg = Buffer.concat([Buffer.from('OggS'), Buffer.alloc(4_000)]);
    await expect(inspectTrack(fakeOgg, 'audio/ogg')).rejects.toBeInstanceOf(InvalidMediaException);
  });
});
