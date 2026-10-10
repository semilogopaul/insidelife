import { Vector3, type Bone } from 'three';
import type { AvatarHandle } from '@/common/three/avatar';

/**
 * Where speech bubbles hang. Whoever draws a character says where its head is: interiors track avatar handles (the
 * head bone, so sitting and standing both work), the street registers a resolver (players' interpolated positions,
 * cars included). The projector asks here every frame for the few characters with a bubble up.
 */

/** Writes the point just above `characterId`'s head (world space) into `out`; false when they aren't drawn here. */
export type AnchorResolver = (characterId: string, self: boolean, out: Vector3) => boolean;

/** Key for your own avatar (its character id isn't known where it's drawn). */
export const SELF_ANCHOR = '@self';

const resolvers = new Set<AnchorResolver>();
const avatars = new Map<string, AvatarHandle>();
const heads = new WeakMap<AvatarHandle, Bone | null>();
const scale = new Vector3();

/** Head top above the head bone, in avatar units (the head is ~0.5 tall, plus hair). */
const HEAD_TOP = 0.62;

export function addAnchorResolver(resolver: AnchorResolver): () => void {
  resolvers.add(resolver);
  return () => resolvers.delete(resolver);
}

/** Follow an avatar's head (key: a character id or SELF_ANCHOR). Returns the untrack function. */
export function trackAvatar(key: string, handle: AvatarHandle): () => void {
  avatars.set(key, handle);
  return () => {
    if (avatars.get(key) === handle) avatars.delete(key);
  };
}

function headOf(handle: AvatarHandle): Bone | null {
  let head = heads.get(handle);
  if (head === undefined) {
    head = handle.parts.skeleton.getBoneByName('head') ?? null;
    heads.set(handle, head);
  }
  return head;
}

/** Just above an avatar's head, this frame (its matrices brought up to date first). False once it's unmounted. */
export function headAnchor(handle: AvatarHandle, out: Vector3): boolean {
  const object = handle.object;
  if (!object?.parent) return false;
  const head = headOf(handle);
  const node = head ?? object;
  node.updateWorldMatrix(true, false);
  out.setFromMatrixPosition(node.matrixWorld);
  scale.setFromMatrixScale(node.matrixWorld);
  out.y += (head ? HEAD_TOP : 1.6) * scale.y;
  return true;
}

export function resolveAnchor(characterId: string, self: boolean, out: Vector3): boolean {
  const tracked = avatars.get(self ? SELF_ANCHOR : characterId);
  if (tracked && headAnchor(tracked, out)) return true;
  for (const resolver of resolvers) if (resolver(characterId, self, out)) return true;
  return false;
}

/** DOM elements of the bubbles on screen, by speaker; positioned by `SpeechProjector`, never re-rendered per frame. */
export const bubbleElements = new Map<string, HTMLElement>();
