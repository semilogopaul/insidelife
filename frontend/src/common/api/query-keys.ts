/**
 * Central query keys so any feature can invalidate shared server state (e.g. the character snapshot after a
 * purchase) without importing another feature.
 */
export const queryKeys = {
  me: ['auth', 'me'] as const,
  clock: ['world', 'clock'] as const,
  worldState: ['world', 'state'] as const,
  snapshot: ['character', 'snapshot'] as const,
  notifications: ['notifications'] as const,
  lifeEvents: ['life-events'] as const,
  wallet: ['wallet'] as const,
  domain: (name: string, ...rest: ReadonlyArray<string | number>) => ['domain', name, ...rest] as const,
} as const;
