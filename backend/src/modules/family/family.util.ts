import { MAX_STATUS, MINUTES_PER_DAY, addNeeds, type NeedKey } from '@insidelife/shared';
import type { SimulationContext } from '../simulation/simulation-context.js';

/** Set (or replace) a temporary mood modifier on the character. */
export function addMood(ctx: SimulationContext, id: string, label: string, value: number, days = 1): void {
  if (value === 0) return;
  const character = ctx.character;
  character.moodModifiers = [
    ...character.moodModifiers.filter((modifier) => modifier.id !== id),
    { id, label, value, until: ctx.time + Math.round(days * MINUTES_PER_DAY) },
  ];
}

/** Top up needs (social, fun…) after a good time with people. */
export function boostNeeds(ctx: SimulationContext, boosts: Readonly<Partial<Record<NeedKey, number>>>): void {
  ctx.character.needs = addNeeds(ctx.character.needs, boosts);
}

/** Clout up or down (reputation in the family and the street). */
export function adjustStatus(ctx: SimulationContext, delta: number): void {
  if (delta === 0) return;
  ctx.character.status = Math.max(0, Math.min(MAX_STATUS, Math.round(ctx.character.status + delta)));
}

/** "Man know man": network strength 0-100. */
export function adjustConnections(ctx: SimulationContext, delta: number): void {
  ctx.character.connections = Math.max(0, Math.min(100, ctx.character.connections + delta));
}

/** Replace `{key}` placeholders in a catalog string. */
export function fill(template: string, values: Readonly<Record<string, string | number | boolean>>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}
