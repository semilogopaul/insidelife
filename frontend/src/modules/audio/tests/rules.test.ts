import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fromDateParts } from '@insidelife/shared';
import { deriveAmbience, hasGridPower, isRushHour, SILENT_AMBIENCE } from '../services/ambience/ambience-state';
import { engineRpm } from '../services/ambience/engine-sound';
import { nextPlayAfter, parseClubSchedule, playAt, safeMediaUrl } from '../services/club/club-rotation';
import { CooldownGate, VariantPicker, VoiceLimiter } from '../services/engine/limits';
import { resolveScene, sceneKey, type SceneInputs } from '../services/scene/audio-scene';
import { AUDIO_ASSETS } from '../services/sfx/audio-assets.generated';
import { assetUrls, busOf, normalisationDb } from '../services/sfx/sample-bank';
import { CORE_SAMPLES, SFX_RECIPES, STINGERS, recipeSamples } from '../services/sfx/sfx-catalog';
import { pickVoice, type VoiceLike } from '../services/voice/voice-guide';

const at = (hour: number, day = 10, month = 3) => fromDateParts({ year: 2028, month, day, hour });

describe('cooldowns and polyphony', () => {
  it('rate-limits per key', () => {
    const gate = new CooldownGate();
    expect(gate.tryAcquire('ui-click', 0, 35)).toBe(true);
    expect(gate.tryAcquire('ui-click', 20, 35)).toBe(false);
    expect(gate.tryAcquire('horn', 20, 140)).toBe(true);
    expect(gate.tryAcquire('ui-click', 36, 35)).toBe(true);
  });

  it('checks groups atomically (a rejected group does not consume the id)', () => {
    const gate = new CooldownGate();
    expect(gate.tryAcquireAll([['celebration', 1500], ['group:stinger', 1200]], 0)).toBe(true);
    expect(gate.tryAcquireAll([['level-up', 1500], ['group:stinger', 1200]], 500)).toBe(false);
    expect(gate.tryAcquireAll([['level-up', 1500], ['group:stinger', 1200]], 1300)).toBe(true);
  });

  it('caps concurrent voices until they end', () => {
    const limiter = new VoiceLimiter(2);
    expect(limiter.tryStart(0, 1)).toBe(true);
    expect(limiter.tryStart(0.1, 1)).toBe(true);
    expect(limiter.tryStart(0.2, 1)).toBe(false);
    expect(limiter.active(1.05)).toBe(1);
    expect(limiter.tryStart(1.05, 1)).toBe(true);
  });

  it('never repeats a variant twice in a row', () => {
    const picker = new VariantPicker();
    let seed = 1;
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    let previous = -1;
    for (let i = 0; i < 200; i++) {
      const index = picker.pick('steps', 5, random);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(5);
      expect(index).not.toBe(previous);
      previous = index;
    }
    expect(picker.pick('single', 1, random)).toBe(0);
  });
});

describe('sfx catalog', () => {
  it('only references shipped assets, and every asset file exists', () => {
    const keys = recipeSamples([...Object.values(SFX_RECIPES), ...Object.values(STINGERS)]);
    for (const key of [...keys, ...CORE_SAMPLES]) expect(AUDIO_ASSETS[key]).toBeDefined();
    const publicDir = join(process.cwd(), 'public');
    for (const key of Object.keys(AUDIO_ASSETS) as Array<keyof typeof AUDIO_ASSETS>) {
      for (const url of assetUrls(key)) expect(existsSync(join(publicDir, url))).toBe(true);
    }
  });

  it('ships no unused assets', () => {
    const used = new Set(recipeSamples([...Object.values(SFX_RECIPES), ...Object.values(STINGERS)]));
    for (const key of Object.keys(AUDIO_ASSETS)) expect(used.has(key as keyof typeof AUDIO_ASSETS)).toBe(true);
  });

  it('routes samples to buses and loudness-matches within limits', () => {
    expect(busOf('ui/click-1')).toBe('ui');
    expect(busOf('money/coins-1')).toBe('ui');
    expect(busOf('world/step-wood-1')).toBe('sfx');
    for (const key of Object.keys(AUDIO_ASSETS) as Array<keyof typeof AUDIO_ASSETS>) {
      const db = normalisationDb(key);
      expect(db).toBeGreaterThanOrEqual(-10);
      expect(db).toBeLessThanOrEqual(6);
    }
  });

  it('keeps immediate-feedback sounds short and rate-limited', () => {
    for (const id of ['ui-click', 'ui-open', 'ui-close', 'footstep'] as const) {
      expect(SFX_RECIPES[id].cooldownMs).toBeLessThanOrEqual(120);
    }
    expect(SFX_RECIPES.celebration.group?.id).toBe(STINGERS.milestone.group.id);
  });
});

