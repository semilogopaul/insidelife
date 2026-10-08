import type { CityRoute, RouteManeuver, WorldPoint } from '@insidelife/shared';

/**
 * The active GPS route, shared by the in-canvas guidance (writer) and the DOM minimap (reader) without React
 * re-renders. `version` changes whenever the route is replaced.
 */
export interface ActiveRoute {
  route: CityRoute | null;
  maneuvers: readonly RouteManeuver[];
  destination: WorldPoint | null;
  destinationName: string | null;
  /** Metres travelled along the route. */
  along: number;
  version: number;
}

export const activeRoute: ActiveRoute = { route: null, maneuvers: [], destination: null, destinationName: null, along: 0, version: 0 };

export function setActiveRoute(route: CityRoute | null, maneuvers: readonly RouteManeuver[], destination: WorldPoint | null, destinationName: string | null): void {
  activeRoute.route = route;
  activeRoute.maneuvers = maneuvers;
  activeRoute.destination = destination;
  activeRoute.destinationName = destinationName;
  activeRoute.along = 0;
  activeRoute.version++;
}
