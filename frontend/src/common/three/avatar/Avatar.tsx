'use client';

import { createPortal, useFrame } from '@react-three/fiber';
import { createContext, useContext, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode, type Ref } from 'react';
import type { Group } from 'three';
import type { Appearance, Gender, Outfit } from '@insidelife/shared';
import type { AvatarClip, AvatarStance } from './animation/clips';
import { enqueueFrameJob } from '../core/build-queue';
import { AvatarInstance, isAvatarBuilt, prebuildAvatar, type AvatarParts, type AvatarSocket } from './avatar-instance';
import { avatarBuildKey, type AvatarBuildInput } from './build/build-avatar';
import { blobShadowGeometry, blobShadowMaterial } from './blob-shadow';
import type { AvatarLod } from './build/build-avatar';
import { expressionForMood, type Expression } from './face';
import { resolveOutfit, type ResolvedOutfit } from './outfit';

export interface AvatarHandle {
  /** Outer group: move/rotate it freely per frame (it is the `position`/`rotationY` target). */
  readonly object: Group | null;
  readonly parts: AvatarParts;
  /** Crossfade to a clip (default 0.35 s). */
  play(clip: AvatarClip, options?: { readonly fade?: number; readonly stance?: AvatarStance }): void;
  /** One-shot upper-body overlay (e.g. `wave` for 1.8 s), then back to the current clip. */
  gesture(clip: AvatarClip, seconds?: number): void;
  /** Force an expression (null = follow mood). */
  setExpression(expression: Expression | null): void;
  /** Slow down / speed up the current clip (e.g. match walk cycle to movement speed). */
  setTimeScale(scale: number): void;
}

export interface AvatarProps {
  readonly appearance: Appearance;
  /** Clothing ids per slot (resolved through the shop catalog; unknown ids are skipped). */
  readonly outfit: Outfit;
  /** Already-resolved clothing (shop previews, NPCs) — wins over ids per slot. */
  readonly clothing?: ResolvedOutfit;
  /** Subtle face details (lashes). Defaults to male. */
  readonly gender?: Gender;
  readonly animation?: AvatarClip;
  /** Lower body for upper-body clips (eat/read/type/talk/phone/pray…): stand, sit (on a 0.36 m seat), kneel. */
  readonly stance?: AvatarStance;
  /** 0-100, drives the facial expression (happy / neutral / sad / tired). */
  readonly mood?: number;
  /** Force an expression (overrides mood). */
  readonly expression?: Expression;
  readonly position?: readonly [number, number, number];
  readonly rotationY?: number;
  readonly scale?: number;
  /** `low` = one draw call, no face texture or props — for crowds and distant players. */
  readonly lod?: AvatarLod;
  /** Show action props (phone, bowl, book, laptop, steering wheel…). Default true. */
  readonly props?: boolean;
  /** Soft blob shadow under the feet (default true). Turn off when the scene draws its own (e.g. instanced). */
  readonly shadow?: boolean;
  /** Cast real shadows from the scene's shadow light (default false — costs a second pass). */
  readonly castShadow?: boolean;
  /** Animation variety / blink schedule seed (defaults to a per-instance counter). */
  readonly seed?: number;
  /**
   * Build a not-yet-seen look in a later frame (at most one new look per frame across all deferred avatars) and
   * render nothing until then. Use for crowds/NPCs so entering a busy place doesn't hitch; leave off for the player.
   */
  readonly deferBuild?: boolean;
  readonly ref?: Ref<AvatarHandle>;
  /** Rendered inside the avatar; use `<AvatarAttachment socket="handR">` to hold things. */
  readonly children?: ReactNode;
}

const AvatarPartsContext = createContext<AvatarParts | null>(null);

/** Bones/sockets of the enclosing `<Avatar>` (null outside one). */
export function useAvatarParts(): AvatarParts | null {
  return useContext(AvatarPartsContext);
}

/** Attach children to a bone of the enclosing avatar (held items, a car's steering wheel, a crown…). */
export function AvatarAttachment({ socket, children }: { readonly socket: AvatarSocket; readonly children: ReactNode }) {
  const parts = useAvatarParts();
  if (!parts) return null;
  return createPortal(children, parts.sockets[socket]);
}

