'use client';

import { Suspense, useCallback, useMemo, useState, type ReactNode } from 'react';
import type { MeshStandardMaterial } from 'three';
import { homeLocationId, isHomeLocation, toDateParts, type ActionDefinition, type HomePersonDto, type PresencePlayerDto } from '@insidelife/shared';
import { gameClock } from '@/common/game/game-clock';
import { segmentAt, useSnapshot } from '@/common/game/snapshot';
import { useGameMinute } from '@/common/game/use-game-clock';
import { isBusy, isPlaceAction, placeActions, servicesAt, useActionAvailability, type PlaceService } from '@/common/places';
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
import { buildHotspots, hotspotRoom, type ActionStatus } from './hotspots/hotspots';
import { placeLayoutFor } from './layouts/catalog';
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
  /** What can be done here (hotspots); defaults to the snapshot's place actions. Previews pass their own. */
  readonly actions?: readonly ActionDefinition[];
  /** Something chosen is running (hotspots hidden); defaults to the snapshot. */
  readonly busy?: boolean;
  /** Phone-app services found here (browse cars, see a doctor); defaults to the venue's. Previews pass their own. */
  readonly services?: readonly PlaceService[];
  /** Extra scene content (e.g. `<MoneyRain />` triggered by the play layer). */
  readonly children?: ReactNode;
}

/**
 * A cosy, readable room of the place the player is in: the template comes from the venue type (or the kind of
 * home), furniture from the Kenney kit, Lagos props, ambient NPCs and other players present, lit by the game clock.
 * With a player it's walkable (homes are layouts of rooms, venues one room): the avatar walks about, hotspots offer
 * the place's actions where they happen, and an action walks the avatar to its spot. ≤ ~100 draw calls.
 */
const NO_PLAYERS: readonly PresencePlayerDto[] = [];
const NO_ACTIONS: readonly ActionDefinition[] = [];
const NO_SERVICES: readonly PlaceService[] = [];
/** Far below the floor (its light has a 5 m reach): keeps the light rig identical across a home's rooms. */
const SPARE_LANTERN = [0, -20, 0] as const;

export function InteriorScene({ locationId, players: present = NO_PLAYERS, player, templateId, home, hour, nepa, camera = 'dollhouse', interactiveCamera = true, homeItems: previewItems, actions: actionsOverride, busy: busyOverride, services: servicesOverride, children }: InteriorSceneProps) {
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
  // Every place is a layout of walkable rooms (a venue has one); which room is on screen is client view state (`walk/`).
  const showsPlayer = player !== null && (player !== undefined || snapshot !== undefined);
  const house = useHomeRoom(placeLayoutFor(resolvedId), locationId, player?.animation ?? animation, camera === 'dollhouse' && showsPlayer);
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

  const actionId = segment?.actionId ?? null;
  const resolvedPlayer = useMemo<InteriorPlayer | null>(() => {
    if (player !== undefined) return player;
    if (!snapshot) return null;
    const { character } = snapshot;
    return { appearance: character.appearance, outfit: character.outfit, gender: character.gender, animation, mood: character.mood, actionId };
  }, [player, snapshot, animation, actionId]);

  // Hotspots: the place's own actions (not the do-anywhere ones) anchored where they happen in this room.
  const here = snapshot !== undefined && snapshot.character.locationId === locationId;
  const listed = useMemo(() => actionsOverride ?? (here ? placeActions(snapshot).actions : NO_ACTIONS), [actionsOverride, here, snapshot]);
  const venueType = here ? placeActions(snapshot).place?.venue?.type ?? null : null;
  const services = useMemo(() => servicesOverride ?? (venueType ? servicesAt({ kind: 'venue', venueType }) : NO_SERVICES), [servicesOverride, venueType]);
  const busy = busyOverride ?? (here && isBusy(snapshot));
  // Same rules and reasons as the venue sheet (open hours, age, money…); previews without a session allow everything.
  const availability = useActionAvailability(here ? snapshot : undefined);
  const status = useCallback((action: ActionDefinition): ActionStatus => {
    const { priceNote, reason } = availability(action);
    return { priceNote, reason };
  }, [availability]);
  const houseLayout = house?.layout;
  const houseRoom = house?.room;
  const hotspots = useMemo(() => {
    if (!houseLayout || !houseRoom) return [];
    const own = listed.filter((action) => isPlaceAction(action) && (houseLayout.rooms.length <= 1 || hotspotRoom(houseLayout, action) === houseRoom.id));
    // Services belong to the room you come in by (a venue's only room).
    return buildHotspots(template, own, houseRoom.template, houseRoom.id === houseLayout.entry ? services : NO_SERVICES);
  }, [houseLayout, houseRoom, listed, template, services]);

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
      {walking && house && resolvedPlayer && <HomeWalkLayer home={house} template={template} player={resolvedPlayer} guests={players.length} hotspots={hotspots} busy={busy} status={status} />}
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
