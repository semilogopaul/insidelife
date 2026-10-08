'use client';

import type { Appearance, Gender, Outfit } from '@insidelife/shared';
import { useCallback } from 'react';
import { Avatar, type AvatarHandle } from '@/common/three/avatar';
import { PLAYER_SCALE, type PlayRuntime } from '../runtime/play-runtime';

export interface PlayerLook {
  readonly appearance: Appearance;
  readonly outfit: Outfit;
  readonly gender: Gender;
  readonly mood?: number;
}

/** The player's avatar on foot; the runtime moves it and picks idle / walk / jog every frame. */
export function PlayerAvatar({ runtime, look, castShadow }: { readonly runtime: PlayRuntime; readonly look: PlayerLook; readonly castShadow: boolean }) {
  const register = useCallback((handle: AvatarHandle | null) => runtime.registerAvatar(handle), [runtime]);
  return (
    <Avatar
      ref={register}
      appearance={look.appearance}
      outfit={look.outfit}
      gender={look.gender}
      mood={look.mood}
      animation="idle"
      scale={PLAYER_SCALE}
      castShadow={castShadow}
      props={false}
      seed={7}
    />
  );
}
