import {
  FAULTY_CONDITION,
  MAX_FURNITURE_COMFORT,
  NO_BED_QUALITY,
  POWER_BACKUPS,
  type ItemDefinition,
  type PowerBackupKind,
} from '@insidelife/shared';
import type { HomeComfortBonus } from '../../../common/ports/inventory.port.js';

export interface OwnedForComfort {
  readonly def: ItemDefinition;
  /** 0-100 right now. */
  readonly condition: number;
}

const powerRank = (power: PowerBackupKind): number => POWER_BACKUPS.indexOf(power);

/** Faulty items (and event-only junk) don't count for comfort, power, tags or status. */
export function isWorking(entry: OwnedForComfort): boolean {
  return entry.condition >= FAULTY_CONDITION;
}

/**
 * What belongings add to home life:
 * - comfort: the best item per group counts (two beds don't stack), and the sum has smooth diminishing returns
 *   `15 × (1 − e^(−raw/15))`, so the first pieces of furniture matter most and the total never reaches 15;
 * - bed quality: the best working bed (a mat on the floor without one);
 * - power: the best working backup, solar > inverter > generator > none.
 */
export function aggregateHomeComfort(owned: readonly OwnedForComfort[]): HomeComfortBonus {
  const bestByGroup = new Map<string, number>();
  let bedQuality = NO_BED_QUALITY;
  let power: PowerBackupKind = 'none';

  for (const entry of owned) {
    if (!isWorking(entry)) continue;
    const { def } = entry;
    if (def.comfort > 0) bestByGroup.set(def.group, Math.max(bestByGroup.get(def.group) ?? 0, def.comfort));
    if (def.bedQuality !== undefined) bedQuality = Math.max(bedQuality, def.bedQuality);
    if (def.power && powerRank(def.power) > powerRank(power)) power = def.power;
  }

  let raw = 0;
  for (const value of bestByGroup.values()) raw += value;
  const comfort = MAX_FURNITURE_COMFORT * (1 - Math.exp(-raw / MAX_FURNITURE_COMFORT));
  return { comfort: Math.round(comfort * 10) / 10, bedQuality, power };
}

/** Status from owned gadgets and furniture: the best working item per group. */
export function belongingsStatus(owned: readonly OwnedForComfort[]): number {
  const bestByGroup = new Map<string, number>();
  for (const entry of owned) {
    if (!isWorking(entry) || entry.def.status <= 0) continue;
    bestByGroup.set(entry.def.group, Math.max(bestByGroup.get(entry.def.group) ?? 0, entry.def.status));
  }
  let total = 0;
  for (const value of bestByGroup.values()) total += value;
  return total;
}

/** Capability tags from working items. */
export function capabilityTags(owned: readonly OwnedForComfort[]): string[] {
  const tags = new Set<string>();
  for (const entry of owned) if (isWorking(entry)) for (const tag of entry.def.tags) tags.add(tag);
  return [...tags];
}
