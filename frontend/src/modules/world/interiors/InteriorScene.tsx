'use client';

import { Suspense, useCallback, useMemo, useState, type ReactNode } from 'react';
import type { MeshStandardMaterial } from 'three';
import { homeLocationId, isHomeLocation, toDateParts, type HomePersonDto, type PresencePlayerDto } from '@insidelife/shared';
import { gameClock } from '@/common/game/game-clock';
import { segmentAt, useSnapshot } from '@/common/game/snapshot';
import { useGameMinute } from '@/common/game/use-game-clock';
import { useHomePeople, useVisits } from '@/common/visits';
import { animationForSegment } from '@/common/three/avatar';
import { ClubLights } from './effects/ClubLights';
import { DollhouseCamera } from './components/DollhouseCamera';
import { FurnitureLayer } from './components/FurnitureLayer';
import { InteriorLighting, currentHour } from './components/InteriorLighting';
import { InteriorPeople, type InteriorPlayer } from './components/InteriorPeople';
import { RoomShell } from './components/RoomShell';
import { ShowroomCars } from './components/ShowroomCars';
import { TvScreens } from './components/TvScreens';
import { homeLayoutFor } from './layouts/catalog';
import { applyDecor } from './templates/decor';
import { furnish } from './templates/furnish';
import { getTemplate } from './templates/registry';
import { isNepaOff, resolveTemplateId, type HomeInfo, type InteriorTemplateId } from './templates/resolve';
import { HomeWalkLayer } from './walk/HomeWalk';
import { peopleInRoom, useHomeRoom } from './walk/use-home-room';

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
  /** Previews: furnish the room with these belongings as if it were your rented/owned home. */
  readonly homeItems?: readonly string[];
  /** Extra scene content (e.g. `<MoneyRain />` triggered by the play layer). */
  readonly children?: ReactNode;
}

/**
 * A cosy, readable dollhouse of the place the player is in: the template comes from the venue type (or the kind of
 * home), furniture from the Kenney kit, Lagos props, the player animating by their current activity, ambient NPCs
 * and other players present. Lit by the game clock. ≤ 80 draw calls.
 */
const NO_PLAYERS: readonly PresencePlayerDto[] = [];
/** Far below the floor (its light has a 5 m reach): keeps the light rig identical across a home's rooms. */
const SPARE_LANTERN = [0, -20, 0] as const;

