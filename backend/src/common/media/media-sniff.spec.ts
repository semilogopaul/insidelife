import sharp from 'sharp';
import { isCreativeSource, isTrackType, sniffMedia } from './media-sniff.js';

const bytes = (...values: number[]): Uint8Array => Uint8Array.from(values);
const ascii = (text: string): number[] => [...Buffer.from(text, 'latin1')];

describe('sniffMedia', () => {
  it('recognises real images produced by an encoder', async () => {
    const base = sharp({ create: { width: 8, height: 8, channels: 3, background: '#0a8f3c' } });
    expect(sniffMedia(await base.clone().png().toBuffer())).toBe('image/png');
    expect(sniffMedia(await base.clone().jpeg().toBuffer())).toBe('image/jpeg');
    expect(sniffMedia(await base.clone().webp().toBuffer())).toBe('image/webp');
  });

  it('recognises MP3 (ID3 tag or bare frame header) and OGG', () => {
    expect(sniffMedia(bytes(...ascii('ID3'), 0x04, 0x00, 0x00, 0x00, 0x00, 0x22, 0x54))).toBe('audio/mpeg');
    expect(sniffMedia(bytes(0xff, 0xfb, 0x90, 0x64))).toBe('audio/mpeg'); // MPEG-1 Layer III 128 kbps 44.1 kHz
    expect(sniffMedia(bytes(0xff, 0xf3, 0x84, 0xc4))).toBe('audio/mpeg'); // MPEG-2 Layer III
    expect(sniffMedia(bytes(...ascii('OggS'), 0x00, 0x02))).toBe('audio/ogg');
  });

  it('refuses look-alikes and other formats regardless of what the client claims', () => {
    expect(sniffMedia(bytes(0xff, 0xf1, 0x50, 0x80))).toBeNull(); // AAC ADTS, not MP3
    expect(sniffMedia(bytes(0xff, 0xfb, 0xf0, 0x64))).toBeNull(); // "bad" bitrate index
    expect(sniffMedia(bytes(...ascii('ID3'), 0xff, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00))).toBeNull(); // bad ID3 version
    expect(sniffMedia(bytes(...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WAVE')))).toBeNull(); // WAV, not WebP
    expect(sniffMedia(bytes(...ascii('GIF89a')))).toBeNull();
    expect(sniffMedia(bytes(...ascii('<svg xmlns="http://www.w3.org/2000/svg">')))).toBeNull();
    expect(sniffMedia(bytes(...ascii('<!DOCTYPE html><script>alert(1)</script>')))).toBeNull();
    expect(sniffMedia(bytes(0x25, 0x50, 0x44, 0x46))).toBeNull(); // %PDF
    expect(sniffMedia(bytes(0x4d, 0x5a))).toBeNull(); // MZ (Windows executable)
    expect(sniffMedia(bytes(0x89, 0x50, 0x4e))).toBeNull(); // truncated PNG signature
    expect(sniffMedia(new Uint8Array())).toBeNull();
  });

  it('separates images from audio', () => {
    expect(isCreativeSource('image/webp')).toBe(true);
    expect(isCreativeSource('audio/ogg')).toBe(false);
    expect(isTrackType('audio/mpeg')).toBe(true);
    expect(isTrackType('image/png')).toBe(false);
    expect(isTrackType(null)).toBe(false);
  });
});
