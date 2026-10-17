'use client';

import {
  findVenue,
  homeEntrance,
  homeKey,
  homeLocationId,
  isHomeLocation,
  isIntercityMode,
  isStreetLocation,
  venueEntrance,
  type ActionDefinition,
  type CharacterSnapshotDto,
  type DistrictId,
  type PresencePlayerDto,
  type WeatherCondition,
  type WorldPoint,
} from '@insidelife/shared';
import { PerformanceMonitor } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAboard } from '@/common/aviation';
import { useSnapshot } from '@/common/game/snapshot';
import { useUi, type GraphicsQuality } from '@/common/game/ui-store';
import { useWorld, type PlayerMode } from '@/common/game/world-store';
import type { PlaceService } from '@/common/places';
import { CityScene } from './city/CityScene';
import { isCoarseDevice, resolveQuality, type QualityProfile } from './city/lib/quality';
import { setWorldTimeOverride } from './city/lib/world-time';
import { Diagnostics } from './city/stage/Diagnostics';
import { ReviewCamera } from './city/stage/ReviewCamera';
import { FlightScene } from './aviation/flight/FlightScene';
import { AviationOverlay } from './aviation/flow/AviationOverlay';
import { useAviationScene, type AviationScene } from './aviation/flow/use-aviation-scene';
import { InteriorOverlay, InteriorScene } from './interiors';
import { useVenueGuests } from './interiors/use-venue-guests';
import { NavigationLayer } from './navigation/NavigationLayer';
import { InteriorMoments, InteriorSpray, PLAY_LAYER_OWNS_CAMERA, PlayLayer, PlayOverlay, usePlayBridge, type SandboxStart } from './play';
import { STREET_CAMERA } from './play/camera-defaults';
import { SpeechBubbles } from './speech/SpeechBubbles';
import { SpeechProjector } from './speech/SpeechProjector';

/** Where the city opens when nothing better is known (Herbert Macaulay Way by UNILAG). */
const DEFAULT_FOCUS: WorldPoint = venueEntrance('unilag')?.position ?? { x: 0, z: 0 };

/** The door the player last came through: their current venue/home, else the venue they are travelling from. */
function spawnPoint(snapshot: CharacterSnapshotDto | undefined): WorldPoint {
  if (!snapshot) return DEFAULT_FOCUS;
  const { character } = snapshot;
  const locationId = snapshot.travel?.toLocationId ?? character.locationId;
  if (locationId === homeLocationId(character.id)) return homeEntrance(homeKey(character.id, character.homePropertyId), character.homeDistrictId as DistrictId).position;
  if (findVenue(locationId)) return venueEntrance(locationId)?.position ?? DEFAULT_FOCUS;
  return DEFAULT_FOCUS;
}

type Presence = 'outside' | 'inside' | 'riding';

/**
 * The single world <Canvas>. Outside (street or on a booked ride) it renders the city, GPS and the play layer (plus
 * the play overlay's DOM: touch controls, name tags, sponsor sheet); inside a venue or home it renders that
 * interior. It owns the coarse player mode in the world store; the play layer refines `walking` ↔ `driving`.
 */
export function WorldCanvas() {
  const { data: snapshot } = useSnapshot();
  const setMode = useWorld((state) => state.setMode);
  const locationId = snapshot?.character.locationId ?? null;
  // A ride plays on the city's roads; a flight or the coach is spent inside the departure venue until the landing.
  const presence: Presence = snapshot?.travel && !isIntercityMode(snapshot.travel.mode) ? 'riding' : !locationId || isStreetLocation(locationId) ? 'outside' : 'inside';
  // Other players at the venue you're in are drawn at its guest spots (homes get their host and guests from visits).
  const guests = useVenueGuests(presence === 'inside' && locationId && !isHomeLocation(locationId) ? locationId : null);
  // Flying: the apron's planes, your plane's cabin, the sky itself (see `modules/world/aviation/flow`).
  const aviation = useAviationScene();

  useEffect(() => {
    const mode: PlayerMode = presence === 'outside' ? 'walking' : presence;
    setMode(mode);
  }, [presence, setMode]);
  // Stepping outside, the context button's keys (always on, inside and out).
  usePlayBridge(presence);

  // Only the review camera (play layer disabled) uses a focus point; the play layer follows the player itself.
  const focus = useMemo(() => spawnPoint(snapshot), [snapshot]);

  return (
    <>
      <WorldStage>
        {presence === 'inside' && aviation.kind === 'sky' ? (
          <FlightScene
            key={aviation.key}
            cls={aviation.flight.cls}
            livery={aviation.flight.livery}
            durationMs={aviation.durationMs}
            onDone={() => useAboard.getState().skipFlight(aviation.key)}
          />
        ) : presence === 'inside' && locationId ? (
          <InteriorOrCabin locationId={locationId} guests={guests} aviation={aviation} />
        ) : (
          <OutsideWorld focus={focus} play={PLAY_LAYER_OWNS_CAMERA ? 'game' : null} />
        )}
        <SpeechProjector />
      </WorldStage>
      <PlayOverlay presence={presence} />
      <SpeechBubbles inside={presence === 'inside'} />
      {presence === 'inside' && <InteriorOverlay />}
      {presence === 'inside' && <AviationOverlay scene={aviation} />}
    </>
  );
}

