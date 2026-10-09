import sharp from 'sharp';
import { BILLBOARD_FORMAT_SPECS } from '@insidelife/shared';
import { InvalidMediaException } from '../promotions.errors.js';
import { countMp3, countOgg } from './audio-frames.js';
import { inspectTrack } from './audio-inspector.js';
import { renderCreative } from './image-processor.js';

const landscape = BILLBOARD_FORMAT_SPECS.landscape;

/** MPEG-1 Layer III, 128 kbps, 44.1 kHz, no CRC/padding: 417-byte frames of 1152 samples (silent payload). */
const framesFor = (seconds: number): number => Math.ceil((seconds * 44_100) / 1_152);

function synthMp3(seconds: number): Buffer {
  const frame = Buffer.alloc(417);
  frame.set([0xff, 0xfb, 0x90, 0x64]);
  return Buffer.concat(Array.from({ length: framesFor(seconds) }, () => frame));
}

/** A Xing tag frame declaring `frames` audio frames (joint stereo: the tag sits after 32 bytes of side info). */
function xingFrame(frames: number): Buffer {
  const frame = Buffer.alloc(417);
  frame.set([0xff, 0xfb, 0x90, 0x64]);
  frame.write('Xing', 36, 'latin1');
  frame.writeUInt32BE(1, 40); // flags: frame count present
  frame.writeUInt32BE(frames, 44);
  return frame;
}

/** One Ogg page (CRC left at 0: neither our counter nor the parser checks it). */
function oggPage(serial: number, sequence: number, granule: bigint, packets: readonly Buffer[], flags: number): Buffer {
  const lacing: number[] = [];
  for (const packet of packets) {
    let size = packet.length;
    while (size >= 255) {
      lacing.push(255);
      size -= 255;
    }
    lacing.push(size);
  }
  const header = Buffer.alloc(27);
  header.write('OggS', 0, 'latin1');
  header[5] = flags;
  header.writeBigInt64LE(granule, 6);
  header.writeUInt32LE(serial, 14);
  header.writeUInt32LE(sequence, 18);
  header[26] = lacing.length;
  return Buffer.concat([header, Buffer.from(lacing), ...packets]);
}

/** Pages of `perPage` audio packets after the header packets, granules scaled by `declaredShare` (1 = honest). */
function oggStream(serial: number, headers: readonly Buffer[], audio: readonly Buffer[], samplesBefore: (index: number) => number, declaredShare: number): Buffer {
  const pages = [oggPage(serial, 0, 0n, [headers[0]!], 0x02), oggPage(serial, 1, 0n, headers.slice(1), 0)];
  const perPage = 50;
  for (let start = 0; start < audio.length; start += perPage) {
    const end = Math.min(audio.length, start + perPage);
    const granule = BigInt(Math.round(samplesBefore(end) * declaredShare));
    pages.push(oggPage(serial, pages.length, granule, audio.slice(start, end), end === audio.length ? 0x04 : 0));
  }
  return Buffer.concat(pages);
}

const PRE_SKIP = 312;

/** Opus at 48 kHz: CELT 20 ms frames (TOC config 31, one frame per packet = 960 samples). */
function synthOpus(seconds: number, declaredSeconds = seconds, serial = 0x1234): Buffer {
  const head = Buffer.alloc(19);
  head.write('OpusHead', 0, 'latin1');
  head[8] = 1;
  head[9] = 2;
  head.writeUInt16LE(PRE_SKIP, 10);
  head.writeUInt32LE(48_000, 12);
  const vendor = Buffer.from('test');
  const tags = Buffer.concat([Buffer.from('OpusTags', 'latin1'), Buffer.from([vendor.length, 0, 0, 0]), vendor, Buffer.alloc(4)]);
  const packets = Math.ceil((seconds * 48_000 + PRE_SKIP) / 960);
  const audio = Array.from({ length: packets }, () => Buffer.from([31 << 3, 0xfc, 0xff]));
  return oggStream(serial, [head, tags], audio, (count) => PRE_SKIP + (count * 960 - PRE_SKIP) * (declaredSeconds / seconds), 1);
}

/** LSB-first bit writer (Vorbis packing). */
function vorbisBits(fields: ReadonlyArray<readonly [value: number, bits: number]>): Buffer {
  const bytes: number[] = [];
  let position = 0;
  for (const [value, width] of fields) {
    for (let bit = 0; bit < width; bit++) {
      const index = position >> 3;
      bytes[index] = (bytes[index] ?? 0) | (((value >> bit) & 1) << (position & 7));
      position += 1;
    }
  }
  return Buffer.from(bytes.map((byte) => byte ?? 0));
}

