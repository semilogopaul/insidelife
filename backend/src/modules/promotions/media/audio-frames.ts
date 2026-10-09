/**
 * Counts how long a song really is from its audio frames, independently of any length a header declares (an MP3
 * Xing/Info/VBRI frame or an Ogg granule position can claim anything). Pure byte parsing, no decoding:
 *
 * - MP3: walks every MPEG audio frame header in the file (skipping ID3v2/ID3v1/APE tags) and adds up its samples.
 * - Ogg: walks every page of the single logical stream, rebuilds the packets and adds up their samples — from each
 *   packet's TOC byte for Opus, and from each packet's mode (short or long block, read from the setup header) for
 *   Vorbis.
 *
 * Returns null when the bytes aren't a plain, single-stream file of that kind.
 */

export interface FrameCount {
  /** Seconds of audio counted from the frames/packets. */
  readonly seconds: number;
  /** Seconds the file's own length information claims (Xing/Info/VBRI frame count, or the last granule position); null if none. */
  readonly declaredSeconds: number | null;
}

// ----- MP3 ---------------------------------------------------------------------------------------------------------

const MPEG1_L3_KBPS = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const MPEG2_L3_KBPS = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const SAMPLE_RATES: Readonly<Record<number, readonly number[]>> = { 3: [44_100, 48_000, 32_000], 2: [22_050, 24_000, 16_000], 0: [11_025, 12_000, 8_000] };
/** More non-frame bytes than this share of the file (outside tags) and it isn't a plain MP3. */
const MAX_JUNK_SHARE = 0.05;

interface Mp3Frame {
  readonly length: number;
  readonly samples: number;
  readonly sampleRate: number;
  /** Offset of the side info's end (where a Xing/Info tag would start). */
  readonly tagOffset: number;
}

/** An MPEG Layer III frame header at `at`, or null. */
function mp3FrameAt(buf: Buffer, at: number): Mp3Frame | null {
  if (at + 4 > buf.length) return null;
  const header = buf.readUInt32BE(at);
  if (header >>> 21 !== 0x7ff) return null;
  const version = (header >>> 19) & 3; // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5, 1 = reserved
  const layer = (header >>> 17) & 3; // 1 = Layer III
  const bitrateIndex = (header >>> 12) & 15;
  const rateIndex = (header >>> 10) & 3;
  if (version === 1 || layer !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) return null;
  const mpeg1 = version === 3;
  const kbps = (mpeg1 ? MPEG1_L3_KBPS : MPEG2_L3_KBPS)[bitrateIndex] ?? 0;
  const sampleRate = SAMPLE_RATES[version]?.[rateIndex] ?? 0;
  if (kbps === 0 || sampleRate === 0) return null;
  const padding = (header >>> 9) & 1;
  const length = Math.floor(((mpeg1 ? 144_000 : 72_000) * kbps) / sampleRate) + padding;
  const mono = ((header >>> 6) & 3) === 3;
  const crc = ((header >>> 16) & 1) === 0 ? 2 : 0;
  const sideInfo = mpeg1 ? (mono ? 17 : 32) : mono ? 9 : 17;
  return { length, samples: mpeg1 ? 1152 : 576, sampleRate, tagOffset: at + 4 + crc + sideInfo };
}

const ascii = (buf: Buffer, at: number, text: string): boolean => at + text.length <= buf.length && buf.toString('latin1', at, at + text.length) === text;

/** Bytes taken by an ID3v2 tag at the start (with its footer), or 0. */
function id3v2Length(buf: Buffer): number {
  if (!ascii(buf, 0, 'ID3') || buf.length < 10) return 0;
  const size = ((buf[6] ?? 0) << 21) | ((buf[7] ?? 0) << 14) | ((buf[8] ?? 0) << 7) | (buf[9] ?? 0);
  const footer = ((buf[5] ?? 0) & 0x10) !== 0 ? 10 : 0;
  return 10 + size + footer;
}

/** The frame count a Xing/Info or VBRI header in the first frame declares, or null. */
function declaredFrames(buf: Buffer, at: number, frame: Mp3Frame): number | null {
  if (ascii(buf, frame.tagOffset, 'Xing') || ascii(buf, frame.tagOffset, 'Info')) {
    const flags = frame.tagOffset + 8 <= buf.length ? buf.readUInt32BE(frame.tagOffset + 4) : 0;
    return (flags & 1) !== 0 && frame.tagOffset + 12 <= buf.length ? buf.readUInt32BE(frame.tagOffset + 8) : null;
  }
  const vbri = at + 4 + 32;
  if (ascii(buf, vbri, 'VBRI') && vbri + 18 <= buf.length) return buf.readUInt32BE(vbri + 14);
  return null;
}