/** Resolve outfit ids (memoised by content, not identity). */
export function useResolvedOutfit(outfit: Outfit, clothing?: ResolvedOutfit): ResolvedOutfit {
  const outfitJson = JSON.stringify(outfit);
  const clothingJson = clothing ? JSON.stringify(clothing) : '';
  return useMemo(
    () => resolveOutfit(JSON.parse(outfitJson) as Outfit, undefined, clothingJson ? (JSON.parse(clothingJson) as ResolvedOutfit) : undefined),
    [outfitJson, clothingJson],
  );
}

/**
 * The procedural chibi avatar. Geometry is built once per distinct look and shared; each instance owns a skeleton
 * and an animator. ≤ 6 draw calls at `lod="high"` (base + ≤3 prints + face + blob), 1-2 at `lod="low"`.
 */
export function Avatar(props: AvatarProps) {
  return props.deferBuild ? <DeferredAvatar {...props} /> : <AvatarBody {...props} />;
}

/** Waits for the frame queue to build this look (unless it's already cached), then renders the avatar. */
function DeferredAvatar(props: AvatarProps) {
  const resolved = useResolvedOutfit(props.outfit, props.clothing);
  const gender = props.gender ?? 'male';
  const lod = props.lod ?? 'high';
  const appearanceKey = JSON.stringify(props.appearance);
  const input = useMemo<AvatarBuildInput>(() => ({ appearance: JSON.parse(appearanceKey) as AvatarProps['appearance'], gender, outfit: resolved, lod }), [appearanceKey, gender, resolved, lod]);
  const key = avatarBuildKey(input);
  const [readyKey, setReadyKey] = useState<string | null>(null);
  const built = isAvatarBuilt(input);
  useEffect(() => {
    if (built) return;
    return enqueueFrameJob(
      () => prebuildAvatar(input, gender === 'female'),
      () => setReadyKey(key),
    );
  }, [built, input, key, gender]);
  if (!built && readyKey !== key) return null;
  return <AvatarBody {...props} />;
}

function AvatarBody({
  appearance,
  outfit,
  clothing,
  gender = 'male',
  animation = 'idle',
  stance,
  mood,
  expression,
  position = [0, 0, 0],
  rotationY = 0,
  scale = 1,
  lod = 'high',
  props = true,
  shadow = true,
  castShadow = false,
  seed,
  ref,
  children,
}: AvatarProps) {
  const resolved = useResolvedOutfit(outfit, clothing);
  const groupRef = useRef<Group>(null);
  const appearanceKey = JSON.stringify(appearance);
  const instance = useMemo(
    () => new AvatarInstance({ appearance: JSON.parse(appearanceKey) as Appearance, gender, outfit: resolved, lod }, { seed, lashes: gender === 'female' }),
    [appearanceKey, gender, resolved, lod, seed],
  );

  useEffect(() => {
    instance.retain();
    return () => instance.release();
  }, [instance]);

  useEffect(() => {
    instance.animator.play(animation, { stance });
  }, [instance, animation, stance]);

  useEffect(() => {
    instance.animator.setMoodExpression(expressionForMood(mood));
    instance.animator.setExpression(expression ?? null);
    instance.animator.setShowProps(props && lod === 'high');
    instance.setShadow(castShadow);
  }, [instance, mood, expression, props, lod, castShadow]);

  useImperativeHandle(
    ref,
    () => ({
      get object() {
        return groupRef.current;
      },
      parts: instance.parts,
      play: (clip, options) => instance.animator.play(clip, options),
      gesture: (clip, seconds) => instance.animator.gesture(clip, seconds),
      setExpression: (value) => instance.animator.setExpression(value),
      setTimeScale: (value) => instance.animator.setTimeScale(value),
    }),
    [instance],
  );

  useFrame((state, delta) => instance.update(delta, state.clock.elapsedTime));

  return (
    <group ref={groupRef} position={[position[0], position[1], position[2]]} rotation-y={rotationY} scale={scale}>
      <primitive object={instance.mesh} />
      {shadow && <mesh geometry={blobShadowGeometry()} material={blobShadowMaterial()} position-y={0.004} scale={[0.62, 1, 0.5]} renderOrder={-1} />}
      <AvatarPartsContext.Provider value={instance.parts}>{children}</AvatarPartsContext.Provider>
    </group>
  );
}
