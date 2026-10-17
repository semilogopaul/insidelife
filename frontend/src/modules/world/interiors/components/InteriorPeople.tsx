'use client';

import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { Matrix4, type InstancedMesh, type Material } from 'three';
import { findAction, type Appearance, type Gender, type Outfit, type PresencePlayerDto } from '@insidelife/shared';
import { Avatar, npcLook, type AvatarClip, type AvatarHandle } from '@/common/three/avatar';
import { SELF_ANCHOR, trackAvatar } from '../../speech/speech-anchors';
import { blobShadowGeometry, blobShadowMaterial } from '@/common/three/avatar/blob-shadow';
import { actionSpot } from '../hotspots/action-spots';
import { placeAt } from '../templates/spots';
import type { InteriorTemplate, Spot } from '../templates/types';

export interface InteriorPlayer {
  readonly appearance: Appearance;
  readonly outfit: Outfit;
  readonly gender: Gender;
  readonly animation: AvatarClip;
  readonly mood?: number;
  /** The running action (picks its spot: drinks at the bar, not just "somewhere seated"). */
  readonly actionId?: string | null;
}

export interface InteriorPeopleProps {
  readonly template: InteriorTemplate;
  readonly locationId: string;
  readonly player: InteriorPlayer | null;
  readonly players: readonly PresencePlayerDto[];
}

/** NPCs beyond this many render at the crowd LOD. */
const HIGH_DETAIL_NPCS = 4;
/** Other players beyond this many render at the crowd LOD too (a busy bar stays inside the draw-call budget). */
const HIGH_DETAIL_GUESTS = 3;

/** Speech bubbles follow this avatar's head (a guest by character id, or you). */
function useBubbleAnchor(key: string) {
  return useCallback((handle: AvatarHandle | null) => (handle ? trackAvatar(key, handle) : undefined), [key]);
}

function GuestAvatar({ guest, spot, lod }: { readonly guest: PresencePlayerDto; readonly spot: Spot; readonly lod: 'high' | 'low' }) {
  const anchor = useBubbleAnchor(guest.characterId);
  return <Avatar ref={anchor} {...placeAt(spot)} appearance={guest.appearance} outfit={guest.outfit} gender={guest.gender} animation={guestAnimation(guest, spot.animation)} stance={spot.stance} lod={lod} shadow={false} deferBuild />;
}

function guestAnimation(player: PresencePlayerDto, fallback: AvatarClip): AvatarClip {
  if (!player.activity) return fallback;
  return findAction(player.activity)?.animation ?? fallback;
}

/**
 * The player, ambient NPCs (seeded by location) and other players present, with one instanced contact shadow.
 * The player mounts immediately; NPCs and guests build one new look per frame (`deferBuild`) so entry never hitches.
 */
export function InteriorPeople({ template, locationId, player, players }: InteriorPeopleProps) {
  const npcs = useMemo(
    () =>
      template.npcs.map((spot, index) => ({
        spot,
        look: npcLook(`${locationId}:${spot.id ?? index}`, spot.theme, spot.gender),
        lod: spot.lod ?? ((spot.id ?? index) < HIGH_DETAIL_NPCS ? ('high' as const) : ('low' as const)),
        key: spot.id ?? index,
      })),
    [template, locationId],
  );
  const shown = player !== null;
  const actionId = player?.actionId ?? null;
  const animation = player?.animation ?? 'idle';
  const playerSpot = useMemo(() => {
    if (!shown) return null;
    const action = actionId ? findAction(actionId) : undefined;
    return actionSpot(template, action && action.animation === animation ? action : { animation });
  }, [shown, actionId, animation, template]);
  const guests = players.slice(0, template.guests.length).map((guest, index) => ({ guest, spot: template.guests[index]! }));
  const selfAnchor = useBubbleAnchor(SELF_ANCHOR);

  const feet = useMemo(() => {
    const list: Array<readonly [number, number]> = [];
    if (playerSpot) list.push([playerSpot.at[0], playerSpot.at[playerSpot.at.length - 1]!]);
    for (const npc of npcs) list.push([npc.spot.at[0], npc.spot.at[npc.spot.at.length - 1]!]);
    for (const { spot } of guests) list.push([spot.at[0], spot.at[spot.at.length - 1]!]);
    return list;
  }, [playerSpot, npcs, guests]);

  return (
    <group name="people">
      {player && playerSpot && (
        <Avatar
          ref={selfAnchor}
          {...placeAt(playerSpot)}
          appearance={player.appearance}
          outfit={player.outfit}
          gender={player.gender}
          animation={player.animation}
          stance={playerSpot.stance}
          props={playerSpot.props ?? true}
          mood={player.mood}
          shadow={false}
        />
      )}
      {npcs.map(({ spot, look, lod, key }) => (
        <Avatar
          key={`npc-${key}`}
          {...placeAt(spot)}
          appearance={look.appearance}
          outfit={{}}
          clothing={look.clothing}
          gender={look.gender}
          animation={spot.animation}
          stance={spot.stance}
          props={spot.props ?? true}
          mood={70}
          lod={lod}
          shadow={false}
          deferBuild
        />
      ))}
      {guests.map(({ guest, spot }, index) => (
        <GuestAvatar key={guest.characterId} guest={guest} spot={spot} lod={index < HIGH_DETAIL_GUESTS ? 'high' : 'low'} />
      ))}
      <ContactShadows feet={feet} />
    </group>
  );
}

const tmp = new Matrix4();

function ContactShadows({ feet }: { readonly feet: ReadonlyArray<readonly [number, number]> }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    feet.forEach(([x, z], index) => {
      tmp.makeScale(0.62, 1, 0.5).setPosition(x, 0.006, z);
      mesh.setMatrixAt(index, tmp);
    });
    mesh.count = feet.length;
    mesh.instanceMatrix.needsUpdate = true;
  }, [feet]);
  if (feet.length === 0) return null;
  return <instancedMesh key={feet.length} ref={ref} args={[blobShadowGeometry(), blobShadowMaterial() as Material, feet.length]} frustumCulled={false} renderOrder={-1} />;
}

export type { Spot };