export function countMp3(buf: Buffer): FrameCount | null {
  let at = id3v2Length(buf);
  let samples = 0;
  let frames = 0;
  let junk = 0;
  let synced = false;
  let seconds = 0;
  let declared: number | null = null;
  while (at + 4 <= buf.length) {
    const frame = mp3FrameAt(buf, at);
    // After junk (or at the start), only trust a header that is followed by another one (or the end of the file).
    const next = frame ? at + frame.length : 0;
    const confirmed = frame !== null && next <= buf.length && (synced || next === buf.length || mp3FrameAt(buf, next) !== null);
    if (frame && confirmed) {
      if (frames === 0) {
        const tagged = declaredFrames(buf, at, frame);
        if (tagged !== null) {
          // The tag frame itself carries no audio; what it claims is compared with what we count.
          declared = (tagged * frame.samples) / frame.sampleRate;
          at = next;
          frames += 1;
          synced = true;
          continue;
        }
      }
      samples += frame.samples;
      seconds += frame.samples / frame.sampleRate;
      frames += 1;
      at = next;
      synced = true;
      continue;
    }
    if (frame && next > buf.length && synced) break; // a truncated last frame
    synced = false;
    if (ascii(buf, at, 'TAG') && buf.length - at === 128) break; // ID3v1 at the very end
    if (ascii(buf, at, 'APETAGEX') && at + 16 <= buf.length) {
      at += 32 + buf.readUInt32LE(at + 12); // APEv2 header/footer + items (the size excludes the 32-byte footer)
      continue;
    }
    junk += 1;
    at += 1;
  }
  if (samples === 0 || junk > buf.length * MAX_JUNK_SHARE) return null;
  return { seconds, declaredSeconds: declared };
}

// ----- Ogg ---------------------------------------------------------------------------------------------------------

interface OggStream {
  readonly packets: Buffer[];
  /** Largest granule position seen on a page that finished a packet (-1 pages excluded). */
  readonly lastGranule: bigint | null;
}

/** Every page of a single logical stream, reassembled into packets. Null if anything isn't a well-formed page. */
function readOgg(buf: Buffer): OggStream | null {
  const packets: Buffer[] = [];
  let pending: Buffer[] = [];
  let serial: number | null = null;
  let lastGranule: bigint | null = null;
  let at = 0;
  while (at < buf.length) {
    if (!ascii(buf, at, 'OggS') || at + 27 > buf.length || buf[at + 4] !== 0) return null;
    const type = buf[at + 5] ?? 0;
    const granule = buf.readBigInt64LE(at + 6);
    const pageSerial = buf.readUInt32LE(at + 14);
    const segments = buf[at + 26] ?? 0;
    const tableEnd = at + 27 + segments;
    if (tableEnd > buf.length) return null;
    if (serial === null) {
      if ((type & 0x02) === 0) return null; // the first page must begin the stream
      serial = pageSerial;
    } else if (pageSerial !== serial || (type & 0x02) !== 0) {
      return null; // a second stream (multiplexed or chained): not a plain song
    }
    let data = tableEnd;
    for (let i = 0; i < segments; i++) {
      const lacing = buf[at + 27 + i] ?? 0;
      if (data + lacing > buf.length) return null;
      pending.push(buf.subarray(data, data + lacing));
      data += lacing;
      if (lacing < 255) {
        packets.push(Buffer.concat(pending));
        pending = [];
      }
    }
    if (granule !== -1n) {
      if (lastGranule !== null && granule < lastGranule) return null; // granules never go backwards
      lastGranule = granule;
    }
    at = data;
  }
  return serial === null ? null : { packets, lastGranule };
}

/** Samples in one Opus packet at 48 kHz, from its TOC byte (RFC 6716 §3.1). */
function opusPacketSamples(packet: Buffer): number {
  if (packet.length === 0) return 0;
  const toc = packet[0] ?? 0;
  const config = toc >> 3;
  let frameSamples: number;
  if (config < 12) frameSamples = [480, 960, 1920, 2880][config % 4] ?? 0;
  else if (config < 16) frameSamples = config % 2 === 0 ? 480 : 960;
  else frameSamples = [120, 240, 480, 960][config % 4] ?? 0;
  const code = toc & 3;
  const frames = code === 0 ? 1 : code === 3 ? (packet[1] ?? 0) & 0x3f : 2;
  return frames * frameSamples;
}

