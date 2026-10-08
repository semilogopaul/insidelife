import { describe, expect, it } from 'vitest';
import { AVATAR_ANIMATIONS, CLOTHING, type Appearance, type ClothingDefinition, type TimelineSegmentDto } from '@insidelife/shared';
import { CLIPS, evaluateClip, resolveStance, type AvatarClip } from '../avatar/animation/clips';
import { Pose } from '../avatar/animation/pose';
import { animationForSegment, stanceFor } from '../avatar/animation/select';
import { expressionForMood, faceCellIndex, faceCellOffset } from '../avatar/face';
import { npcLook } from '../avatar/npc';
import { BASE_LAYER, knownStyle, outfitKey, resolveOutfit, withBaseLayer, type ClothingLookup } from '../avatar/outfit';
import { BONE_NAMES, BONE_PARENT, computeRig } from '../avatar/rig';

const item = (overrides: Partial<ClothingDefinition>): ClothingDefinition => ({
  id: 'x',
  name: 'X',
  slot: 'top',
  style: 'tee',
  pattern: 'solid',
  primary: '#ffffff',
  secondary: '#000000',
  price: 1,
  status: 0,
  store: 'market',
  cut: 'unisex',
  ...overrides,
});

const catalog = new Map<string, ClothingDefinition>([
  ['tee', item({ id: 'tee' })],
  ['jeans', item({ id: 'jeans', slot: 'bottom', style: 'jeans', pattern: 'denim' })],
  ['agbada', item({ id: 'agbada', slot: 'full', style: 'agbada', pattern: 'aso-oke' })],
  ['gele', item({ id: 'gele', slot: 'headwear', style: 'gele' })],
]);
const lookup: ClothingLookup = (id) => catalog.get(id);

describe('outfit resolution', () => {
  it('resolves ids per slot and skips unknown ids', () => {
    const resolved = resolveOutfit({ top: 'tee', bottom: 'jeans', shoes: 'missing-from-catalog' }, lookup);
    expect(resolved.top?.id).toBe('tee');
    expect(resolved.bottom?.id).toBe('jeans');
    expect(resolved.shoes).toBeUndefined();
  });

  it('lets a full outfit override top and bottom', () => {
    const resolved = resolveOutfit({ top: 'tee', bottom: 'jeans', full: 'agbada', headwear: 'gele' }, lookup);
    expect(resolved.full?.id).toBe('agbada');
    expect(resolved.top).toBeUndefined();
    expect(resolved.bottom).toBeUndefined();
    expect(resolved.headwear?.id).toBe('gele');
  });

  it('ignores items filed under the wrong slot and prefers explicit overrides', () => {
    expect(resolveOutfit({ top: 'jeans' }, lookup).top).toBeUndefined();
    const preview = item({ id: 'preview', style: 'polo' });
    expect(resolveOutfit({ top: 'tee' }, lookup, { top: preview }).top?.id).toBe('preview');
  });

  it('falls back to known styles and fills a base layer', () => {
    expect(knownStyle('top', 'cape')).toBe('tee');
    expect(knownStyle('full', 'agbada')).toBe('agbada');
    expect(withBaseLayer({}).top).toBe(BASE_LAYER.top);
    expect(withBaseLayer({ full: catalog.get('agbada') }).top).toBeUndefined();
  });

  it('keys outfits by what changes the mesh, not by id', () => {
    const a = outfitKey({ top: item({ id: 'a', primary: '#FFFFFF' }) });
    const b = outfitKey({ top: item({ id: 'b', primary: '#ffffff' }) });
    expect(a).toBe(b);
    expect(outfitKey({ top: item({ primary: '#ff0000' }) })).not.toBe(a);
  });

  it('resolves every real catalog item', () => {
    for (const definition of CLOTHING) expect(resolveOutfit({ [definition.slot]: definition.id }).hasOwnProperty(definition.slot)).toBe(true);
  });
});

const segment = (overrides: Partial<TimelineSegmentDto>): TimelineSegmentDto => ({
  kind: 'action',
  startsAt: 0,
  endsAt: 60,
  locationId: 'home:1',
  label: '',
  explicit: true,
  profile: { energy: { target: 50, rate: 0 }, hunger: { target: 50, rate: 0 }, hygiene: { target: 50, rate: 0 }, fun: { target: 50, rate: 0 }, social: { target: 50, rate: 0 } },
  ...overrides,
});