describe('club schedule parsing', () => {
  const origin = 'https://insidelife.ng';
  const play = (patch: Record<string, unknown> = {}) => ({
    slotIndex: 7,
    venueId: 'the-vault',
    trackId: 't1',
    audioUrl: '/media/t1.mp3',
    artistName: 'Ayo',
    title: 'Lagos Love',
    durationSeconds: 150,
    contentType: 'audio/mpeg',
    startsAtMs: 1_000_000,
    gameMinute: 900,
    ...patch,
  });

  it('accepts the contract shape, in time order', () => {
    const schedule = parseClubSchedule({ venueId: 'the-vault', untilMs: 2_000_000, plays: [play({ slotIndex: 9, startsAtMs: 1_500_000 }), play()] }, 'the-vault', origin);
    expect(schedule?.untilMs).toBe(2_000_000);
    expect(schedule?.plays).toEqual([
      { slotIndex: 7, startsAtMs: 1_000_000, trackId: 't1', url: 'https://insidelife.ng/media/t1.mp3', artist: 'Ayo', title: 'Lagos Love', durationSeconds: 150 },
      expect.objectContaining({ slotIndex: 9, startsAtMs: 1_500_000 }),
    ]);
  });

  it('tolerates empty, malformed and hostile payloads', () => {
    expect(parseClubSchedule(null, 'the-vault', origin)).toBeNull();
    expect(parseClubSchedule({ message: 'Not found' }, 'the-vault', origin)).toBeNull();
    expect(parseClubSchedule({ untilMs: 5, plays: [1, 'x', play({ audioUrl: 'javascript:alert(1)' }), play({ startsAtMs: 'soon' })] }, 'the-vault', origin)?.plays).toEqual([]);
    // Another club's plays and duplicate slots are dropped.
    expect(parseClubSchedule({ untilMs: 5, plays: [play(), play(), play({ slotIndex: 8, venueId: 'quilox' })] }, 'the-vault', origin)?.plays).toHaveLength(1);
  });

  it('knows what should be sounding now and what comes next (exact times)', () => {
    const plays = parseClubSchedule({ untilMs: 5, plays: [play(), play({ slotIndex: 9, startsAtMs: 1_500_000 })] }, 'the-vault', origin)?.plays ?? [];
    expect(playAt(plays, 999_999)).toBeNull();
    expect(playAt(plays, 1_000_000)?.slotIndex).toBe(7);
    expect(playAt(plays, 1_100_000)?.slotIndex).toBe(7); // mid-song: join it
    expect(playAt(plays, 1_000_000 + 150_000 - 1_000)).toBeNull(); // its last second: let it go
    expect(nextPlayAfter(plays, 1_100_000)?.slotIndex).toBe(9);
    expect(nextPlayAfter(plays, 1_600_000)).toBeNull();
  });

  it('only allows http(s) media and no https→http downgrade', () => {
    expect(safeMediaUrl('data:audio/mp3;base64,AAA', origin)).toBeNull();
    expect(safeMediaUrl('http://evil.example/a.mp3', origin)).toBeNull();
    expect(safeMediaUrl('/x.mp3', 'http://localhost:3100')).toBe('http://localhost:3100/x.mp3');
  });
});

describe('scene resolution', () => {
  const base: SceneInputs = { mode: 'inside', locationId: 'the-vault', homeDistrictId: 'yaba', positionDistrictId: null, gameMinute: at(23) };

  it('maps venues to music contexts and the club rotation', () => {
    expect(resolveScene(base)).toMatchObject({ kind: 'inside', context: 'club', clubVenueId: 'the-vault', placeType: 'club', night: true });
    expect(resolveScene({ ...base, locationId: 'vi-lounge' })).toMatchObject({ context: 'club', clubVenueId: 'vi-lounge' });
    expect(resolveScene({ ...base, locationId: 'luth' }).context).toBe('hospital');
    expect(resolveScene({ ...base, locationId: 'unilag' }).context).toBe('campus');
    expect(resolveScene({ ...base, locationId: 'landmark-event-centre' }).context).toBe('party');
    expect(resolveScene({ ...base, locationId: 'eko-hotel' }).context).toBe('city');
    expect(resolveScene({ ...base, locationId: 'home:abc' })).toMatchObject({ context: 'home', placeType: 'home', districtId: 'yaba' });
  });

  it('is outdoors (city) whenever walking, driving or riding', () => {
    expect(resolveScene({ ...base, mode: 'walking', positionDistrictId: 'ikeja' })).toMatchObject({ kind: 'street', context: 'city', districtId: 'ikeja', clubVenueId: null });
    expect(resolveScene({ ...base, mode: 'driving' }).driving).toBe(true);
    expect(resolveScene({ ...base, mode: 'loading', locationId: null }).kind).toBe('menu');
  });

  it('honours music-context overrides only while the player stays put', () => {
    const override = { context: 'party' as const, venueId: null, key: sceneKey(base) };
    expect(resolveScene(base, override).context).toBe('party');
    expect(resolveScene({ ...base, locationId: 'luth' }, override).context).toBe('hospital');
  });
});

