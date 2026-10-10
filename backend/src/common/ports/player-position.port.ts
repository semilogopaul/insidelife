/**
 * Where the server last accepted a player in the open world (the life module's anti-teleport bookkeeping, fed by
 * exits, heartbeats and entries). Other domains read it to judge whether something a client reports is plausible, e.g.
 * that a player could really have seen a billboard.
 */
export interface PlayerFix {
  readonly x: number;
  readonly z: number;
  /** Real epoch ms of the fix. */
  readonly at: number;
  readonly mode: 'walk' | 'car';
}

export interface PlayerPositionPort {
  /** The last accepted fix, or null when the player isn't out in the city (or it's older than ~15 minutes). */
  last(characterId: string): Promise<PlayerFix | null>;
}

export const PLAYER_POSITION_PORT = Symbol('PLAYER_POSITION_PORT');
