/**
 * Voice-note length straight from the media timestamps. Browsers' MediaRecorder writes live-streaming files: WebM
 * without a Duration element and fragmented MP4 whose header duration is ~0, so container metadata can't be trusted
 * for the 90-second limit. These readers walk the file once and return the end of the last timestamp (ms), or null
 * when the file isn't a structure they understand (the upload is then refused).
 */

// ── WebM / Matroska (EBML) ─────────────────────────────────────────────────────────────────────────────────────────

const EBML_HEADER = 0x1a45dfa3;
const SEGMENT = 0x18538067;
const INFO = 0x1549a966;
const TIMECODE_SCALE = 0x2ad7b1;
const CLUSTER = 0x1f43b675;
const CLUSTER_TIMECODE = 0xe7;
const BLOCK_GROUP = 0xa0;
const BLOCK = 0xa1;
const SIMPLE_BLOCK = 0xa3;
/** Masters we step into instead of skipping (Segment and Cluster are often "unknown size" when streamed). */
const DESCEND: ReadonlySet<number> = new Set([SEGMENT, INFO, CLUSTER, BLOCK_GROUP]);
/** An Opus/AAC frame is ~20 ms; the last block's start plus one frame approximates the end. */
const LAST_FRAME_MS = 20;

interface Vint {
  readonly value: number;
  readonly length: number;
  readonly unknown: boolean;
}

function readVint(bytes: Uint8Array, pos: number, keepMarker: boolean): Vint | null {
  const first = bytes[pos];
  if (first === undefined || first === 0) return null;
  let length = 1;
  while (length <= 8 && (first & (0x80 >> (length - 1))) === 0) length++;
  if (length > 8 || pos + length > bytes.length) return null;
  let value = keepMarker ? first : first & (0xff >> length);
  let allOnes = value === 0xff >> length;
  for (let i = 1; i < length; i++) {
    const byte = bytes[pos + i] ?? 0;
    value = value * 256 + byte;
    allOnes &&= byte === 0xff;
  }
  return { value, length, unknown: !keepMarker && allOnes };
}

function readUint(bytes: Uint8Array, start: number, size: number): number {
  let value = 0;
  for (let i = 0; i < size; i++) value = value * 256 + (bytes[start + i] ?? 0);
  return value;
}

export function webmDurationMs(bytes: Uint8Array): number | null {
  if (readUint(bytes, 0, 4) !== EBML_HEADER) return null;
  let pos = 0;
  let scaleNs = 1_000_000;
  let clusterTicks = 0;
  let endMs = -1;
  while (pos < bytes.length) {
    const id = readVint(bytes, pos, true);
    if (!id) return null;
    const size = readVint(bytes, pos + id.length, false);
    if (!size) return null;
    const dataStart = pos + id.length + size.length;
    if (DESCEND.has(id.value)) {
      pos = dataStart;
      continue;
    }
    if (size.unknown || dataStart + size.value > bytes.length) {
      // A truncated final element (the recorder stopped mid-write) ends the scan; anything else is malformed.
      if (dataStart + size.value > bytes.length && !size.unknown) break;
      return null;
    }
    if (id.value === TIMECODE_SCALE) scaleNs = readUint(bytes, dataStart, size.value);
    else if (id.value === CLUSTER_TIMECODE) clusterTicks = readUint(bytes, dataStart, size.value);
    else if (id.value === SIMPLE_BLOCK || id.value === BLOCK) {
      const track = readVint(bytes, dataStart, false);
      if (!track) return null;
      const raw = readUint(bytes, dataStart + track.length, 2);
      const relative = raw >= 0x8000 ? raw - 0x10000 : raw;
      endMs = Math.max(endMs, ((clusterTicks + relative) * scaleNs) / 1_000_000);
    }
    pos = dataStart + size.value;
  }
  return endMs < 0 ? null : Math.round(endMs + LAST_FRAME_MS);
}

// ── MP4 / ISO BMFF (plain or fragmented) ─────────────────────────────────────────────────────────────────────────

const MP4_CONTAINERS: ReadonlySet<string> = new Set(['moov', 'trak', 'mdia', 'mvex', 'moof', 'traf']);

