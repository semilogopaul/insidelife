'use client';

import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { MeshStandardMaterial } from 'three';
import { aircraftIdOfLocation, findAction, homeLocationId, isAircraftDecorTemplate, isHomeLocation, toDateParts, type ActionDefinition, type HomePersonDto, type HostTreatId, type PresencePlayerDto } from '@insidelife/shared';
import { gameClock } from '@/common/game/game-clock';
import { segmentAt, useSnapshot } from '@/common/game/snapshot';
import { useGameMinute } from '@/common/game/use-game-clock';
import { useDecorEdit } from '@/common/decor';
import { isBusy, isPlaceAction, placeActions, servicesAt, useActionAvailability, servicesWithGoal, useGoalHere, type GoalHere, type PlaceService } from '@/common/places';
import { useHomePeople, useVisits } from '@/common/visits';
import { animationForSegment } from '@/common/three/avatar';
import { withApronColliders } from '../aviation/terminal/apron-colliders';
import { layoutApron, type ApronPlane } from '../aviation/terminal/apron-layout';
import { Apron, type AirsideProps } from '../aviation/terminal/Apron';
import { AIRSIDE_ID } from '../aviation/terminal/terminal-templates';
import { ClubLights } from './effects/ClubLights';
import { DollhouseCamera } from './components/DollhouseCamera';
import { FurnitureLayer } from './components/FurnitureLayer';
import { InteriorLighting, currentHour } from './components/InteriorLighting';
import { InteriorPeople, type InteriorPlayer } from './components/InteriorPeople';
import { RoomShell } from './components/RoomShell';
import { ShowroomCars } from './components/ShowroomCars';
import { TvScreens } from './components/TvScreens';
import { DecorWorld } from './decor/DecorWorld';
import { piecesSignature } from './decor/DecorLayer';
import { withDecorColliders } from './decor/decor-scene';
import { useRoomDecor, type DecorMode } from './decor/use-room-decor';
import type { ActionLike } from './hotspots/action-spots';
import { buildHotspots, hotspotRoom, type ActionStatus } from './hotspots/hotspots';
import { withSeating } from './hotspots/seating';
import { placeLayoutFor } from './layouts/catalog';
import { applyDecor } from './templates/decor';
import { furnish } from './templates/furnish';
import { getTemplate } from './templates/registry';
import { isNepaOff, resolveTemplateId, type HomeInfo, type InteriorTemplateId } from './templates/resolve';
import { HomeWalkLayer } from './walk/HomeWalk';
import { walkerFoot } from './walk/walk-pose';
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
  /** The life goal that brought you here and what advances it; defaults to the player's goals. Previews pass one. */
  readonly goal?: GoalHere | null;
  /**
   * The General Aviation Terminal's airside: your plane on your stand, other players' planes (at most six are drawn) and
   * what happens when you walk up to your plane's door. Ignored in every other room.
   */
  readonly airside?: AirsideProps;
  /**
   * The aircraft whose cabin is on screen (one of the `aircraft-<class>` layouts): draws its owner's cabin decor for the
   * owner and for anyone aboard, and lets the owner rearrange it in Decorate mode. Defaults to the aircraft named by
   * the location (`aircraft:<id>`, i.e. while you are aboard); previews pass nothing and show the bare cabin.
   */
  readonly aircraftId?: string;
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
const NO_PLANES: readonly ApronPlane[] = [];
const NO_HOTSPOTS: ReturnType<typeof buildHotspots> = [];
/** Far below the floor (its light has a 5 m reach): keeps the light rig identical across a home's rooms. */
const SPARE_LANTERN = [0, -20, 0] as const;

