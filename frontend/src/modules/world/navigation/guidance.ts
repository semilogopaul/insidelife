import type { CityRoute, ManeuverKind, RouteManeuver, WorldPoint } from '@insidelife/shared';

/**
 * Pure GPS guidance: where the player is along the route, which maneuver comes next, what to say and when.
 * No React, no three.js — unit-tested in `guidance.test.ts`.
 */

export interface RouteProgress {
  /** Metres travelled along the route (projection of the player onto the polyline). */
  readonly along: number;
  /** Distance from the player to the route polyline. */
  readonly offRoute: number;
}

/**
 * Projects a point onto the route. `hint` (the previous `along`) keeps the match local so a parallel street or a
 * loop never makes progress jump; falls back to the whole route when nothing nearby matches.
 */
export function projectOnRoute(route: CityRoute, point: WorldPoint, hint = 0): RouteProgress {
  const { points, cumulative } = route;
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestAlong = 0;
  const scan = (windowed: boolean): void => {
    for (let i = 1; i < points.length; i++) {
      const start = cumulative[i - 1] as number;
      const end = cumulative[i] as number;
      if (windowed && (end < hint - 40 || start > hint + 160)) continue;
      const a = points[i - 1] as WorldPoint;
      const b = points[i] as WorldPoint;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const lengthSq = dx * dx + dz * dz;
      const t = lengthSq > 0 ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / lengthSq)) : 0;
      const x = a.x + dx * t;
      const z = a.z + dz * t;
      const distance = Math.hypot(point.x - x, point.z - z);
      if (distance < bestDistance - 0.01) {
        bestDistance = distance;
        bestAlong = start + (end - start) * t;
      }
    }
  };
  scan(true);
  if (bestDistance > 30) scan(false);
  return { along: bestAlong, offRoute: bestDistance };
}

/** The first maneuver still ahead (skipping `depart` once moving). */
export function upcomingManeuver(maneuvers: readonly RouteManeuver[], along: number): RouteManeuver | null {
  for (const maneuver of maneuvers) {
    if (maneuver.kind === 'depart' && along > 15) continue;
    if (maneuver.at > along + 2) return maneuver;
  }
  return maneuvers[maneuvers.length - 1] ?? null;
}

export type TravelMode = 'walk' | 'drive';

/** Spoken distance, rounded the way people say it ("In 200 metres", "In 1.2 kilometres"). */
export function spokenDistance(metres: number): string {
  if (metres >= 950) return `${(Math.round(metres / 100) / 10).toFixed(1).replace(/\.0$/, '')} kilometres`;
  const rounded = metres >= 100 ? Math.round(metres / 50) * 50 : Math.max(10, Math.round(metres / 10) * 10);
  return `${rounded} metres`;
}

const lowerFirst = (text: string): string => text.charAt(0).toLowerCase() + text.slice(1);

/** Distance prompts per mode (metres) — far, near; "now" is spoken inside `NOW_RADIUS`. */
export const PROMPT_THRESHOLDS: Readonly<Record<TravelMode, readonly number[]>> = { drive: [200, 50], walk: [50] };
export const NOW_RADIUS: Readonly<Record<TravelMode, number>> = { drive: 18, walk: 8 };

/**
 * Decides what to say for a maneuver at a distance, remembering what was already said so prompts never repeat.
 * Prompts only fire inside a band below each threshold, so a maneuver that is already close does not trigger the
 * far prompt late.
 */
export class VoicePrompter {
  private spoken = new Map<RouteManeuver, Set<string>>();

  reset(): void {
    this.spoken = new Map();
  }

  next(maneuver: RouteManeuver, distance: number, mode: TravelMode): string | null {
    if (maneuver.kind === 'depart') return null;
    const said = this.spoken.get(maneuver) ?? new Set<string>();
    this.spoken.set(maneuver, said);
    if (maneuver.kind === 'arrive') return null;
    if (distance <= NOW_RADIUS[mode]) {
      if (said.has('now')) return null;
      said.add('now');
      return maneuver.text;
    }
    for (const threshold of PROMPT_THRESHOLDS[mode]) {
      const key = `t${threshold}`;
      if (said.has(key)) continue;
      if (distance <= threshold && distance > threshold * 0.55) {
        said.add(key);
        return `In ${spokenDistance(distance)}, ${lowerFirst(maneuver.text)}`;
      }
    }
    return null;
  }
}

/**
 * The banner text for a maneuver. The final `arrive` maneuver reads "LUTH is ahead" on the last stretch; "You have
 * arrived" is only said at the door.
 */
export function instructionText(maneuver: RouteManeuver, destinationName: string): string {
  return maneuver.kind === 'arrive' ? `${destinationName} is ahead` : maneuver.text;
}

/** Typical speeds for ETAs when the player's own speed is unknown (m/s). */
export const DEFAULT_SPEED: Readonly<Record<TravelMode, number>> = { drive: 12, walk: 2.4 };

export function etaSeconds(remaining: number, speed: number, mode: TravelMode): number {
  const effective = speed > 0.8 ? Math.max(speed, DEFAULT_SPEED[mode] * 0.5) : DEFAULT_SPEED[mode];
  return remaining / effective;
}

export type { ManeuverKind };