interface Mp4Scan {
  timescale: number;
  headerDuration: number;
  trexDuration: number;
  fragmentEnd: number;
  sawFragments: boolean;
  /** Per-traf state. */
  baseTime: number;
  tfhdDuration: number;
}

const view = (bytes: Uint8Array): DataView => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

function readBig(data: DataView, offset: number): number {
  return data.getUint32(offset) * 2 ** 32 + data.getUint32(offset + 4);
}

function walkBoxes(bytes: Uint8Array, data: DataView, start: number, end: number, scan: Mp4Scan): boolean {
  let pos = start;
  while (pos + 8 <= end) {
    let size = data.getUint32(pos);
    const type = String.fromCharCode(
      bytes[pos + 4] ?? 0,
      bytes[pos + 5] ?? 0,
      bytes[pos + 6] ?? 0,
      bytes[pos + 7] ?? 0,
    );
    let header = 8;
    if (size === 1) {
      if (pos + 16 > end) return false;
      size = readBig(data, pos + 8);
      header = 16;
    } else if (size === 0) size = end - pos;
    if (size < header || pos + size > end) return false;
    const body = pos + header;
    if (MP4_CONTAINERS.has(type)) {
      if (type === 'traf') {
        scan.baseTime = 0;
        scan.tfhdDuration = 0;
      }
      if (!walkBoxes(bytes, data, body, pos + size, scan)) return false;
    } else if (!readLeaf(type, data, body, pos + size, scan)) return false;
    pos += size;
  }
  return true;
}

function readLeaf(type: string, data: DataView, body: number, end: number, scan: Mp4Scan): boolean {
  const need = (bytes: number): boolean => body + bytes <= end;
  if (type === 'mdhd') {
    const version = data.getUint8(body);
    if (!need(version === 1 ? 32 : 20)) return false;
    scan.timescale = data.getUint32(body + (version === 1 ? 20 : 12));
    scan.headerDuration = version === 1 ? readBig(data, body + 24) : data.getUint32(body + 16);
  } else if (type === 'trex') {
    if (!need(16)) return false;
    scan.trexDuration = data.getUint32(body + 12);
  } else if (type === 'tfhd') {
    if (!need(8)) return false;
    const flags = data.getUint32(body) & 0xffffff;
    let offset = body + 8;
    if (flags & 0x1) offset += 8;
    if (flags & 0x2) offset += 4;
    if (flags & 0x8) {
      if (offset + 4 > end) return false;
      scan.tfhdDuration = data.getUint32(offset);
    }
  } else if (type === 'tfdt') {
    const version = data.getUint8(body);
    if (!need(version === 1 ? 12 : 8)) return false;
    scan.baseTime = version === 1 ? readBig(data, body + 4) : data.getUint32(body + 4);
  } else if (type === 'trun') {
    if (!need(8)) return false;
    const flags = data.getUint32(body) & 0xffffff;
    const count = data.getUint32(body + 4);
    let offset = body + 8 + (flags & 0x1 ? 4 : 0) + (flags & 0x4 ? 4 : 0);
    const fieldBytes = [0x100, 0x200, 0x400, 0x800].filter((flag) => flags & flag).length * 4;
    if (offset + count * fieldBytes > end) return false;
    let total = 0;
    for (let i = 0; i < count; i++) {
      total += flags & 0x100 ? data.getUint32(offset) : scan.tfhdDuration || scan.trexDuration;
      offset += fieldBytes;
    }
    scan.sawFragments = true;
    scan.fragmentEnd = Math.max(scan.fragmentEnd, scan.baseTime + total);
    scan.baseTime += total;
  }
  return true;
}

export function mp4DurationMs(bytes: Uint8Array): number | null {
  if (bytes.length < 8 || String.fromCharCode(...bytes.subarray(4, 8)) !== 'ftyp') return null;
  const scan: Mp4Scan = {
    timescale: 0,
    headerDuration: 0,
    trexDuration: 0,
    fragmentEnd: 0,
    sawFragments: false,
    baseTime: 0,
    tfhdDuration: 0,
  };
  if (!walkBoxes(bytes, view(bytes), 0, bytes.length, scan) || scan.timescale <= 0) return null;
  const ticks = scan.sawFragments ? scan.fragmentEnd : scan.headerDuration;
  return ticks > 0 ? Math.round((ticks / scan.timescale) * 1000) : null;
}
