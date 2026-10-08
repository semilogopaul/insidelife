import type { DrivenVehicleDto, SpawnPoint } from '@insidelife/shared';

/**
 * Hands the spawn point from whoever stepped outside (the world bridge, the venue sheet) to the play layer, which
 * mounts a moment later when the snapshot says "street". Also keeps a per-tab copy of the last open-world pose so a
 * reload outside resumes where you were (a convenience; the server's anti-teleport check stays authoritative).
 */

export interface SpawnOffer {
  readonly spawn: SpawnPoint;
  /** False when the spawn was derived locally (the car still has to be looked up). */
  readonly fromServer: boolean;
  readonly at: number;
}

let pending: SpawnOffer | null = null;
const listeners = new Set<(offer: SpawnOffer) => void>();

export const spawnHandoff = {
  offer(spawn: SpawnPoint, fromServer: boolean): void {
    pending = { spawn, fromServer, at: Date.now() };
    for (const listener of listeners) listener(pending);
  },
  /** The pending spawn, consumed (stale offers older than a minute are ignored). */
  take(): SpawnOffer | null {
    const offer = pending;
    pending = null;
    return offer && Date.now() - offer.at < 60_000 ? offer : null;
  },
  peek(): SpawnOffer | null {
    return pending;
  },
  subscribe(listener: (offer: SpawnOffer) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export interface SavedPose {
  readonly characterId: string;
  readonly x: number;
  readonly z: number;
  readonly heading: number;
  readonly driving: boolean;
  readonly car: { readonly x: number; readonly z: number; readonly heading: number; readonly vehicle: DrivenVehicleDto } | null;
  readonly savedAt: number;
}

const KEY = 'insidelife:open-world-pose';
/** A saved pose older than this is ignored (the server forgets positions after 15 minutes). */
const MAX_AGE_MS = 15 * 60_000;

export function savePose(pose: SavedPose): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(pose));
  } catch {
    // Storage unavailable (private mode): resuming after a reload just starts at the district centre.
  }
}

export function loadPose(characterId: string): SavedPose | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const pose = JSON.parse(raw) as SavedPose;
    if (pose.characterId !== characterId || Date.now() - pose.savedAt > MAX_AGE_MS) return null;
    if (![pose.x, pose.z, pose.heading].every(Number.isFinite)) return null;
    return pose;
  } catch {
    return null;
  }
}

export function clearPose(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
