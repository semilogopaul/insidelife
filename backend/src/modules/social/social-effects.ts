import { MAX_STATUS, type NeedKey, type Needs } from '@insidelife/shared';
import type { SimulationContext } from '../simulation/simulation-context.js';

/**
 * Small, bounded character effects used by parties and social life events. They mutate the locked character inside
 * the caller's `CharacterSession`; the session persists them.
 */
export function adjustStatus(ctx: SimulationContext, delta: number): void {
  const character = ctx.character;
  character.status = Math.round(Math.min(MAX_STATUS, Math.max(0, character.status + delta)));
}

export function adjustConnections(ctx: SimulationContext, delta: number): void {
  const character = ctx.character;
  character.connections = Math.min(100, Math.max(0, character.connections + delta));
}

export function boostNeeds(ctx: SimulationContext, boosts: Partial<Needs>): void {
  const needs: Record<NeedKey, number> = { ...ctx.character.needs };
  for (const [key, delta] of Object.entries(boosts) as Array<[NeedKey, number]>) {
    needs[key] = Math.min(100, Math.max(0, needs[key] + delta));
  }
  ctx.character.needs = needs;
}

/** Add (or replace) a temporary mood modifier. */
export function addMood(ctx: SimulationContext, id: string, label: string, value: number, minutes: number): void {
  const character = ctx.character;
  character.moodModifiers = [
    ...character.moodModifiers.filter((modifier) => modifier.id !== id),
    { id, label, value, until: ctx.time + minutes },
  ];
}
