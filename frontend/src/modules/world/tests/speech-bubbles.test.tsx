import { render, screen } from '@testing-library/react';
import { Vector3 } from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import type { VenuePlayerDto } from '@insidelife/shared';
import { useSpeech } from '@/common/speech';
import type { AvatarHandle } from '@/common/three/avatar';
import { guestOrder } from '../interiors/use-venue-guests';
import { outdoorAnchors } from '../play/players/speech-anchors-outdoor';
import type { RemotePlayers } from '../play/players/remote-players';
import type { PlayRuntime } from '../play/runtime/play-runtime';
import { SpeechBubbles } from '../speech/SpeechBubbles';
import { SELF_ANCHOR, addAnchorResolver, bubbleElements, resolveAnchor, trackAvatar } from '../speech/speech-anchors';

const out = new Vector3();

describe('speech anchors', () => {
  it('outside: you over your avatar or car, others at their interpolated position', () => {
    const runtime = { subjectX: 10, subjectZ: 20, mode: 'walk', ride: { onFoot: false } } as unknown as PlayRuntime;
    const remotes = {
      players: new Map([
        ['kemi', { hasPose: true, x: 30, z: 40, pose: { mode: 'walk' } }],
        ['tobi', { hasPose: true, x: 50, z: 60, pose: { mode: 'car' } }],
        ['ghost', { hasPose: false, x: 0, z: 0, pose: { mode: 'walk' } }],
      ]),
    } as unknown as RemotePlayers;
    const anchor = outdoorAnchors(runtime, remotes);
    expect(anchor('ada', true, out)).toBe(true);
    expect([out.x, out.z]).toEqual([10, 20]);
    const walkingHead = out.y;
    expect(anchor('kemi', false, out)).toBe(true);
    expect([out.x, out.z]).toEqual([30, 40]);
    expect(anchor('tobi', false, out)).toBe(true);
    expect(out.y).toBeGreaterThan(walkingHead);
    expect(anchor('ghost', false, out)).toBe(false);
    expect(anchor('nobody', false, out)).toBe(false);
  });

  it('a tracked avatar (inside) wins over resolvers, and stops counting once unmounted', () => {
    const resolver = (id: string, _self: boolean, target: Vector3) => {
      target.set(1, 2, 3);
      return id === 'kemi';
    };
    const remove = addAnchorResolver(resolver);
    const object = { parent: {}, updateWorldMatrix: () => undefined, matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 1, 7, 1] } };
    const handle = { object, parts: { skeleton: { getBoneByName: () => undefined } } } as unknown as AvatarHandle;
    const untrack = trackAvatar('kemi', handle);
    expect(resolveAnchor('kemi', false, out)).toBe(true);
    expect([out.x, out.z]).toEqual([5, 7]);
    expect(out.y).toBeCloseTo(2.6);
    object.parent = null as unknown as object;
    expect(resolveAnchor('kemi', false, out)).toBe(true);
    expect([out.x, out.y, out.z]).toEqual([1, 2, 3]);
    untrack();
    remove();
    expect(resolveAnchor('kemi', false, out)).toBe(false);
  });

  it('your own avatar is tracked under its own key', () => {
    const object = { parent: {}, updateWorldMatrix: () => undefined, matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 9, 0, 9, 1] } };
    const untrack = trackAvatar(SELF_ANCHOR, { object, parts: { skeleton: { getBoneByName: () => undefined } } } as unknown as AvatarHandle);
    expect(resolveAnchor('ada', true, out)).toBe(true);
    expect(resolveAnchor('ada', false, out)).toBe(false);
    untrack();
  });
});

describe('guestOrder', () => {
  const player = (id: string, online: boolean) => ({ id, online }) as VenuePlayerDto;
  it('online players first, each group in a stable order so people keep their spots', () => {
    expect(guestOrder([player('c', false), player('b', true), player('a', false), player('d', true)]).map((p) => p.id)).toEqual(['b', 'd', 'a', 'c']);
  });
});

describe('SpeechBubbles', () => {
  beforeEach(() => {
    useSpeech.setState({ selfId: 'ada', lines: [], bubbles: [], composerOpen: false, unread: 0 });
  });

  it('renders one bubble per speaker for the frame loop to place, and names the speaker inside', () => {
    useSpeech.setState({
      bubbles: [
        { lineId: 'l1', characterId: 'kemi', handle: 'kemi_o', text: 'How far?', mine: false, until: Date.now() + 5_000 },
        { lineId: 'l2', characterId: 'ada', handle: 'ada_b', text: 'I dey', mine: true, until: Date.now() + 5_000 },
      ],
    });
    const { rerender } = render(<SpeechBubbles inside />);
    expect(bubbleElements.size).toBe(2);
    expect(screen.getByText('@kemi_o')).toBeTruthy();
    expect(screen.queryByText('@ada_b')).toBeNull();
    expect(screen.getByTestId('speech-bubbles').getAttribute('aria-hidden')).toBe('true');
    // Outside, name tags already say who it is.
    rerender(<SpeechBubbles inside={false} />);
    expect(screen.queryByText('@kemi_o')).toBeNull();
    useSpeech.setState({ bubbles: [] });
    rerender(<SpeechBubbles inside={false} />);
    expect(bubbleElements.size).toBe(0);
  });
});
