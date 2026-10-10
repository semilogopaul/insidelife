'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { useSpeech } from '@/common/speech';
import { bubbleElements, resolveAnchor } from './speech-anchors';

const point = new Vector3();
const projected = new Vector3();
/** Bubbles fade out between these camera distances (metres) and are gone beyond (the Nearby log still has the line). */
const FADE_FROM = 70;
const FAR = 95;
/** Keep a bubble this far inside the screen edges (more at the top, below the HUD's clock and wallet row). */
const EDGE = 6;
const EDGE_TOP = 72;
const sizes = new WeakMap<HTMLElement, { readonly width: number; readonly height: number }>();

function sizeOf(element: HTMLElement): { readonly width: number; readonly height: number } {
  let size = sizes.get(element);
  if (!size) {
    size = { width: element.offsetWidth, height: element.offsetHeight };
    if (size.width > 0) sizes.set(element, size);
  }
  return size;
}

function hide(element: HTMLElement): void {
  if (element.style.opacity !== '0') element.style.opacity = '0';
}

/**
 * Inside the canvas: places each speech bubble (DOM, `SpeechBubbles`) over its speaker's head every frame, after the
 * camera and avatars have moved. No React state, no draw calls: a transform and an opacity per bubble on screen.
 */
export function SpeechProjector() {
  const size = useThree((state) => state.size);
  useFrame(({ camera }) => {
    if (bubbleElements.size === 0) return;
    const selfId = useSpeech.getState().selfId;
    camera.updateMatrixWorld();
    for (const [characterId, element] of bubbleElements) {
      if (!resolveAnchor(characterId, characterId === selfId, point)) {
        hide(element);
        continue;
      }
      const distance = camera.position.distanceTo(point);
      projected.copy(point).project(camera);
      if (distance > FAR || projected.z > 1 || Math.abs(projected.x) > 1.15 || Math.abs(projected.y) > 1.15) {
        hide(element);
        continue;
      }
      const { width, height } = sizeOf(element);
      const sx = (projected.x * 0.5 + 0.5) * size.width;
      const sy = (-projected.y * 0.5 + 0.5) * size.height;
      // Bottom-centre on the head, kept fully on screen so it can always be read.
      const left = Math.min(Math.max(sx - width / 2, EDGE), Math.max(EDGE, size.width - width - EDGE));
      const top = Math.min(Math.max(sy - height, EDGE_TOP), Math.max(EDGE_TOP, size.height - height - EDGE));
      element.style.transform = `translate3d(${left.toFixed(1)}px, ${top.toFixed(1)}px, 0)`;
      element.style.opacity = distance > FADE_FROM ? ((FAR - distance) / (FAR - FADE_FROM)).toFixed(2) : '1';
    }
  });
  return null;
}