describe('ambience rules', () => {
  const street = { worldSeed: 'w', kind: 'street' as const, placeType: null, districtId: 'surulere' as const, driving: false };

  it('thickens traffic in rush hour and thins it at night', () => {
    expect(isRushHour(7)).toBe(true);
    expect(isRushHour(12)).toBe(false);
    const rush = deriveAmbience({ ...street, gameMinute: at(8) });
    const deepNight = deriveAmbience({ ...street, gameMinute: at(3) });
    expect(rush.trafficDb).toBeGreaterThan(deepNight.trafficDb);
    expect(rush.hornsPerMinute).toBeGreaterThan(deepNight.hornsPerMinute);
    expect(rush.trafficCutoffHz).toBeGreaterThan(deepNight.trafficCutoffHz);
  });

  it('muffles the city indoors and silences it in loud venues and menus', () => {
    const outside = deriveAmbience({ ...street, gameMinute: at(12) });
    const inside = deriveAmbience({ ...street, kind: 'inside', placeType: 'office', gameMinute: at(12) });
    expect(inside.trafficDb).toBeLessThan(outside.trafficDb - 10);
    expect(inside.trafficCutoffHz).toBeLessThan(outside.trafficCutoffHz);
    expect(inside.muffled).toBe(true);
    expect(inside.roomToneDb).toBeGreaterThan(Number.NEGATIVE_INFINITY);
    expect(deriveAmbience({ ...street, kind: 'inside', placeType: 'club', gameMinute: at(23) }).trafficDb).toBe(Number.NEGATIVE_INFINITY);
    expect(deriveAmbience({ ...street, kind: 'menu', gameMinute: at(12) })).toBe(SILENT_AMBIENCE);
  });

  it('adds night insects (louder by the lagoon) and frogs only outdoors at night by the lagoon', () => {
    const lagoon = deriveAmbience({ ...street, districtId: 'yaba', gameMinute: at(22) });
    const inland = deriveAmbience({ ...street, districtId: 'surulere', gameMinute: at(22) });
    expect(lagoon.insectsDb).toBeGreaterThan(inland.insectsDb);
    expect(lagoon.frogsPerMinute).toBeGreaterThan(0);
    expect(inland.frogsPerMinute).toBe(0);
    expect(deriveAmbience({ ...street, districtId: 'yaba', gameMinute: at(12) }).insectsDb).toBe(Number.NEGATIVE_INFINITY);
  });

  it('runs the home generator at night when NEPA has taken light', () => {
    // Find a night hour without grid power in low-supply Mushin (9 h/day).
    let found = false;
    for (let day = 1; day <= 20 && !found; day++) {
      for (const hour of [20, 22]) {
        const t = at(hour, day);
        if (hasGridPower('w', 'mushin', t)) continue;
        const home = deriveAmbience({ ...street, kind: 'inside', placeType: 'home', districtId: 'mushin', gameMinute: t });
        expect(home.generatorDb).toBeGreaterThan(Number.NEGATIVE_INFINITY);
        expect(home.generatorIndoor).toBe(true);
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('supplies roughly gridHours of power per day, deterministically', () => {
    for (const [district, hours] of [['mushin', 9], ['banana-island', 22]] as const) {
      for (let day = 1; day <= 5; day++) {
        let powered = 0;
        for (let hour = 0; hour < 24; hour += 2) if (hasGridPower('seed', district, at(hour, day))) powered += 2;
        expect(Math.abs(powered - hours)).toBeLessThanOrEqual(2);
      }
      expect(hasGridPower('seed', district, at(20, 3))).toBe(hasGridPower('seed', district, at(20, 3)));
    }
  });

  it('maps speed to rpm with gear shifts', () => {
    expect(engineRpm(0)).toBe(850);
    expect(engineRpm(10)).toBeGreaterThan(engineRpm(1));
    expect(engineRpm(19)).toBeLessThan(engineRpm(17)); // shifted up
    for (let speed = 0; speed <= 200; speed += 5) {
      expect(engineRpm(speed)).toBeGreaterThanOrEqual(850);
      expect(engineRpm(speed)).toBeLessThanOrEqual(5200);
    }
  });
});

describe('voice selection', () => {
  const voice = (name: string, lang: string, localService = true): VoiceLike => ({ name, lang, localService, default: false });

  it('prefers Nigerian English, then British, then American', () => {
    expect(pickVoice([voice('Samantha', 'en-US'), voice('Daniel', 'en-GB'), voice('Ezinne', 'en-NG')])?.name).toBe('Ezinne');
    expect(pickVoice([voice('Samantha', 'en-US'), voice('Daniel', 'en_GB')])?.name).toBe('Daniel');
    expect(pickVoice([voice('Amélie', 'fr-CA'), voice('Samantha', 'en-US')])?.name).toBe('Samantha');
  });

  it('avoids novelty voices and non-English voices', () => {
    expect(pickVoice([voice('Bad News', 'en-GB'), voice('Karen', 'en-AU')])?.name).toBe('Karen');
    expect(pickVoice([voice('Thomas', 'fr-FR')])).toBeNull();
  });
});