const NO_ACTIONS: readonly ActionDefinition[] = [];
const NO_SERVICES: readonly PlaceService[] = [];

/** The venue's interior, or the cabin of the plane you are sitting in (parked on the apron, or in the air). */
function InteriorOrCabin({ locationId, guests, aviation }: { readonly locationId: string; readonly guests: readonly PresencePlayerDto[]; readonly aviation: AviationScene }) {
  if (aviation.kind === 'cabin') {
    return <InteriorScene key={aviation.templateId} locationId={locationId} templateId={aviation.templateId} players={aviation.players} actions={NO_ACTIONS} services={NO_SERVICES} goal={null} busy={false} />;
  }
  return (
    <InteriorScene locationId={locationId} players={guests} airside={aviation.kind === 'terminal' ? aviation.airside : undefined}>
      {!isHomeLocation(locationId) && <InteriorSpray venueId={locationId} />}
      {!isHomeLocation(locationId) && <InteriorMoments venueId={locationId} />}
    </InteriorScene>
  );
}

export interface CityPreviewProps {
  /** Pin the hour of day (0–24). */
  readonly hour?: number | null;
  readonly weather?: WeatherCondition | null;
  /** Where the review camera looks (defaults to UNILAG). */
  readonly focus?: WorldPoint;
  readonly cameraOffset?: readonly [number, number, number];
  /** Override the player's graphics setting (QA). */
  readonly graphics?: GraphicsQuality;
  /** Play-test sandbox (no session): walk/drive from a venue door instead of the review camera. */
  readonly play?: SandboxStart | null;
}

/** The city without a session (dev route, landing visuals): pinned time/weather, review camera or a play sandbox. */
export function CityPreview({ hour = null, weather = null, focus = DEFAULT_FOCUS, cameraOffset, graphics, play = null }: CityPreviewProps) {
  useEffect(() => {
    setWorldTimeOverride(hour, weather);
    return () => setWorldTimeOverride(null, null);
  }, [hour, weather]);
  return (
    <>
      <WorldStage graphics={graphics}>
        <OutsideWorld focus={focus} cameraOffset={cameraOffset} play={play} />
      </WorldStage>
      {play && <PlayOverlay presence="outside" />}
    </>
  );
}

function OutsideWorld({ focus, cameraOffset, play }: { readonly focus: WorldPoint; readonly cameraOffset?: readonly [number, number, number]; readonly play: 'game' | SandboxStart | null }) {
  const quality = useQualityContext();
  return (
    <>
      <CityScene quality={quality} />
      <NavigationLayer />
      {play ? <PlayLayer quality={quality} sandbox={play === 'game' ? null : play} /> : <ReviewCamera focus={focus} offset={cameraOffset} />}
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------------

const QualityContext = createContext<QualityProfile>(resolveQuality('auto', false, 0));
const useQualityContext = (): QualityProfile => useContext(QualityContext);

function WorldStage({ children, graphics: forced }: { readonly children: ReactNode; readonly graphics?: GraphicsQuality }) {
  const setting = useUi((state) => state.settings.graphics);
  const graphics = forced ?? setting;
  const [declines, setDeclines] = useState(0);
  const coarse = useMemo(() => isCoarseDevice(), []);
  const quality = useMemo(() => resolveQuality(graphics, coarse, declines), [graphics, coarse, declines]);

  return (
    <Canvas
      className="!absolute inset-0"
      dpr={[quality.dpr[0], quality.dpr[1]]}
      shadows={quality.shadows ? 'percentage' : false}
      camera={{ ...STREET_CAMERA, position: [0, 80, 120] }}
      gl={{ antialias: quality.tier !== 'low', powerPreference: 'high-performance', stencil: false }}
    >
      <PerformanceMonitor onDecline={() => setDeclines((count) => Math.min(2, count + 1))} flipflops={3} />
      <QualityContext.Provider value={quality}>{children}</QualityContext.Provider>
      {process.env.NODE_ENV !== 'production' && <Diagnostics quality={quality} />}
    </Canvas>
  );
}