export function InteriorScene({ locationId, players: present = NO_PLAYERS, player, templateId, home, hour, nepa, camera = 'dollhouse', interactiveCamera = true, aircraftId: aircraftProp, homeItems: previewItems, actions: actionsOverride, busy: busyOverride, services: servicesOverride, goal: goalOverride, airside, children }: InteriorSceneProps) {
  const snapshot = useSnapshot().data;
  const minute = useGameMinute(4000);
  const ownHome = snapshot !== undefined && locationId === homeLocationId(snapshot.character.id) && templateId === undefined;
  // Someone else's home you were invited to: their room and furniture (as of the invite), and them in it.
  const hostId = isHomeLocation(locationId) && templateId === undefined ? locationId.slice('home:'.length) : null;
  const visits = useVisits(snapshot !== undefined && hostId !== null).data;
  const visit = !ownHome && hostId ? visits?.incoming.find((candidate) => candidate.home.locationId === locationId) : undefined;
  const hosting = ownHome && (visits?.outgoing.some((candidate) => candidate.status === 'accepted') ?? false);
  const homePeople = useHomePeople(visit || hosting ? hostId : null).data;
  const people = homePeople?.people;
  // What the host put out for guests: plates and drinks on the table, for host and guests alike (keyed by ids, so a
  // poll that only changes who's doing what doesn't rebuild the room).
  const treatIds = homePeople?.treats.map((treat) => treat.treatId).join(',') ?? '';
  const treats = useMemo(() => (treatIds ? (treatIds.split(',') as HostTreatId[]) : undefined), [treatIds]);
  const homeInfo = home === undefined ? (visit?.home ?? snapshot?.summary.home) : home;
  const resolvedId = templateId ?? resolveTemplateId(locationId, homeInfo);
  const segment = snapshot ? segmentAt(snapshot, minute) : undefined;
  const animation = animationForSegment(segment);
  // Every place is a layout of walkable rooms (a venue has one); which room is on screen is client view state (`walk/`).
  const showsPlayer = player !== null && (player !== undefined || snapshot !== undefined);
  const runningId = player === undefined ? (segment?.actionId ?? null) : (player?.actionId ?? null);
  const house = useHomeRoom(placeLayoutFor(resolvedId, templateId === undefined && !isHomeLocation(locationId) ? locationId : null), locationId, player?.animation ?? animation, camera === 'dollhouse' && showsPlayer, runningId);
  const base = house?.room.template ?? getTemplate(resolvedId);
  // Your own home shows what you own; other places show their template.
  const homeItems = snapshot?.summary.homeItems;
  const ownership = snapshot?.summary.home.ownership;
  const decor = snapshot?.summary.home.decor;
  const pantryMeals = snapshot?.summary.pantryMeals ?? 0;
  const surname = ownHome ? snapshot?.character.lastName : visit?.host.lastName;
  const furnished = useMemo(() => {
    if (previewItems) return furnish(base, previewItems, { providedFurniture: /^home-(family|hostel)(:|$)/.test(base.id) });
    // Your paint and floor go on every room of the home (and the host's on a visit).
    if (visit) return applyDecor(furnish(base, visit.home.items, { providedFurniture: visit.home.ownership === 'family' || visit.home.ownership === 'hostel', surname, treats }), visit.home.decor);
    return ownHome && homeItems ? applyDecor(furnish(base, homeItems, { providedFurniture: ownership === 'family' || ownership === 'hostel', pantryMeals, surname, treats }), decor) : base;
  }, [base, ownHome, homeItems, ownership, pantryMeals, previewItems, visit, surname, decor, treats]);
  // Decor: yours in your own home, the host's when you're a guest. The walker bumps into the solid pieces.
  const aircraftId = previewItems ? null : (aircraftProp ?? aircraftIdOfLocation(locationId));
  const decorMode: DecorMode = aircraftId
    ? { aircraftId }
    : templateId !== undefined || previewItems
      ? null
      : ownHome
        ? 'own'
        : visit && hostId
          ? { hostId }
          : null;
  const decorTemplateId = house?.layout.id;
  const decorRoomId = house?.room.id;
  const roomDecor = useRoomDecor(decorMode, decorTemplateId, decorRoomId);
  const decorating = useDecorEdit((state) => state.active) && roomDecor.editable;
  // The overlay (DOM) needs to know which cabin this is; it is client view state, cleared when the cabin goes.
  const cabinAircraftId = aircraftId && decorTemplateId && isAircraftDecorTemplate(decorTemplateId) ? aircraftId : null;
  useEffect(() => {
    useDecorEdit.getState().setCabin(cabinAircraftId);
    return () => useDecorEdit.getState().setCabin(null);
  }, [cabinAircraftId]);
  const decorSignature = piecesSignature(roomDecor.placed);
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

  // Seats are limited and some are the NPCs': whoever sits down (you for your action, the others present) gets one.
  const playerAnimation = resolvedPlayer?.animation ?? null;
  const playerActionId = resolvedPlayer?.actionId ?? null;
  const seatAction = useMemo<ActionLike | null>(() => {
    if (!playerAnimation) return null;
    const found = playerActionId ? findAction(playerActionId) : undefined;
    return found && found.animation === playerAnimation ? found : { animation: playerAnimation };
  }, [playerAnimation, playerActionId]);
  // (A home keeps what you own: nobody conjures a sofa for you; a venue always has a seat for whoever sits down.)
  const atHome = isHomeLocation(locationId);
  const template = useMemo(() => (atHome ? furnished : withSeating(furnished, { action: seatAction, others: players.length })), [furnished, atHome, seatAction, players.length]);
  // The walker bumps into the solid decor pieces (on top of the room, seats included).
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the signature stands for the placed pieces
  const decorTemplate = useMemo(() => withDecorColliders(template, roomDecor.placed), [template, decorSignature]);
  // On the airside apron the parked planes are solid too (the same layout the apron draws).
  const onApron = template.id === AIRSIDE_ID;
  const apronPlanes = useMemo(() => (onApron ? layoutApron(airside?.own ?? null, airside?.others ?? NO_PLANES) : null), [onApron, airside?.own, airside?.others]);
  const walkTemplate = useMemo(() => (apronPlanes ? withApronColliders(decorTemplate, apronPlanes) : decorTemplate), [decorTemplate, apronPlanes]);

  // Hotspots: the place's own actions (not the do-anywhere ones) anchored where they happen in this room.
  const here = snapshot !== undefined && snapshot.character.locationId === locationId;
  const listed = useMemo(() => actionsOverride ?? (here ? placeActions(snapshot).actions : NO_ACTIONS), [actionsOverride, here, snapshot]);
  const venueType = here ? placeActions(snapshot).place?.venue?.type ?? null : null;
  const services = useMemo(() => servicesOverride ?? (venueType ? servicesAt({ kind: 'venue', venueType }) : NO_SERVICES), [servicesOverride, venueType]);
  // A goal that sent you here: what advances it is first at its hotspot, and highlighted.
  const ownActions = useMemo(() => listed.filter(isPlaceAction), [listed]);
  const goalHere = useGoalHere(goalOverride === undefined ? venueType : null, ownActions, services);
  const goal = goalOverride === undefined ? goalHere : goalOverride;
  const busy = busyOverride ?? (here && isBusy(snapshot, minute));
  // Same rules and reasons as the venue sheet (open hours, age, money…); previews without a session allow everything.
  const availability = useActionAvailability(here ? snapshot : undefined);
  const status = useCallback((entry: ActionDefinition | PlaceService): ActionStatus => {
    const { priceNote, reason } = availability(entry);
    return { priceNote, reason };
  }, [availability]);
  const houseLayout = house?.layout;
  const houseRoom = house?.room;
  const hotspots = useMemo(() => {
    if (!houseLayout || !houseRoom || decorating) return NO_HOTSPOTS;
    const own = listed.filter((action) => isPlaceAction(action) && (houseLayout.rooms.length <= 1 || hotspotRoom(houseLayout, action) === houseRoom.id));
    // Services belong to the room you come in by (a venue's only room); the goal's own one joins them there.
    const here = houseRoom.id === houseLayout.entry ? servicesWithGoal(services, goal) : NO_SERVICES;
    return buildHotspots(template, own, houseRoom.template, here, goal);
  }, [houseLayout, houseRoom, listed, template, services, goal, decorating]);

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
        {decorMode !== null && decorTemplateId && decorRoomId && (
          <DecorWorld template={template} templateId={decorTemplateId} roomId={decorRoomId} decor={roomDecor} />
        )}
        <TvScreens furniture={template.furniture} powerCut={powerCut} />
        {template.extras?.cars && <ShowroomCars cars={template.extras.cars} />}
        {onApron && <Apron own={airside?.own ?? null} others={airside?.others ?? NO_PLANES} onBoard={airside?.onBoard} getPlayer={walkerFoot} />}
      </Suspense>
      {template.extras?.clubLights && <ClubLights floor={template.extras.clubLights} ceiling={room.height} />}
      <InteriorPeople template={template} locationId={locationId} player={walking ? null : resolvedPlayer} players={players} />
      {walking && house && resolvedPlayer && <HomeWalkLayer home={house} template={walkTemplate} player={resolvedPlayer} guests={players.length} hotspots={hotspots} busy={busy} status={status} goal={goal} />}
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
