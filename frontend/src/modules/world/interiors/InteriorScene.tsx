'use client';

import { Suspense, useCallback, useMemo, useState, type ReactNode } from 'react';
import type { MeshStandardMaterial } from 'three';
import { isHomeLocation, toDateParts, type PresencePlayerDto } from '@insidelife/shared';
import { gameClock } from '@/common/game/game-clock';
import { segmentAt, useSnapshot } from '@/common/game/snapshot';
import { useGameMinute } from '@/common/game/use-game-clock';
import { animationForSegment } from '@/common/three/avatar';
import { ClubLights } from './effects/ClubLights';
import { DollhouseCamera } from './components/DollhouseCamera';
import { FurnitureLayer } from './components/FurnitureLayer';
import { InteriorLighting, currentHour } from './components/InteriorLighting';
import { InteriorPeople, type InteriorPlayer } from './components/InteriorPeople';
import { RoomShell } from './components/RoomShell';
import { ShowroomCars } from './components/ShowroomCars';
import { getTemplate } from './templates/registry';
import { isNepaOff, resolveTemplateId, type HomeInfo, type InteriorTemplateId } from './templates/resolve';

export interface InteriorSceneProps {
  /** Venue id or `home:<characterId>` the player is inside. */
  readonly locationId: string;
  /** Other players present (from realtime presence). */
  readonly players?: readonly PresencePlayerDto[];
  /** Override the player (previews/dev). Defaults to the snapshot character; `null` hides the player. */
  readonly player?: InteriorPlayer | null;
  /** Force a template instead of resolving it from the location. */
  readonly templateId?: InteriorTemplateId;
  /** Home info for `home:` locations (defaults to `snapshot.summary.home`). */
  readonly home?: HomeInfo | null;
  /** Force the time of day (fractional hour). */
  readonly hour?: number;
  /** Force the NEPA (power cut) mood; by default it happens on some nights at home. */
  readonly nepa?: boolean;
  /** `dollhouse` (default) frames the room on mount; `none` leaves the camera to the caller. */
  readonly camera?: 'dollhouse' | 'none';
  /** Allow limited orbit/zoom (default true). */
  readonly interactiveCamera?: boolean;
  /** Extra scene content (e.g. `<MoneyRain />` triggered by the play layer). */
  readonly children?: ReactNode;
}

/**
 * A cosy, readable dollhouse of the place the player is in: the template comes from the venue type (or the kind of
 * home), furniture from the Kenney kit, Lagos props, the player animating by their current activity, ambient NPCs
 * and other players present. Lit by the game clock. ≤ 80 draw calls.
 */
export function InteriorScene({ locationId, players = [], player, templateId, home, hour, nepa, camera = 'dollhouse', interactiveCamera = true, children }: InteriorSceneProps) {
  const snapshot = useSnapshot().data;
  const minute = useGameMinute(4000);
  const homeInfo = home === undefined ? snapshot?.summary.home : home;
  const template = getTemplate(templateId ?? resolveTemplateId(locationId, homeInfo));
  const [glass, setGlass] = useState<MeshStandardMaterial | null>(null);
  const onGlass = useCallback((material: MeshStandardMaterial | null) => setGlass(material), []);

  const segment = snapshot ? segmentAt(snapshot, minute) : undefined;
  const animation = animationForSegment(segment);
  const resolvedPlayer = useMemo<InteriorPlayer | null>(() => {
    if (player !== undefined) return player;
    if (!snapshot) return null;
    const { character } = snapshot;
    return { appearance: character.appearance, outfit: character.outfit, gender: character.gender, animation, mood: character.mood };
  }, [player, snapshot, animation]);

  const h = currentHour(hour);
  const dayIndex = gameClock.ready ? toDateParts(minute).dayIndex : 0;
  const powerCut = nepa ?? (isHomeLocation(locationId) && isNepaOff(locationId, dayIndex, h));
  const lanternProp = template.props.find((prop) => prop.kind === 'lantern');
  const lantern = lanternProp ? ([lanternProp.at[0], lanternProp.y ?? 0, lanternProp.at[1]] as const) : undefined;
  const { room } = template;

  return (
    <group name={`interior:${template.id}`}>
      <InteriorLighting spec={template.lighting} room={room} glass={glass} hour={hour} nepa={powerCut} lantern={lantern} />
      <RoomShell template={template} onGlass={onGlass} />
      <Suspense fallback={null}>
        <FurnitureLayer placements={template.furniture} />
        {template.extras?.cars && <ShowroomCars cars={template.extras.cars} />}
      </Suspense>
      {template.extras?.clubLights && <ClubLights floor={template.extras.clubLights} ceiling={room.height} />}
      <InteriorPeople template={template} locationId={locationId} player={resolvedPlayer} players={players} />
      {camera === 'dollhouse' && <DollhouseCamera width={room.width} depth={room.depth} height={room.height} interactive={interactiveCamera} />}
      {children}
    </group>
  );
}
