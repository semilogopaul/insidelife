/**
 * Aviation, the 3D side (docs/MULTI_CITY.md). Exteriors, cabins, the General Aviation Terminal and the flight sequence.
 *
 * - `<Aircraft cls livery />` — a low-poly plane in a livery (name and `5N-XXX` painted on).
 * - `aircraftLayoutFor(cls)` / `AIRCRAFT_LAYOUTS` — walkable cabin + cockpit layouts (also registered as the
 *   `aircraft-<class>` interior templates, previewable at /dev/interiors?type=aircraft-light-jet).
 * - `AVIATION_TERMINAL_LAYOUT` — lounge + airside (template id `aviation-terminal`); `<InteriorScene airside={{ own, others, onBoard }} />`.
 * - `<FlightScene>` + `<FlightOverlay>` (or the all-in-one `<FlightSequence>`) — take-off, cruise, landing.
 * - Preview everything at /dev/aviation.
 */
export { Aircraft, type AircraftProps } from './model/Aircraft';
export { AIRCRAFT_SPECS, aircraftSpec, doorPoint, type AircraftSpec } from './model/aircraft-spec';
export {
  AIRCRAFT_CLASSES,
  AIRCRAFT_CLASS_OF,
  AIRCRAFT_IDS,
  AIRCRAFT_NAME_MAX,
  AVIATION_TERMINAL_TYPE,
  DEFAULT_LIVERY,
  GAT_VENUE_IDS,
  isRegistration,
  type AircraftClass,
  type AircraftId,
  type AircraftLivery,
} from './contract';
export { AIRCRAFT_LAYOUTS, AIRCRAFT_TEMPLATE_IDS, aircraftLayoutFor, aircraftTemplateId, type AircraftTemplateId } from './cabin/cabin-layouts';
export { AVIATION_TERMINAL_LAYOUT } from './terminal/terminal-layout';
export { AIRSIDE_ID, AVIATION_TERMINAL_ID } from './terminal/terminal-templates';
export { Apron, type AirsideProps, type ApronProps } from './terminal/Apron';
export { layoutApron, MAX_OTHERS, type ApronLayout, type ApronPlane, type PlacedPlane } from './terminal/apron-layout';
export { FlightScene, defaultQuality, type FlightQuality, type FlightSceneProps } from './flight/FlightScene';
export { FlightOverlay, type FlightOverlayProps } from './flight/FlightOverlay';
export { FlightSequence, type FlightSequenceProps } from './flight/FlightSequence';
export { flightAt, flightProfile, type FlightPhase, type FlightState } from './flight/flight-timeline';