/** Reads bits backwards (from the last bit of `buf` towards the first), the way Vorbis setup headers are parsed from their end. */
class ReverseBits {
  private position: number;

  constructor(private readonly buf: Buffer) {
    this.position = buf.length * 8 - 1;
  }

  get left(): number {
    return this.position + 1;
  }

  get offset(): number {
    return this.position;
  }

  seek(position: number): void {
    this.position = position;
  }

  bit(): number {
    const byte = this.buf[this.position >> 3] ?? 0;
    const value = (byte >> (this.position & 7)) & 1;
    this.position -= 1;
    return value;
  }

  bits(count: number): number {
    let value = 0;
    for (let i = 0; i < count; i++) value = (value << 1) | this.bit();
    return value;
  }
}

/**
 * The block flag of each mode, read backwards from the end of a Vorbis setup header (the same approach as liboggz and
 * FFmpeg: the modes are the last thing in it, each `blockflag(1) windowtype(16)=0 transformtype(16)=0 mapping(8)`,
 * then a framing bit). Null if no consistent mode section is found.
 */
function vorbisModeBlockFlags(setup: Buffer): boolean[] | null {
  const reader = new ReverseBits(setup);
  let framing = -1;
  while (reader.left > 97) {
    if (reader.bit() === 1) {
      framing = reader.offset;
      break;
    }
  }
  if (framing < 0) return null;
  let modes = 0;
  let found = 0;
  while (reader.left >= 97) {
    if (reader.bits(8) > 63 || reader.bits(16) !== 0 || reader.bits(16) !== 0) break;
    reader.bit();
    modes += 1;
    if (modes > 64) break;
    const mark = reader.offset;
    if (reader.bits(6) + 1 === modes) found = modes;
    reader.seek(mark);
  }
  if (found === 0) return null;
  reader.seek(framing);
  const flags: boolean[] = Array.from({ length: found }, () => false);
  for (let mode = found - 1; mode >= 0; mode--) {
    reader.bits(40);
    flags[mode] = reader.bit() === 1;
  }
  return flags;
}

const ilog = (value: number): number => (value <= 0 ? 0 : Math.floor(Math.log2(value)) + 1);

function countVorbis(stream: OggStream): FrameCount | null {
  const [id, , setup, ...audio] = stream.packets;
  if (!id || !setup || id.length < 30 || !ascii(id, 1, 'vorbis') || !ascii(setup, 0, '\x05vorbis')) return null;
  const rate = id.readUInt32LE(12);
  const sizes = id[28] ?? 0;
  const shortBlock = 1 << (sizes & 0x0f);
  const longBlock = 1 << (sizes >> 4);
  const flags = vorbisModeBlockFlags(setup);
  if (rate === 0 || !flags) return null;
  const modeBits = ilog(flags.length - 1);
  let samples = 0;
  let previous: number | null = null;
  for (const packet of audio) {
    if (packet.length === 0 || ((packet[0] ?? 0) & 1) !== 0) continue; // empty, or not an audio packet
    let mode = 0;
    for (let bit = 0; bit < modeBits; bit++) mode |= (((packet[(bit + 1) >> 3] ?? 0) >> ((bit + 1) & 7)) & 1) << bit;
    if (mode >= flags.length) return null;
    const block = flags[mode] ? longBlock : shortBlock;
    if (previous !== null) samples += previous / 4 + block / 4;
    previous = block;
  }
  return { seconds: samples / rate, declaredSeconds: stream.lastGranule === null ? null : Number(stream.lastGranule) / rate };
}

function countOpus(stream: OggStream): FrameCount | null {
  const [head, tags, ...audio] = stream.packets;
  if (!head || !tags || head.length < 19 || !ascii(head, 0, 'OpusHead') || !ascii(tags, 0, 'OpusTags')) return null;
  const preSkip = head.readUInt16LE(10);
  const samples = audio.reduce((sum, packet) => sum + opusPacketSamples(packet), 0);
  const declared = stream.lastGranule === null ? null : Math.max(0, Number(stream.lastGranule) - preSkip) / 48_000;
  return { seconds: Math.max(0, samples - preSkip) / 48_000, declaredSeconds: declared };
}

export function countOgg(buf: Buffer): FrameCount | null {
  const stream = readOgg(buf);
  const first = stream?.packets[0];
  if (!stream || !first) return null;
  if (ascii(first, 0, 'OpusHead')) return countOpus(stream);
  if (ascii(first, 1, 'vorbis')) return countVorbis(stream);
  return null;
}
