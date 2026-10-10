import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClubDj, type ClubDjDeps } from '../services/club/club-dj';
import type { ClubSchedule } from '../services/club/club-rotation';
import type { AudioResources } from '../services/engine/resources';
import type { NowPlayingTrack, ScheduledClubTrack } from '../types/audio';

/** A media element that "loads" at once and records what the DJ asks of it. */
class FakeAudio extends EventTarget {
  static created: FakeAudio[] = [];
  src = '';
  currentTime = 0;
  paused = true;
  volume = 1;
  crossOrigin: string | null = null;
  preload = 'none';
  constructor() {
    super();
    FakeAudio.created.push(this);
  }
  load(): void {
    if (this.src) queueMicrotask(() => this.dispatchEvent(new Event('canplay')));
  }
  play(): Promise<void> {
    this.paused = false;
    return Promise.resolve();
  }
  pause(): void {
    this.paused = true;
  }
  removeAttribute(name: string): void {
    if (name === 'src') this.src = '';
  }
}

const param = () => ({ value: 0, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() });
const node = () => ({ connect: (next: unknown) => next, gain: param() });

let now = 0;
const START = 10_000_000;
const song = (slotIndex: number, startsAtMs: number, durationSeconds = 120): ScheduledClubTrack => ({
  slotIndex,
  startsAtMs,
  durationSeconds,
  trackId: `t${slotIndex}`,
  url: `/media/t${slotIndex}.mp3`,
  artist: 'Ayo',
  title: `Song ${slotIndex}`,
});

function dj(plays: ScheduledClubTrack[]) {
  const nowPlaying: (NowPlayingTrack | null)[] = [];
  const groove: boolean[] = [];
  const schedule: ClubSchedule = { venueId: 'quilox', plays, untilMs: START + 20 * 60_000 };
  const deps: ClubDjDeps = {
    ctx: { currentTime: 0, createMediaElementSource: () => node() } as unknown as AudioContext,
    res: { track: (value: unknown) => value, gain: () => node(), release: vi.fn() } as unknown as AudioResources,
    output: node() as unknown as AudioNode,
    fetchSchedule: async () => schedule,
    serverNow: () => now,
    onNowPlaying: (track) => nowPlaying.push(track),
    setGrooveActive: (active) => groove.push(active),
    fallbackVolume: () => 0.5,
  };
  return { dj: new ClubDj(deps), nowPlaying, groove };
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe('ClubDj follows the published schedule', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('Audio', FakeAudio);
    FakeAudio.created = [];
    now = START;
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('keeps game music when nothing is booked', async () => {
    const { dj: player, nowPlaying } = dj([]);
    player.enter('quilox');
    await flush();
    expect(FakeAudio.created).toHaveLength(0);
    expect(nowPlaying).toEqual([]);
  });

  it('joins a song mid-way when you walk in, at the right position', async () => {
    const { dj: player, nowPlaying, groove } = dj([song(1, START - 45_000)]);
    player.enter('quilox');
    await flush();
    await vi.advanceTimersByTimeAsync(0);
    const element = FakeAudio.created[0];
    expect(element?.src).toBe('/media/t1.mp3');
    expect(element?.currentTime).toBeCloseTo(45, 0);
    expect(element?.paused).toBe(false);
    expect(nowPlaying.at(-1)).toMatchObject({ trackId: 't1', venueId: 'quilox' });
    expect(groove).toContain(false);
  });

  it('starts the next song exactly at its time, plays it in full, then hands back to game music', async () => {
    const { dj: player, nowPlaying, groove } = dj([song(2, START + 60_000, 90)]);
    player.enter('quilox');
    await flush();
    // Nothing yet; the file is fetched shortly before the slot, played on the dot.
    await vi.advanceTimersByTimeAsync(50_000);
    expect(nowPlaying).toEqual([]);
    now = START + 52_000;
    await vi.advanceTimersByTimeAsync(2_500);
    const element = FakeAudio.created[0];
    expect(element?.src).toBe('/media/t2.mp3');
    expect(element?.paused).toBe(true);
    now = START + 60_000;
    await vi.advanceTimersByTimeAsync(8_000);
    expect(element?.paused).toBe(false);
    expect(nowPlaying.at(-1)).toMatchObject({ trackId: 't2' });
    // 90 s later it ends and the groove comes back.
    now = START + 60_000 + 90_500;
    await vi.advanceTimersByTimeAsync(91_000);
    expect(nowPlaying.at(-1)).toBeNull();
    expect(groove.at(-1)).toBe(true);
  });

  it('doesn’t start a song whose time is almost up', async () => {
    const { dj: player } = dj([song(3, START - 119_500, 120)]);
    player.enter('quilox');
    await flush();
    expect(FakeAudio.created).toHaveLength(0);
  });
});