describe('animation selection', () => {
  it('uses the action animation, sleep for sleep segments, idle otherwise', () => {
    expect(animationForSegment(undefined)).toBe('idle');
    expect(animationForSegment(segment({ kind: 'sleep' }))).toBe('sleep');
    expect(animationForSegment(segment({ actionId: 'cook' }))).toBe('cook');
    expect(animationForSegment(segment({ actionId: 'club-night' }))).toBe('dance');
    expect(animationForSegment(segment({ kind: 'idle' }))).toBe('idle');
    expect(animationForSegment(segment({ actionId: 'not-an-action', kind: 'work' }))).toBe('type');
    expect(animationForSegment(segment({ kind: 'lecture' }))).toBe('read');
  });

  it('chooses a stance from the seat availability', () => {
    expect(stanceFor('eat', true)).toBe('sit');
    expect(stanceFor('eat', false)).toBe('stand');
    expect(stanceFor('dance', true)).toBe('stand');
    expect(stanceFor('pray', true)).toBe('kneel');
  });
});

describe('clips', () => {
  const rig = computeRig({ bodyType: 'average', height: 1, skinTone: 2, hairStyle: 'fade', hairColor: 0, facialHair: 'none', eyeStyle: 'round' });

  it('covers every shared animation plus jog and run', () => {
    for (const animation of [...AVATAR_ANIMATIONS, 'jog', 'run'] as const) expect(CLIPS[animation]).toBeDefined();
  });

  it('produces finite poses over time for every clip and stance', () => {
    const pose = new Pose();
    for (const clip of Object.keys(CLIPS) as AvatarClip[]) {
      for (const requested of ['stand', 'sit', 'kneel'] as const) {
        const stance = resolveStance(clip, requested);
        for (const t of [0, 0.37, 1.9, 7.3, 13.1]) {
          evaluateClip(pose, clip, { t, beatTime: t, rig, stance, variety: 0.4, props: true });
          for (const value of pose.rot) expect(Number.isFinite(value)).toBe(true);
          for (const value of pose.rootPos) expect(Number.isFinite(value)).toBe(true);
        }
      }
    }
  });

  it('full-body clips ignore the requested stance', () => {
    expect(resolveStance('dance', 'sit')).toBe('stand');
    expect(resolveStance('eat', undefined)).toBe('sit');
    expect(resolveStance('phone', 'sit')).toBe('sit');
  });

  it('blends poses linearly and hands face hints to the dominant side', () => {
    const a = new Pose().set('head', 0);
    const b = new Pose().set('head', 1);
    b.mouth = 1;
    const out = new Pose().blend(a, b, 0.25);
    expect(out.get('head', 0)).toBeCloseTo(0.25);
    expect(out.mouth).toBe(0);
    expect(new Pose().blend(a, b, 0.75).mouth).toBe(1);
  });
});

describe('face', () => {
  it('maps mood to expressions', () => {
    expect(expressionForMood(90)).toBe('happy');
    expect(expressionForMood(50)).toBe('neutral');
    expect(expressionForMood(25)).toBe('sad');
    expect(expressionForMood(5)).toBe('tired');
    expect(expressionForMood(undefined)).toBe('neutral');
  });

  it('addresses atlas cells', () => {
    expect(faceCellIndex({ expression: 'happy', eyesClosed: false, mouthOpen: false })).toEqual({ col: 0, row: 0 });
    expect(faceCellIndex({ expression: 'tired', eyesClosed: true, mouthOpen: true })).toEqual({ col: 3, row: 3 });
    expect(faceCellOffset({ expression: 'happy', eyesClosed: false, mouthOpen: false })).toEqual([0, 0.75]);
  });
});

describe('rig', () => {
  const base: Appearance = { bodyType: 'average', height: 1, skinTone: 2, hairStyle: 'fade', hairColor: 0, facialHair: 'none', eyeStyle: 'round' };

  it('has a valid bone hierarchy', () => {
    for (const name of BONE_NAMES) {
      const parent = BONE_PARENT[name];
      if (parent) expect(BONE_NAMES.indexOf(parent)).toBeLessThan(BONE_NAMES.indexOf(name));
    }
  });

  it('scales with height and body type', () => {
    const tall = computeRig({ ...base, height: 1.08 });
    const short = computeRig({ ...base, height: 0.92 });
    expect(tall.headCenterY).toBeGreaterThan(short.headCenterY);
    expect(computeRig({ ...base, bodyType: 'broad' }).torso.shoulderW).toBeGreaterThan(computeRig({ ...base, bodyType: 'slim' }).torso.shoulderW);
    expect(computeRig({ ...base, bodyType: 'curvy' }).torso.hipW).toBeGreaterThan(computeRig(base).torso.hipW);
    // ~1.4 m chibi.
    expect(computeRig(base).headCenterY + computeRig(base).head[1] / 2).toBeGreaterThan(1.3);
    expect(computeRig(base).headCenterY + computeRig(base).head[1] / 2).toBeLessThan(1.45);
  });
});

describe('npc looks', () => {
  it('is deterministic per seed and respects the theme', () => {
    const a = npcLook('unilag:3', 'owambe');
    const b = npcLook('unilag:3', 'owambe');
    expect(a).toEqual(b);
    expect(a.clothing.full).toBeDefined();
    expect(npcLook('luth:1', 'medic').clothing.full?.style).toBe('scrubs');
  });
});