/** Vorbis, 44.1 kHz, blocks 256/2048, two modes (short, long), `packets` long-block audio packets. */
function synthVorbis(packets: number, declaredShare = 1): Buffer {
  const id = Buffer.alloc(30);
  id[0] = 1;
  id.write('vorbis', 1, 'latin1');
  id[11] = 2;
  id.writeUInt32LE(44_100, 12);
  id.writeInt32LE(128_000, 20);
  id[28] = (11 << 4) | 8;
  id[29] = 1;
  const vendor = Buffer.from('test');
  const comments = Buffer.concat([Buffer.from('\x03vorbis', 'latin1'), Buffer.from([vendor.length, 0, 0, 0]), vendor, Buffer.alloc(4), Buffer.from([1])]);
  const modes = vorbisBits([
    [1, 6], // mode count - 1
    [0, 1], [0, 16], [0, 16], [0, 8], // mode 0: short block
    [1, 1], [0, 16], [0, 16], [0, 8], // mode 1: long block
    [1, 1], // framing
  ]);
  const setup = Buffer.concat([Buffer.from('\x05vorbis', 'latin1'), Buffer.alloc(8, 0xff), modes]);
  const audio = Array.from({ length: packets }, () => Buffer.from([0b10, 0xab, 0xcd]));
  return oggStream(0x5678, [id, comments, setup], audio, (count) => Math.max(0, count - 1) * 1_024, declaredShare);
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

  it('refuses songs that are too short, or longer than 3 minutes (measured from the frames)', async () => {
    await expect(inspectTrack(synthMp3(5), 'audio/mpeg')).rejects.toThrow(/at least 30 seconds/);
    await expect(inspectTrack(synthMp3(3 * 60 + 3), 'audio/mpeg')).rejects.toThrow(/at most 3 minutes \(this one is 3:03\)/);
    await expect(inspectTrack(synthMp3(3 * 60), 'audio/mpeg')).resolves.toEqual({ contentType: 'audio/mpeg', durationSeconds: 180 });
    await expect(inspectTrack(synthMp3(2 * 60 + 58), 'audio/mpeg')).resolves.toEqual({ contentType: 'audio/mpeg', durationSeconds: 178 });
  });

  it('counts MP3 frames itself and refuses a Xing header that lies about the length', async () => {
    const honest = Buffer.concat([xingFrame(framesFor(160)), synthMp3(160)]);
    await expect(inspectTrack(honest, 'audio/mpeg')).resolves.toEqual({ contentType: 'audio/mpeg', durationSeconds: 160 });
    // Declares 4 minutes, carries 6: the header says "short enough", the frames say otherwise.
    const forged = Buffer.concat([xingFrame(framesFor(160)), synthMp3(240)]);
    expect(countMp3(forged)).toMatchObject({ declaredSeconds: expect.closeTo(160, 0) });
    expect(countMp3(forged)?.seconds).toBeCloseTo(240, 0);
    await expect(inspectTrack(forged, 'audio/mpeg')).rejects.toThrow(/length information doesn’t match/);
    // Within 5% is fine (encoders round), more is not.
    await expect(inspectTrack(Buffer.concat([xingFrame(framesFor(155)), synthMp3(160)]), 'audio/mpeg')).resolves.toMatchObject({ durationSeconds: 160 });
    await expect(inspectTrack(Buffer.concat([xingFrame(framesFor(130)), synthMp3(160)]), 'audio/mpeg')).rejects.toThrow(/doesn’t match/);
  });

  it('counts Opus packets from their TOC bytes and refuses granule positions that lie', async () => {
    expect(countOgg(synthOpus(160))?.seconds).toBeCloseTo(160, 1);
    await expect(inspectTrack(synthOpus(160), 'audio/ogg')).resolves.toEqual({ contentType: 'audio/ogg', durationSeconds: 160 });
    // Six minutes of packets whose pages claim four.
    const forged = synthOpus(240, 160);
    expect(countOgg(forged)).toMatchObject({ declaredSeconds: expect.closeTo(160, 0) });
    await expect(inspectTrack(forged, 'audio/ogg')).rejects.toThrow(/doesn’t match/);
  });

  it('counts Vorbis packets by block size, from the modes in the setup header', () => {
    // 2048-sample long blocks: every packet after the first adds 1024 samples.
    const counted = countOgg(synthVorbis(10_000));
    expect(counted?.seconds).toBeCloseTo((9_999 * 1_024) / 44_100, 3);
    expect(counted?.declaredSeconds).toBeCloseTo((9_999 * 1_024) / 44_100, 3);
    const forged = countOgg(synthVorbis(10_000, 0.5));
    expect(forged?.declaredSeconds).toBeCloseTo(((9_999 * 1_024) / 44_100) * 0.5, 0);
    expect(forged?.seconds).toBeCloseTo((9_999 * 1_024) / 44_100, 3);
  });

  it('refuses a second (chained) Ogg stream and pages that go backwards', () => {
    const opus = synthOpus(60);
    expect(countOgg(Buffer.concat([opus, synthOpus(60, 60, 0xbeef)]))).toBeNull();
    expect(countOgg(Buffer.concat([opus, Buffer.from('trailing junk')]))).toBeNull();
  });

  it('refuses junk behind a valid-looking signature', async () => {
    const fakeId3 = Buffer.concat([Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]), Buffer.from('not really audio '.repeat(200))]);
    await expect(inspectTrack(fakeId3, 'audio/mpeg')).rejects.toBeInstanceOf(InvalidMediaException);
    const fakeOgg = Buffer.concat([Buffer.from('OggS'), Buffer.alloc(4_000)]);
    await expect(inspectTrack(fakeOgg, 'audio/ogg')).rejects.toBeInstanceOf(InvalidMediaException);
  });
});