export function InteriorScene({ locationId, players: present = NO_PLAYERS, player, templateId, home, hour, nepa, camera = 'dollhouse', interactiveCamera = true, homeItems: previewItems, children }: InteriorSceneProps) {
  const snapshot = useSnapshot().data;
  const minute = useGameMinute(4000);
  const ownHome = snapshot !== undefined && locationId === homeLocationId(snapshot.character.id) && templateId === undefined;
  // Someone else's home you were invited to: their room and furniture (as of the invite), and them in it.
  const hostId = isHomeLocation(locationId) && templateId === undefined ? locationId.slice('home:'.length) : null;
  const visits = useVisits(snapshot !== undefined && hostId !== null).data;
  const visit = !ownHome && hostId ? visits?.incoming.find((candidate) => candidate.home.locationId === locationId) : undefined;
  const hosting = ownHome && (visits?.outgoing.some((candidate) => candidate.status === 'accepted') ?? false);
  const people = useHomePeople(visit || hosting ? hostId : null).data?.people;
  const homeInfo = home === undefined ? (visit?.home ?? snapshot?.summary.home) : home;
  const resolvedId = templateId ?? resolveTemplateId(locationId, homeInfo);
  const segment = snapshot ? segmentAt(snapshot, minute) : undefined;
  const animation = animationForSegment(segment);
  // Homes are layouts of one or more walkable rooms; which room is on screen is client view state (`walk/`).
  const showsPlayer = player !== null && (player !== undefined || snapshot !== undefined);
  const house = useHomeRoom(homeLayoutFor(resolvedId), locationId, player?.animation ?? animation, camera === 'dollhouse' && showsPlayer);
  const base = house?.room.template ?? getTemplate(resolvedId);
  // Your own home shows what you own; other places show their template.
  const homeItems = snapshot?.summary.homeItems;
  const ownership = snapshot?.summary.home.ownership;
  const decor = snapshot?.summary.home.decor;
  const pantryMeals = snapshot?.summary.pantryMeals ?? 0;
  const surname = ownHome ? snapshot?.character.lastName : visit?.host.lastName;
  const template = useMemo(() => {
    if (previewItems) return furnish(base, previewItems, { providedFurniture: base.id === 'home-family' || base.id === 'home-hostel' });
    // Your paint and floor go on every room of the home (and the host's on a visit).
    if (visit) return applyDecor(furnish(base, visit.home.items, { providedFurniture: visit.home.ownership === 'family' || visit.home.ownership === 'hostel', surname }), visit.home.decor);
    return ownHome && homeItems ? applyDecor(furnish(base, homeItems, { providedFurniture: ownership === 'family' || ownership === 'hostel', pantryMeals, surname }), decor) : base;
  }, [base, ownHome, homeItems, ownership, pantryMeals, previewItems, visit, surname, decor]);
  const everyone = useMemo(() => (people ? [...present, ...people.map((person) => asPresence(person, locationId))] : present), [present, people, locationId]);
  const homeLayout = house?.layout ?? null;
  const homeRoomId = house?.room.id ?? null;
  const players = useMemo(() => (homeLayout && homeRoomId ? peopleInRoom(homeLayout, homeRoomId, everyone) : everyone), [homeLayout, homeRoomId, everyone]);
  const [glass, setGlass] = useState<MeshStandardMaterial | null>(null);
  const onGlass = useCallback((material: MeshStandardMaterial | null) => setGlass(material), []);

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
  // Rooms of one home keep the same lights (a spare, unlit lantern where there's none) so moving between them never
  // changes the light count, which would recompile every shader.
  const lantern = lanternProp ? ([lanternProp.at[0], lanternProp.y ?? 0, lanternProp.at[1]] as const) : (house?.layout.rooms.length ?? 0) > 1 ? SPARE_LANTERN : undefined;
  const { room } = template;
  const walking = house?.walkable === true && resolvedPlayer !== null;

  return (
    <group name={`interior:${template.id}`}>
      <InteriorLighting spec={template.lighting} room={room} glass={glass} hour={hour} nepa={powerCut} lantern={lantern} />
      <RoomShell template={template} onGlass={onGlass} />
      <Suspense fallback={null}>
        <FurnitureLayer placements={template.furniture} />
        <TvScreens furniture={template.furniture} powerCut={powerCut} />
        {template.extras?.cars && <ShowroomCars cars={template.extras.cars} />}
      </Suspense>
      {template.extras?.clubLights && <ClubLights floor={template.extras.clubLights} ceiling={room.height} />}
      <InteriorPeople template={template} locationId={locationId} player={walking ? null : resolvedPlayer} players={players} />
      {walking && house && resolvedPlayer && <HomeWalkLayer home={house} template={template} player={resolvedPlayer} guests={players.length} />}
      {camera === 'dollhouse' && !(walking && house?.camera === 'walk') && <DollhouseCamera width={room.width} depth={room.depth} height={room.height} interactive={interactiveCamera} />}
      {children}
    </group>
  );
}

/** A host or guest in the home, drawn like any other player present. */
function asPresence(person: HomePersonDto, locationId: string): PresencePlayerDto {
  return {
    characterId: person.id,
    handle: person.handle,
    firstName: person.firstName,
    gender: person.gender,
    appearance: person.appearance,
    outfit: person.outfit,
    locationId,
    activity: person.activity,
    status: 0,
  };
}
