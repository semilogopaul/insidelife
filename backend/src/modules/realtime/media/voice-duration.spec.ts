import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mp4DurationMs, webmDurationMs } from './voice-duration.js';

const fixture = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
const u32 = (value: number): number[] => [
  (value >>> 24) & 255,
  (value >>> 16) & 255,
  (value >>> 8) & 255,
  value & 255,
];
const box = (type: string, body: number[]): number[] => [
  ...u32(8 + body.length),
  ...Buffer.from(type, 'latin1'),
  ...body,
];

describe('voice-note duration', () => {
  it('reads a Chrome MediaRecorder WebM (no Duration element, unknown-size clusters)', () => {
    const ms = webmDurationMs(fixture('chrome-3s.webm'));
    expect(ms).not.toBeNull();
    expect(ms).toBeGreaterThan(2_800);
    expect(ms).toBeLessThan(3_600);
  });

  it('reads a Chrome MediaRecorder fragmented MP4 (header duration is ~0)', () => {
    const ms = mp4DurationMs(fixture('chrome-3s.m4a'));
    expect(ms).not.toBeNull();
    expect(ms).toBeGreaterThan(2_800);
    expect(ms).toBeLessThan(3_600);
  });

  it('refuses files that are not what they claim to be', () => {
    expect(webmDurationMs(fixture('chrome-3s.m4a'))).toBeNull();
    expect(mp4DurationMs(fixture('chrome-3s.webm'))).toBeNull();
    expect(webmDurationMs(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x00]))).toBeNull();
    expect(mp4DurationMs(new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0, 0]))).toBeNull();
  });

  it('measures a plain (non-fragmented) MP4 from its media header', () => {
    // ftyp + moov/trak/mdia/mdhd (v0): timescale 48 000, duration 4.5 s.
    const mdhd = box('mdhd', [0, 0, 0, 0, ...u32(0), ...u32(0), ...u32(48_000), ...u32(216_000), 0, 0, 0, 0]);
    const file = [
      ...box('ftyp', [...Buffer.from('M4A ', 'latin1'), 0, 0, 0, 0]),
      ...box('moov', box('trak', box('mdia', mdhd))),
    ];
    expect(mp4DurationMs(Uint8Array.from(file))).toBe(4_500);
  });
});
